const COMMANDS: &[&str] = &[
    "availability",
    "generate",
    "generate_cancel",
    "stream",
    "stream_cancel",
    "speech_status",
    "speech_request_access",
    "speech_prepare",
    "speech_transcribe",
];

fn main() {
    apple_build::SwiftLibrary {
        name: "apple_intelligence_bridge",
        module: "AppleIntelligenceBridge",
        sources: &["swift/LanguageModelBridge.swift", "swift/SpeechBridge.swift"],
        frameworks: &["Speech", "AVFAudio", "FoundationModels"],
    }
    .build();
    tauri_plugin::Builder::new(COMMANDS).build();
}
