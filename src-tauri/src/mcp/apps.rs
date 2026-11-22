//! MCP Apps (`io.modelcontextprotocol/ui`): a tool's `ui://` screen is read from its server and served on its own origin,
//! `mcp-app://<token>/`, with a Content-Security-Policy header built only from the domains the screen declares.
//! The HTML never passes through the webview's own page.

use base64::Engine;
use rmcp::model::{JsonObject, ReadResourceRequestParams, ResourceContents};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    http::{header, Request, Response, StatusCode},
    AppHandle, Manager, Runtime, State, UriSchemeContext,
};
use tokio::time::timeout;

use super::{config, runtime::McpState};

/// The URI scheme screens are served on.
pub const SCHEME: &str = "mcp-app";
pub const EXTENSION_ID: &str = "io.modelcontextprotocol/ui";
const MIME: &str = "text/html;profile=mcp-app";

/// What Roci tells servers in `initialize`: it renders MCP App HTML.
pub fn extension_settings() -> JsonObject {
    let mut settings = JsonObject::new();
    settings.insert("mimeTypes".into(), json!([MIME]));
    settings
}

struct Screen {
    html: String,
    csp: String,
}

/// Screens open in chat, by token (the host part of their origin).
#[derive(Default)]
pub struct AppScreens(Mutex<HashMap<String, Screen>>);

/// A screen ready to load: its URL and the resource's `_meta.ui` (border preference, permissions, CSP as declared).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedApp {
    url: String,
    token: String,
    meta: Value,
}

static NEXT_SCREEN: AtomicU64 = AtomicU64::new(0);

/// A fresh host name, so no two screens share an origin (storage, cookies).
fn new_token() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or_default();
    format!("s{:x}{:x}", NEXT_SCREEN.fetch_add(1, Ordering::Relaxed), nanos)
}

/// The HTML and `_meta.ui` of the first HTML entry in a `resources/read` result.
fn html_of(contents: Vec<ResourceContents>) -> Result<(String, Value), String> {
    for entry in contents {
        let (mime, html, meta) = match entry {
            ResourceContents::TextResourceContents { mime_type, text, meta, .. } => (mime_type, text, meta),
            ResourceContents::BlobResourceContents { mime_type, blob, meta, .. } => {
                let bytes = base64::engine::general_purpose::STANDARD.decode(blob).map_err(|e| format!("Screen is not valid base64: {e}"))?;
                (mime_type, String::from_utf8(bytes).map_err(|e| format!("Screen is not UTF-8: {e}"))?, meta)
            }
            // Kinds a later protocol adds are not screens.
            _ => continue,
        };
        if !mime.as_deref().unwrap_or_default().starts_with("text/html") {
            continue;
        }
        let ui = meta.and_then(|m| m.0.get("ui").cloned()).unwrap_or(Value::Null);
        return Ok((html, ui));
    }
    Err("The server returned no HTML screen".into())
}

/// Origins a screen declared under `csp[key]`; anything that could break out of a CSP directive is dropped.
fn declared(csp: Option<&Map<String, Value>>, key: &str) -> Vec<String> {
    let safe = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || ":/.*-_".contains(c));
    csp.and_then(|c| c.get(key))
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(Value::as_str).filter(|s| safe(s)).map(str::to_string).collect())
        .unwrap_or_default()
}

/// `sources` after the fixed ones, or `fallback` when a directive has neither.
fn directive(name: &str, fixed: &[&str], sources: &[String], fallback: &str) -> String {
    let all: Vec<&str> = fixed.iter().copied().chain(sources.iter().map(String::as_str)).collect();
    if all.is_empty() {
        format!("{name} {fallback}")
    } else {
        format!("{name} {}", all.join(" "))
    }
}

/// What a screen's scripts may do beyond the spec's default.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ScreenCode {
    /// The spec's default: no code built from strings, no workers.
    Strict,
    /// The user allowed it for this server: code built from strings, `blob:` workers and media (WebGL apps such as 3D maps
    /// need them), as the spec's reference host allows. The network, frame and plugin locks stay as they are.
    Advanced,
}

/// The `allowScreenCode` switch on this server's saved entry.
fn screen_code_for(app: &AppHandle, server: &str) -> ScreenCode {
    let allowed = config::read(app)
        .map(|value| config::servers(&value).get(server).and_then(|entry| entry.get("allowScreenCode")).and_then(Value::as_bool) == Some(true))
        .unwrap_or(false);
    if allowed { ScreenCode::Advanced } else { ScreenCode::Strict }
}

/// The spec's restrictive default, widened only by the domains the screen declared and, if the user allowed it for this
/// server, by advanced code; never loosened further.
fn content_security_policy(ui: &Value, code: ScreenCode) -> String {
    let csp = ui.get("csp").and_then(Value::as_object);
    let resources = declared(csp, "resourceDomains");
    let advanced = code == ScreenCode::Advanced;
    let scripts: &[&str] = if advanced { &["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"] } else { &["'self'", "'unsafe-inline'"] };
    let files: &[&str] = if advanced { &["'self'", "data:", "blob:"] } else { &["'self'", "data:"] };
    let workers = if advanced { directive("worker-src", &["'self'", "blob:"], &resources, "") } else { "worker-src 'none'".to_string() };
    [
        "default-src 'none'".to_string(),
        directive("script-src", scripts, &resources, ""),
        directive("style-src", &["'self'", "'unsafe-inline'"], &resources, ""),
        directive("img-src", files, &resources, ""),
        directive("font-src", files, &resources, ""),
        directive("media-src", files, &resources, ""),
        workers,
        directive("connect-src", &[], &declared(csp, "connectDomains"), "'none'"),
        directive("frame-src", &[], &declared(csp, "frameDomains"), "'none'"),
        directive("base-uri", &[], &declared(csp, "baseUriDomains"), "'self'"),
        "object-src 'none'".to_string(),
    ]
    .join("; ")
}

/// Read a tool's `ui://` screen from its server and give it an origin of its own.
#[tauri::command]
pub async fn mcp_open_app(
    app: AppHandle,
    state: State<'_, McpState>,
    screens: State<'_, AppScreens>,
    server: String,
    uri: String,
) -> Result<OpenedApp, String> {
    if !uri.starts_with("ui://") {
        return Err(format!("Not an MCP App screen: {uri}"));
    }
    let limit = state.settings.lock().await.tool_call_timeout();
    let peer = state
        .servers
        .lock()
        .await
        .get(&server)
        .map(|connection| connection.peer.clone())
        .ok_or_else(|| format!("MCP server '{server}' is not connected"))?;
    let read = timeout(limit, peer.read_resource(ReadResourceRequestParams::new(uri.clone())))
        .await
        .map_err(|_| format!("Reading {uri} timed out"))?
        .map_err(|e| e.to_string())?;
    let (html, meta) = html_of(read.contents)?;
    let csp = content_security_policy(&meta, screen_code_for(&app, &server));
    log::info!("[mcp] {server} screen {uri}: {csp}");

    let token = new_token();
    let mut open = screens.0.lock().map_err(|e| e.to_string())?;
    open.insert(token.clone(), Screen { html, csp });
    Ok(OpenedApp { url: format!("{SCHEME}://{token}/"), token, meta })
}

/// Forget a screen once chat no longer shows it.
#[tauri::command]
pub fn mcp_close_app(screens: State<'_, AppScreens>, token: String) -> Result<(), String> {
    screens.0.lock().map_err(|e| e.to_string())?.remove(&token);
    Ok(())
}

fn not_found() -> Response<Vec<u8>> {
    Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap_or_default()
}

/// `mcp-app://<token>/`: the screen's HTML under its CSP header; anything else is not found.
pub fn serve<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let Some(token) = request.uri().host() else { return not_found() };
    let screens = ctx.app_handle().state::<AppScreens>();
    let Ok(open) = screens.0.lock() else { return not_found() };
    let Some(screen) = open.get(token) else { return not_found() };
    Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, &screen.csp)
        .body(screen.html.clone().into_bytes())
        .unwrap_or_else(|_| not_found())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_declaration_is_the_spec_default() {
        let csp = content_security_policy(&Value::Null, ScreenCode::Strict);
        assert!(csp.contains("connect-src 'none'"));
        assert!(csp.contains("frame-src 'none'"));
        assert!(csp.contains("script-src 'self' 'unsafe-inline'"));
        assert!(csp.contains("object-src 'none'"));
    }

    #[test]
    fn declared_domains_widen_only_their_directive_and_injection_is_dropped() {
        let ui = json!({ "csp": { "connectDomains": ["https://api.example.com", "https://x; script-src *"], "resourceDomains": ["https://cdn.example.com"] } });
        let csp = content_security_policy(&ui, ScreenCode::Strict);
        assert!(csp.contains("connect-src https://api.example.com;"));
        assert!(csp.contains("img-src 'self' data: https://cdn.example.com"));
        assert!(!csp.contains("script-src *"));
        assert!(csp.contains("frame-src 'none'"));
    }

    #[test]
    fn advanced_code_adds_eval_and_blob_workers_but_keeps_the_network_and_frame_locks() {
        let strict = content_security_policy(&Value::Null, ScreenCode::Strict);
        assert!(!strict.contains("unsafe-eval"));
        assert!(strict.contains("worker-src 'none'"));
        let advanced = content_security_policy(&Value::Null, ScreenCode::Advanced);
        assert!(advanced.contains("script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"));
        assert!(advanced.contains("worker-src 'self' blob:"));
        assert!(advanced.contains("connect-src 'none'"));
        assert!(advanced.contains("frame-src 'none'"));
        assert!(advanced.contains("object-src 'none'"));
    }

    #[test]
    fn non_html_entries_are_skipped() {
        let contents = vec![ResourceContents::text("{}", "ui://a"), ResourceContents::text("<p>hi</p>", "ui://a")];
        // `text()` sets no MIME type, so neither counts as a screen.
        assert!(html_of(contents).is_err());
    }
}
