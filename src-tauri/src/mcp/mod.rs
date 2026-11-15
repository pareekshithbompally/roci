//! MCP client: Rust owns every server connection, `mcp_config.json`, health checks and tool calls.

pub mod commands;
mod config;
mod runtime;
mod shell_path;

pub use runtime::{kill_all_children, start_active_servers, McpState};
pub use shell_path::login_path;

/// Event the webview listens on to refresh server status and tools.
pub const MCP_UPDATE_EVENT: &str = "mcp-update";
