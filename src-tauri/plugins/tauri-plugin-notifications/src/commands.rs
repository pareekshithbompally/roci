//! Webview commands. Async, so the permission prompt never blocks the main thread.

use tauri::command;

use crate::{Category, Notice, Status};

#[command]
pub async fn status() -> Status {
    crate::status()
}

/// Raise the macOS prompt when undecided (Settings › Notifications › Allow).
#[command]
pub async fn request() -> Status {
    crate::request()
}

#[command]
pub async fn post(notice: Notice) {
    crate::post(&notice);
}

#[command]
pub async fn schedule(notice: Notice, at_ms: i64) {
    crate::schedule(notice, at_ms);
}

#[command]
pub async fn remove(ids: Vec<String>) {
    crate::remove(&ids);
}

#[command]
pub async fn add_categories(categories: Vec<Category>) {
    crate::add_categories(&categories);
}

#[command]
pub async fn set_muted(kinds: Vec<String>) {
    crate::set_muted(kinds);
}
