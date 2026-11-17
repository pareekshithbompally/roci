//! Server lifecycle — connect, monitor, reconnect, stop.

use rmcp::{
    model::{ClientCapabilities, ClientConfig, Implementation},
    service::RunningService,
    transport::{streamable_http_client::StreamableHttpClientTransportConfig, StreamableHttpClientTransport},
    RoleClient, ServiceExt,
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter, Manager};
use tokio::{
    sync::{oneshot, Mutex},
    time::{sleep, timeout},
};

use super::{
    config::{self, McpSettings, Transport},
    MCP_UPDATE_EVENT,
};

pub type Service = RunningService<RoleClient, ClientConfig>;

/// Health probe cadence; slow because every probe is a tools/list the server may log to stderr.
const HEALTH_INTERVAL: Duration = Duration::from_secs(30);
pub(super) const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);

/// All MCP runtime state, managed by Tauri.
#[derive(Default)]
pub struct McpState {
    /// Live connections by name; `Arc` so a tool call clones its server instead of holding the map.
    pub(super) servers: Mutex<HashMap<String, Arc<Service>>>,
    /// Servers the user enabled (config by name), whether or not connected.
    pub(super) active: Mutex<HashMap<String, Value>>,
    pub(super) settings: Mutex<McpSettings>,
    pub(super) cancellations: Mutex<HashMap<String, oneshot::Sender<()>>>,
    starting: Mutex<HashSet<String>>,
    monitors: Mutex<HashMap<String, JoinHandle<()>>>,
    /// Launched servers' process groups, for teardown (the Mac only).
    #[cfg(desktop)]
    pub(super) processes: super::stdio::Processes,
}

pub(super) fn client_info() -> ClientConfig {
    ClientConfig::new(
        ClientCapabilities::default(),
        Implementation::new(env!("APP_NAME"), env!("CARGO_PKG_VERSION")),
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

/// Connect one server and monitor it; idempotent, since two `initialize`s break streamable-http servers.
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
        // A failed first start is saved as off, so neither restart nor a monitor may bring it back.
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
    #[cfg(desktop)]
    let launched = matches!(transport, Transport::Stdio { .. });
    let service = match transport {
        Transport::Http { url, headers, timeout } => connect_http(&url, &headers, timeout).await?,
        #[cfg(desktop)]
        Transport::Stdio { command, args, env } => super::stdio::connect(app, name, &command, &args, &env).await?,
        #[cfg(mobile)]
        Transport::Stdio { .. } => return Err(format!("'{name}' is launched as a program, which runs only on the Mac")),
    };
    log::info!("[mcp] connected {name}: {:?}", service.peer_info().map(|p| p.server_info.clone()));
    app.state::<McpState>().servers.lock().await.insert(name.to_string(), Arc::new(service));

    #[cfg(desktop)]
    if launched {
        super::stdio::verify(app, name).await?;
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

// ── Monitor ──

/// Probe health; on failure reconnect with backoff, until the user deactivates the server.
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

/// Remove a live connection, close it, and (launched servers) reap its process group.
async fn drop_connection(app: &AppHandle, name: &str) {
    let state = app.state::<McpState>();
    let service = state.servers.lock().await.remove(name);
    // An in-flight call may still hold a clone; its drop guard then closes the transport.
    if let Some(Ok(service)) = service.map(Arc::try_unwrap) {
        let _ = service.cancel().await;
    }
    #[cfg(desktop)]
    state.processes.reap(name);
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

