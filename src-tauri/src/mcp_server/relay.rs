//! `Kasset mcp` — the command coding agents launch (stdio MCP transport).
//!
//! It joins stdin/stdout to the running app's socket byte for byte; the app
//! speaks MCP. When Kasset isn't running it is opened in the background
//! (hidden, no Dock bounce) and the relay waits for it. Runs before Tauri
//! starts and never prints to stdout itself — stdout belongs to the protocol.

use std::{
    io::{self, Write},
    net::Shutdown,
    os::unix::net::UnixStream,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant},
};

use super::socket_path;

/// A cold launch loads the webview and its tools; give it time.
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_POLL: Duration = Duration::from_millis(250);

/// Run the relay until either side closes. Returns the process exit code.
pub fn run() -> i32 {
    match connect_or_launch().and_then(relay) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("[Kasset mcp] {e}");
            1
        }
    }
}

fn connect_or_launch() -> Result<UnixStream, String> {
    let path = socket_path()?;
    if let Ok(stream) = UnixStream::connect(&path) {
        return Ok(stream);
    }
    launch_app()?;
    let deadline = Instant::now() + LAUNCH_TIMEOUT;
    loop {
        thread::sleep(CONNECT_POLL);
        match UnixStream::connect(&path) {
            Ok(stream) => return Ok(stream),
            Err(e) if Instant::now() >= deadline => {
                return Err(format!("Kasset did not start serving in time ({e})"));
            }
            Err(_) => {}
        }
    }
}

/// Open the Kasset.app this binary belongs to, hidden. A bare binary (a dev
/// build) has no bundle to open: the developer starts it.
fn launch_app() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("locate Kasset: {e}"))?;
    let bundle = app_bundle(&exe).ok_or("Kasset isn't running. Start it and try again.")?;
    let status = Command::new("/usr/bin/open")
        .args(["-g", "-j"])
        .arg(&bundle)
        .args(["--args", "--minimized"])
        .status()
        .map_err(|e| format!("open Kasset: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open Kasset exited with {status}"))
    }
}

/// `…/Kasset.app` for `…/Kasset.app/Contents/MacOS/Kasset`.
pub fn app_bundle(exe: &Path) -> Option<PathBuf> {
    let bundle = exe.parent()?.parent()?.parent()?;
    let is_app = bundle.extension().is_some_and(|ext| ext == "app");
    is_app.then(|| bundle.to_path_buf())
}

/// Copy stdin → socket on a thread and socket → stdout here. The app closing
/// the socket (quit) ends the relay; the agent closing stdin half-closes the
/// socket so the app ends the session.
fn relay(stream: UnixStream) -> Result<(), String> {
    let mut upstream = stream.try_clone().map_err(|e| format!("socket: {e}"))?;
    thread::spawn(move || {
        let _ = io::copy(&mut io::stdin().lock(), &mut upstream);
        let _ = upstream.shutdown(Shutdown::Write);
    });
    let mut downstream = stream;
    let mut stdout = io::stdout().lock();
    io::copy(&mut downstream, &mut stdout).map_err(|e| format!("relay: {e}"))?;
    stdout.flush().map_err(|e| format!("relay: {e}"))
}
