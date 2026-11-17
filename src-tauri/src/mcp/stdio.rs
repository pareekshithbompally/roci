//! Launched (stdio) MCP servers — the Mac only: spawned in their own process group, stderr logged, checked after
//! starting, and their process groups reaped on stop and on quit.

use std::{collections::HashMap, process::Stdio, sync::Mutex, time::Duration};

use rmcp::{transport::TokioChildProcess, ServiceExt};
use tauri::{AppHandle, Manager};
use tokio::{
    io::AsyncReadExt,
    process::{ChildStderr, Command},
    time::{sleep, timeout},
};

use super::runtime::{client_info, McpState, Service};
use super::shell_path;
use crate::sync::lock;

/// A server that exits within this window after `initialize` failed to start.
const STARTUP_SETTLE: Duration = Duration::from_millis(500);
const VERIFY_ATTEMPTS: u32 = 3;
const VERIFY_BACKOFF: Duration = Duration::from_secs(1);
/// How long the startup check and a failed start's stderr read may take.
const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// Each launched server's process-group leader, by server name.
#[derive(Default)]
pub struct Processes(Mutex<HashMap<String, u32>>);

impl Processes {
    fn insert(&self, name: &str, pid: u32) {
        lock(&self.0).insert(name.to_string(), pid);
    }

    /// Signals the server's whole process group (the `npx`/`uvx` grandchildren too).
    pub fn reap(&self, name: &str) {
        kill_group(lock(&self.0).remove(name));
    }

    pub fn reap_all(&self) {
        let pids: Vec<u32> = lock(&self.0).drain().map(|(_, pid)| pid).collect();
        pids.into_iter().for_each(|pid| kill_group(Some(pid)));
    }
}

pub async fn connect(
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
    // Process-group leader so teardown reaches the grandchildren `npx`/`uvx` fork.
    cmd.process_group(0);

    let (process, stderr) = TokioChildProcess::builder(cmd)
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run '{command}' for MCP server '{name}': {e}"))?;
    let pid = process.id();

    match client_info().serve(process).await {
        Ok(service) => {
            if let Some(pid) = pid {
                app.state::<McpState>().processes.insert(name, pid);
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
        let _ = timeout(PROBE_TIMEOUT, stream.read_to_string(&mut buffer)).await;
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

/// Fail a stdio server that exits right after `initialize`; wait out one slow to answer tools/list.
pub async fn verify(app: &AppHandle, name: &str) -> Result<(), String> {
    sleep(STARTUP_SETTLE).await;
    let state = app.state::<McpState>();
    for attempt in 1..=VERIFY_ATTEMPTS {
        let probe = {
            let Some(peer) = state.servers.lock().await.get(name).map(|c| c.peer.clone()) else {
                return Err(format!("MCP server '{name}' quit immediately after starting"));
            };
            timeout(PROBE_TIMEOUT, peer.list_all_tools()).await
        };
        if matches!(probe, Ok(Ok(_))) {
            return Ok(());
        }
        log::warn!("[mcp] {name} tools/list not ready (attempt {attempt}/{VERIFY_ATTEMPTS})");
        sleep(VERIFY_BACKOFF).await;
    }
    // Proceed anyway: if it quits later, its watch reconnects it.
    Ok(())
}

/// Last-resort teardown on app exit: signal every server's process group so no `npx`/`node` outlives Roci.
pub fn kill_all_children(app: &AppHandle) {
    if let Some(state) = app.try_state::<McpState>() {
        state.processes.reap_all();
    }
}

fn kill_group(pid: Option<u32>) {
    if let Some(pid) = pid.and_then(|p| libc::pid_t::try_from(p).ok()) {
        // SAFETY: killpg only signals; pid is a group we created (pgid == pid).
        unsafe { libc::killpg(pid, libc::SIGTERM) };
    }
}
