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
    let maxTokens: Int?
    let temperature: Float?
    let topP: Float?
    let topK: Int?
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
    private var embedder: (dir: String, container: EmbedderModelContainer)?
    private var speaker: Speaker?

    func unload(_ role: String) {
        switch role {
        case "chat": chatModel = nil
        case "voice": speaker = nil
        default: embedder = nil
        }
        Memory.clearCache()
    }

    func speakerModel(_ dir: String) async throws -> Speaker {
        if let loaded = speaker, loaded.dir == dir { return loaded }
        speaker = nil
        let model = try await reportingLoad(role: "voice", dir: dir) { try await TTS.loadModel(modelRepo: dir) }
        let loaded = Speaker(dir: dir, model: model)
        speaker = loaded
        return loaded
    }

    private func chatContainer(_ dir: String) async throws -> ModelContainer {
        if let loaded = chatModel, loaded.dir == dir { return loaded.container }
        chatModel = nil
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

    private func embedderContainer(_ dir: String) async throws -> EmbedderModelContainer {
        if let loaded = embedder, loaded.dir == dir { return loaded.container }
        embedder = nil
        let container = try await reportingLoad(role: "embedding", dir: dir) {
            try await EmbedderModelFactory.shared.loadContainer(from: URL(filePath: dir), using: FolderTokenizerLoader())
        }
        embedder = (dir, container)
        return container
    }

    /// Streams `text`, `reasoning` and `tool-call` events, then returns usage; Stop ends it early.
    func chat(_ request: ChatRequest, emit: @escaping @Sendable ([String: Any]) -> Void) async throws -> [String: any Sendable] {
        let container = try await chatContainer(request.modelDir)
        let parameters = GenerateParameters(
            maxTokens: request.maxTokens,
            temperature: request.temperature ?? 0.6,
            topP: request.topP ?? 1.0,
            topK: request.topK ?? 0)
        let generation = Task<GenerateCompletionInfo?, Error> {
            try await container.perform { (context: ModelContext) async throws -> GenerateCompletionInfo? in
                let input = UserInput(chat: try request.messages.map(Self.message), tools: request.tools?.map(Self.spec))
                let prepared = try await context.processor.prepare(input: input)
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
                return info
            }
        }
        Streams.shared.add(request.streamId) { generation.cancel() }
        defer { Streams.shared.remove(request.streamId) }
        let info = try await generation.value
        return [
            "promptTokens": info?.promptTokenCount ?? 0,
            "completionTokens": info?.generationTokenCount ?? 0,
            "cancelled": generation.isCancelled,
        ]
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

    /// The model ships a vision encoder (`vision_config` in its config.json, as Gemma 4 does).
    private static func hasVision(_ folder: URL) -> Bool {
        guard let data = try? Data(contentsOf: folder.appending(path: "config.json")),
              let config = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return false }
        return config["vision_config"] != nil
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
