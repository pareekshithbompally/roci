//! Model files over the system's background downloads (`native/RociDownloads.swift`, one URLSession on Mac, iPhone and
//! iPad): a transfer carries on while Roci is in the background or the network drops for a while, and picks up where it
//! stopped. Each event goes to the download waiting for its file; one nobody waits for (a transfer that finished while
//! Roci was closed, reported when the session reconnects) goes to the handler `connect` was given.

use std::collections::HashMap;
use std::ffi::{c_char, CStr, CString};
use std::sync::{LazyLock, Mutex, OnceLock};

use serde::Deserialize;
use tokio::sync::mpsc::UnboundedSender;

use super::LocalError;
use crate::sync::lock;

unsafe extern "C" {
    fn roci_downloads_connect(callback: extern "C" fn(*const c_char));
    fn roci_downloads_start(json: *const c_char) -> *mut c_char;
    fn roci_downloads_cancel(json: *const c_char) -> *mut c_char;
    fn roci_downloads_free_string(ptr: *mut c_char);
}

/// What happened to one file's transfer.
#[derive(Debug, PartialEq, Eq)]
pub enum Transfer {
    /// Bytes of the file received so far.
    Progress(u64),
    /// The file is at its destination.
    Finished,
    /// Stopped on request; what arrived is kept for the next start.
    Cancelled,
    /// Ended with a reason; what arrived is kept for the next start when the system could keep it.
    Failed(String),
}

impl Transfer {
    fn ends(&self) -> bool {
        !matches!(self, Transfer::Progress(_))
    }
}

/// A transfer's key: the model and its file.
pub fn key_of(model: &str, file: &str) -> String {
    format!("{model}/{file}")
}

type Unclaimed = Box<dyn Fn(String, Transfer) + Send + Sync>;

/// The downloads waiting for their files' events, by key.
static WAITING: LazyLock<Mutex<HashMap<String, UnboundedSender<(String, Transfer)>>>> = LazyLock::new(Mutex::default);
static UNCLAIMED: OnceLock<Unclaimed> = OnceLock::new();

/// Once at launch: events nobody waits for go to `unclaimed`; the session reconnects, so transfers from before report in.
pub fn connect(unclaimed: impl Fn(String, Transfer) + Send + Sync + 'static) {
    if UNCLAIMED.set(Box::new(unclaimed)).is_ok() {
        // SAFETY: `on_event` is a valid `extern "C"` function for the life of the app.
        unsafe { roci_downloads_connect(on_event) }
    }
}

/// Starts (or rejoins) the transfer of `url` to `destination`; its events go to `events`, tagged with `key`.
pub fn start(key: &str, url: &str, destination: &str, events: UnboundedSender<(String, Transfer)>) -> Result<(), LocalError> {
    lock(&WAITING).insert(key.to_string(), events);
    let input = serde_json::json!({ "key": key, "url": url, "destination": destination });
    call(roci_downloads_start, &input).inspect_err(|_| {
        lock(&WAITING).remove(key);
    })
}

/// Stops `key`'s transfer, keeping what arrived; its download hears `Cancelled`.
pub fn cancel(key: &str) {
    if let Err(error) = call(roci_downloads_cancel, &serde_json::json!(key)) {
        log::warn!("[models] stopping the download of {key} failed: {error}");
    }
}

#[derive(Deserialize)]
struct Reply {
    ok: bool,
    error: Option<String>,
}

fn call(function: unsafe extern "C" fn(*const c_char) -> *mut c_char, input: &serde_json::Value) -> Result<(), LocalError> {
    let json = CString::new(input.to_string()).map_err(|e| LocalError::Download(e.to_string()))?;
    // SAFETY: the bridge reads the C string during the call and returns a string we own until freed below.
    let reply = unsafe {
        let ptr = function(json.as_ptr());
        let text = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        roci_downloads_free_string(ptr);
        text
    };
    let reply: Reply = serde_json::from_str(&reply).map_err(|e| LocalError::Download(e.to_string()))?;
    if reply.ok { Ok(()) } else { Err(LocalError::Download(reply.error.unwrap_or_default())) }
}

#[derive(Deserialize)]
struct Event {
    key: String,
    event: String,
    received: Option<u64>,
    error: Option<String>,
}

/// An event as Swift sends it; None for one this side doesn't know.
fn parse(json: &str) -> Option<(String, Transfer)> {
    let event: Event = serde_json::from_str(json).ok()?;
    let transfer = match event.event.as_str() {
        "progress" => Transfer::Progress(event.received.unwrap_or(0)),
        "finished" => Transfer::Finished,
        "cancelled" => Transfer::Cancelled,
        "failed" => Transfer::Failed(event.error.unwrap_or_else(|| "the download stopped".into())),
        _ => return None,
    };
    Some((event.key, transfer))
}

/// The session's events (on its own queue): to the download waiting for the file, else to the unclaimed handler.
extern "C" fn on_event(json: *const c_char) {
    // SAFETY: Swift passes a valid C string for the duration of the call.
    let json = unsafe { CStr::from_ptr(json) }.to_string_lossy();
    let Some((key, transfer)) = parse(&json) else {
        log::warn!("[models] unknown download event: {json}");
        return;
    };
    let ends = transfer.ends();
    let mut waiting = lock(&WAITING);
    let undelivered = match waiting.get(&key) {
        Some(events) => events.send((key.clone(), transfer)).err().map(|e| e.0),
        None => Some((key.clone(), transfer)),
    };
    if ends || undelivered.is_some() {
        waiting.remove(&key);
    }
    drop(waiting);
    if let (Some((key, transfer)), Some(unclaimed)) = (undelivered, UNCLAIMED.get()) {
        unclaimed(key, transfer);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_each_event_swift_sends() {
        assert_eq!(parse(r#"{"key":"m/f","event":"progress","received":42}"#), Some(("m/f".into(), Transfer::Progress(42))));
        assert_eq!(parse(r#"{"key":"m/f","event":"finished"}"#), Some(("m/f".into(), Transfer::Finished)));
        assert_eq!(parse(r#"{"key":"m/f","event":"cancelled"}"#), Some(("m/f".into(), Transfer::Cancelled)));
        assert_eq!(parse(r#"{"key":"m/f","event":"failed","error":"offline"}"#), Some(("m/f".into(), Transfer::Failed("offline".into()))));
        assert_eq!(parse(r#"{"key":"m/f","event":"paused"}"#), None);
    }

    #[test]
    fn only_progress_leaves_a_transfer_running() {
        assert!(!Transfer::Progress(1).ends());
        assert!([Transfer::Finished, Transfer::Cancelled, Transfer::Failed(String::new())].iter().all(Transfer::ends));
    }
}
