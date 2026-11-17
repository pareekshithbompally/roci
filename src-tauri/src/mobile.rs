//! iOS / iPadOS: the shared shell. Features join here as their modules become shared.

use tauri::{App, AppHandle, Builder, Manager, RunEvent, WebviewWindowBuilder, Wry};

use crate::{mlx, models};

unsafe extern "C" {
  /// native/RociWebView.swift: pinned page, resized above the keyboard, no form toolbar.
  fn roci_webview_configure(webview: *mut std::ffi::c_void);
}

pub fn extend_window(window: WebviewWindowBuilder<'_, Wry, AppHandle>) -> WebviewWindowBuilder<'_, Wry, AppHandle> {
  window
}

/// On-device models (MLX chat and meeting search): their catalog, downloads and engine.
pub fn extend(builder: Builder<Wry>) -> Builder<Wry> {
  builder
    .manage(models::ModelsState::default())
    .manage(mlx::MlxState::default())
    .invoke_handler(tauri::generate_handler![
      models::commands::local_models,
      models::commands::local_model_download,
      models::commands::local_model_cancel,
      models::commands::local_model_remove,
      models::local_models_set_idle,
      mlx::mlx_chat,
      mlx::mlx_cancel,
      mlx::mlx_embed,
    ])
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  if let Some(window) = app.get_webview_window("main") {
    // SAFETY: `inner()` is the live WKWebView; the closure runs on the main thread, where UIKit must be used.
    window.with_webview(|webview| unsafe { roci_webview_configure(webview.inner()) })?;
  }
  Ok(())
}

pub fn on_event(_app_handle: &AppHandle, _event: RunEvent) {}
