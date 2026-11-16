//! iOS / iPadOS: the shared shell. Features join here as their modules become shared.

use tauri::{App, AppHandle, Builder, RunEvent, WebviewWindowBuilder, Wry};

pub fn extend_window(window: WebviewWindowBuilder<'_, Wry, AppHandle>) -> WebviewWindowBuilder<'_, Wry, AppHandle> {
  window
}

pub fn extend(builder: Builder<Wry>) -> Builder<Wry> {
  builder
}

pub fn setup(_app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  Ok(())
}

pub fn on_event(_app_handle: &AppHandle, _event: RunEvent) {}
