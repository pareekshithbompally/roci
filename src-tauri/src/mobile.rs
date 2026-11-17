//! iOS / iPadOS: the shared shell. Features join here as their modules become shared.

use tauri::{App, AppHandle, Builder, Manager, RunEvent, WebviewWindowBuilder, Wry};

unsafe extern "C" {
  /// native/RociWebView.swift: pinned page, resized above the keyboard, no form toolbar.
  fn roci_webview_configure(webview: *mut std::ffi::c_void);
}

pub fn extend_window(window: WebviewWindowBuilder<'_, Wry, AppHandle>) -> WebviewWindowBuilder<'_, Wry, AppHandle> {
  window
}

pub fn extend(builder: Builder<Wry>) -> Builder<Wry> {
  builder
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  if let Some(window) = app.get_webview_window("main") {
    // SAFETY: `inner()` is the live WKWebView; the closure runs on the main thread, where UIKit must be used.
    window.with_webview(|webview| unsafe { roci_webview_configure(webview.inner()) })?;
  }
  Ok(())
}

pub fn on_event(_app_handle: &AppHandle, _event: RunEvent) {}
