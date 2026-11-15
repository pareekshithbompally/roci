//! On-device FoundationModels and SpeechAnalyzer; speech needs `NSSpeechRecognitionUsageDescription`.

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
