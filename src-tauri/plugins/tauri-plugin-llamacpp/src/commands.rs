use crate::process::terminate_process;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::State;

/// Info about a running llama-server session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub pid: u32,
    pub port: u16,
    pub model_path: String,
}

/// Plugin state tracking running server sessions and download cancellation.
pub struct LlamaCppState {
    pub sessions: Mutex<HashMap<u32, (SessionInfo, Child)>>,
    pub download_cancelled: Arc<AtomicBool>,
}

impl Default for LlamaCppState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            download_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpawnResult {
    pub pid: u32,
    pub port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GgufMetadata {
    pub file_size: u64,
    pub magic: String,
    pub version: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub ok: bool,
    pub status: String,
}

/// Spawn a llama-server process.
///
/// Watches stdout for the "http server listening" line to confirm readiness.
/// Returns `{ pid, port }` on success.
#[tauri::command]
pub async fn spawn_llama_server(
    state: State<'_, LlamaCppState>,
    binary_path: String,
    model_path: String,
    port: u16,
    args: Vec<String>,
) -> Result<SpawnResult, String> {
    log::info!(
        "[llamacpp] Spawning server: binary={}, model={}, port={}",
        binary_path,
        model_path,
        port
    );

    let mut cmd = Command::new(&binary_path);
    cmd.arg("--model")
        .arg(&model_path)
        .arg("--port")
        .arg(port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Add any extra args (e.g., --ctx-size, --n-gpu-layers, --threads)
    for arg in &args {
        cmd.arg(arg);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

    let pid = child.id();
    log::info!("[llamacpp] Spawned process pid={}", pid);

    // Watch both stdout and stderr for the ready signal.
    // Newer llama.cpp versions may log to either stream.
    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture stderr")?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture stdout")?;

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

    // Shared buffer to collect output for diagnostics on failure
    let output_lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    // Helper: watch a stream for the ready signal
    let spawn_watcher = |stream: Box<dyn std::io::Read + Send>,
                         label: &'static str,
                         tx: std::sync::mpsc::Sender<Result<(), String>>,
                         lines: Arc<Mutex<Vec<String>>>| {
        std::thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines() {
                match line {
                    Ok(text) => {
                        log::info!("[llamacpp:{}] {}", label, text);
                        if let Ok(mut buf) = lines.lock() {
                            buf.push(format!("[{}] {}", label, &text));
                        }
                        if text.contains("http server listening")
                            || text.contains("server is listening")
                            || text.contains("main: server is listening")
                        {
                            let _ = tx.send(Ok(()));
                            return;
                        }
                        // Detect fatal errors early
                        if text.contains("FATAL") {
                            let _ = tx.send(Err(format!("Server fatal error: {}", text)));
                            return;
                        }
                    }
                    Err(_) => return,
                }
            }
            // EOF — signal only from stderr (primary stream)
            if label == "stderr" {
                let tail = lines
                    .lock()
                    .map(|buf| {
                        let n = buf.len();
                        let start = if n > 20 { n - 20 } else { 0 };
                        buf[start..].join("\n")
                    })
                    .unwrap_or_default();
                let _ = tx.send(Err(format!(
                    "Server process exited before becoming ready.\nLast output:\n{}",
                    tail
                )));
            }
        });
    };

    spawn_watcher(Box::new(stderr), "stderr", tx.clone(), Arc::clone(&output_lines));
    spawn_watcher(Box::new(stdout), "stdout", tx, Arc::clone(&output_lines));

    // Wait up to 60 seconds for the server to be ready
    match rx.recv_timeout(std::time::Duration::from_secs(60)) {
        Ok(Ok(())) => {
            log::info!("[llamacpp] Server ready on port {}", port);
        }
        Ok(Err(e)) => {
            let _ = child.kill();
            return Err(e);
        }
        Err(_) => {
            let _ = child.kill();
            return Err("Timeout waiting for llama-server to start".to_string());
        }
    }

    let session = SessionInfo {
        pid,
        port,
        model_path,
    };

    state
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?
        .insert(pid, (session, child));

    Ok(SpawnResult { pid, port })
}

/// Kill a running llama-server by PID.
#[tauri::command]
pub async fn kill_llama_server(
    state: State<'_, LlamaCppState>,
    pid: u32,
) -> Result<(), String> {
    log::info!("[llamacpp] Killing server pid={}", pid);

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    if let Some((_, mut child)) = sessions.remove(&pid) {
        terminate_process(&mut child, 5000)?;
        Ok(())
    } else {
        Err(format!("No active session for pid={}", pid))
    }
}

/// Kill all running llama-server sessions. Called on app shutdown.
#[tauri::command]
pub async fn kill_all_llama_servers(
    state: State<'_, LlamaCppState>,
) -> Result<(), String> {
    log::info!("[llamacpp] Killing all servers");

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    for (pid, (_, mut child)) in sessions.drain() {
        log::info!("[llamacpp] Stopping server pid={}", pid);
        if let Err(e) = terminate_process(&mut child, 3000) {
            log::error!("[llamacpp] Error killing pid={}: {}", pid, e);
        }
    }

    Ok(())
}

/// Find a random available TCP port.
#[tauri::command]
pub async fn get_random_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local addr: {}", e))?
        .port();
    Ok(port)
}

/// Read basic GGUF file metadata from the header.
///
/// GGUF format: magic (4 bytes "GGUF") + version (u32) + tensor_count (u64) + metadata_kv_count (u64)
/// We read the magic and version, plus the file size.
#[tauri::command]
pub async fn read_gguf_metadata(path: String) -> Result<GgufMetadata, String> {
    use std::fs::File;
    use std::io::Read;

    let file = File::open(&path).map_err(|e| format!("Cannot open file: {}", e))?;
    let file_size = file
        .metadata()
        .map_err(|e| format!("Cannot read metadata: {}", e))?
        .len();

    let mut reader = std::io::BufReader::new(file);
    let mut magic_bytes = [0u8; 4];
    reader
        .read_exact(&mut magic_bytes)
        .map_err(|e| format!("Cannot read magic: {}", e))?;

    let magic = String::from_utf8_lossy(&magic_bytes).to_string();
    if magic != "GGUF" {
        return Err(format!("Not a GGUF file (magic: {})", magic));
    }

    let mut version_bytes = [0u8; 4];
    reader
        .read_exact(&mut version_bytes)
        .map_err(|e| format!("Cannot read version: {}", e))?;
    let version = u32::from_le_bytes(version_bytes);

    Ok(GgufMetadata {
        file_size,
        magic,
        version,
    })
}

/// Remove macOS quarantine extended attributes from a directory recursively.
/// No-op on non-macOS platforms.
#[tauri::command]
pub async fn remove_quarantine(dir_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let output = tokio::process::Command::new("xattr")
            .args(["-rd", "com.apple.quarantine", &dir_path])
            .output()
            .await
            .map_err(|e| format!("xattr failed: {}", e))?;
        // Log but don't fail — attribute might not exist
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::debug!("[llamacpp] xattr returned non-zero (may be fine): {}", stderr);
        }
    }
    Ok(())
}

/// Create short-name symlinks for versioned dylibs/shared libraries.
///
/// llama.cpp archives contain versioned filenames like `libmtmd.0.0.8149.dylib`
/// but the binary links against `libmtmd.0.dylib`. Archive extraction often
/// drops the symlinks, so we recreate them here.
///
/// Pattern: `libXXX.A.B.C.dylib` → creates symlink `libXXX.A.dylib`
#[tauri::command]
pub async fn fix_lib_symlinks(dir_path: String) -> Result<Vec<String>, String> {
    use std::fs;
    use std::path::Path;

    let dir = Path::new(&dir_path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let mut created = Vec::new();

    let entries = fs::read_dir(dir).map_err(|e| format!("Cannot read dir: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Dir entry error: {}", e))?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Match versioned dylib: lib{name}.{major}.{minor}.{patch}.dylib
        // Also match .so.{major}.{minor}.{patch} on Linux
        if let Some(short_name) = versioned_lib_short_name(&name) {
            let symlink_path = dir.join(&short_name);
            if !symlink_path.exists() {
                #[cfg(unix)]
                {
                    std::os::unix::fs::symlink(&name, &symlink_path)
                        .map_err(|e| format!("Symlink failed: {}", e))?;
                }
                #[cfg(windows)]
                {
                    // Windows: just copy the file (symlinks need admin on some configs)
                    fs::copy(entry.path(), &symlink_path)
                        .map_err(|e| format!("Copy failed: {}", e))?;
                }
                log::info!("[llamacpp] created symlink: {} -> {}", short_name, name);
                created.push(format!("{} -> {}", short_name, name));
            }
        }
    }

    Ok(created)
}

/// Extract the short symlink name from a versioned library filename.
///
/// `libfoo.0.1.2.dylib` → Some(`libfoo.0.dylib`)
/// `libfoo.0.dylib`     → None (already short)
/// `llama-server`        → None (not a library)
fn versioned_lib_short_name(filename: &str) -> Option<String> {
    // Handle .dylib (macOS)
    if let Some(stem) = filename.strip_suffix(".dylib") {
        // Split on dots: ["libfoo", "0", "1", "2"]
        let parts: Vec<&str> = stem.split('.').collect();
        // Need at least 3 version components: name.major.minor.patch
        if parts.len() >= 4 {
            // Verify the version parts are numeric
            if parts[1..].iter().all(|p| p.parse::<u64>().is_ok()) {
                return Some(format!("{}.{}.dylib", parts[0], parts[1]));
            }
        }
        // Also handle name-with-dashes like libggml-base.0.9.7.dylib
        // The "name" part may contain dots too, so find the first numeric segment
        let mut name_end = 0;
        for (i, part) in parts.iter().enumerate() {
            if part.parse::<u64>().is_ok() {
                name_end = i;
                break;
            }
        }
        if name_end > 0 && parts.len() > name_end + 2 {
            let base = parts[..name_end].join(".");
            let major = parts[name_end];
            return Some(format!("{}.{}.dylib", base, major));
        }
    }

    // Handle .so.X.Y.Z (Linux)
    if let Some(pos) = filename.find(".so.") {
        let base = &filename[..pos + 3]; // "libfoo.so"
        let version = &filename[pos + 4..]; // "X.Y.Z"
        let ver_parts: Vec<&str> = version.split('.').collect();
        if ver_parts.len() >= 2 && ver_parts.iter().all(|p| p.parse::<u64>().is_ok()) {
            return Some(format!("{}.{}", base, ver_parts[0]));
        }
    }

    None
}

/// Check the health of a running llama-server.
#[tauri::command]
pub async fn check_server_health(port: u16) -> Result<HealthStatus, String> {
    let url = format!("http://127.0.0.1:{}/health", port);

    match reqwest::get(&url).await {
        Ok(resp) => {
            let status_code = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            Ok(HealthStatus {
                ok: status_code == 200,
                status: if status_code == 200 {
                    "ok".to_string()
                } else {
                    format!("status={} body={}", status_code, body)
                },
            })
        }
        Err(e) => Ok(HealthStatus {
            ok: false,
            status: format!("unreachable: {}", e),
        }),
    }
}
