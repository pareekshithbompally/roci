//! `mcp_config.json`: the one file every MCP setting lives in.

use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::{fs, path::PathBuf, time::Duration};
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "mcp_config.json";

/// Starter servers in a new `mcp_config.json`, all off until enabled: on the Mac, launched programs that need no
/// placeholder paths or keys; iPhone and iPad connect only to remote servers, so they start with none.
#[cfg(desktop)]
const STARTER_SERVERS: &str = r#"{
    "fetch": { "command": "uvx", "args": ["mcp-server-fetch"], "env": {}, "active": false },
    "sequential-thinking": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"], "env": {}, "active": false },
    "browsermcp": { "command": "npx", "args": ["@browsermcp/mcp"], "env": {}, "active": false }
  }"#;
#[cfg(mobile)]
const STARTER_SERVERS: &str = "{}";

/// Runtime settings a new `mcp_config.json` starts with.
const STARTER_SETTINGS: &str = r#"{
    "toolCallTimeoutSeconds": 30,
    "maxToolOutputChars": 40000,
    "baseRestartDelayMs": 1000,
    "maxRestartDelayMs": 30000,
    "backoffMultiplier": 2.0,
    "allowAllTools": false,
    "trustedServers": []
  }"#;

/// The first `mcp_config.json` on this device.
fn default_config() -> String {
    format!("{{\n  \"mcpServers\": {STARTER_SERVERS},\n  \"mcpSettings\": {STARTER_SETTINGS}\n}}\n")
}

/// Runtime settings Rust acts on; serde ignores the webview-owned fields (tool permissions).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct McpSettings {
    pub tool_call_timeout_seconds: u64,
    /// Per-result character cap; `0` disables it.
    pub max_tool_output_chars: u64,
    pub base_restart_delay_ms: u64,
    pub max_restart_delay_ms: u64,
    pub backoff_multiplier: f64,
}

impl Default for McpSettings {
    fn default() -> Self {
        Self {
            tool_call_timeout_seconds: 30,
            max_tool_output_chars: 40_000,
            base_restart_delay_ms: 1_000,
            max_restart_delay_ms: 30_000,
            backoff_multiplier: 2.0,
        }
    }
}

impl McpSettings {
    /// At least one second, so a `0` never makes every call time out.
    pub fn tool_call_timeout(&self) -> Duration {
        Duration::from_secs(self.tool_call_timeout_seconds.max(1))
    }

    /// Backoff before reconnect attempt `failures` (1-based), capped.
    pub fn restart_delay(&self, failures: u32) -> Duration {
        let exponent = failures.saturating_sub(1) as i32;
        let delay = self.base_restart_delay_ms as f64 * self.backoff_multiplier.powi(exponent);
        Duration::from_millis((delay as u64).min(self.max_restart_delay_ms))
    }
}

/// How to reach one server, parsed from its `mcpServers` entry.
#[derive(Debug, Clone)]
pub enum Transport {
    /// A program Roci launches (the Mac only; iPhone and iPad report it as unsupported).
    #[cfg_attr(mobile, expect(dead_code, reason = "launched servers run only on the Mac"))]
    Stdio {
        command: String,
        args: Vec<String>,
        env: Vec<(String, String)>,
    },
    Http {
        url: String,
        headers: Vec<(String, String)>,
        timeout: Option<Duration>,
    },
}

/// Parse one server entry; `http` and deprecated `sse` both connect over Streamable HTTP.
pub fn parse_transport(entry: &Value) -> Option<Transport> {
    let obj = entry.as_object()?;
    match obj.get("type").and_then(Value::as_str) {
        Some("http" | "sse") => Some(Transport::Http {
            url: obj.get("url")?.as_str()?.to_string(),
            headers: string_pairs(obj.get("headers")),
            timeout: obj.get("timeout").and_then(Value::as_u64).map(Duration::from_secs),
        }),
        _ => Some(Transport::Stdio {
            command: obj.get("command")?.as_str()?.to_string(),
            args: obj
                .get("args")?
                .as_array()?
                .iter()
                .filter_map(|arg| arg.as_str().map(String::from))
                .collect(),
            env: string_pairs(obj.get("env")),
        }),
    }
}

fn string_pairs(value: Option<&Value>) -> Vec<(String, String)> {
    value
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

pub fn is_active(entry: &Value) -> bool {
    entry.get("active").and_then(Value::as_bool).unwrap_or(false)
}

pub fn parse_settings(config: &Value) -> McpSettings {
    config
        .get("mcpSettings")
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default()
}

pub fn servers(config: &Value) -> Map<String, Value> {
    config
        .get("mcpServers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    Ok(dir.join(CONFIG_FILE))
}

/// Read the config, writing defaults on first use; an unparsable file is an error, never replaced.
pub fn read(app: &AppHandle) -> Result<Value, String> {
    let path = config_path(app)?;
    if !path.exists() {
        fs::write(&path, default_config())
            .map_err(|e| format!("Failed to create MCP config: {e}"))?;
    }
    let body = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut value: Value =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse {CONFIG_FILE}: {e}"))?;
    ensure_sections(&mut value)?;
    Ok(value)
}

/// Validate and persist a config payload from the webview.
pub fn write(app: &AppHandle, payload: &str) -> Result<Value, String> {
    let mut value: Value =
        serde_json::from_str(payload).map_err(|e| format!("Invalid MCP config payload: {e}"))?;
    ensure_sections(&mut value)?;
    let pretty = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    fs::write(config_path(app)?, pretty).map_err(|e| format!("Failed to write MCP config: {e}"))?;
    Ok(value)
}

fn ensure_sections(value: &mut Value) -> Result<(), String> {
    let obj = value.as_object_mut().ok_or("MCP config must be a JSON object")?;
    obj.entry("mcpServers").or_insert_with(|| json!({}));
    obj.entry("mcpSettings").or_insert_with(|| json!({}));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_parses_every_server() {
        let value: Value = serde_json::from_str(&default_config()).unwrap();
        for (name, entry) in servers(&value) {
            assert!(parse_transport(&entry).is_some(), "{name} should parse");
            assert!(!is_active(&entry));
        }
    }

    #[test]
    fn http_entry_requires_url() {
        assert!(parse_transport(&json!({"type": "http"})).is_none());
        let parsed = parse_transport(&json!({"type": "sse", "url": "https://x/mcp", "timeout": 5}));
        assert!(matches!(parsed, Some(Transport::Http { timeout: Some(t), .. }) if t.as_secs() == 5));
    }

    #[test]
    fn restart_delay_backs_off_and_caps() {
        let settings = McpSettings::default();
        assert_eq!(settings.restart_delay(1).as_millis(), 1_000);
        assert_eq!(settings.restart_delay(3).as_millis(), 4_000);
        assert_eq!(settings.restart_delay(20).as_millis(), 30_000);
    }
}
