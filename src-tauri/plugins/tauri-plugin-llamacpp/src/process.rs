use std::process::Child;

/// Gracefully terminate a child process.
/// On Unix: sends SIGTERM, waits up to `timeout_ms`, then SIGKILL.
/// On Windows: calls TerminateProcess.
pub fn terminate_process(child: &mut Child, timeout_ms: u64) -> Result<(), String> {
    let pid = child.id();
    log::info!("[llamacpp] Terminating process pid={}", pid);

    #[cfg(unix)]
    {
        use std::time::{Duration, Instant};

        // Send SIGTERM
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }

        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    log::info!("[llamacpp] Process {} exited with {}", pid, status);
                    return Ok(());
                }
                Ok(None) => {
                    if Instant::now() >= deadline {
                        log::warn!("[llamacpp] Process {} did not exit in time, sending SIGKILL", pid);
                        unsafe {
                            libc::kill(pid as i32, libc::SIGKILL);
                        }
                        let _ = child.wait();
                        return Ok(());
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => return Err(format!("Failed to wait on process {}: {}", pid, e)),
            }
        }
    }

    #[cfg(windows)]
    {
        child.kill().map_err(|e| format!("Failed to kill process {}: {}", pid, e))?;
        let _ = child.wait();
        Ok(())
    }
}
