//! Server lifecycle — connect, watch for the connection ending (an event, never a probe), reconnect, stop.

use rmcp::{
    model::{ClientCapabilities, ClientConfig, Implementation},
    service::{Peer, QuitReason, RunningService, RunningServiceCancellationToken},
    transport::{streamable_http_client::StreamableHttpClientTransportConfig, StreamableHttpClientTransport},
    RoleClient, ServiceExt,
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    future::Future,
    pin::Pin,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    sync::{oneshot, Mutex},
    time::sleep,
};

use super::{
    config::{self, McpSettings, Transport},
    MCP_UPDATE_EVENT,
};

pub type Service = RunningService<RoleClient, ClientConfig>;

/// One live server: its peer for requests (cloned per call), and the token that closes it.
pub(super) struct Connection {
    pub(super) peer: Peer<RoleClient>,
    stop: RunningServiceCancellationToken,
}

/// All MCP runtime state, managed by Tauri.
#[derive(Default)]
pub struct McpState {
    /// Live connections by name; a request clones its peer instead of holding the map.
    pub(super) servers: Mutex<HashMap<String, Connection>>,
    /// Servers the user enabled (config by name), whether or not connected.
    pub(super) active: Mutex<HashMap<String, Value>>,
    pub(super) settings: Mutex<McpSettings>,
    pub(super) cancellations: Mutex<HashMap<String, oneshot::Sender<()>>>,
    /// Servers being connected or reconnected now, so each has one attempt at a time.
    starting: Mutex<HashSet<String>>,
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

/// Connect one server (watched from then on); idempotent, since two `initialize`s break streamable-http servers.
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
        // A failed first start is saved as off, so nothing reconnects it.
        state.active.lock().await.remove(name);
        drop_connection(app, name).await;
        return Err(e);
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
    let connection = Connection { peer: service.peer().clone(), stop: service.cancellation_token() };
    app.state::<McpState>().servers.lock().await.insert(name.to_string(), connection);
    tauri::async_runtime::spawn(watch(app.clone(), name.to_string(), entry.clone(), service));

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

// ── Watch & reconnect ──

/// Waits for the connection to end (server quit, stream dropped) and reconnects; Roci closing it is `Cancelled`.
async fn watch(app: AppHandle, name: String, entry: Value, service: Service) {
    let reason = service.waiting().await;
    if matches!(reason, Ok(QuitReason::Cancelled)) {
        return;
    }
    log::warn!("[mcp] {name} disconnected ({reason:?}); reconnecting");
    reconnect(&app, &name, &entry).await;
}

/// Drops a lost connection and reconnects with backoff until back or turned off (boxed: its new watch may call it again).
pub(super) fn reconnect<'a>(app: &'a AppHandle, name: &'a str, entry: &'a Value) -> Pin<Box<dyn Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
        let state = app.state::<McpState>();
        if !state.starting.lock().await.insert(name.to_string()) {
            return; // a connect or reconnect is already under way
        }
        drop_connection(app, name).await;
        emit_update(app, name);
        let mut failures: u32 = 0;
        while is_still_active(app, name).await {
            let delay = state.settings.lock().await.restart_delay(failures);
            sleep(delay).await;
            if !is_still_active(app, name).await {
                break;
            }
            match connect_and_register(app, name, entry).await {
                Ok(()) => break,
                Err(e) => {
                    failures += 1;
                    log::error!("[mcp] {name} reconnect attempt {failures} failed: {e}");
                }
            }
        }
        state.starting.lock().await.remove(name);
    })
}

async fn is_still_active(app: &AppHandle, name: &str) -> bool {
    app.state::<McpState>().active.lock().await.contains_key(name)
}

// ── Stop ──

/// Remove a live connection, close it, and (launched servers) reap its process group.
async fn drop_connection(app: &AppHandle, name: &str) {
    let state = app.state::<McpState>();
    // Cancelling ends the service loop (its watch sees `Cancelled`) and closes the transport.
    if let Some(connection) = state.servers.lock().await.remove(name) {
        connection.stop.cancel();
    }
    #[cfg(desktop)]
    state.processes.reap(name);
}

/// User turned a server off: forget it (a reconnect in progress then stops) and disconnect.
pub async fn stop_server(app: &AppHandle, name: &str) {
    let state = app.state::<McpState>();
    state.active.lock().await.remove(name);
    drop_connection(app, name).await;
    emit_update(app, name);
}

