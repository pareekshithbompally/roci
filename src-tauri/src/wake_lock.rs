use std::process::Child;
use std::sync::Mutex;

/// Holds the caffeinate child process while recording is active.
/// Dropped (and killed) automatically when the app exits.
pub struct WakeLockState {
    child: Mutex<Option<Child>>,
}

impl WakeLockState {
    pub fn new() -> Self {
        Self { child: Mutex::new(None) }
    }
}

impl Drop for WakeLockState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Prevent system idle sleep by spawning `caffeinate -i`.
/// Idempotent — calling while already held is a no-op.
#[tauri::command]
pub fn acquire_wake_lock(state: tauri::State<WakeLockState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }
    let child = std::process::Command::new("caffeinate")
        .arg("-i")
        .spawn()
        .map_err(|e| format!("caffeinate spawn failed: {e}"))?;
    *guard = Some(child);
    log::info!("[wake_lock] acquired");
    Ok(())
}

/// Release the wake lock. No-op if not currently held.
#[tauri::command]
pub fn release_wake_lock(state: tauri::State<WakeLockState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
        log::info!("[wake_lock] released");
    }
    Ok(())
}
