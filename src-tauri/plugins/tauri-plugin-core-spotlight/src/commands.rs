//! Webview commands.

use tauri::command;

use crate::Status;

#[command]
pub async fn status() -> Status {
    Status {
        supported: crate::supported(),
    }
}
