import Foundation
import AVFAudio
import Speech

// MARK: - Apple Speech (SpeechAnalyzer, macOS / iOS 26+) — JSON C-string bridge, freed with `apple_intelligence_free_string`

/// The app's name from its Info.plist (Tauri embeds one in dev builds too).
private let appName = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "This app"

private struct SpeechFailure: Error {
    let kind: String
    let message: String
}

/// `{"available": bool, "authorization": "authorized"|"denied"|"not_determined"|"restricted", "installed": bool}`
@_cdecl("apple_speech_status")
public func appleSpeechStatus(_ language: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let code = String(cString: language)
    guard SpeechTranscriber.isAvailable else {
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
        return speechFailure("unavailable", "Speech Recognition can only be allowed from the \(appName) app. Development builds run outside the app bundle, so macOS can't ask from here.")
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
    let result = speechBlocking { try await transcribe(file: file, language: code) }
    switch result {
    case .success(let segments): return speechJSON(["segments": segments])
    case .failure(let error): return speechFailure(error)
    }
}

/// Starts live stream `id` (several run at once, e.g. you and the call): words as they are said. `{}` or `{"error"}`
@_cdecl("apple_speech_live_start")
public func appleSpeechLiveStart(_ id: UInt32, _ language: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar> {
    let code = String(cString: language)
    switch speechBlocking({ try await LiveSpeech.start(language: code) }) {
    case .success(let live):
        LiveSpeeches.shared.replace(id, with: live)
        return speechJSON([:])
    case .failure(let error): return speechFailure(error)
    }
}

/// Feeds stream `id` 16 kHz mono f32 (`count` bytes). `{"committed", "tentative"}` so far, or `{"error"}`
@_cdecl("apple_speech_live_feed")
public func appleSpeechLiveFeed(_ id: UInt32, _ bytes: UnsafeRawPointer?, _ count: Int) -> UnsafeMutablePointer<CChar> {
    guard let live = LiveSpeeches.shared.get(id) else { return speechFailure("failed", "No live Apple speech stream \(id).") }
    do {
        try live.feed(UnsafeRawBufferPointer(start: bytes, count: count))
        return speechJSON(live.text())
    } catch {
        return speechFailure(error)
    }
}

/// Ends stream `id` once its audio is transcribed. `{"text"}` (everything it heard) or `{"error"}`
@_cdecl("apple_speech_live_finish")
public func appleSpeechLiveFinish(_ id: UInt32) -> UnsafeMutablePointer<CChar> {
    guard let live = LiveSpeeches.shared.remove(id) else { return speechFailure("failed", "No live Apple speech stream \(id).") }
    switch speechBlocking({ try await live.finish() }) {
    case .success(let text): return speechJSON(["text": text])
    case .failure(let error): return speechFailure(error)
    }
}

/// Abandons stream `id`, if it's running.
@_cdecl("apple_speech_live_cancel")
public func appleSpeechLiveCancel(_ id: UInt32) {
    LiveSpeeches.shared.remove(id)?.cancel()
}

// MARK: - Live streams

/// One live stream: its own analyzer, fed 16 kHz mono f32, its results gathered as they arrive.
private final class LiveSpeech: @unchecked Sendable {
    private static let fed = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000, channels: 1, interleaved: false)!
    private let lock = NSLock()
    private let analyzer: SpeechAnalyzer
    private let input: AsyncStream<AnalyzerInput>.Continuation
    /// To the analyzer's format; nil when it takes the fed audio as is.
    private let converter: AVAudioConverter?
    private var results: Task<Void, Error>?
    private var settled: [String] = []
    private var revising = ""

    private init(analyzer: SpeechAnalyzer, input: AsyncStream<AnalyzerInput>.Continuation, format: AVAudioFormat) {
        self.analyzer = analyzer
        self.input = input
        converter = format == Self.fed ? nil : AVAudioConverter(from: Self.fed, to: format)
    }

    static func start(language: String) async throws -> LiveSpeech {
        let transcriber = try await readyTranscriber(language, reporting: [.volatileResults])
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            throw SpeechFailure(kind: "failed", message: "Apple speech has no audio format for \(language).")
        }
        let (sequence, input) = AsyncStream.makeStream(of: AnalyzerInput.self)
        let live = LiveSpeech(analyzer: SpeechAnalyzer(modules: [transcriber]), input: input, format: format)
        live.results = Task { for try await result in transcriber.results { live.take(result) } }
        try await live.analyzer.start(inputSequence: sequence)
        return live
    }

    func feed(_ bytes: UnsafeRawBufferPointer) throws {
        guard bytes.count % MemoryLayout<Float>.size == 0 else {
            throw SpeechFailure(kind: "failed", message: "Audio isn't whole f32 samples.")
        }
        guard let base = bytes.baseAddress, !bytes.isEmpty else { return }
        let frames = AVAudioFrameCount(bytes.count / MemoryLayout<Float>.size)
        guard let pcm = AVAudioPCMBuffer(pcmFormat: Self.fed, frameCapacity: frames) else {
            throw SpeechFailure(kind: "failed", message: "Couldn't hold \(frames) audio frames.")
        }
        pcm.frameLength = frames
        memcpy(pcm.floatChannelData![0], base, bytes.count)
        input.yield(AnalyzerInput(buffer: try converted(pcm)))
    }

    /// `{"committed", "tentative"}`: the settled words, then the ones still being revised.
    func text() -> [String: Any] {
        lock.withLock {
            let committed = settled.joined(separator: " ")
            let tentative = committed.isEmpty || revising.isEmpty ? revising : " " + revising
            return ["committed": committed, "tentative": tentative]
        }
    }

    /// No more audio: waits for the last results, then everything heard.
    func finish() async throws -> String {
        input.finish()
        try await analyzer.finalizeAndFinishThroughEndOfInput()
        try await results?.value
        return lock.withLock { (settled + [revising]).filter { !$0.isEmpty }.joined(separator: " ") }
    }

    func cancel() {
        input.finish()
        results?.cancel()
        Task { await analyzer.cancelAndFinishNow() }
    }

    private func take(_ result: SpeechTranscriber.Result) {
        let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
        lock.withLock {
            guard result.isFinal else {
                revising = text
                return
            }
            if !text.isEmpty { settled.append(text) }
            revising = ""
        }
    }

    private func converted(_ pcm: AVAudioPCMBuffer) throws -> AVAudioPCMBuffer {
        guard let converter else { return pcm }
        let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
        let capacity = AVAudioFrameCount((Double(pcm.frameLength) * ratio).rounded(.up))
        guard let out = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: capacity) else {
            throw SpeechFailure(kind: "failed", message: "Couldn't hold \(capacity) converted audio frames.")
        }
        var supplied = false
        var failure: NSError?
        converter.convert(to: out, error: &failure) { _, status in
            status.pointee = supplied ? .noDataNow : .haveData
            defer { supplied = true }
            return supplied ? nil : pcm
        }
        if let failure { throw failure }
        return out
    }
}

/// The running live streams, by the webview's id.
private final class LiveSpeeches: @unchecked Sendable {
    static let shared = LiveSpeeches()
    private let lock = NSLock()
    private var running: [UInt32: LiveSpeech] = [:]

    /// Starts tracking `live` as `id`, abandoning any stream already there.
    func replace(_ id: UInt32, with live: LiveSpeech) {
        lock.withLock { running.updateValue(live, forKey: id) }?.cancel()
    }

    func get(_ id: UInt32) -> LiveSpeech? { lock.withLock { running[id] } }

    func remove(_ id: UInt32) -> LiveSpeech? { lock.withLock { running.removeValue(forKey: id) } }
}

// MARK: - Transcription

/// `reporting: [.volatileResults]` also reports the words still being revised (live streams).
private func transcriber(
    for language: String,
    reporting: Set<SpeechTranscriber.ReportingOption> = []
) async throws -> SpeechTranscriber {
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: language)) else {
        throw SpeechFailure(kind: "unsupported-language", message: "Apple speech doesn't support \(language).")
    }
    return SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: reporting, attributeOptions: [.audioTimeRange])
}

private func installedTranscriber(
    _ language: String,
    reporting: Set<SpeechTranscriber.ReportingOption> = []
) async -> SpeechTranscriber? {
    guard let transcriber = try? await transcriber(for: language, reporting: reporting) else { return nil }
    return await AssetInventory.status(forModules: [transcriber]) == .installed ? transcriber : nil
}

/// A transcriber that can run now: Speech Recognition allowed and the language's model downloaded.
private func readyTranscriber(
    _ language: String,
    reporting: Set<SpeechTranscriber.ReportingOption> = []
) async throws -> SpeechTranscriber {
    guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
        throw SpeechFailure(kind: "not-authorized", message: "Speech Recognition is off for \(appName).")
    }
    guard let transcriber = await installedTranscriber(language, reporting: reporting) else {
        throw SpeechFailure(kind: "model-not-ready", message: "The Apple speech model for \(language) isn't downloaded.")
    }
    return transcriber
}

private func transcribe(file: String, language: String) async throws -> [[String: Any]] {
    let transcriber = try await readyTranscriber(language)
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
