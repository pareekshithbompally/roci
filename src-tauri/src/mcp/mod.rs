//! MCP client: Rust owns every server connection, `mcp_config.json`, health checks and tool calls.

pub mod commands;
mod config;
mod runtime;
#[cfg(desktop)]
mod shell_path;
#[cfg(desktop)]
mod stdio;

pub use runtime::{start_active_servers, McpState};
#[cfg(desktop)]
pub use shell_path::login_path;
#[cfg(desktop)]
pub use stdio::kill_all_children;

/// Event the webview listens on to refresh server status and tools.
pub const MCP_UPDATE_EVENT: &str = "mcp-update";
