// One loaded model per role (chat, embedding, voice), loaded from its downloaded folder on first use and kept until unloaded.

import CoreImage
import Foundation
import MLX
import MLXEmbedders
import MLXLLM
import MLXVLM
import MLXAudioTTS
import MLXLMCommon
import Tokenizers

/// A chat turn as the webview sends it (AI SDK prompt, flattened); a user turn may carry images (base64).
struct ChatMessage: Decodable, Sendable {
    let role: String
    let content: String
    let images: [String]?
    let toolCalls: [ToolCall]?
    let toolCallId: String?
    let toolName: String?
}

struct ChatRequest: Decodable, Sendable {
    let streamId: UInt64
    let modelDir: String
    let messages: [ChatMessage]
    /// OpenAI-style function specs.
    let tools: [JSONValue]?
    /// A JSON schema (as text) to decode the reply to (`Guided.swift`).
    let schema: String?
    let maxTokens: Int?
    let temperature: Float?
    let topP: Float?
    let topK: Int?
    let minP: Float?
    let repetitionPenalty: Float?
    let presencePenalty: Float?
    let frequencyPenalty: Float?
    /// How many recent tokens the three penalties look back over.
    let penaltyContext: Int?
    /// The most tokens the model keeps in mind; older ones roll off.
    let contextTokens: Int?
    /// Compresses the kept tokens to 4 or 8 bits.
    let kvBits: Int?
}

/// The chat model's last conversation, so the next turn reads only what's new. Unchecked: one reply at a time uses it (the
/// GPU queue runs chats one after another).
final class Conversation: @unchecked Sendable {
    let session: ChatSession

    init(_ session: ChatSession) { self.session = session }
}

/// Tokens in and out of one reply.
struct ReplyUsage: Sendable {
    let prompt: Int
    let completion: Int
}

struct EmbedRequest: Decodable, Sendable {
    let modelDir: String
    let texts: [String]
}

struct EngineError: LocalizedError, CustomStringConvertible {
    let description: String
    var errorDescription: String? { description }
}

/// Running chat streams by id, so Stop can cancel one.
final class Streams: @unchecked Sendable {
    static let shared = Streams()
    private let lock = NSLock()
    private var cancels: [UInt64: @Sendable () -> Void] = [:]

    func add(_ id: UInt64, cancel: @escaping @Sendable () -> Void) { lock.withLock { cancels[id] = cancel } }
    func remove(_ id: UInt64) { _ = lock.withLock { cancels.removeValue(forKey: id) } }
    func cancel(_ id: UInt64) { lock.withLock { cancels[id] }?() }
}

actor Engine {
    static let shared = Engine()

    private var chatModel: (dir: String, container: ModelContainer)?
    /// The loaded chat model's schema-decoding pieces, built on its first schema request.
    private var grammar: (dir: String, kit: GrammarKit)?
    private var conversation: Conversation?
    private var embedder: (dir: String, container: EmbedderModelContainer)?
    private var speaker: Speaker?

    func unload(_ role: String) {
        switch role {
        case "chat":
            chatModel = nil
            grammar = nil
            conversation = nil
        case "voice": speaker = nil
        default: embedder = nil
        }
        Memory.clearCache()
    }

    func speakerModel(_ dir: String, type: String?) async throws -> Speaker {
        if let loaded = speaker, loaded.dir == dir { return loaded }
        speaker = nil
        let model = try await reportingLoad(role: "voice", dir: dir) { try await TTS.loadModel(modelRepo: dir, modelType: type) }
        let loaded = Speaker(dir: dir, model: model)
        speaker = loaded
        return loaded
    }

    private func chatContainer(_ dir: String) async throws -> ModelContainer {
        if let loaded = chatModel, loaded.dir == dir { return loaded.container }
        chatModel = nil
        grammar = nil
        conversation = nil
        Memory.clearCache()
        // A model whose config declares a vision part loads on the engine's vision path (text, images, tools); else text.
        let folder = URL(filePath: dir)
        let container = try await reportingLoad(role: "chat", dir: dir) {
            Self.hasVision(folder)
                ? try await VLMModelFactory.shared.loadContainer(from: folder, using: FolderTokenizerLoader())
                : try await LLMModelFactory.shared.loadContainer(from: folder, using: FolderTokenizerLoader())
        }
        chatModel = (dir, container)
        return container
    }

    private func grammarKit(_ dir: String, _ container: ModelContainer) async throws -> GrammarKit {
        if let built = grammar, built.dir == dir { return built.kit }
        let kit = try await container.perform { (context: ModelContext) in try GrammarKit(context.tokenizer) }
        grammar = (dir, kit)
        return kit
    }

    private func embedderContainer(_ dir: String) async throws -> EmbedderModelContainer {
        if let loaded = embedder, loaded.dir == dir { return loaded.container }
        embedder = nil
        let container = try await reportingLoad(role: "embedding", dir: dir) {
            try await EmbedderModelFactory.shared.loadContainer(from: URL(filePath: dir), using: FolderTokenizerLoader())
        }
        embedder = (dir, container)
        return container
    }

    /// Streams `text` and `tool-call` events, then returns usage; Stop ends it early. With a `schema` the reply is decoded to it.
    func chat(_ request: ChatRequest, emit: @escaping @Sendable ([String: Any]) -> Void) async throws -> [String: any Sendable] {
        let container = try await chatContainer(request.modelDir)
        let generation: Task<ReplyUsage, Error>
        var reading: Conversation?
        if let schema = request.schema {
            let kit = try await grammarKit(request.modelDir, container)
            generation = Task { try await Self.decode(schema, request: request, kit: kit, container: container, emit: emit) }
        } else {
            let reply = try await continuing(request, container)
            reading = reply.conversation
            generation = Task { try await Self.stream(reply.events, emit: emit) }
        }
        Streams.shared.add(request.streamId) { generation.cancel() }
        defer { Streams.shared.remove(request.streamId) }
        let result = await generation.result
        // Stop ends our reading at once, not the library's generation: wait for it, so this GPU turn ends with it.
        await reading?.session.synchronize()
        let usage = try result.get()
        return [
            "promptTokens": usage.prompt,
            "completionTokens": usage.completion,
            "cancelled": generation.isCancelled,
        ]
    }

    /// Thinking off: templates that think by default (SmolLM3, Bonsai 2) answer directly and quickly.
    private static let context: [String: any Sendable] = ["enable_thinking": false]

    /// This turn's session and reply events: the last conversation's cache carried over (the library keeps the prefix this
    /// chat starts with, and rebuilds the cache when its memory values change).
    private func continuing(
        _ request: ChatRequest, _ container: ModelContainer
    ) async throws -> (conversation: Conversation, events: AsyncThrowingStream<Generation, Error>) {
        var history = try request.messages.map(Self.message)
        guard let last = history.popLast() else { throw EngineError(description: "There's no message to answer.") }
        let tools = request.tools?.map(Self.spec)
        let session = if let kept = conversation {
            await kept.session.fork(history: history)
        } else {
            ChatSession(container, history: history, processing: .init(), additionalContext: Self.context)
        }
        let instructions = request.contextTokens == nil ? 0 : try await Self.instructionTokens(request, container)
        session.generateParameters = try Self.parameters(request, instructions: instructions)
        session.components = Checkpoint.components
        session.tools = tools
        let current = Conversation(session)
        conversation = current
        return (current, session.streamDetails(to: [last]))
    }

    /// How many tokens the chat's instructions (its system messages and tools) take at the start of the prompt: two prompts
    /// that differ only in the first user turn share exactly that much.
    private static func instructionTokens(_ request: ChatRequest, _ container: ModelContainer) async throws -> Int {
        try await container.perform { (model: ModelContext) async throws -> Int in
            let system = try request.messages.prefix { $0.role == "system" }.map(message)
            let tools = request.tools?.map(spec)
            func tokens(_ probe: String) async throws -> [Int] {
                let input = UserInput(chat: system + [.user(probe)], tools: tools, additionalContext: context)
                return try await model.processor.prepare(input: input).text.tokens.asArray(Int.self)
            }
            let (a, b) = (try await tokens("a"), try await tokens("b"))
            return zip(a, b).prefix { $0 == $1 }.count
        }
    }

    /// The memory the chat keeps: at most `contextTokens`, compressed to `kvBits`. When older text rolls off, the
    /// instructions stay (rounded up to a prefill chunk so the cache isn't rebuilt each turn), up to half the window.
    private static func memory(_ request: ChatRequest, instructions: Int) throws -> KVCacheConfiguration? {
        let strategy: KVCacheConfiguration.Strategy = try request.kvBits.map { .affine(try .init(bits: $0)) } ?? .fullPrecision
        let capacity = try request.contextTokens.map { window in
            let chunk = PrefillParameters.defaultStepSize
            let rounded = (instructions + chunk - 1) / chunk * chunk
            return try KVCacheConfiguration.Capacity(maxTokens: window, preservedPrefixTokens: min(rounded, window / 2))
        }
        guard capacity != nil || request.kvBits != nil else { return nil }
        return KVCacheConfiguration(capacity: capacity, strategy: strategy, compatibility: .allowPartial)
    }

    /// The request's values over the library's defaults.
    private static func parameters(_ request: ChatRequest, instructions: Int) throws -> GenerateParameters {
        let base = GenerateParameters()
        let window = request.penaltyContext
        return GenerateParameters(
            maxTokens: request.maxTokens,
            kvCache: try memory(request, instructions: instructions),
            temperature: request.temperature ?? base.temperature,
            topP: request.topP ?? base.topP,
            topK: request.topK ?? base.topK,
            minP: request.minP ?? base.minP,
            repetitionPenalty: request.repetitionPenalty,
            repetitionContextSize: window ?? base.repetitionContextSize,
            presencePenalty: request.presencePenalty,
            presenceContextSize: window ?? base.presenceContextSize,
            frequencyPenalty: request.frequencyPenalty,
            frequencyContextSize: window ?? base.frequencyContextSize,
            prefill: Checkpoint.prefill)
    }

    /// A reply decoded to `schema`, from the whole chat (a one-off: it neither reads nor keeps a conversation cache).
    private static func decode(
        _ schema: String, request: ChatRequest, kit: GrammarKit, container: ModelContainer,
        emit: @escaping @Sendable ([String: Any]) -> Void
    ) async throws -> ReplyUsage {
        try await container.perform { (model: ModelContext) async throws -> ReplyUsage in
            let input = UserInput(chat: try request.messages.map(message), tools: request.tools?.map(spec), additionalContext: context)
            let prepared = try await model.processor.prepare(input: input)
            let produced = try kit.generate(schema: schema, input: prepared, context: model, maxTokens: request.maxTokens) { text in
                emit(["type": "text", "text": text])
                Checkpoint.shared.pass()
                return !Task.isCancelled
            }
            return ReplyUsage(prompt: prepared.text.tokens.size, completion: produced)
        }
    }

    /// A free reply: text and tool calls as they're generated.
    private static func stream(
        _ events: AsyncThrowingStream<Generation, Error>, emit: @Sendable ([String: Any]) -> Void
    ) async throws -> ReplyUsage {
        var info: GenerateCompletionInfo?
        for try await event in events {
            if Task.isCancelled { break }
            switch event {
            case .chunk(let text): emit(["type": "text", "text": text])
            case .toolCall(let call): emit(Self.toolCallEvent(call))
            case .info(let completion): info = completion
            default: break
            }
        }
        return ReplyUsage(prompt: info?.promptTokenCount ?? 0, completion: info?.generationTokenCount ?? 0)
    }

    /// Vectors for `texts`, unit length; batches pad on the left so last-token pooling reads each text's last token.
    func embed(_ request: EmbedRequest) async throws -> [String: any Sendable] {
        let container = try await embedderContainer(request.modelDir)
        let vectors = await container.perform { context -> [[Float]] in
            let inputs = request.texts.map { context.tokenizer.encode(text: $0, addSpecialTokens: true) }
            let length = inputs.map(\.count).max() ?? 0
            let pad = context.tokenizer.eosTokenId ?? 0
            let ids = stacked(inputs.map { MLXArray(Array(repeating: pad, count: length - $0.count) + $0) })
            let mask = stacked(inputs.map { MLXArray(Array(repeating: false, count: length - $0.count) + Array(repeating: true, count: $0.count)) })
            let output = context.model(ids, positionIds: nil, tokenTypeIds: nil, attentionMask: mask)
            let pooled = output.pooledOutput ?? context.pooling(output, normalize: true, applyLayerNorm: false)
            pooled.eval()
            return pooled.map { $0.asArray(Float.self) }
        }
        return ["vectors": vectors]
    }

    private static func message(_ m: ChatMessage) throws -> Chat.Message {
        switch m.role {
        case "system": .system(m.content)
        case "assistant": .assistant(m.content, toolCalls: m.toolCalls)
        case "tool": .tool(m.content, id: m.toolCallId, name: m.toolName)
        default: .user(m.content, images: try (m.images ?? []).map(image))
        }
    }

    /// An attached image (base64 of its file: PNG, JPEG, HEIC …), decoded by Core Image.
    private static func image(_ base64: String) throws -> UserInput.Image {
        guard let data = Data(base64Encoded: base64), let decoded = CIImage(data: data) else {
            throw EngineError(description: "An attached image couldn't be read.")
        }
        return .ciImage(decoded)
    }

    /// The model ships a vision encoder (`vision_config` in its config.json).
    private static func hasVision(_ folder: URL) -> Bool {
        config(folder)?["vision_config"] != nil
    }

    /// The model type its config.json declares, if any.
    private static func config(_ folder: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: folder.appending(path: "config.json")) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private static func spec(_ value: JSONValue) -> ToolSpec {
        guard case .object(let object) = value else { return [:] }
        return object.mapValues(sendable)
    }

    private static func sendable(_ value: JSONValue) -> any Sendable {
        switch value {
        case .null: NSNull()
        case .bool(let b): b
        case .int(let i): i
        case .double(let d): d
        case .string(let s): s
        case .array(let a): a.map(sendable)
        case .object(let o): o.mapValues(sendable)
        }
    }

    private static func toolCallEvent(_ call: ToolCall) -> [String: Any] {
        let arguments = (try? JSONEncoder().encode(call.function.arguments)).map { String(decoding: $0, as: UTF8.self) } ?? "{}"
        return ["type": "tool-call", "id": call.id ?? UUID().uuidString, "name": call.function.name, "arguments": arguments]
    }
}
