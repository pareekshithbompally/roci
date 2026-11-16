// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // `Roci mcp`: the stdio relay coding agents launch — no window, no Tauri.
  #[cfg(desktop)]
  if std::env::args().nth(1).as_deref() == Some(app_lib::MCP_RELAY_ARG) {
    std::process::exit(app_lib::run_mcp_relay());
  }
  app_lib::run();
}
