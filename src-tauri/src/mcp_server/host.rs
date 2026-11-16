//! App side: serves MCP on the socket and runs each tool call in the webview, waiting for it to be ready.

use std::{
    collections::HashMap,
    os::unix::fs::PermissionsExt,
    path::Path,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler, ServiceExt,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
        ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
    },
    service::RequestContext,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    net::{UnixListener, UnixStream},
    sync::{oneshot, watch},
    time::timeout,
};

use super::{SERVER_NAME, socket_path};

/// Rust → webview: run one tool (`ToolCallRequest`).
pub const CALL_EVENT: &str = "mcp-host://call";
/// Rust → webview: the listener or its client count changed.
pub const STATUS_EVENT: &str = "mcp-host://status";

/// How long a request waits for the webview after Roci launches.
const WEBVIEW_READY_TIMEOUT: Duration = Duration::from_secs(30);
/// Only catches a webview that went away mid-call; the webview bounds each tool itself.
const CALL_TIMEOUT: Duration = Duration::from_secs(45);
/// Owner read/write only: other users on this Mac can't connect.
const SOCKET_MODE: u32 = 0o600;

const INSTRUCTIONS: &str = "Roci holds the user's recorded meetings (transcripts, summaries, \
action items), their todos, and their Roci chat history. Start with search_meetings or \
list_meetings, then get_meeting for one meeting in full.";

#[derive(Default)]
pub struct McpHostState {
    /// `None` until the webview publishes its tools.
    tools: Mutex<Option<watch::Sender<Option<Vec<Tool>>>>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<ToolReply>>>,
    next_call: AtomicU64,
    next_session: AtomicU64,
    /// Agents connected now, by session, as each announced itself when it connected.
    agents: Mutex<Vec<(u64, ConnectedAgent)>>,
    /// Why the socket isn't listening, when it isn't.
    error: Mutex<Option<String>>,
    listening: std::sync::atomic::AtomicBool,
}

/// What the webview sends back for one call.
#[derive(Debug, serde::Deserialize)]
pub struct ToolReply {
    pub text: String,
    #[serde(rename = "isError")]
    pub is_error: bool,
}

#[derive(Clone, Serialize)]
struct ToolCallRequest<'a> {
    id: u64,
    name: &'a str,
    arguments: serde_json::Value,
}

/// A connected agent as it announced itself (MCP `clientInfo`), e.g. `claude-code` / "Claude Code".
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ConnectedAgent {
    pub name: String,
    pub title: String,
}

impl ConnectedAgent {
    fn from_client(client: &rmcp::model::Implementation) -> Self {
        Self {
            name: client.name.clone(),
            title: client.title.clone().unwrap_or_else(|| client.name.clone()),
        }
    }
}

/// What Settings › Integrations and the menu bar show about the server.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatus {
    pub listening: bool,
    /// The webview published its tools: calls run now instead of waiting.
    pub ready: bool,
    pub clients: usize,
    pub agents: Vec<ConnectedAgent>,
    pub error: Option<String>,
}

impl HostStatus {
    /// The menu bar row: a summary, its status dot, and the agents connected (status only — the server lives with the app).
    pub fn menu_status(&self) -> crate::menubar::McpMenuStatus {
        use crate::menubar::StatusLevel;
        let (summary, level) = match (self.error.is_some(), self.listening && self.ready, self.agents.len()) {
            (true, _, _) => ("Unavailable".to_string(), StatusLevel::Unavailable),
            (false, false, _) => ("Starting…".to_string(), StatusLevel::Starting),
            (false, true, 0) => ("Ready".to_string(), StatusLevel::Available),
            (false, true, 1) => ("1 agent connected".to_string(), StatusLevel::Available),
            (false, true, n) => (format!("{n} agents connected"), StatusLevel::Available),
        };
        crate::menubar::McpMenuStatus {
            summary,
            level,
            agents: self.agents.iter().map(|a| (a.name.clone(), a.title.clone())).collect(),
        }
    }
}

impl McpHostState {
    fn sender(&self) -> watch::Sender<Option<Vec<Tool>>> {
        let mut guard = self.tools.lock().unwrap_or_else(|e| e.into_inner());
        guard.get_or_insert_with(|| watch::channel(None).0).clone()
    }

    pub fn publish_tools(&self, tools: Vec<Tool>) {
        self.sender().send_replace(Some(tools));
    }

    pub fn reply(&self, id: u64, reply: ToolReply) {
        let sender = self
            .pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
        // None: the call already timed out or was cancelled by the agent.
        if let Some(sender) = sender {
            let _ = sender.send(reply);
        }
    }

    pub fn status(&self) -> HostStatus {
        let agents = self.agents();
        HostStatus {
            listening: self.listening.load(Ordering::Relaxed),
            ready: self.sender().borrow().is_some(),
            clients: agents.len(),
            agents,
            error: self.error.lock().unwrap_or_else(|e| e.into_inner()).clone(),
        }
    }

    /// The agents connected, once each: an agent can hold several sessions (OpenCode starts its MCP servers twice).
    fn agents(&self) -> Vec<ConnectedAgent> {
        let sessions = self.agents.lock().unwrap_or_else(|e| e.into_inner());
        let mut agents: Vec<ConnectedAgent> = Vec::with_capacity(sessions.len());
        for (_, agent) in sessions.iter() {
            if !agents.iter().any(|known| known.name == agent.name) {
                agents.push(agent.clone());
            }
        }
        agents
    }

    fn connect(&self, agent: ConnectedAgent) -> u64 {
        let session = self.next_session.fetch_add(1, Ordering::Relaxed);
        self.agents.lock().unwrap_or_else(|e| e.into_inner()).push((session, agent));
        session
    }

    fn disconnect(&self, session: u64) {
        self.agents.lock().unwrap_or_else(|e| e.into_inner()).retain(|(id, _)| *id != session);
    }

    fn forget(&self, id: u64) {
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&id);
    }
}

// ── Listener ──

/// Listen for agents for as long as the app runs. Called once at launch.
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = listen(&app).await {
            log::error!("[mcp-host] not serving coding agents: {e}");
            let state = app.state::<McpHostState>();
            *state.error.lock().unwrap_or_else(|e| e.into_inner()) = Some(e);
            emit_status(&app);
        }
    });
}

async fn listen(app: &AppHandle) -> Result<(), String> {
    let path = socket_path()?;
    let listener = bind(&path).await?;
    app.state::<McpHostState>()
        .listening
        .store(true, Ordering::Relaxed);
    emit_status(app);
    log::info!("[mcp-host] serving MCP on {}", path.display());
    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                tauri::async_runtime::spawn(serve_client(app.clone(), stream));
            }
            // Per-connection failures (e.g. out of descriptors) don't end the listener.
            Err(e) => log::warn!("[mcp-host] accept failed: {e}"),
        }
    }
}

/// Bind the socket, taking over a stale file but never a live server (e.g. a second Roci).
async fn bind(path: &Path) -> Result<UnixListener, String> {
    if UnixStream::connect(path).await.is_ok() {
        return Err("another copy of Roci is already serving coding agents".into());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    }
    match std::fs::remove_file(path) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("remove stale socket: {e}")),
    }
    let listener = UnixListener::bind(path).map_err(|e| format!("bind {}: {e}", path.display()))?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(SOCKET_MODE))
        .map_err(|e| format!("restrict socket: {e}"))?;
    Ok(listener)
}

/// One agent's session: listed (by the name it announced) from initialize until it disconnects.
async fn serve_client(app: AppHandle, stream: UnixStream) {
    let state = app.state::<McpHostState>();
    let service = match (RociServer { app: app.clone() }).serve(stream).await {
        Ok(service) => service,
        Err(e) => {
            log::warn!("[mcp-host] agent failed to initialize: {e}");
            return;
        }
    };
    let agent = service.peer_info().map_or_else(
        || ConnectedAgent { name: "unknown".into(), title: "Unknown agent".into() },
        |peer| ConnectedAgent::from_client(&peer.client_info),
    );
    log::info!("[mcp-host] {} ({}) connected", agent.title, agent.name);
    let session = state.connect(agent);
    emit_status(&app);
    if let Err(e) = service.waiting().await {
        log::warn!("[mcp-host] session ended abnormally: {e}");
    }
    state.disconnect(session);
    emit_status(&app);
}

/// Tell the webview (Settings) and the menu bar that the server's state changed.
pub fn emit_status(app: &AppHandle) {
    crate::menubar::set_mcp_status(app, app.state::<McpHostState>().status().menu_status());
    if let Err(e) = app.emit(STATUS_EVENT, ()) {
        log::error!("[mcp-host] failed to emit {STATUS_EVENT}: {e}");
    }
}

// ── MCP handler ──

#[derive(Clone)]
struct RociServer {
    app: AppHandle,
}

impl RociServer {
    fn state(&self) -> tauri::State<'_, McpHostState> {
        self.app.state::<McpHostState>()
    }

    /// The webview's tools, waiting for it to load if Roci just launched.
    async fn tools(&self) -> Result<Vec<Tool>, McpError> {
        let mut rx = self.state().sender().subscribe();
        let ready = timeout(WEBVIEW_READY_TIMEOUT, rx.wait_for(Option::is_some)).await;
        match ready {
            Ok(Ok(tools)) => Ok(tools.clone().unwrap_or_default()),
            _ => Err(McpError::internal_error(
                "Roci is still starting; try again",
                None,
            )),
        }
    }

    /// Send one call to the webview and wait for its reply (or the agent's cancel).
    async fn run(
        &self,
        name: &str,
        arguments: serde_json::Value,
        ctx: &RequestContext<RoleServer>,
    ) -> CallToolResult {
        let state = self.state();
        let id = state.next_call.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        state
            .pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, tx);

        if let Err(e) = self.app.emit(
            CALL_EVENT,
            ToolCallRequest {
                id,
                name,
                arguments,
            },
        ) {
            state.forget(id);
            return error_result(format!("Roci could not run {name}: {e}"));
        }

        let outcome = tokio::select! {
            reply = timeout(CALL_TIMEOUT, rx) => reply,
            () = ctx.ct.cancelled() => {
                state.forget(id);
                return error_result("Cancelled".to_string());
            }
        };
        state.forget(id);
        match outcome {
            Ok(Ok(reply)) if reply.is_error => error_result(reply.text),
            Ok(Ok(reply)) => CallToolResult::success(vec![ContentBlock::text(reply.text)]),
            _ => error_result(format!("Roci did not finish {name} in time")),
        }
    }
}

/// A tool failure the agent's model reads (a protocol error would hide the message).
fn error_result(text: String) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(text)])
}

impl ServerHandler for RociServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(SERVER_NAME, env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(self.tools().await?))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        let name = request.name.as_ref();
        if !self.tools().await?.iter().any(|tool| tool.name == name) {
            return Ok(error_result(format!("Unknown tool \"{name}\"")).into());
        }
        let arguments = serde_json::Value::Object(request.arguments.unwrap_or_default());
        Ok(self.run(name, arguments, &context).await.into())
    }
}

#[cfg(test)]
mod tests {
    use super::{ConnectedAgent, HostStatus, McpHostState};
    use crate::menubar::StatusLevel;

    fn status(listening: bool, ready: bool, agents: usize, error: Option<&str>) -> HostStatus {
        let agents: Vec<ConnectedAgent> = (0..agents)
            .map(|i| ConnectedAgent { name: format!("agent-{i}"), title: format!("Agent {i}") })
            .collect();
        HostStatus { listening, ready, clients: agents.len(), agents, error: error.map(str::to_string) }
    }

    #[test]
    fn menu_status_reads_the_server_state() {
        let read = |s: HostStatus| {
            let m = s.menu_status();
            (m.summary, m.level, m.agents.len())
        };
        assert_eq!(read(status(false, false, 0, None)), ("Starting…".into(), StatusLevel::Starting, 0));
        assert_eq!(read(status(true, false, 0, None)), ("Starting…".into(), StatusLevel::Starting, 0));
        assert_eq!(read(status(true, true, 0, None)), ("Ready".into(), StatusLevel::Available, 0));
        assert_eq!(read(status(true, true, 1, None)), ("1 agent connected".into(), StatusLevel::Available, 1));
        assert_eq!(read(status(true, true, 3, None)), ("3 agents connected".into(), StatusLevel::Available, 3));
        assert_eq!(read(status(false, false, 0, Some("taken"))), ("Unavailable".into(), StatusLevel::Unavailable, 0));
    }

    #[test]
    fn an_agent_with_several_sessions_counts_once_until_its_last_session_ends() {
        let host = McpHostState::default();
        let agent = |name: &str| ConnectedAgent { name: name.into(), title: name.into() };
        let first = host.connect(agent("opencode"));
        let second = host.connect(agent("opencode"));
        host.connect(agent("claude-code"));
        assert_eq!(host.status().clients, 2);
        host.disconnect(first);
        assert_eq!(host.status().clients, 2);
        host.disconnect(second);
        assert_eq!(host.status().agents, vec![agent("claude-code")]);
    }
}
