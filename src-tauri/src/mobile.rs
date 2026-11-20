//! iOS / iPadOS: the shared shell. Features join here as their modules become shared.

use tauri::{App, AppHandle, Builder, Manager, RunEvent, WebviewWindowBuilder, Wry};

use crate::{audio, mcp, meeting_reminders, mlx, models, permissions, search_index, stt, tts};

unsafe extern "C" {
  /// native/RociWebView.swift: pinned page, resized above the keyboard, no form toolbar.
  fn roci_webview_configure(webview: *mut std::ffi::c_void);
}

pub fn extend_window(window: WebviewWindowBuilder<'_, Wry, AppHandle>) -> WebviewWindowBuilder<'_, Wry, AppHandle> {
  window
}

/// Meeting recording (microphone) and calendar meeting reminders, on-device models (MLX chat, meeting search and voices; transcribe.cpp speech) and remote MCP servers.
pub fn extend(builder: Builder<Wry>) -> Builder<Wry> {
  builder
    .manage(mcp::McpState::default())
    .manage(models::ModelsState::default())
    .manage(mlx::MlxState::default())
    .manage(stt::SttState::default())
    .manage(tts::TtsState::default())
    .invoke_handler(tauri::generate_handler![
      // The device's date/time formats (the web view's Intl ignores them)
      crate::system_format::system_format,
      audio::commands::start_audio_capture,
      audio::commands::stop_audio_capture,
      audio::commands::pause_audio_capture,
      audio::commands::resume_audio_capture,
      audio::commands::recorder_state,
      audio::commands::recover_meetings,
      meeting_reminders::configure_meeting_reminders,
      permissions::commands::get_permissions,
      permissions::commands::request_permission,
      permissions::commands::open_permission_settings,
      models::commands::local_models,
      models::commands::local_model_download,
      models::commands::local_model_cancel,
      models::commands::local_model_remove,
      models::local_models_set_idle,
      mlx::mlx_chat,
      mlx::mlx_cancel,
      search_index::search_meetings,
      search_index::search_meeting_within,
      search_index::search_chats,
      search_index::index_stretch,
      search_index::rebuild_search_index,
      stt::commands::stt_transcribe,
      stt::commands::stt_live_start,
      stt::commands::stt_live_feed,
      stt::commands::stt_live_finish,
      stt::commands::stt_live_cancel,
      audio::live::meeting_echo_signals,
      tts::commands::tts_voices,
      tts::commands::tts_speak,
      tts::commands::tts_stop,
      tts::commands::tts_chunks,
      mcp::commands::get_mcp_configs,
      mcp::commands::save_mcp_configs,
      mcp::commands::activate_mcp_server,
      mcp::commands::deactivate_mcp_server,
      mcp::commands::get_connected_mcp_servers,
      mcp::commands::get_mcp_server_info,
      mcp::commands::get_mcp_tools,
      mcp::commands::call_mcp_tool,
      mcp::commands::cancel_mcp_tool_call,
    ])
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  // Recording: microphone answers reach the webview; calls and route changes reach the recorder.
  permissions::emit_answers(app.handle().clone());
  audio::session::watch(app.handle().clone());
  // Meeting reminders: iOS delivers them (scheduled notices with Record), re-armed on calendar changes.
  meeting_reminders::start(app.handle().clone());
  crate::system_format::watch(app.handle().clone());
  // On-device model loads show in the activity tray.
  mlx::report_loads(app.handle());
  // Search: meetings and chats are indexed in Rust as they're saved.
  search_index::start(app.handle().clone());
  // MCP: connect the remote servers the user left enabled.
  tauri::async_runtime::spawn(mcp::start_active_servers(app.handle().clone()));
  if let Some(window) = app.get_webview_window("main") {
    // SAFETY: `inner()` is the live WKWebView; the closure runs on the main thread, where UIKit must be used.
    window.with_webview(|webview| unsafe { roci_webview_configure(webview.inner()) })?;
  }
  Ok(())
}

pub fn on_event(_app_handle: &AppHandle, _event: RunEvent) {}
