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
    } catch LanguageModelSession.GenerationError.exceededContextWindowSize(let context) {
        throw BridgeError(kind: "context-window", message: context.debugDescription)
    } catch LanguageModelSession.GenerationError.refusal(_, let context) {
        throw BridgeError(kind: "refused", message: context.debugDescription)
    } catch LanguageModelSession.GenerationError.guardrailViolation(let context) {
        throw BridgeError(kind: "refused", message: context.debugDescription)
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
