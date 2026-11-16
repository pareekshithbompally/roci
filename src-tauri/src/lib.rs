//! Roci's native core. `run()` picks the macOS app (`desktop`) or the iOS / iPadOS app (`mobile`);
//! modules move from desktop-only to shared as iOS gains each feature.

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

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
#[cfg(target_os = "macos")]
mod call_detection;
#[cfg(target_os = "macos")]
mod meeting_spotlight;

#[cfg(desktop)]
pub use mcp_server::RELAY_ARG as MCP_RELAY_ARG;
#[cfg(desktop)]
pub use mcp_server::relay::run as run_mcp_relay;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(desktop)]
  desktop::run();
  #[cfg(mobile)]
  mobile::run();
}
