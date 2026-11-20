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
    private var embedder: (dir: String, container: EmbedderModelContainer)?
    private var speaker: Speaker?

    func unload(_ role: String) {
        switch role {
        case "chat":
            chatModel = nil
            grammar = nil
        case "voice": speaker = nil
        default: embedder = nil
        }
        Memory.clearCache()
    }

    func speakerModel(_ dir: String) async throws -> Speaker {
        if let loaded = speaker, loaded.dir == dir { return loaded }
        speaker = nil
        // A config without `model_type` (Kokoro) is named by its folder, the catalog id, never by the rest of the path.
        let folder = URL(filePath: dir)
        let type = Self.declaredType(folder) == nil ? folder.lastPathComponent : nil
        let model = try await reportingLoad(role: "voice", dir: dir) { try await TTS.loadModel(modelRepo: dir, modelType: type) }
        let loaded = Speaker(dir: dir, model: model)
        speaker = loaded
        return loaded
    }

    private func chatContainer(_ dir: String) async throws -> ModelContainer {
        if let loaded = chatModel, loaded.dir == dir { return loaded.container }
        chatModel = nil
        grammar = nil
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
        let kit = request.schema == nil ? nil : try await grammarKit(request.modelDir, container)
        let generation = Task<ReplyUsage, Error> {
            try await container.perform { (context: ModelContext) async throws -> ReplyUsage in
                let prepared = try await context.processor.prepare(input: try Self.input(request))
                guard let schema = request.schema, let kit else {
                    return try await Self.stream(prepared, request: request, context: context, emit: emit)
                }
                let produced = try kit.generate(schema: schema, input: prepared, context: context, maxTokens: request.maxTokens) { text in
                    emit(["type": "text", "text": text])
                    return !Task.isCancelled
                }
                return ReplyUsage(prompt: prepared.text.tokens.size, completion: produced)
            }
        }
        Streams.shared.add(request.streamId) { generation.cancel() }
        defer { Streams.shared.remove(request.streamId) }
        let usage = try await generation.value
        return [
            "promptTokens": usage.prompt,
            "completionTokens": usage.completion,
            "cancelled": generation.isCancelled,
        ]
    }

    /// The chat as the model's template reads it. Thinking off: templates that think by default (SmolLM3, Bonsai 2) answer
    /// directly and quickly.
    private static func input(_ request: ChatRequest) throws -> UserInput {
        UserInput(
            chat: try request.messages.map(Self.message), tools: request.tools?.map(Self.spec),
            additionalContext: ["enable_thinking": false])
    }

    /// A free reply: text and tool calls as they're generated.
    private static func stream(
        _ prepared: LMInput, request: ChatRequest, context: ModelContext, emit: @Sendable ([String: Any]) -> Void
    ) async throws -> ReplyUsage {
        let parameters = GenerateParameters(
            maxTokens: request.maxTokens,
            temperature: request.temperature ?? 0.6,
            topP: request.topP ?? 1.0,
            topK: request.topK ?? 0)
        var info: GenerateCompletionInfo?
        for await event in try generate(input: prepared, parameters: parameters, context: context) {
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
    private static func declaredType(_ folder: URL) -> String? {
        config(folder)?["model_type"] as? String
    }

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
