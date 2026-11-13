mod shortcuts;
mod window;
mod menubar;
mod autostart;
mod audio;
mod screenshot;
mod wake_lock;
mod notification;
mod permissions;
mod hex_stt;
mod mcp;

/// Open a folder in the OS file manager (Finder on macOS).
#[tauri::command]
fn reveal_in_file_manager(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
}

use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
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

      // Login-item / autostart launches pass --minimized: start hidden.
      // (Hex: LaunchWindow::OpenUnlessLoginItem stays quiet at login.)
      if std::env::args().any(|arg| arg == "--minimized")
        && let Some(window) = app.handle().get_webview_window("main")
      {
        let _ = window.hide();
      }

      Ok(())
    })
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_store::init())
    .plugin(tauri_plugin_calendar::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      Some(vec!["--minimized"]),
    ))
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(shortcuts::ShortcutState {
      registered: Mutex::new(Vec::new()),
    })
    .manage(wake_lock::WakeLockState::new())
    .manage(mcp::McpState::default())
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
      audio::commands::recover_recordings,
      // Permission checklist commands (macOS)
      permissions::commands::get_permissions,
      permissions::commands::request_permission,
      permissions::commands::open_permission_settings,
      // Hex transcription (running Hex app's local API)
      hex_stt::commands::hex_status,
      hex_stt::commands::hex_transcribe,
      // MCP client (servers, tools, calls)
      mcp::commands::get_mcp_configs,
      mcp::commands::save_mcp_configs,
      mcp::commands::activate_mcp_server,
      mcp::commands::deactivate_mcp_server,
      mcp::commands::restart_mcp_servers,
      mcp::commands::get_connected_mcp_servers,
      mcp::commands::get_mcp_server_info,
      mcp::commands::get_mcp_tools,
      mcp::commands::call_mcp_tool,
      mcp::commands::cancel_mcp_tool_call,
      // Screenshot commands
      screenshot::list_capturable_windows,
      screenshot::take_screenshot,
      // Wake lock commands (macOS: prevent idle sleep during recording)
      wake_lock::acquire_wake_lock,
      wake_lock::release_wake_lock,
      // Notification commands (actionable notifications via mac-notification-sys)
      notification::send_actionable_notification,
      // Utility commands
      reveal_in_file_manager,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| match event {
      tauri::RunEvent::Reopen { has_visible_windows, .. } => {
        if !has_visible_windows {
          window::show_main(app_handle);
        }
      }
      // Cmd+Q while recording: ask the user (stop and quit, or cancel).
      // A programmatic exit (code set) is the answer, so it goes through.
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
