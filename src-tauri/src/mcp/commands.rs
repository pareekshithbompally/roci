//! Tauri commands for MCP, Kasset-namespaced.

use rmcp::model::{CallToolRequestParams, CallToolResult, ContentBlock, Icon, IconTheme};
use serde::Serialize;
use serde_json::{Map, Value};
use std::{collections::HashMap, sync::Arc};
use tauri::{AppHandle, State};
use tokio::{sync::oneshot, time::timeout};

use super::{
    config,
    runtime::{self, McpState, Service},
};

/// One tool offered by a connected server.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    name: String,
    description: Option<String>,
    input_schema: Value,
    server: String,
    /// The server marked this tool as destructive (writes, deletes).
    destructive: bool,
}

/// A tool result flattened to what the model reads.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolOutput {
    text: String,
    is_error: bool,
}

// ── Config ──

/// The full `mcp_config.json` (created with defaults on first read).
#[tauri::command]
pub async fn get_mcp_configs(app: AppHandle, state: State<'_, McpState>) -> Result<Value, String> {
    let value = config::read(&app)?;
    *state.settings.lock().await = config::parse_settings(&value);
    Ok(value)
}

/// Persist the whole config. Does not start or stop servers.
#[tauri::command]
pub async fn save_mcp_configs(
    app: AppHandle,
    state: State<'_, McpState>,
    configs: String,
) -> Result<(), String> {
    let value = config::write(&app, &configs)?;
    *state.settings.lock().await = config::parse_settings(&value);
    Ok(())
}

// ── Lifecycle ──

#[tauri::command]
pub async fn activate_mcp_server(app: AppHandle, name: String, config: Value) -> Result<(), String> {
    runtime::start_server(&app, &name, config).await
}

#[tauri::command]
pub async fn deactivate_mcp_server(app: AppHandle, name: String) -> Result<(), String> {
    runtime::stop_server(&app, &name).await;
    Ok(())
}

#[tauri::command]
pub async fn get_connected_mcp_servers(state: State<'_, McpState>) -> Result<Vec<String>, String> {
    Ok(state.servers.lock().await.keys().cloned().collect())
}

/// What a connected server reports in `initialize` (`serverInfo`): title, version, icon, website.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    name: String,
    title: Option<String>,
    version: Option<String>,
    /// The server's icon for light backgrounds or any theme (URL or `data:` URI).
    icon: Option<String>,
    /// Its icon for dark backgrounds, when it offers one.
    icon_dark: Option<String>,
    website_url: Option<String>,
}

/// The first icon for a dark or light background: dark takes only dark icons; light takes light or theme-less ones, else any.
fn icon_for(icons: &[Icon], dark: bool) -> Option<String> {
    let chosen = icons.iter().find(|icon| matches!(icon.theme, Some(IconTheme::Dark)) == dark);
    let fallback = if dark { None } else { icons.first() };
    chosen.or(fallback).map(|icon| icon.src.clone())
}

#[tauri::command]
pub async fn get_mcp_server_info(state: State<'_, McpState>) -> Result<Vec<McpServerInfo>, String> {
    let servers = state.servers.lock().await;
    Ok(servers
        .iter()
        .map(|(name, service)| {
            let info = service.peer_info().and_then(|p| p.server_info.clone());
            let icons = info.as_ref().and_then(|i| i.icons.clone()).unwrap_or_default();
            McpServerInfo {
                name: name.clone(),
                title: info.as_ref().and_then(|i| i.title.clone()),
                version: info.as_ref().map(|i| i.version.clone()),
                icon: icon_for(&icons, false),
                icon_dark: icon_for(&icons, true),
                website_url: info.and_then(|i| i.website_url),
            }
        })
        .collect())
}

// ── Tools ──

/// Every tool from every connected server; a name offered by more than one server is dropped.
#[tauri::command]
pub async fn get_mcp_tools(state: State<'_, McpState>) -> Result<Vec<McpTool>, String> {
    let limit = state.settings.lock().await.tool_call_timeout();
    let servers: Vec<(String, Arc<Service>)> = state
        .servers
        .lock()
        .await
        .iter()
        .map(|(name, service)| (name.clone(), service.clone()))
        .collect();

    let mut tools = Vec::new();
    for (server, service) in servers {
        match timeout(limit, service.list_all_tools()).await {
            Ok(Ok(listed)) => tools.extend(listed.into_iter().map(|tool| McpTool {
                name: tool.name.to_string(),
                description: tool.description.map(|d| d.to_string()),
                input_schema: Value::Object((*tool.input_schema).clone()),
                server: server.clone(),
                destructive: tool
                    .annotations
                    .as_ref()
                    .and_then(|a| a.destructive_hint)
                    .unwrap_or(false),
            })),
            Ok(Err(e)) => log::warn!("[mcp] {server} failed to list tools: {e}"),
            Err(_) => log::warn!("[mcp] {server} timed out listing tools"),
        }
    }
    Ok(drop_ambiguous(tools))
}

fn drop_ambiguous(tools: Vec<McpTool>) -> Vec<McpTool> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for tool in &tools {
        *counts.entry(tool.name.clone()).or_default() += 1;
    }
    tools
        .into_iter()
        .filter(|tool| {
            let unique = counts[&tool.name] == 1 && !tool.name.is_empty();
            if !unique {
                log::warn!("[mcp] tool '{}' is offered by several servers; not offered", tool.name);
            }
            unique
        })
        .collect()
}

/// Call one tool on the named server, bounded by the timeout and cancellable via `cancel_mcp_tool_call`.
#[tauri::command]
pub async fn call_mcp_tool(
    state: State<'_, McpState>,
    server: String,
    tool: String,
    arguments: Option<Map<String, Value>>,
    cancellation_token: String,
) -> Result<McpToolOutput, String> {
    let settings = state.settings.lock().await.clone();
    let service = state
        .servers
        .lock()
        .await
        .get(&server)
        .cloned()
        .ok_or_else(|| format!("MCP server '{server}' is not connected"))?;

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    state.cancellations.lock().await.insert(cancellation_token.clone(), cancel_tx);

    let mut params = CallToolRequestParams::new(tool.clone());
    if let Some(arguments) = arguments {
        params = params.with_arguments(arguments);
    }
    let limit = settings.tool_call_timeout();
    let result = tokio::select! {
        outcome = timeout(limit, service.call_tool(params)) => match outcome {
            Ok(call) => call.map_err(|e| e.to_string()),
            Err(_) => Err(format!("Tool call '{tool}' timed out after {} seconds", limit.as_secs())),
        },
        _ = cancel_rx => Err(format!("Tool call '{tool}' was cancelled")),
    };
    state.cancellations.lock().await.remove(&cancellation_token);

    result.map(|res| flatten_result(&res, settings.max_tool_output_chars))
}

#[tauri::command]
pub async fn cancel_mcp_tool_call(
    state: State<'_, McpState>,
    cancellation_token: String,
) -> Result<(), String> {
    if let Some(cancel) = state.cancellations.lock().await.remove(&cancellation_token) {
        let _ = cancel.send(());
    }
    Ok(())
}

// ── Result shaping ──

fn block_text(block: &ContentBlock) -> String {
    match block {
        ContentBlock::Text(text) => text.text.clone(),
        // Base64 payloads would only burn context; name them instead.
        ContentBlock::Image(image) => format!("[image: {}]", image.mime_type),
        ContentBlock::Audio(audio) => format!("[audio: {}]", audio.mime_type),
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

/// Join the blocks (structured content when there is no text) and cap at `max_chars`; `0` disables it.
fn flatten_result(result: &CallToolResult, max_chars: u64) -> McpToolOutput {
    let mut text = result.content.iter().map(block_text).collect::<Vec<_>>().join("\n");
    if text.trim().is_empty()
        && let Some(structured) = &result.structured_content
    {
        text = structured.to_string();
    }
    McpToolOutput {
        text: cap_chars(text, max_chars),
        is_error: result.is_error.unwrap_or(false),
    }
}

fn cap_chars(text: String, max_chars: u64) -> String {
    let total = text.chars().count();
    let max = usize::try_from(max_chars).unwrap_or(usize::MAX);
    if max == 0 || total <= max {
        return text;
    }
    let kept: String = text.chars().take(max).collect();
    format!(
        "{kept}\n\n[Tool output truncated: {max} of {total} characters retained. \
Increase \"Max tool output characters\" in Settings > MCP Servers to retain more.]"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tool(name: &str, server: &str) -> McpTool {
        McpTool { name: name.into(), description: None, input_schema: Value::Null, server: server.into(), destructive: false }
    }

    #[test]
    fn ambiguous_and_empty_names_are_dropped() {
        let kept = drop_ambiguous(vec![tool("read", "a"), tool("read", "b"), tool("fetch", "a"), tool("", "c")]);
        assert_eq!(kept.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), vec!["fetch"]);
    }

    #[test]
    fn cap_announces_truncation_and_zero_disables() {
        let capped = cap_chars("abcdef".into(), 3);
        assert!(capped.starts_with("abc\n\n[Tool output truncated: 3 of 6"));
        assert_eq!(cap_chars("abcdef".into(), 0), "abcdef");
    }

    #[test]
    fn images_are_named_not_inlined() {
        let result = CallToolResult::success(vec![
            ContentBlock::text("caption"),
            ContentBlock::image("AAAA", "image/png"),
        ]);
        assert_eq!(flatten_result(&result, 0).text, "caption\n[image: image/png]");
    }
}
