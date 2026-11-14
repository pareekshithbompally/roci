//! MCP (Model Context Protocol) client — ported from Jan's `core::mcp`
//! (Apache-2.0, `src-tauri/licenses/JAN-APACHE-2.0.txt`).
//!
//! Rust owns every server connection (stdio child processes and Streamable
//! HTTP), the `mcp_config.json` file, health monitoring with backoff
//! reconnect, and tool calls. The webview lists tools and calls them through
//! the commands in [`commands`]; it never talks to a server directly.
//!
//! Kept from Jan: config shape (`mcpServers` + `mcpSettings`), activation
//! idempotency, stderr draining, tools/list verification, health monitor,
//! cancellable tool calls with timeout, result truncation, refusing tool names
//! offered by more than one server. Left out: OAuth, the Jan Browser bridge,
//! bundled bun/uv overrides, router-model settings.

pub mod commands;
mod config;
mod runtime;
mod shell_path;

pub use runtime::{kill_all_children, start_active_servers, McpState};
pub use shell_path::login_path;

/// Event the webview listens on to refresh server status and tools.
pub const MCP_UPDATE_EVENT: &str = "mcp-update";
