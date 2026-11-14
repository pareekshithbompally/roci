//! Server lifecycle — connect, monitor, reconnect, stop (Jan's `helpers.rs`).

use rmcp::{
    model::{ClientCapabilities, ClientConfig, Implementation},
    service::RunningService,
    transport::{
        streamable_http_client::StreamableHttpClientTransportConfig,
        StreamableHttpClientTransport, TokioChildProcess,
    },
    RoleClient, ServiceExt,
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    process::Stdio,
    sync::Arc,
    time::Duration,
};
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter, Manager};
use tokio::{
    io::AsyncReadExt,
    process::{ChildStderr, Command},
    sync::{oneshot, Mutex},
    time::{sleep, timeout},
};

use super::{
    config::{self, McpSettings, Transport},
    shell_path, MCP_UPDATE_EVENT,
};

pub type Service = RunningService<RoleClient, ClientConfig>;

/// Health probe cadence. Jan: 30s, not 2s — every probe is a tools/list the
/// server may log to stderr.
const HEALTH_INTERVAL: Duration = Duration::from_secs(30);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
/// A server that exits within this window after `initialize` failed to start.
const STARTUP_SETTLE: Duration = Duration::from_millis(500);
const VERIFY_ATTEMPTS: u32 = 3;
const VERIFY_BACKOFF: Duration = Duration::from_secs(1);

/// All MCP runtime state, managed by Tauri.
#[derive(Default)]
pub struct McpState {
    /// Live connections by server name. `Arc` so a tool call clones its
    /// server and releases the map instead of blocking every other server.
    pub(super) servers: Mutex<HashMap<String, Arc<Service>>>,
    /// Servers the user enabled (config by name), whether or not connected.
    pub(super) active: Mutex<HashMap<String, Value>>,
    pub(super) settings: Mutex<McpSettings>,
    pub(super) cancellations: Mutex<HashMap<String, oneshot::Sender<()>>>,
    starting: Mutex<HashSet<String>>,
    monitors: Mutex<HashMap<String, JoinHandle<()>>>,
    /// stdio child PIDs (each a process-group leader), for teardown.
    pids: std::sync::Mutex<HashMap<String, u32>>,
}

fn client_info() -> ClientConfig {
    ClientConfig::new(
        ClientCapabilities::default(),
        Implementation::new("Kasset", env!("CARGO_PKG_VERSION")),
    )
}

pub(super) fn emit_update(app: &AppHandle, server: &str) {
    if let Err(e) = app.emit(MCP_UPDATE_EVENT, serde_json::json!({ "server": server })) {
        log::error!("[mcp] failed to emit {MCP_UPDATE_EVENT}: {e}");
    }
}

// ── Boot ──

/// Start every server marked `active` in the config. Called once at launch.
pub async fn start_active_servers(app: AppHandle) {
    let config = match config::read(&app) {
        Ok(config) => config,
        Err(e) => return log::error!("[mcp] could not load config at launch: {e}"),
    };
    *app.state::<McpState>().settings.lock().await = config::parse_settings(&config);

    for (name, entry) in config::servers(&config) {
        if !config::is_active(&entry) {
            continue;
        }
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = start_server(&app, &name, entry).await {
                log::error!("[mcp] {name} failed to start at launch: {e}");
            }
        });
    }
}

// ── Start ──

/// Connect one server and monitor it. Idempotent: a running or starting
/// server is left alone (two `initialize`s break streamable-http servers).
pub async fn start_server(app: &AppHandle, name: &str, entry: Value) -> Result<(), String> {
    let state = app.state::<McpState>();
    if state.servers.lock().await.contains_key(name) {
        return Ok(());
    }
    if !state.starting.lock().await.insert(name.to_string()) {
        return Ok(());
    }
    state.active.lock().await.insert(name.to_string(), entry.clone());

    let result = connect_and_register(app, name, &entry).await;
    state.starting.lock().await.remove(name);
    if let Err(e) = result {
        // A failed first start is not "enabled": the webview saves it as off,
        // so neither restart nor a monitor may bring it back.
        state.active.lock().await.remove(name);
        drop_connection(app, name).await;
        return Err(e);
    }

    let monitor = tauri::async_runtime::spawn(monitor(app.clone(), name.to_string(), entry));
    if let Some(previous) = state.monitors.lock().await.insert(name.to_string(), monitor) {
        previous.abort();
    }
    Ok(())
}

async fn connect_and_register(app: &AppHandle, name: &str, entry: &Value) -> Result<(), String> {
    let transport = config::parse_transport(entry)
        .ok_or_else(|| format!("Invalid configuration for MCP server '{name}'"))?;
    let is_stdio = matches!(transport, Transport::Stdio { .. });
    let service = match transport {
        Transport::Http { url, headers, timeout } => connect_http(&url, &headers, timeout).await?,
        Transport::Stdio { command, args, env } => connect_stdio(app, name, &command, &args, &env).await?,
    };
    log::info!("[mcp] connected {name}: {:?}", service.peer_info().map(|p| p.server_info.clone()));
    app.state::<McpState>().servers.lock().await.insert(name.to_string(), Arc::new(service));

    if is_stdio {
        verify_stdio_server(app, name).await?;
    }
    emit_update(app, name);
    Ok(())
}

async fn connect_http(
    url: &str,
    headers: &[(String, String)],
    connect_timeout: Option<Duration>,
) -> Result<Service, String> {
    let mut builder = reqwest::Client::builder().default_headers(header_map(headers));
    if let Some(limit) = connect_timeout {
        builder = builder.connect_timeout(limit);
    }
    let client = builder.build().map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let transport = StreamableHttpClientTransport::with_client(
        client,
        StreamableHttpClientTransportConfig::with_uri(url.to_string()),
    );
    client_info()
        .serve(transport)
        .await
        .map_err(|e| format!("Failed to connect to {url}: {e}"))
}

fn header_map(headers: &[(String, String)]) -> reqwest::header::HeaderMap {
    headers
        .iter()
        .filter_map(|(key, value)| {
            let name = reqwest::header::HeaderName::from_bytes(key.as_bytes()).ok()?;
            let value = reqwest::header::HeaderValue::from_str(value).ok()?;
            Some((name, value))
        })
        .collect()
}

async fn connect_stdio(
    app: &AppHandle,
    name: &str,
    command: &str,
    args: &[String],
    env: &[(String, String)],
) -> Result<Service, String> {
    let mut cmd = Command::new(command);
    if let Some(path) = shell_path::login_path().await {
        cmd.env("PATH", path);
    }
    cmd.args(args).envs(env.iter().cloned()).kill_on_drop(true);
    // Process-group leader (pgid == pid) so teardown reaches the grandchildren
    // `npx`/`uvx` fork, which otherwise outlive a single-PID kill.
    #[cfg(unix)]
    cmd.process_group(0);

    let (process, stderr) = TokioChildProcess::builder(cmd)
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run '{command}' for MCP server '{name}': {e}"))?;
    let pid = process.id();

    match client_info().serve(process).await {
        Ok(service) => {
            if let Some(pid) = pid {
                app.state::<McpState>().pids.lock().expect("pids lock").insert(name.to_string(), pid);
            }
            if let Some(stderr) = stderr {
                tauri::async_runtime::spawn(drain_stderr(name.to_string(), stderr));
            }
            Ok(service)
        }
        Err(e) => Err(startup_error(name, &e.to_string(), stderr).await),
    }
}

/// Prefer the server's own stderr over rmcp's opaque handshake error.
async fn startup_error(name: &str, error: &str, stderr: Option<ChildStderr>) -> String {
    let mut buffer = String::new();
    if let Some(mut stream) = stderr {
        let _ = timeout(HEALTH_TIMEOUT, stream.read_to_string(&mut buffer)).await;
    }
    let detail = if buffer.trim().is_empty() { error } else { buffer.trim() };
    format!("Failed to start MCP server '{name}': {detail}")
}

/// Keep the stderr pipe open (a closed pipe SIGPIPEs the server) and log it.
async fn drain_stderr(name: String, mut stderr: ChildStderr) {
    let mut buf = [0u8; 1024];
    while let Ok(n) = stderr.read(&mut buf).await {
        if n == 0 {
            break;
        }
        for line in String::from_utf8_lossy(&buf[..n]).lines().filter(|l| !l.trim().is_empty()) {
            log::info!("[mcp-stderr:{name}] {line}");
        }
    }
}

/// A stdio server can exit right after `initialize`, or need a moment before
/// tools/list answers (`npx mcp-remote`). Fail the first; wait out the second.
async fn verify_stdio_server(app: &AppHandle, name: &str) -> Result<(), String> {
    sleep(STARTUP_SETTLE).await;
    let state = app.state::<McpState>();
    for attempt in 1..=VERIFY_ATTEMPTS {
        let probe = {
            let servers = state.servers.lock().await;
            let Some(service) = servers.get(name) else {
                return Err(format!("MCP server '{name}' quit immediately after starting"));
            };
            timeout(HEALTH_TIMEOUT, service.list_all_tools()).await
        };
        if matches!(probe, Ok(Ok(_))) {
            return Ok(());
        }
        log::warn!("[mcp] {name} tools/list not ready (attempt {attempt}/{VERIFY_ATTEMPTS})");
        sleep(VERIFY_BACKOFF).await;
    }
    // Jan proceeds anyway: the health monitor takes over from here.
    Ok(())
}

// ── Monitor ──

/// Probe health; on failure drop the connection and reconnect with backoff.
/// Exits once the user deactivates the server.
async fn monitor(app: AppHandle, name: String, entry: Value) {
    let mut failures: u32 = 0;
    loop {
        sleep(HEALTH_INTERVAL).await;
        if !is_still_active(&app, &name).await {
            return;
        }
        if is_healthy(&app, &name).await {
            failures = 0;
            continue;
        }
        log::warn!("[mcp] {name} failed its health check; reconnecting");
        drop_connection(&app, &name).await;
        emit_update(&app, &name);
        failures += 1;
        failures = reconnect_with_backoff(&app, &name, &entry, failures).await;
    }
}

async fn is_still_active(app: &AppHandle, name: &str) -> bool {
    app.state::<McpState>().active.lock().await.contains_key(name)
}

async fn is_healthy(app: &AppHandle, name: &str) -> bool {
    let state = app.state::<McpState>();
    let servers = state.servers.lock().await;
    let Some(service) = servers.get(name) else { return false };
    matches!(timeout(HEALTH_TIMEOUT, service.list_all_tools()).await, Ok(Ok(_)))
}

/// One backoff + reconnect attempt. Returns the failure count to carry on with.
async fn reconnect_with_backoff(app: &AppHandle, name: &str, entry: &Value, failures: u32) -> u32 {
    let delay = app.state::<McpState>().settings.lock().await.restart_delay(failures);
    sleep(delay).await;
    if !is_still_active(app, name).await {
        return failures;
    }
    match connect_and_register(app, name, entry).await {
        Ok(()) => 0,
        Err(e) => {
            log::error!("[mcp] {name} reconnect attempt {failures} failed: {e}");
            failures
        }
    }
}

// ── Stop ──

/// Remove a live connection, close it, and reap its process group.
async fn drop_connection(app: &AppHandle, name: &str) {
    let state = app.state::<McpState>();
    let service = state.servers.lock().await.remove(name);
    // An in-flight call may still hold a clone; dropping ours then lets the
    // last holder's drop guard close the transport (the group kill below
    // ends the call either way).
    if let Some(Ok(service)) = service.map(Arc::try_unwrap) {
        let _ = service.cancel().await;
    }
    let pid = state.pids.lock().expect("pids lock").remove(name);
    kill_group(pid);
}

/// User turned a server off: forget it, stop monitoring, disconnect.
pub async fn stop_server(app: &AppHandle, name: &str) {
    let state = app.state::<McpState>();
    state.active.lock().await.remove(name);
    if let Some(monitor) = state.monitors.lock().await.remove(name) {
        monitor.abort();
    }
    drop_connection(app, name).await;
    emit_update(app, name);
}

/// Synchronous last-resort teardown on app exit: signal every server's
/// process group so no `npx`/`node` outlives Kasset.
pub fn kill_all_children(app: &AppHandle) {
    let Some(state) = app.try_state::<McpState>() else { return };
    let pids: Vec<u32> = state.pids.lock().expect("pids lock").drain().map(|(_, pid)| pid).collect();
    for pid in pids {
        kill_group(Some(pid));
    }
}

fn kill_group(pid: Option<u32>) {
    #[cfg(unix)]
    if let Some(pid) = pid.and_then(|p| libc::pid_t::try_from(p).ok()) {
        // SAFETY: killpg only signals; pid is a group we created (pgid == pid).
        unsafe { libc::killpg(pid, libc::SIGTERM) };
    }
    #[cfg(not(unix))]
    let _ = pid;
}
