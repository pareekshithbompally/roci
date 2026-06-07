import Foundation
import AVFoundation
import ScreenCaptureKit

// MARK: - AudioCaptureEngine
//
// Owns the live capture for one recording: ScreenCaptureKit for system audio,
// an AVAudioEngine input tap for the mic, a Timeline to align + mix them, and
// the two WAV writers. All mixing/writing happens on a single serial queue, so
// Timeline access is lock-free-by-confinement.

final class AudioCaptureEngine: NSObject, SCStreamOutput, SCStreamDelegate {
    private let source: Source
    private var hqFile: AVAudioFile?
    private var aiFile: AVAudioFile?
    private var aiConverter: AVAudioConverter?

    private var stream: SCStream?              // system audio
    private let micEngine = AVAudioEngine()    // microphone
    private var micConverter: AVAudioConverter?

    private let timeline: Timeline
    private let queue = DispatchQueue(label: "ai.kasset.audio.mix")

    private let callback: LevelCallback
    private let ctx: UnsafeMutableRawPointer?
    private var lastLevelEmit = Date.distantPast

    private let canonical = AVAudioFormat(standardFormatWithSampleRate: PROCESS_RATE, channels: 1)!

    /// mach ticks → seconds (same epoch as SCStream host-clock PTS).
    private static let machRatio: Double = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(info.numer) / Double(info.denom) / 1e9
    }()

    init(source: Source, callback: @escaping LevelCallback, ctx: UnsafeMutableRawPointer?) {
        self.source = source
        self.timeline = Timeline(mixed: source == .systemAndMicrophone)
        self.callback = callback
        self.ctx = ctx
        super.init()
    }

    // MARK: Lifecycle

    func start(hqPath: String, aiPath: String) throws {
        let pcm16: (Double) -> [String: Any] = { rate in
            [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: rate,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
            ]
        }
        hqFile = try AVAudioFile(forWriting: URL(fileURLWithPath: hqPath), settings: pcm16(PROCESS_RATE))
        aiFile = try AVAudioFile(forWriting: URL(fileURLWithPath: aiPath), settings: pcm16(AI_RATE))

        switch source {
        case .microphone:
            try startMic(asMicLane: false)
        case .system:
            try startScreenCapture()
        case .systemAndMicrophone:
            try startScreenCapture()                 // system → sys lane
            // A mic-engine failure must not abort the whole recording — keep the
            // system audio going and log why the mic didn't start.
            do {
                try startMic(asMicLane: true)        // full mic → mic lane (echo removed in mix)
            } catch {
                NSLog("[AudioBridge] mic engine failed, recording system-only: \(error)")
            }
        }
    }

    func stop() {
        stream?.stopCapture { _ in }
        stream = nil
        if micEngine.isRunning {
            micEngine.inputNode.removeTap(onBus: 0)
            micEngine.stop()
        }
        queue.sync {
            let tail = timeline.drainRemaining()
            if !tail.isEmpty { writeMixed(tail) }
        }
        hqFile = nil // closing finalizes the WAV header
        aiFile = nil
    }

    func pause() { if micEngine.isRunning { micEngine.pause() } }
    func resume() { try? micEngine.start() }

    // MARK: Microphone (AVAudioEngine input tap)

    private func startMic(asMicLane: Bool) throws {
        // Plain input tap — the mic is always captured at full strength. Echo is
        // removed downstream by the NLMS canceller in the mix, not by gating the
        // mic. (No VoiceProcessingIO: it suppresses the mic whenever system audio
        // plays, which is exactly the behavior we must avoid in a recorder.)
        let input = micEngine.inputNode
        let inFormat = input.outputFormat(forBus: 0)
        micConverter = (inFormat == canonical) ? nil : AVAudioConverter(from: inFormat, to: canonical)

        input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { [weak self] buf, when in
            guard let self = self else { return }
            let mono = self.toCanonical(buf, using: self.micConverter)
            if mono.isEmpty { return }
            let pts = when.isHostTimeValid ? Double(when.hostTime) * Self.machRatio : CACurrentMediaTime()
            self.queue.async {
                self.timeline.push(isMic: asMicLane, pts: pts, mono)
                let out = self.timeline.drain()
                if !out.isEmpty { self.writeMixed(out) }
            }
        }
        micEngine.prepare()
        try micEngine.start()
    }

    private func toCanonical(_ buffer: AVAudioPCMBuffer, using conv: AVAudioConverter?) -> [Float] {
        let out: AVAudioPCMBuffer
        if let conv = conv {
            let cap = AVAudioFrameCount(Double(buffer.frameLength) * (PROCESS_RATE / buffer.format.sampleRate)) + 1024
            guard let dst = AVAudioPCMBuffer(pcmFormat: canonical, frameCapacity: cap) else { return [] }
            var fed = false
            var err: NSError?
            let block: AVAudioConverterInputBlock = { _, status in
                if fed { status.pointee = .noDataNow; return nil }
                fed = true; status.pointee = .haveData; return buffer
            }
            conv.convert(to: dst, error: &err, withInputFrom: block)
            if err != nil { return [] }
            out = dst
        } else {
            out = buffer
        }
        let n = Int(out.frameLength)
        guard n > 0, let ch = out.floatChannelData?[0] else { return [] }
        return Array(UnsafeBufferPointer(start: ch, count: n))
    }

    // MARK: System (ScreenCaptureKit)

    private func startScreenCapture() throws {
        let sema = DispatchSemaphore(value: 0)
        var content: SCShareableContent?
        var err: Error?
        SCShareableContent.getWithCompletionHandler { c, e in content = c; err = e; sema.signal() }
        sema.wait()
        if let e = err { throw e }
        guard let display = content?.displays.first else {
            throw NSError(domain: "AudioBridge", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "No display for capture"])
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = Int(PROCESS_RATE)
        config.channelCount = 1

        let s = SCStream(filter: filter, configuration: config, delegate: self)
        try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)

        let sema2 = DispatchSemaphore(value: 0)
        var startErr: Error?
        s.startCapture { e in startErr = e; sema2.signal() }
        sema2.wait()
        if let e = startErr { throw e }
        stream = s
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
                of type: SCStreamOutputType) {
        guard type == .audio, sampleBuffer.isValid else { return }
        guard let pcm = Self.pcmBuffer(from: sampleBuffer, format: canonical) else { return }
        let n = Int(pcm.frameLength)
        guard n > 0, let ch = pcm.floatChannelData?[0] else { return }
        let samples = Array(UnsafeBufferPointer(start: ch, count: n))
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds

        // Already on `queue`; Timeline access is serial.
        timeline.push(isMic: false, pts: pts, samples)
        let out = timeline.drain()
        if !out.isEmpty { writeMixed(out) }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        NSLog("[AudioBridge] SCStream stopped: \(error)")
    }

    /// CMSampleBuffer → AVAudioPCMBuffer in the canonical 48 kHz mono format.
    private static func pcmBuffer(from sb: CMSampleBuffer, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard let fmtDesc = CMSampleBufferGetFormatDescription(sb),
              let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(fmtDesc)
        else { return nil }
        var asbd = asbdPtr.pointee
        guard let srcFormat = AVAudioFormat(streamDescription: &asbd) else { return nil }
        let frames = AVAudioFrameCount(CMSampleBufferGetNumSamples(sb))
        guard frames > 0, let src = AVAudioPCMBuffer(pcmFormat: srcFormat, frameCapacity: frames) else { return nil }
        src.frameLength = frames
        CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sb, at: 0, frameCount: Int32(frames), into: src.mutableAudioBufferList)

        if srcFormat == format { return src }
        guard let conv = AVAudioConverter(from: srcFormat, to: format) else { return nil }
        let cap = AVAudioFrameCount(Double(frames) * (format.sampleRate / srcFormat.sampleRate)) + 1024
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: cap) else { return nil }
        var fed = false
        var err: NSError?
        let block: AVAudioConverterInputBlock = { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true; status.pointee = .haveData; return src
        }
        conv.convert(to: out, error: &err, withInputFrom: block)
        return err == nil ? out : nil
    }

    // MARK: Output (files + meter)

    private func writeMixed(_ samples: [Float]) {
        guard let buf = AVAudioPCMBuffer(pcmFormat: canonical, frameCapacity: AVAudioFrameCount(samples.count)),
              let ch = buf.floatChannelData?[0] else { return }
        buf.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { ch.update(from: $0.baseAddress!, count: samples.count) }

        if let hq = hqFile { try? hq.write(from: buf) }

        if let ai = aiFile {
            if aiConverter == nil { aiConverter = AVAudioConverter(from: canonical, to: ai.processingFormat) }
            if let conv = aiConverter {
                let cap = AVAudioFrameCount(Double(buf.frameLength) * (AI_RATE / PROCESS_RATE)) + 4096
                if let out = AVAudioPCMBuffer(pcmFormat: ai.processingFormat, frameCapacity: cap) {
                    var fed = false
                    var err: NSError?
                    let block: AVAudioConverterInputBlock = { _, status in
                        if fed { status.pointee = .noDataNow; return nil }
                        fed = true; status.pointee = .haveData; return buf
                    }
                    conv.convert(to: out, error: &err, withInputFrom: block)
                    if err == nil && out.frameLength > 0 { try? ai.write(from: out) }
                }
            }
        }

        emitLevels(samples)
    }

    private func emitLevels(_ s: [Float]) {
        guard Date().timeIntervalSince(lastLevelEmit) >= LEVEL_THROTTLE, !s.isEmpty else { return }
        lastLevelEmit = Date()

        var sumSq: Float = 0, peak: Float = 0
        for v in s { let a = abs(v); if a > peak { peak = a }; sumSq += v * v }
        let rms = (sumSq / Float(s.count)).squareRoot()

        var bars = [UInt8](repeating: 0, count: LEVEL_BARS)
        let bucket = max(s.count / LEVEL_BARS, 1)
        for b in 0..<LEVEL_BARS {
            let start = b * bucket
            if start >= s.count { break }
            let end = min((b + 1) * bucket, s.count)
            var sum: Float = 0
            for i in start..<end { sum += abs(s[i]) }
            let avg = sum / Float(end - start)
            bars[b] = UInt8(min(pow(avg, 0.6), 1.0) * 255)
        }
        bars.withUnsafeBufferPointer { callback(ctx, rms, peak, $0.baseAddress, LEVEL_BARS) }
    }
}
