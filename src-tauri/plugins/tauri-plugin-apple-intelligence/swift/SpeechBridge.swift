import Foundation
import AVFAudio
import Speech

// MARK: - Apple Speech (SpeechAnalyzer, macOS 26+) — JSON C-string bridge, freed with `apple_intelligence_free_string`

private struct SpeechFailure: Error {
    let kind: String
    let message: String
}

/// `{"available": bool, "authorization": "authorized"|"denied"|"not_determined"|"restricted", "installed": bool}`
@_cdecl("apple_speech_status")
public func appleSpeechStatus(_ language: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let code = String(cString: language)
    guard #available(macOS 26.0, *), SpeechTranscriber.isAvailable else {
        return speechJSON(["available": false, "authorization": authorizationName(), "installed": false])
    }
    let installed = speechBlocking { await installedTranscriber(code) != nil }
    return speechJSON(["available": true, "authorization": authorizationName(), "installed": (try? installed.get()) ?? false])
}

/// `{"granted"}`; asks only from the `.app` (else `unavailable`): macOS aborts a responsible process lacking the key.
@_cdecl("apple_speech_request_access")
public func appleSpeechRequestAccess() -> UnsafeMutablePointer<CChar> {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: return speechJSON(["granted": true])
    case .denied, .restricted: return speechJSON(["granted": false])
    default: break
    }
    guard canAskForSpeechRecognition() else {
        return speechFailure("unavailable", "Speech Recognition can only be allowed from the Roci app. Development builds run outside the app bundle, so macOS can't ask from here.")
    }
    let semaphore = DispatchSemaphore(value: 0)
    var granted = false
    SFSpeechRecognizer.requestAuthorization { status in
        granted = status == .authorized
        semaphore.signal()
    }
    semaphore.wait()
    return speechJSON(["granted": granted])
}

/// Downloads the language model when missing. `{}` or `{"error": {"kind", "message"}}`
@_cdecl("apple_speech_prepare")
public func appleSpeechPrepare(_ language: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let code = String(cString: language)
    guard #available(macOS 26.0, *) else { return speechFailure("unavailable", "Apple speech requires macOS 26 or later.") }
    let result = speechBlocking { () throws -> Bool in
        let transcriber = try await transcriber(for: code)
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }
        return true
    }
    if case .failure(let error) = result { return speechFailure(error) }
    return speechJSON([:])
}

/// Transcribes an audio file. `{"segments": [{"start", "end", "text"}]}` or `{"error": {"kind", "message"}}`
@_cdecl("apple_speech_transcribe")
public func appleSpeechTranscribe(_ path: UnsafePointer<CChar>, _ language: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let file = String(cString: path)
    let code = String(cString: language)
    guard #available(macOS 26.0, *) else { return speechFailure("unavailable", "Apple speech requires macOS 26 or later.") }
    guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
        return speechFailure("not-authorized", "Speech Recognition is off for Roci.")
    }
    let result = speechBlocking { try await transcribe(file: file, language: code) }
    switch result {
    case .success(let segments): return speechJSON(["segments": segments])
    case .failure(let error): return speechFailure(error)
    }
}

// MARK: - Transcription

@available(macOS 26.0, *)
private func transcriber(for language: String) async throws -> SpeechTranscriber {
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: language)) else {
        throw SpeechFailure(kind: "unsupported-language", message: "Apple speech doesn't support \(language).")
    }
    return SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [], attributeOptions: [.audioTimeRange])
}

@available(macOS 26.0, *)
private func installedTranscriber(_ language: String) async -> SpeechTranscriber? {
    guard let transcriber = try? await transcriber(for: language) else { return nil }
    return await AssetInventory.status(forModules: [transcriber]) == .installed ? transcriber : nil
}

@available(macOS 26.0, *)
private func transcribe(file: String, language: String) async throws -> [[String: Any]] {
    guard let transcriber = await installedTranscriber(language) else {
        throw SpeechFailure(kind: "model-not-ready", message: "The Apple speech model for \(language) isn't downloaded.")
    }
    let audio = try AVAudioFile(forReading: URL(fileURLWithPath: file))
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    async let segments: [[String: Any]] = transcriber.results.reduce(into: []) { list, result in
        let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        list.append(["start": result.range.start.seconds, "end": result.range.end.seconds, "text": text])
    }
    if let last = try await analyzer.analyzeSequence(from: audio) {
        try await analyzer.finalizeAndFinish(through: last)
    } else {
        try await analyzer.finalizeAndFinishThroughEndOfInput()
    }
    return try await segments
}

// MARK: - Helpers

/// A launched `.app` with the usage description is its own responsible process for privacy prompts.
private func canAskForSpeechRecognition() -> Bool {
    Bundle.main.bundleURL.pathExtension == "app"
        && Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") != nil
}

private func authorizationName() -> String {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "not_determined"
    @unknown default: return "not_determined"
    }
}

private final class SpeechResult<Value>: @unchecked Sendable {
    var value: Result<Value, Error>?
}

/// Runs `operation` to completion off the caller's thread (no timeout: long recordings take minutes).
private func speechBlocking<Value>(_ operation: @escaping @Sendable () async throws -> Value) -> Result<Value, Error> {
    let semaphore = DispatchSemaphore(value: 0)
    let box = SpeechResult<Value>()
    Task.detached(priority: .utility) {
        do { box.value = .success(try await operation()) } catch { box.value = .failure(error) }
        semaphore.signal()
    }
    semaphore.wait()
    return box.value!
}

private func speechFailure(_ error: Error) -> UnsafeMutablePointer<CChar> {
    if let failure = error as? SpeechFailure { return speechFailure(failure.kind, failure.message) }
    return speechFailure("failed", error.localizedDescription)
}

private func speechFailure(_ kind: String, _ message: String) -> UnsafeMutablePointer<CChar> {
    speechJSON(["error": ["kind": kind, "message": message]])
}

private func speechJSON(_ dict: [String: Any]) -> UnsafeMutablePointer<CChar> {
    let data = (try? JSONSerialization.data(withJSONObject: dict, options: [])) ?? Data("{}".utf8)
    let str = String(decoding: data, as: UTF8.self)
    let ptr = UnsafeMutablePointer<CChar>.allocate(capacity: str.utf8.count + 1)
    str.withCString { ptr.initialize(from: $0, count: str.utf8.count + 1) }
    return ptr
}
