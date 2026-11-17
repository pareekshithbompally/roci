// Tells Rust when a model starts and ends loading, so the app can show it; the listener is set once at startup.

import Foundation

/// Receives `{"role", "modelDir", "state": "loading" | "loaded" | "failed"}` as JSON.
public typealias RociMLXLoadListener = @convention(c) (UnsafePointer<CChar>) -> Void

private final class LoadListener: @unchecked Sendable {
    static let shared = LoadListener()
    private let lock = NSLock()
    private var listener: RociMLXLoadListener?

    func set(_ listener: RociMLXLoadListener) { lock.withLock { self.listener = listener } }

    func report(role: String, dir: String, state: String) {
        guard let listener = lock.withLock({ listener }),
              let data = try? JSONSerialization.data(withJSONObject: ["role": role, "modelDir": dir, "state": state])
        else { return }
        String(decoding: data, as: UTF8.self).withCString { listener($0) }
    }
}

@_cdecl("roci_mlx_set_load_listener")
public func rociMLXSetLoadListener(_ listener: RociMLXLoadListener) {
    LoadListener.shared.set(listener)
}

/// Loads with `load`, reporting the start and its outcome for `role`.
func reportingLoad<T>(role: String, dir: String, _ load: () async throws -> T) async throws -> T {
    LoadListener.shared.report(role: role, dir: dir, state: "loading")
    do {
        let loaded = try await load()
        LoadListener.shared.report(role: role, dir: dir, state: "loaded")
        return loaded
    } catch {
        LoadListener.shared.report(role: role, dir: dir, state: "failed")
        throw error
    }
}
