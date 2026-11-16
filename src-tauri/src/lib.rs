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
#[cfg(desktop)]
mod audio;
#[cfg(desktop)]
mod screenshot;
#[cfg(desktop)]
mod wake_lock;
#[cfg(desktop)]
mod app_icon;
#[cfg(desktop)]
mod permissions;
#[cfg(desktop)]
mod hex;
#[cfg(desktop)]
mod ipc;
#[cfg(desktop)]
mod models;
#[cfg(desktop)]
mod stt;
#[cfg(desktop)]
mod sync;
#[cfg(desktop)]
mod tts;
#[cfg(desktop)]
mod open_native;
#[cfg(desktop)]
mod downloads;
#[cfg(desktop)]
mod mcp;
#[cfg(desktop)]
mod mcp_server;
#[cfg(desktop)]
mod url_actions;
#[cfg(desktop)]
mod meeting_reminders;
#[cfg(desktop)]
mod call_detection;
#[cfg(desktop)]
mod meeting_spotlight;

#[cfg(desktop)]
pub use mcp_server::RELAY_ARG as MCP_RELAY_ARG;
#[cfg(desktop)]
pub use mcp_server::relay::run as run_mcp_relay;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .setup(|app| {
      platform::extend_window(main_window(app)?).build()?;
      if cfg!(debug_assertions) {
        app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
      }
      platform::setup(app)
    })
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_store::init());
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
