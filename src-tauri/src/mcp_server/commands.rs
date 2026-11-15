//! Webview ⇄ MCP server: tool publishing and replies, and the coding agents rows.

use rmcp::model::Tool;
use serde::Serialize;
use tauri::{AppHandle, State};

use super::{
    agents::{self, AgentId, AgentStatus},
    host::{self, HostStatus, McpHostState, ToolReply},
};

/// The webview's tool list; `async` because a sync command here deadlocks the menu rebuild at launch.
#[tauri::command]
pub async fn mcp_host_publish_tools(
    app: AppHandle,
    state: State<'_, McpHostState>,
    tools: Vec<Tool>,
) -> Result<(), String> {
    state.publish_tools(tools);
    host::emit_status(&app);
    Ok(())
}

/// The result of one `mcp-host://call`.
#[tauri::command]
pub fn mcp_host_reply(state: State<'_, McpHostState>, id: u64, reply: ToolReply) {
    state.reply(id, reply);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerOverview {
    #[serde(flatten)]
    host: HostStatus,
    /// What any other agent's config launches: `command args`.
    command: Option<String>,
    args: Vec<String>,
}

#[tauri::command]
pub fn mcp_host_status(state: State<'_, McpHostState>) -> ServerOverview {
    let (command, args) = match agents::manual_command() {
        Some((command, arg)) => (Some(command), vec![arg]),
        None => (None, Vec::new()),
    };
    ServerOverview {
        host: state.status(),
        command,
        args,
    }
}

#[tauri::command]
pub async fn coding_agents_status() -> Vec<AgentStatus> {
    let mut statuses = Vec::with_capacity(agents::AGENTS.len());
    for id in agents::AGENTS {
        statuses.push(agents::status(id).await);
    }
    statuses
}

/// Add (`registered: true`) or remove Kasset in one agent's config.
#[tauri::command]
pub async fn coding_agent_set(id: AgentId, registered: bool) -> Result<AgentStatus, String> {
    agents::set(id, registered)
        .await
        .inspect_err(|e| log::error!("[mcp-host] {id:?} registration failed: {e}"))
}
