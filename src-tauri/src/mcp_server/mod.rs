//! Roci as an MCP server: agents launch the stdio relay, which reaches the app's socket and webview tools.

pub mod agents;
pub mod commands;
mod host;
pub mod relay;

use std::path::PathBuf;

pub use host::{McpHostState, start};

/// The argument that turns the app binary into the stdio relay (`Roci mcp`).
pub const RELAY_ARG: &str = "mcp";
/// The server's name in every agent's config, and in `initialize`.
pub const SERVER_NAME: &str = "roci";
/// `identifier` in tauri.conf.json, hardcoded because the relay runs without Tauri.
const BUNDLE_ID: &str = "ai.roci.app";
const SOCKET_FILE: &str = "mcp.sock";

/// `~/Library/Application Support/ai.roci.app/mcp.sock`, shared by host and relay.
pub fn socket_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
    Ok(PathBuf::from(home)
        .join("Library/Application Support")
        .join(BUNDLE_ID)
        .join(SOCKET_FILE))
}
