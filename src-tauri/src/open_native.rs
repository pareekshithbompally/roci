//! Opens the few native places Kasset sends the user to — System Settings
//! privacy panes and the Hex app — by name. The webview can't open arbitrary
//! URLs (the shell scope only allows web links), so the targets live here.

use serde::Deserialize;
use std::process::Command;

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NativeTarget {
    CalendarsSettings,
    RemindersSettings,
    SpeechRecognitionSettings,
    AppleIntelligenceSettings,
    AutomationSettings,
    HexApp,
}

fn open_args(target: &NativeTarget) -> [&'static str; 2] {
    match target {
        NativeTarget::CalendarsSettings => ["-u", "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars"],
        NativeTarget::RemindersSettings => ["-u", "x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders"],
        NativeTarget::SpeechRecognitionSettings => ["-u", "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"],
        NativeTarget::AppleIntelligenceSettings => ["-u", "x-apple.systempreferences:com.apple.Siri-Settings.extension"],
        NativeTarget::AutomationSettings => ["-u", "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"],
        NativeTarget::HexApp => ["-a", "Hex"],
    }
}

/// `open` (LaunchServices) for one known target.
#[tauri::command]
pub fn open_native(target: NativeTarget) -> Result<(), String> {
    let status = Command::new("/usr/bin/open")
        .args(open_args(&target))
        .status()
        .map_err(|error| error.to_string())?;
    status.success().then_some(()).ok_or_else(|| format!("open exited with {status}"))
}
