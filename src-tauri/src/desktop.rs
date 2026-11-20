//! macOS: the full app (menu bar, shortcuts, audio capture, MCP, coding agents …).

use crate::{
  app_icon, audio, autostart, call_detection, choice_menu, downloads, hex, mcp, mcp_server, meeting_reminders, meeting_spotlight, search_index,
  menubar, mlx, models, native_alert, open_native, permissions, screenshot, shortcuts, stt, system_format, tts, updates, url_actions, window,
};
use std::sync::Mutex;
use tauri::{App, AppHandle, Builder, Emitter, Manager, RunEvent, WebviewWindowBuilder, Wry};
use tauri_plugin_autostart::MacosLauncher;

/// The main window's webview takes web downloads.
pub fn extend_window(window: WebviewWindowBuilder<'_, Wry, AppHandle>) -> WebviewWindowBuilder<'_, Wry, AppHandle> {
  window.on_download(downloads::handle)
}

/// Desktop plugins, state and commands on the shared builder.
pub fn extend(builder: Builder<Wry>) -> Builder<Wry> {
  builder
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_apple_notes::init())
    .plugin(tauri_plugin_core_spotlight::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      Some(vec!["--minimized"]),
    ))
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_deep_link::init())
    .manage(shortcuts::ShortcutState {
      registered: Mutex::new(Vec::new()),
    })
    .manage(mcp::McpState::default())
    .manage(mcp_server::McpHostState::default())
    .manage(url_actions::UrlActionsState::default())
    .manage(hex::HexState::default())
    .manage(models::ModelsState::default())
    .manage(stt::SttState::default())
    .manage(tts::TtsState::default())
    .manage(mlx::MlxState::default())
    .invoke_handler(tauri::generate_handler![
      // Shortcut commands
      shortcuts::register_shortcut,
      shortcuts::unregister_shortcut,
      shortcuts::unregister_all_shortcuts,
      shortcuts::is_shortcut_registered,
      // Window commands
      window::get_window_state,
      window::save_window_state,
      window::show_window,
      window::hide_window,
      window::toggle_window,
      window::set_always_on_top,
      // Autostart commands
      autostart::enable_autostart,
      autostart::disable_autostart,
      autostart::is_autostart_enabled,
      // Menubar commands (backend owns tray icon, menu, visibility)
      menubar::menubar_set_recording_state,
      menubar::menubar_set_speech_models,
      menubar::menubar_set_activity,
      menubar::menubar_set_recent_meetings,
      menubar::menubar_set_tooltip,
      menubar::menubar_set_visible,
      menubar::menubar_set_prefs,
      menubar::menubar_get_state,
      menubar::menubar_quit,
      // Audio capture commands (macOS)
      audio::commands::start_audio_capture,
      audio::commands::stop_audio_capture,
      audio::commands::pause_audio_capture,
      audio::commands::resume_audio_capture,
      audio::commands::recorder_state,
      audio::commands::recover_meetings,
      // Permission checklist commands (macOS)
      permissions::commands::get_permissions,
      permissions::commands::request_permission,
      permissions::commands::open_permission_settings,
      // Meeting reminders (on/off)
      meeting_reminders::configure_meeting_reminders,
      meeting_reminders::record_calendar_event,
      // The Mac's date/time formats (the web view's Intl ignores them)
      system_format::system_format,
      // Meetings in Spotlight (on/off)
      meeting_spotlight::configure_meeting_spotlight,
      // Hex integration (transcription models + one-way meeting sync)
      hex::commands::hex_status,
      hex::commands::hex_transcribe,
      hex::commands::hex_meetings_list,
      hex::commands::hex_meeting_show,
      hex::commands::hex_watch,
      // Curated on-device models (download / delete), speech-to-text, read aloud
      models::commands::local_models,
      models::commands::local_model_download,
      models::commands::local_model_cancel,
      models::commands::local_model_remove,
      models::local_models_set_idle,
      stt::commands::stt_transcribe,
      stt::commands::stt_live_start,
      stt::commands::stt_live_feed,
      stt::commands::stt_live_finish,
      stt::commands::stt_live_cancel,
      choice_menu::native_menu,
      native_alert::native_alert,
      audio::live::meeting_echo_signals,
      tts::commands::tts_voices,
      tts::commands::tts_speak,
      tts::commands::tts_stop,
      tts::commands::tts_chunks,
      mlx::mlx_chat,
      mlx::mlx_cancel,
      search_index::search_meetings,
      search_index::search_meeting_within,
      search_index::search_chats,
      search_index::index_stretch,
      search_index::rebuild_search_index,
      // MCP client (servers, tools, calls)
      mcp::commands::get_mcp_configs,
      mcp::commands::save_mcp_configs,
      mcp::commands::activate_mcp_server,
      mcp::commands::deactivate_mcp_server,
      mcp::commands::get_connected_mcp_servers,
      mcp::commands::get_mcp_server_info,
      mcp::commands::get_mcp_tools,
      mcp::commands::call_mcp_tool,
      mcp::commands::cancel_mcp_tool_call,
      // MCP server (Roci's tools for coding agents)
      mcp_server::commands::mcp_host_publish_tools,
      mcp_server::commands::mcp_host_reply,
      mcp_server::commands::mcp_host_status,
      mcp_server::commands::coding_agents_status,
      mcp_server::commands::coding_agent_set,
      // roci:// URL actions
      url_actions::url_actions_ready,
      // Screenshot commands
      screenshot::list_capturable_windows,
      screenshot::take_screenshot,
      // App updates (Rust checks daily and installs)
      updates::update_check,
      updates::update_state,
      updates::update_install,
      // Utility commands
      app_icon::app_icon,
      open_native::open_native,
    ])
}

/// Desktop setup, after the shared main window and log.
pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
  // Setup window close handler (close hides to tray by preference)
  window::setup_window_handlers(app.handle());

  // Backend-owned menubar: tray icon, menu, visibility, quit path.
  menubar::setup(app.handle());

  // On-device model loads show in the activity tray.
  mlx::report_loads(app.handle());


  // MCP: connect the servers the user left enabled.
  tauri::async_runtime::spawn(mcp::start_active_servers(app.handle().clone()));

  // Roci as an MCP server for coding agents (socket in the app data folder).
  mcp_server::start(app.handle().clone());

  // roci:// URL actions (queued until the webview is ready).
  url_actions::setup(app.handle());

  // Calendar meeting reminders: idle until the frontend enables them.
  permissions::emit_answers(app.handle().clone());
  meeting_reminders::start(app.handle().clone());
  system_format::watch(app.handle().clone());

  // Detected calls: offer to record when a call app takes the microphone.
  call_detection::start(app.handle().clone());

  // App updates: checked after launch and daily; the menu bar, tray row and one notification per version say so.
  updates::start(app.handle().clone());

  // Meetings in Spotlight: follows meeting writes; idle until the frontend turns it on.
  meeting_spotlight::start(app.handle().clone());
  // Search: meetings and chats are indexed in Rust as they're saved.
  search_index::start(app.handle().clone());

  // Login-item / autostart launches pass --minimized: start hidden.
  if std::env::args().any(|arg| arg == "--minimized")
    && let Some(window) = app.handle().get_webview_window("main")
  {
    let _ = window.hide();
  }

  Ok(())
}

/// App lifecycle: Dock reopen, quit while recording, exit cleanup.
pub fn on_event(app_handle: &AppHandle, event: RunEvent) {
  match event {
    RunEvent::Reopen { has_visible_windows, .. } => {
      if !has_visible_windows {
        window::show_main(app_handle);
      }
    }
    // Cmd+Q while recording asks the user; a programmatic exit (code set) goes through.
    RunEvent::ExitRequested { code: None, api, .. } if audio::commands::capture_active() => {
      api.prevent_exit();
      window::show_main(app_handle);
      let _ = app_handle.emit(window::QUIT_REQUESTED_EVENT, ());
    }
    RunEvent::Exit => {
      audio::commands::abandon_active();
      mcp::kill_all_children(app_handle);
      mlx::unload_all();
    }
    _ => {}
  }
}
