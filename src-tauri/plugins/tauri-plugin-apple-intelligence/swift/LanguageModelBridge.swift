import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// MARK: - Apple Intelligence (FoundationModels) — JSON C-string bridge, freed with `apple_intelligence_free_string`

private struct BridgeError: LocalizedError {
    let kind: String
    let message: String
    var errorDescription: String? { message }
}

/// 0 available · 1 device not eligible · 2 Apple Intelligence off · 3 model not ready · 4 macOS < 26 · 5 unknown
@_cdecl("apple_intelligence_availability")
public func appleIntelligenceAvailability() -> Int32 {
    #if canImport(FoundationModels)
    guard #available(macOS 26.0, *) else { return 4 }
    switch SystemLanguageModel.default.availability {
    case .available: return 0
    case .unavailable(.deviceNotEligible): return 1
    case .unavailable(.appleIntelligenceNotEnabled): return 2
    case .unavailable(.modelNotReady): return 3
    case .unavailable: return 5
    }
    #else
    return 4
    #endif
}

/// The model's context window in tokens; 0 when unavailable.
@_cdecl("apple_intelligence_context_size")
public func appleIntelligenceContextSize() -> Int {
    #if canImport(FoundationModels)
    guard #available(macOS 26.0, *) else { return 0 }
    return SystemLanguageModel.default.contextSize
    #else
    return 0
    #endif
}

/// Generation guided by a JSON Schema (empty → plain text); returns `{"text"}` or `{"error": {"kind", "message"}}`.
@_cdecl("apple_intelligence_generate")
public func appleIntelligenceGenerate(
    _ instructions: UnsafePointer<CChar>,
    _ prompt: UnsafePointer<CChar>,
    _ schemaJson: UnsafePointer<CChar>,
    _ timeoutMs: UInt64
) -> UnsafeMutablePointer<CChar> {
    #if canImport(FoundationModels)
    guard #available(macOS 26.0, *) else { return failure("unavailable", "Apple Intelligence requires macOS 26 or later.") }
    let input = (String(cString: instructions), String(cString: prompt), String(cString: schemaJson))
    let result = blocking(timeoutMs: timeoutMs) { try await generate(instructions: input.0, prompt: input.1, schemaJson: input.2) }
    switch result {
    case .success(let text): return bridgeJSON(["text": text])
    case .failure(let error as BridgeError): return failure(error.kind, error.message)
    case .failure(let error): return failure("failed", error.localizedDescription)
    }
    #else
    return failure("unavailable", "Apple Intelligence requires macOS 26 or later.")
    #endif
}

/// Receives one streamed text piece; returns false to stop the stream.
public typealias AppleIntelligenceDelta = @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>) -> Bool

/// A chat reply streamed to `onDelta`; request `{"instructions", "turns": [{"role", "text"}]}` (last turn: the user's).
/// Returns `{}` once done or stopped, or `{"error": {"kind", "message"}}`.
@_cdecl("apple_intelligence_stream")
public func appleIntelligenceStream(
    _ requestJson: UnsafePointer<CChar>,
    _ context: UnsafeMutableRawPointer?,
    _ onDelta: AppleIntelligenceDelta,
    _ timeoutMs: UInt64
) -> UnsafeMutablePointer<CChar> {
    #if canImport(FoundationModels)
    guard #available(macOS 26.0, *) else { return failure("unavailable", "Apple Intelligence requires macOS 26 or later.") }
    guard let request = try? JSONDecoder().decode(ChatRequest.self, from: Data(String(cString: requestJson).utf8)),
          let prompt = request.turns.last, prompt.role == "user" else {
        return failure("failed", "Invalid chat request")
    }
    let sink = DeltaSink(context: context, onDelta: onDelta)
    let result = blocking(timeoutMs: timeoutMs) { try await streamReply(request, prompt: prompt.text, to: sink) }
    sink.close()
    switch result {
    case .success: return bridgeJSON([:])
    case .failure(let error as BridgeError): return failure(error.kind, error.message)
    case .failure(let error): return failure("failed", error.localizedDescription)
    }
    #else
    return failure("unavailable", "Apple Intelligence requires macOS 26 or later.")
    #endif
}

@_cdecl("apple_intelligence_free_string")
public func appleIntelligenceFreeString(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}

// MARK: - Generation

#if canImport(FoundationModels)
@available(macOS 26.0, *)
private func generate(instructions: String, prompt: String, schemaJson: String) async throws -> String {
    let model = SystemLanguageModel(useCase: .general, guardrails: .permissiveContentTransformations)
    let session = LanguageModelSession(model: model, instructions: instructions)
    let options = GenerationOptions(temperature: 0.2)
    do {
        if schemaJson.isEmpty {
            return try await session.respond(to: prompt, options: options).content
        }
        let response = try await session.respond(to: prompt, schema: try generationSchema(from: schemaJson), options: options)
        return response.content.jsonString
    } catch {
        throw bridged(error)
    }
}

// MARK: - Chat

private struct ChatRequest: Decodable {
    struct Turn: Decodable {
        let role: String
        let text: String
    }
    let instructions: String
    let turns: [Turn]
}

/// Streams the reply to `prompt` after the earlier turns. Each snapshot is the whole text so far (it only grows), so
/// only its new end is sent, counted in Unicode scalars: a combining mark or emoji modifier can join the last character.
@available(macOS 26.0, *)
private func streamReply(_ request: ChatRequest, prompt: String, to sink: DeltaSink) async throws {
    let session = LanguageModelSession(model: SystemLanguageModel.default, transcript: transcript(of: request))
    var sent = 0
    do {
        for try await snapshot in session.streamResponse(to: prompt) {
            let scalars = snapshot.content.unicodeScalars
            guard scalars.count > sent else { continue }
            guard sink.send(String(String.UnicodeScalarView(scalars.dropFirst(sent)))) else { return }
            sent = scalars.count
        }
    } catch {
        throw bridged(error)
    }
}

/// The instructions and every turn before the last, as the session's history.
@available(macOS 26.0, *)
private func transcript(of request: ChatRequest) -> Transcript {
    let instructions: [Transcript.Entry] = request.instructions.isEmpty
        ? []
        : [.instructions(Transcript.Instructions(segments: [segment(request.instructions)], toolDefinitions: []))]
    let history: [Transcript.Entry] = request.turns.dropLast().map { turn in
        turn.role == "user"
            ? .prompt(Transcript.Prompt(segments: [segment(turn.text)]))
            : .response(Transcript.Response(assetIDs: [], segments: [segment(turn.text)]))
    }
    return Transcript(entries: instructions + history)
}

@available(macOS 26.0, *)
private func segment(_ text: String) -> Transcript.Segment {
    .text(Transcript.TextSegment(content: text))
}

/// Generation failures the webview tells apart; anything else passes through.
@available(macOS 26.0, *)
private func bridged(_ error: Error) -> Error {
    switch error {
    case LanguageModelSession.GenerationError.exceededContextWindowSize(let context):
        return BridgeError(kind: "context-window", message: context.debugDescription)
    case LanguageModelSession.GenerationError.refusal(_, let context):
        return BridgeError(kind: "refused", message: context.debugDescription)
    case LanguageModelSession.GenerationError.guardrailViolation(let context):
        return BridgeError(kind: "refused", message: context.debugDescription)
    default:
        return error
    }
}

@available(macOS 26.0, *)
private func generationSchema(from json: String) throws -> GenerationSchema {
    guard let data = json.data(using: .utf8),
          let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw BridgeError(kind: "failed", message: "Invalid output schema")
    }
    return try GenerationSchema(root: dynamicSchema(root, name: "Output"), dependencies: [])
}

/// JSON Schema node → DynamicGenerationSchema (object, array, string, number, integer, boolean, string enum).
@available(macOS 26.0, *)
private func dynamicSchema(_ node: [String: Any], name: String) -> DynamicGenerationSchema {
    if let choices = node["enum"] as? [String] {
        return DynamicGenerationSchema(name: name, description: node["description"] as? String, anyOf: choices)
    }
    switch node["type"] as? String {
    case "object":
        let properties = node["properties"] as? [String: Any] ?? [:]
        let required = Set(node["required"] as? [String] ?? [])
        return DynamicGenerationSchema(
            name: name,
            description: node["description"] as? String,
            properties: properties.keys.sorted().map { key in
                let child = properties[key] as? [String: Any] ?? [:]
                return DynamicGenerationSchema.Property(
                    name: key,
                    description: child["description"] as? String,
                    schema: dynamicSchema(child, name: "\(name)_\(key)"),
                    isOptional: !required.contains(key))
            })
    case "array":
        return DynamicGenerationSchema(arrayOf: dynamicSchema(node["items"] as? [String: Any] ?? [:], name: "\(name)_item"))
    case "number": return DynamicGenerationSchema(type: Double.self)
    case "integer": return DynamicGenerationSchema(type: Int.self)
    case "boolean": return DynamicGenerationSchema(type: Bool.self)
    default: return DynamicGenerationSchema(type: String.self)
    }
}
#endif

// MARK: - Helpers

/// The caller's delta callback; closed once the call returns, so a timed-out task can't call into freed memory.
private final class DeltaSink: @unchecked Sendable {
    private let lock = NSLock()
    private let context: UnsafeMutableRawPointer?
    private let onDelta: AppleIntelligenceDelta
    private var open = true

    init(context: UnsafeMutableRawPointer?, onDelta: @escaping AppleIntelligenceDelta) {
        self.context = context
        self.onDelta = onDelta
    }

    /// Whether the caller wants more.
    func send(_ text: String) -> Bool {
        lock.withLock { open && text.withCString { onDelta(context, $0) } }
    }

    func close() { lock.withLock { open = false } }
}

private final class BlockingResult<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Result<Value, Error>?
    func store(_ value: Result<Value, Error>) { lock.withLock { self.value = value } }
    func take() -> Result<Value, Error> { lock.withLock { value! } }
}

/// Runs `operation` off the caller's thread; gives up after `timeoutMs`.
private func blocking<Value: Sendable>(timeoutMs: UInt64, _ operation: @escaping @Sendable () async throws -> Value) -> Result<Value, Error> {
    let semaphore = DispatchSemaphore(value: 0)
    let result = BlockingResult<Value>()
    let task = Task.detached(priority: .utility) {
        do { result.store(.success(try await operation())) } catch { result.store(.failure(error)) }
        semaphore.signal()
    }
    guard semaphore.wait(timeout: .now() + .milliseconds(Int(timeoutMs))) == .success else {
        task.cancel()
        return .failure(BridgeError(kind: "timeout", message: "Apple Intelligence timed out."))
    }
    return result.take()
}

private func failure(_ kind: String, _ message: String) -> UnsafeMutablePointer<CChar> {
    bridgeJSON(["error": ["kind": kind, "message": message]])
}

private func bridgeJSON(_ dict: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = (try? JSONSerialization.data(withJSONObject: dict, options: [])) ?? Data("{}".utf8)
    let str = String(decoding: data, as: UTF8.self)
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}
