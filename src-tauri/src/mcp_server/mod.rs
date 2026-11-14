//! Kasset as an MCP server — the same tools Kasset's chat uses, offered to
//! coding agents (Claude Code, Codex, OpenCode, …).
//!
//! One server, one tool registry. The tools stay in the webview
//! (`src/extensions/tools`); this module only carries them:
//!
//! ```text
//! agent ──stdio──▶ `Kasset mcp` (relay) ──unix socket──▶ app (host) ──event──▶ webview tool
//! ```
//!
//! - [`host`] — the running app listens on a user-only socket in its data
//!   folder and serves MCP there, asking the webview to list and run tools.
//! - [`relay`] — `Kasset mcp`, the command agents launch. It joins its stdio
//!   to the socket, opening Kasset in the background first when it isn't
//!   running. No port, no token in any agent's config.
//! - [`agents`] — adds or removes exactly one `kasset` server entry in each
//!   agent's own config, through the agent's CLI where it has one.

pub mod agents;
pub mod commands;
mod host;
pub mod relay;

use std::path::PathBuf;

pub use host::{McpHostState, start};

/// The argument that turns the app binary into the stdio relay (`Kasset mcp`).
pub const RELAY_ARG: &str = "mcp";
/// The server's name in every agent's config, and in `initialize`.
pub const SERVER_NAME: &str = "kasset";
/// `identifier` in tauri.conf.json — the app's data folder name. The relay runs
/// without Tauri, so it can't ask for it.
const BUNDLE_ID: &str = "ai.kasset.desktop";
const SOCKET_FILE: &str = "mcp.sock";

/// `~/Library/Application Support/ai.kasset.desktop/mcp.sock`, shared by host and relay.
pub fn socket_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("HOME is not set")?;
    Ok(PathBuf::from(home)
        .join("Library/Application Support")
        .join(BUNDLE_ID)
        .join(SOCKET_FILE))
}
