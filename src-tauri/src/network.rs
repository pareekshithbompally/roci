//! The device's network, as the system reports it (Network framework's path monitor, macOS and iOS): online or not, pushed
//! to the webview on every change. Advice only, as Apple's networking guidance has it — nothing is preflighted or blocked on
//! it; requests still run and fail on their own. It shows the offline state, and when the network comes back (and stays
//! back) it starts the MCP servers that are turned on but couldn't connect while it was down.

use std::ffi::c_void;
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::time::Duration;

use block2::RcBlock;
use dispatch2::DispatchQueue;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Rust → webview: the device went online or offline.
const CHANGED_EVENT: &str = "network://changed";
/// How long a restored network must hold before acting on it: right after Wi-Fi returns the path can flap
/// (satisfied → unsatisfied → satisfied within seconds).
const SETTLE: Duration = Duration::from_secs(2);
/// The path monitor's own serial queue.
const QUEUE_LABEL: &str = "ai.roci.network";

/// `nw_path_status_satisfied`: the path can be used now (`satisfiable`, an interface that would come up on demand, is not).
const STATUS_SATISFIED: i32 = 1;

#[link(name = "Network", kind = "framework")]
unsafe extern "C" {
    fn nw_path_monitor_create() -> *mut c_void;
    fn nw_path_monitor_set_queue(monitor: *mut c_void, queue: &DispatchQueue);
    fn nw_path_monitor_set_update_handler(monitor: *mut c_void, handler: &block2::Block<dyn Fn(*mut c_void)>);
    fn nw_path_monitor_start(monitor: *mut c_void);
    fn nw_path_get_status(path: *mut c_void) -> i32;
}

const UNKNOWN: u8 = 0;
const ONLINE: u8 = 1;
const OFFLINE: u8 = 2;

/// The last state the system reported (unknown until its first report).
static STATE: AtomicU8 = AtomicU8::new(UNKNOWN);
/// Bumped on every change, so a settle that a later change overtook does nothing.
static CHANGES: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
struct NetworkChange {
    online: bool,
}

/// Whether the device is online now; true until the system has said otherwise, so nothing is ever called offline on a guess.
#[tauri::command]
pub fn network_online() -> bool {
    STATE.load(Ordering::Relaxed) != OFFLINE
}

/// One report from the system: record it, tell the webview when it changed, and act once a restored network has settled.
fn on_path(app: &AppHandle, online: bool) {
    let now = if online { ONLINE } else { OFFLINE };
    let before = STATE.swap(now, Ordering::Relaxed);
    if before == now {
        return;
    }
    let change = CHANGES.fetch_add(1, Ordering::Relaxed) + 1;
    if let Err(error) = app.emit(CHANGED_EVENT, NetworkChange { online }) {
        log::warn!("[network] {CHANGED_EVENT} failed: {error}");
    }
    log::info!("[network] {}", if online { "online" } else { "offline" });
    // The first report is the state at launch, which launch itself already acted on.
    if online && before == OFFLINE {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(SETTLE).await;
            if CHANGES.load(Ordering::Relaxed) == change {
                crate::mcp::network_restored(app).await;
            }
        });
    }
}

/// Starts the system's path monitor for the app's lifetime, reporting each path as online or not.
fn monitor(report: impl Fn(bool) + 'static) {
    let handler = RcBlock::new(move |path: *mut c_void| {
        // SAFETY: the system passes a valid path for the duration of this call; only its status is read.
        let status = unsafe { nw_path_get_status(path) };
        report(status == STATUS_SATISFIED);
    });
    let queue = DispatchQueue::new(QUEUE_LABEL, None);
    // SAFETY: a fresh monitor, given its queue and handler before it starts, as the Network framework requires; the
    // monitor copies the handler block and retains the queue.
    unsafe {
        let monitor = nw_path_monitor_create();
        nw_path_monitor_set_queue(monitor, &queue);
        nw_path_monitor_set_update_handler(monitor, &handler);
        nw_path_monitor_start(monitor);
    }
    // The monitor runs for the app's lifetime: it is never cancelled or released.
}

/// Follows the device's network for the app's lifetime (see the module notes).
pub fn watch(app: AppHandle) {
    monitor(move |online| on_path(&app, online));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn the_system_reports_the_path_as_soon_as_monitoring_starts() {
        let (sender, reports) = mpsc::channel();
        monitor(move |online| {
            let _ = sender.send(online);
        });
        // The first report is the current path; this machine is online while the tests run.
        assert_eq!(reports.recv_timeout(Duration::from_secs(5)), Ok(true));
    }
}
