//! Apple's on-device models for Kasset: FoundationModels (summaries, through
//! the AI SDK model in services/ai) and SpeechAnalyzer (a transcription engine).
//! Requires `NSSpeechRecognitionUsageDescription` in Info.plist. Language-model
//! calls need no permission — only availability (device, setting, model, macOS).

mod bridge;
mod commands;
pub mod types;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("apple-intelligence")
        .invoke_handler(tauri::generate_handler![
            commands::availability,
            commands::generate,
            commands::speech_status,
            commands::speech_request_access,
            commands::speech_prepare,
            commands::speech_transcribe,
        ])
        .build()
}
