mod shortcuts;
mod window;
mod menubar;
mod autostart;
mod audio;
mod screenshot;
mod wake_lock;
mod app_icon;
mod permissions;
mod hex;
mod ipc;
mod models;
mod stt;
mod sync;
mod tts;
mod open_native;
mod downloads;
mod mcp;
mod mcp_server;
mod url_actions;
mod meeting_reminders;
#[cfg(target_os = "macos")]
mod call_detection;
#[cfg(target_os = "macos")]
mod meeting_spotlight;

/// Open a folder in the OS file manager (Finder on macOS).
#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    // `-R` selects the item in a Finder window instead of opening it.
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| format!("Failed to reveal in Finder: {e}"))?;
    Ok(())
}

pub use mcp_server::RELAY_ARG as MCP_RELAY_ARG;
pub use mcp_server::relay::run as run_mcp_relay;

use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // Built here (`create: false` in tauri.conf.json) so its webview can take web downloads.
      let main = app.config().app.windows.iter().find(|w| w.label == "main").cloned().ok_or("main window config missing")?;
      tauri::WebviewWindowBuilder::from_config(app.handle(), &main)?
        .on_download(downloads::handle)
        .build()?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      // Setup window close handler (close hides to tray by preference)
      window::setup_window_handlers(app.handle());

      // Backend-owned menubar: tray icon, menu, visibility, quit path.
      menubar::setup(app.handle());

      // MCP: connect the servers the user left enabled.
      tauri::async_runtime::spawn(mcp::start_active_servers(app.handle().clone()));

      // Roci as an MCP server for coding agents (socket in the app data folder).
      mcp_server::start(app.handle().clone());

      // roci:// URL actions (queued until the webview is ready).
      url_actions::setup(app.handle());

      // Calendar meeting reminders: idle until the frontend enables them.
      meeting_reminders::start(app.handle().clone());

      // Detected calls: offer to record when a call app takes the microphone.
      #[cfg(target_os = "macos")]
      call_detection::start(app.handle().clone());

      // Meetings in Spotlight: follows meeting writes; idle until the frontend turns it on.
      #[cfg(target_os = "macos")]
      meeting_spotlight::start(app.handle().clone());

      // Login-item / autostart launches pass --minimized: start hidden.
      if std::env::args().any(|arg| arg == "--minimized")
        && let Some(window) = app.handle().get_webview_window("main")
      {
        let _ = window.hide();
      }

      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_store::init())
    .plugin(tauri_plugin_calendar::init())
    .plugin(tauri_plugin_notifications::init())
    .plugin(tauri_plugin_apple_intelligence::init())
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
      menubar::menubar_set_update,
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
      // Hex integration (transcription models + one-way meeting sync)
      meeting_reminders::configure_meeting_reminders,
      // Meetings in Spotlight (on/off)
      #[cfg(target_os = "macos")]
      meeting_spotlight::configure_meeting_spotlight,
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
      stt::commands::stt_transcribe,
      stt::commands::stt_live_start,
      stt::commands::stt_live_feed,
      stt::commands::stt_live_finish,
      stt::commands::stt_live_cancel,
      tts::commands::tts_voices,
      tts::commands::tts_speak,
      tts::commands::tts_stop,
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
      // Utility commands
      app_icon::app_icon,
      reveal_in_file_manager,
      open_native::open_native,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| match event {
      tauri::RunEvent::Reopen { has_visible_windows, .. } => {
        if !has_visible_windows {
          window::show_main(app_handle);
        }
      }
      // Cmd+Q while recording asks the user; a programmatic exit (code set) goes through.
      tauri::RunEvent::ExitRequested { code: None, api, .. }
        if audio::commands::capture_active() =>
      {
        api.prevent_exit();
        window::show_main(app_handle);
        let _ = app_handle.emit(window::QUIT_REQUESTED_EVENT, ());
      }
      tauri::RunEvent::Exit => {
        audio::commands::abandon_active();
        mcp::kill_all_children(app_handle);
      }
      _ => {}
    });
}
