//! The system voice: Apple's `say`, which speaks with the voice and rate set
//! in System Settings › Accessibility › Spoken Content.

use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use crate::models::LocalError;

const SAY: &str = "/usr/bin/say";
const POLL: Duration = Duration::from_millis(50);

/// Speaks `text`; returns when done, or as soon as `stop` is set.
pub fn speak(text: &str, stop: &AtomicBool) -> Result<(), LocalError> {
    let mut child = Command::new(SAY).stdin(Stdio::piped()).spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(text.as_bytes())?;
    } // closing stdin starts the speech
    loop {
        if let Some(status) = child.try_wait()? {
            return if status.success() { Ok(()) } else { Err(LocalError::Engine(format!("say exited with {status}"))) };
        }
        if stop.load(Ordering::Relaxed) {
            child.kill()?;
            child.wait()?;
            return Ok(());
        }
        thread::sleep(POLL);
    }
}
