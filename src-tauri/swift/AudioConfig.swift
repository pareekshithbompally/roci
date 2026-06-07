import Foundation

// MARK: - Audio bridge overview
//
// The macOS audio capture engine lives in Swift (it talks directly to Apple's
// AVFoundation + ScreenCaptureKit frameworks) and is driven from Rust over a C
// ABI, mirroring the project's tauri-plugin-calendar / CalendarBridge pattern.
//
//   Rust  src/audio/bridge.rs  ──extern "C"──▶  Swift  AudioBridge.swift  (@_cdecl)
//                                                        │
//                                        AudioCaptureEngine  (capture · mix · write)
//                                            ├─ Timeline        (PTS alignment)
//                                            └─ EchoCanceller   (NLMS echo removal)
//
// Capture strategy:
//   • System audio → ScreenCaptureKit (pristine, never voice-processed).
//   • Microphone   → AVAudioEngine input tap (always captured at full strength).
//   • Both streams share the mach host clock, so they align by timestamp; the
//     mic's system-audio echo is removed by the NLMS canceller, then the two are
//     summed to one mono stream and written as HQ (48 kHz playback) + AI (16 kHz
//     transcription) WAV files.

/// Pipeline sample rate — native capture and the HQ playback file.
let PROCESS_RATE: Double = 48_000
/// Downsampled rate for the transcription (AI) file.
let AI_RATE: Double = 16_000
/// Number of meter bars sent to the UI (matches the Rust/TS level event).
let LEVEL_BARS = 48
/// Minimum spacing between level-meter callbacks.
let LEVEL_THROTTLE: TimeInterval = 0.08

/// Capture source, kept in sync with the Rust `AudioCaptureSource` tags (0/1/2).
enum Source: Int32 {
    case system = 0
    case microphone = 1
    case systemAndMicrophone = 2
}

/// Level-meter callback into Rust: (ctx, rms, peak, barsPtr, barsLen).
public typealias LevelCallback = @convention(c) (
    UnsafeMutableRawPointer?, Float, Float, UnsafePointer<UInt8>?, Int
) -> Void
