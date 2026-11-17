// C entry points for Rust: JSON in, JSON out (`{"ok":true,…}` / `{"ok":false,"error":…}`), strings freed by the caller.

import Foundation

/// Receives one stream event (JSON) on the calling thread; `context` is the caller's.
public typealias RociMLXEvent = @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>) -> Void

/// Streams a chat reply as events, blocking until it ends; the result says whether it finished.
@_cdecl("roci_mlx_chat")
public func rociMLXChat(
    _ request: UnsafePointer<CChar>, _ onEvent: RociMLXEvent, _ context: UnsafeMutableRawPointer?
) -> UnsafeMutablePointer<CChar> {
    let json = String(cString: request)
    let emit = EventSink(onEvent: onEvent, context: context)
    return reply { try await Engine.shared.chat(try decode(ChatRequest.self, json), emit: emit.send) }
}

/// Stops the chat stream with this id (no-op once it ended).
@_cdecl("roci_mlx_cancel")
public func rociMLXCancel(_ streamId: UInt64) {
    Streams.shared.cancel(streamId)
}

/// Embeds texts with an embedding model; the result carries `vectors`.
@_cdecl("roci_mlx_embed")
public func rociMLXEmbed(_ request: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let json = String(cString: request)
    return reply { try await Engine.shared.embed(try decode(EmbedRequest.self, json)) }
}

/// Frees a role's model ("chat" or "embedding") and MLX's buffer cache.
@_cdecl("roci_mlx_unload")
public func rociMLXUnload(_ role: UnsafePointer<CChar>) {
    let role = String(cString: role)
    wait { await Engine.shared.unload(role) }
}

@_cdecl("roci_mlx_free_string")
public func rociMLXFreeString(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}

/// The callback and its context, handed across the async boundary (called only while the C call blocks).
private struct EventSink: @unchecked Sendable {
    let onEvent: RociMLXEvent
    let context: UnsafeMutableRawPointer?

    func send(_ event: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: event), let text = String(data: data, encoding: .utf8) else { return }
        text.withCString { onEvent(context, $0) }
    }
}

private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(type, from: Data(json.utf8))
}

/// Runs `work` to completion on the cooperative pool while the C caller's thread waits.
private func wait<T: Sendable>(_ work: @escaping @Sendable () async -> T) -> T {
    let done = DispatchSemaphore(value: 0)
    let box = Box<T>()
    Task.detached {
        box.value = await work()
        done.signal()
    }
    done.wait()
    return box.value!
}

private final class Box<T>: @unchecked Sendable {
    var value: T?
}

/// `{"ok":true, …result}` or `{"ok":false,"error":…}` as a C string.
private func reply(_ work: @escaping @Sendable () async throws -> [String: any Sendable]) -> UnsafeMutablePointer<CChar> {
    let json: String = wait {
        let result: [String: Any]
        do {
            result = ["ok": true].merging(try await work()) { $1 }
        } catch {
            result = ["ok": false, "error": "\(error)"]
        }
        let data = (try? JSONSerialization.data(withJSONObject: result)) ?? Data(#"{"ok":false,"error":"unencodable result"}"#.utf8)
        return String(decoding: data, as: UTF8.self)
    }
    return strdup(json)
}
