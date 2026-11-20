//! Roci's native core: one shared builder, extended by `desktop` (macOS) or `mobile` (iOS / iPadOS).

#[cfg(desktop)]
mod desktop;
#[cfg(desktop)]
use desktop as platform;
#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
use mobile as platform;

#[cfg(desktop)]
mod shortcuts;
#[cfg(desktop)]
mod window;
#[cfg(desktop)]
mod menubar;
#[cfg(desktop)]
mod autostart;
mod audio;
#[cfg(target_os = "ios")]
mod audio_session;
#[cfg(desktop)]
mod choice_menu;
#[cfg(desktop)]
mod native_alert;
#[cfg(desktop)]
mod screenshot;
#[cfg(desktop)]
mod wake_lock;
#[cfg(desktop)]
mod app_icon;
mod permissions;
#[cfg(desktop)]
mod hex;
mod ipc;
mod models;
mod stt;
mod sync;
mod tts;
mod mlx;
#[cfg(desktop)]
mod open_native;
#[cfg(desktop)]
mod downloads;
mod mcp;
mod system_format;
#[cfg(desktop)]
mod mcp_server;
#[cfg(desktop)]
mod updates;
#[cfg(desktop)]
mod url_actions;
mod meeting_reminders;
#[cfg(desktop)]
mod call_detection;
#[cfg(desktop)]
mod meeting_spotlight;

#[cfg(desktop)]
pub use mcp_server::RELAY_ARG as MCP_RELAY_ARG;
#[cfg(desktop)]
pub use mcp_server::relay::run as run_mcp_relay;

/// Info and above, in every build: the terminal while developing, and a rotating file in the app's log folder
/// (`~/Library/Logs/ai.roci.roci/` on macOS) so a release build's errors can be read.
fn logger() -> tauri::plugin::TauriPlugin<tauri::Wry> {
  use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
  const MAX_LOG_BYTES: u128 = 5 * 1024 * 1024;
  tauri_plugin_log::Builder::default()
    .level(log::LevelFilter::Info)
    .targets([Target::new(TargetKind::Stdout), Target::new(TargetKind::LogDir { file_name: None })])
    .max_file_size(MAX_LOG_BYTES)
    .rotation_strategy(RotationStrategy::KeepOne)
    .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .setup(|app| {
      platform::extend_window(main_window(app)?).build()?;
      app.handle().plugin(logger())?;
      platform::setup(app)
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::init())
    .plugin(tauri_plugin_apple_intelligence::init())
    .plugin(tauri_plugin_calendar::init())
    .plugin(tauri_plugin_notifications::init());
  platform::extend(builder)
    .build(tauri::generate_context!())
    .expect(concat!("error while running ", env!("APP_NAME")))
    .run(platform::on_event);
}

/// The main window from config (`create: false` in tauri.conf.json), for the platform to extend and build.
fn main_window(app: &tauri::App) -> Result<tauri::WebviewWindowBuilder<'_, tauri::Wry, tauri::AppHandle>, Box<dyn std::error::Error>> {
  let main = app.config().app.windows.iter().find(|w| w.label == "main").cloned().ok_or("main window config missing")?;
  Ok(tauri::WebviewWindowBuilder::from_config(app.handle(), &main)?)
}
