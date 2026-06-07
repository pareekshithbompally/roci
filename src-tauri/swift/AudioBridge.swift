import Foundation

// MARK: - C-ABI handshake (Rust ⇄ Swift)
//
// The only surface Rust links against. Each `@_cdecl` function is paired with an
// `extern "C"` declaration in src/audio/bridge.rs. Calls return a JSON status
// string (`{"ok":bool,"error":?}`) that Rust parses and frees via
// `audio_free_string`. The capture work lives in AudioCaptureEngine.

/// The single in-flight capture (only one recording at a time).
private var activeEngine: AudioCaptureEngine?

private func jsonPtr(_ dict: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = (try? JSONSerialization.data(withJSONObject: dict)) ?? Data("{}".utf8)
    let str = String(data: data, encoding: .utf8) ?? "{}"
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}

@_cdecl("audio_start")
public func audio_start(
    _ source: Int32,
    _ hqPath: UnsafePointer<CChar>,
    _ aiPath: UnsafePointer<CChar>,
    _ callback: @escaping LevelCallback,
    _ ctx: UnsafeMutableRawPointer?
) -> UnsafeMutablePointer<CChar> {
    guard let src = Source(rawValue: source) else {
        return jsonPtr(["ok": false, "error": "Invalid source \(source)"])
    }
    activeEngine?.stop()
    let eng = AudioCaptureEngine(source: src, callback: callback, ctx: ctx)
    do {
        try eng.start(hqPath: String(cString: hqPath), aiPath: String(cString: aiPath))
        activeEngine = eng
        return jsonPtr(["ok": true])
    } catch {
        activeEngine = nil
        return jsonPtr(["ok": false, "error": error.localizedDescription])
    }
}

@_cdecl("audio_stop")
public func audio_stop() -> UnsafeMutablePointer<CChar> {
    activeEngine?.stop()
    activeEngine = nil
    return jsonPtr(["ok": true])
}

@_cdecl("audio_pause")
public func audio_pause() -> UnsafeMutablePointer<CChar> {
    activeEngine?.pause()
    return jsonPtr(["ok": true])
}

@_cdecl("audio_resume")
public func audio_resume() -> UnsafeMutablePointer<CChar> {
    activeEngine?.resume()
    return jsonPtr(["ok": true])
}

@_cdecl("audio_free_string")
public func audio_free_string(_ ptr: UnsafeMutablePointer<CChar>) {
    ptr.deallocate()
}
