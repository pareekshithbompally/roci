//! Registers one `roci` entry in coding agents' configs via their CLI, or by editing OpenCode's file.

use std::{
    fs,
    io::Write,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tokio::{process::Command, time::timeout};

use super::{RELAY_ARG, SERVER_NAME};
use crate::mcp::login_path;

const CLI_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentId {
    ClaudeCode,
    Codex,
    Opencode,
}

pub const AGENTS: [AgentId; 3] = [AgentId::ClaudeCode, AgentId::Codex, AgentId::Opencode];

/// Whether the agent's config has Roci, and whether it points at this copy of Roci.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Registration {
    None,
    Current,
    /// Registered for a Roci that has moved (or another build): re-add to fix.
    Outdated,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub id: AgentId,
    pub installed: bool,
    pub registration: Registration,
    /// The config file Roci reads (and, for OpenCode, writes).
    pub config_path: String,
    /// The config couldn't be read; Roci won't edit it.
    pub problem: Option<String>,
}

// ── Status ──

pub async fn status(id: AgentId) -> AgentStatus {
    let installed = is_installed(id).await;
    let path = config_path(id);
    let current = current_command();
    let (registration, problem) = match path
        .as_ref()
        .map_err(String::clone)
        .and_then(|p| registered_command(id, p))
    {
        Ok(None) => (Registration::None, None),
        Ok(Some(command)) if Some(&command) == current.as_ref() => (Registration::Current, None),
        Ok(Some(_)) => (Registration::Outdated, None),
        Err(e) => (Registration::None, Some(e)),
    };
    AgentStatus {
        id,
        installed,
        registration,
        config_path: path.map(|p| p.display().to_string()).unwrap_or_default(),
        problem,
    }
}

async fn is_installed(id: AgentId) -> bool {
    match id {
        AgentId::ClaudeCode => find_cli("claude").await.is_some(),
        AgentId::Codex => find_cli("codex").await.is_some(),
        AgentId::Opencode => {
            find_cli("opencode").await.is_some()
                || home_join(".config/opencode").is_some_and(|p| p.is_dir())
        }
    }
}

fn config_path(id: AgentId) -> Result<PathBuf, String> {
    match id {
        AgentId::ClaudeCode => home(".claude.json"),
        AgentId::Codex => home(".codex/config.toml"),
        AgentId::Opencode => opencode_config_path(),
    }
}

/// `opencode.json`; an `opencode.jsonc` (comments) is never rewritten.
fn opencode_config_path() -> Result<PathBuf, String> {
    let json = home(".config/opencode/opencode.json")?;
    let jsonc = json.with_extension("jsonc");
    if !json.exists() && jsonc.exists() {
        return Err(format!(
            "{} has comments, so Roci won't edit it. Add Roci by hand.",
            jsonc.display()
        ));
    }
    Ok(json)
}

/// The command the agent's `roci` entry launches, if it has one.
fn registered_command(id: AgentId, path: &Path) -> Result<Option<String>, String> {
    if id == AgentId::Codex {
        return codex_registered_command(path);
    }
    let Some(root) = read_json_object(path)? else {
        return Ok(None);
    };
    let command = match id {
        AgentId::Opencode => opencode_entry(&root)
            .and_then(|entry| entry.get("command"))
            .and_then(|cmd| cmd.get(0)),
        // Claude Code (`~/.claude.json`, user scope)
        _ => root
            .get("mcpServers")
            .and_then(|s| s.get(SERVER_NAME))
            .and_then(|e| e.get("command")),
    };
    Ok(command.and_then(Value::as_str).map(str::to_string))
}

fn codex_registered_command(path: &Path) -> Result<Option<String>, String> {
    let Some(text) = read_optional(path)? else {
        return Ok(None);
    };
    let table: toml::Table = text
        .parse()
        .map_err(|e| format!("{} isn't valid TOML: {e}", path.display()))?;
    let command = table
        .get("mcp_servers")
        .and_then(|s| s.get(SERVER_NAME))
        .and_then(|e| e.get("command"))
        .and_then(toml::Value::as_str);
    Ok(command.map(str::to_string))
}

/// OpenCode 2 nests servers under `mcp.servers`; OpenCode 1 puts them under `mcp`.
fn opencode_entry(root: &Map<String, Value>) -> Option<&Value> {
    let mcp = root.get("mcp")?;
    mcp.get("servers")
        .and_then(|s| s.get(SERVER_NAME))
        .or_else(|| mcp.get(SERVER_NAME))
}

// ── Add / remove ──

/// Add (`on`) or remove Roci in one agent; returns the agent's new status.
pub async fn set(id: AgentId, on: bool) -> Result<AgentStatus, String> {
    let path = config_path(id)?;
    let registered = registered_command(id, &path)?.is_some();
    if on {
        let command = registrable_command()?;
        add(id, &path, &command, registered).await?;
    } else if registered {
        remove(id, &path).await?;
    }
    Ok(status(id).await)
}

async fn add(id: AgentId, path: &Path, command: &str, registered: bool) -> Result<(), String> {
    match id {
        AgentId::ClaudeCode => {
            if registered {
                run_cli("claude", &["mcp", "remove", "--scope", "user", SERVER_NAME]).await?;
            }
            run_cli(
                "claude",
                &[
                    "mcp",
                    "add",
                    "--scope",
                    "user",
                    SERVER_NAME,
                    "--",
                    command,
                    RELAY_ARG,
                ],
            )
            .await
        }
        AgentId::Codex => {
            if registered {
                run_cli("codex", &["mcp", "remove", SERVER_NAME]).await?;
            }
            run_cli(
                "codex",
                &["mcp", "add", SERVER_NAME, "--", command, RELAY_ARG],
            )
            .await
        }
        AgentId::Opencode => {
            let nested = opencode_nests_servers(path).await?;
            edit_json(path, |root| {
                let mcp = object_at(root, "mcp")?;
                let servers = if nested {
                    object_at(mcp, "servers")?
                } else {
                    mcp
                };
                servers.insert(
                    SERVER_NAME.into(),
                    json!({ "type": "local", "command": [command, RELAY_ARG] }),
                );
                Ok(())
            })
        }
    }
}

async fn remove(id: AgentId, path: &Path) -> Result<(), String> {
    match id {
        AgentId::ClaudeCode => {
            run_cli("claude", &["mcp", "remove", "--scope", "user", SERVER_NAME]).await
        }
        AgentId::Codex => run_cli("codex", &["mcp", "remove", SERVER_NAME]).await,
        AgentId::Opencode => edit_json(path, |root| {
            let mcp = object_at(root, "mcp")?;
            mcp.shift_remove(SERVER_NAME);
            if let Some(Value::Object(servers)) = mcp.get_mut("servers") {
                servers.shift_remove(SERVER_NAME);
            }
            Ok(())
        }),
    }
}

/// Follow the file's existing layout; with none yet, ask OpenCode its version.
async fn opencode_nests_servers(path: &Path) -> Result<bool, String> {
    let root = read_json_object(path)?.unwrap_or_default();
    match root.get("mcp").and_then(Value::as_object) {
        Some(mcp) if mcp.contains_key("servers") => Ok(true),
        Some(mcp) if !mcp.is_empty() => Ok(false),
        _ => Ok(opencode_major_version()
            .await
            .is_none_or(|major| major >= 2)),
    }
}

async fn opencode_major_version() -> Option<u32> {
    let out = cli_output("opencode", &["--version"]).await.ok()?;
    let version = out.split_whitespace().last()?.trim_start_matches('v');
    version.split('.').next()?.parse().ok()
}

// ── The command agents launch ──

fn current_command() -> Option<String> {
    std::env::current_exe()
        .ok()
        .map(|p| p.display().to_string())
}

/// This binary, refused when macOS runs it from a randomized translocation path (Downloads, disk image).
fn registrable_command() -> Result<String, String> {
    let command = current_command().ok_or("Roci couldn't find its own location")?;
    if command.contains("/AppTranslocation/") || command.starts_with("/Volumes/") {
        return Err(
            "Move Roci to your Applications folder and open it from there, then add it.".into(),
        );
    }
    Ok(command)
}

/// What another agent's config needs to launch Roci (Settings › manual setup).
pub fn manual_command() -> Option<(String, String)> {
    current_command().map(|command| (command, RELAY_ARG.to_string()))
}

// ── CLIs ──

/// `name` on the user's login-shell PATH (apps launched from Finder don't inherit it).
async fn find_cli(name: &str) -> Option<PathBuf> {
    let path = login_path().await.or_else(|| std::env::var("PATH").ok())?;
    path.split(':')
        .map(|dir| Path::new(dir).join(name))
        .find(|p| is_executable(p))
}

fn is_executable(path: &Path) -> bool {
    fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

async fn run_cli(name: &str, args: &[&str]) -> Result<(), String> {
    cli_output(name, args).await.map(|_| ())
}

/// Run an agent's CLI from the home folder (no project scope) with the login PATH.
async fn cli_output(name: &str, args: &[&str]) -> Result<String, String> {
    let program = find_cli(name)
        .await
        .ok_or_else(|| format!("{name} isn't on your PATH"))?;
    let mut command = Command::new(program);
    command.args(args).stdin(Stdio::null()).kill_on_drop(true);
    if let Some(path) = login_path().await {
        command.env("PATH", path);
    }
    if let Ok(dir) = home("") {
        command.current_dir(dir);
    }
    let out = timeout(CLI_TIMEOUT, command.output())
        .await
        .map_err(|_| format!("{name} didn't answer in time"))?
        .map_err(|e| format!("couldn't run {name}: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() {
        return Ok(stdout);
    }
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(format!(
        "{name} {}: {}",
        args.join(" "),
        if stderr.is_empty() { stdout } else { stderr }
    ))
}

// ── Files ──

fn home(relative: &str) -> Result<PathBuf, String> {
    home_join(relative).ok_or_else(|| "HOME is not set".to_string())
}

fn home_join(relative: &str) -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(relative))
}

fn read_optional(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("couldn't read {}: {e}", path.display())),
    }
}

/// The file's top-level object; `None` when the file doesn't exist or is empty.
fn read_json_object(path: &Path) -> Result<Option<Map<String, Value>>, String> {
    let Some(text) = read_optional(path)? else {
        return Ok(None);
    };
    if text.trim().is_empty() {
        return Ok(None);
    }
    match serde_json::from_str(&text) {
        Ok(Value::Object(map)) => Ok(Some(map)),
        Ok(_) => Err(format!(
            "{} isn't a JSON object, so Roci left it untouched.",
            path.display()
        )),
        Err(_) => Err(format!(
            "{} isn't plain JSON (it may have comments), so Roci left it untouched. Add Roci by hand.",
            path.display()
        )),
    }
}

/// The object at `key`, created when absent; an error when `key` holds something else.
fn object_at<'a>(
    map: &'a mut Map<String, Value>,
    key: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    map.entry(key)
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| format!("\"{key}\" isn't an object, so Roci left the file untouched."))
}

/// Read, change only what `edit` changes, write atomically; a symlinked config is edited at its target.
fn edit_json(
    path: &Path,
    edit: impl FnOnce(&mut Map<String, Value>) -> Result<(), String>,
) -> Result<(), String> {
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let mut root = read_json_object(&target)?.unwrap_or_default();
    edit(&mut root)?;
    let text =
        serde_json::to_string_pretty(&Value::Object(root)).map_err(|e| e.to_string())? + "\n";
    write_atomic(&target, &text)
}

/// Write beside the file, keep its permissions, then rename over it, so a crash never leaves half a file.
fn write_atomic(path: &Path, text: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("config path has no folder")?;
    fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let name = path
        .file_name()
        .ok_or("config path has no file name")?
        .to_string_lossy();
    let tmp = dir.join(format!(".{name}.roci-tmp"));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        if let Ok(meta) = fs::metadata(path) {
            fs::set_permissions(&tmp, meta.permissions())?;
        }
        fs::rename(&tmp, path)
    })();
    result.map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("couldn't write {}: {e}", path.display())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("roci-agents-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn edit_json_touches_only_the_roci_key_and_keeps_order() {
        let path = scratch("order").join("mcp.json");
        fs::write(
            &path,
            r#"{"z":1,"mcpServers":{"other":{"command":"x"}},"a":[1,2]}"#,
        )
        .unwrap();
        edit_json(&path, |root| {
            object_at(root, "mcpServers")?.insert(SERVER_NAME.into(), json!({ "command": "k" }));
            Ok(())
        })
        .unwrap();
        let root: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        let keys: Vec<_> = root.as_object().unwrap().keys().cloned().collect();
        assert_eq!(keys, ["z", "mcpServers", "a"]);
        assert_eq!(root["mcpServers"]["other"]["command"], "x");
        assert_eq!(root["mcpServers"]["roci"]["command"], "k");
    }

    #[test]
    fn edit_json_leaves_files_with_comments_untouched() {
        let path = scratch("comments").join("mcp.json");
        let original = "{ // mine\n \"mcpServers\": {} }";
        fs::write(&path, original).unwrap();
        assert!(edit_json(&path, |_| Ok(())).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
    }

    #[test]
    fn edit_json_writes_through_a_symlink() {
        let dir = scratch("symlink");
        let real = dir.join("real.json");
        let link = dir.join("mcp.json");
        fs::write(&real, "{}").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        edit_json(&link, |root| {
            root.insert("k".into(), json!(1));
            Ok(())
        })
        .unwrap();
        assert!(
            fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert!(fs::read_to_string(&real).unwrap().contains("\"k\": 1"));
    }

    #[test]
    fn opencode_entry_reads_both_layouts() {
        let v2: Map<String, Value> = serde_json::from_value(
            json!({ "mcp": { "servers": { "roci": { "command": ["k"] } } } }),
        )
        .unwrap();
        let v1: Map<String, Value> =
            serde_json::from_value(json!({ "mcp": { "roci": { "command": ["k"] } } })).unwrap();
        assert!(opencode_entry(&v2).is_some());
        assert!(opencode_entry(&v1).is_some());
    }
}
