//! macOS notifications; [`schedule`] hands each notice to macOS with its delivery time, so Roci keeps no timer.

mod bridge;
mod commands;

use std::collections::{HashMap, HashSet};
use std::ffi::CStr;
use std::os::raw::c_char;
use std::sync::{Mutex, MutexGuard, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    Emitter, Runtime,
};

/// Webview: the user answered a notification (`Response`).
pub const RESPONSE_EVENT: &str = "notifications://response";

/// Whether Roci may post notifications.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Authorized,
    Denied,
    NotDetermined,
    /// No app bundle: the system API can't run (it would crash), so nothing posts.
    Unsupported,
}

impl Status {
    fn parse(name: &str) -> Self {
        match name {
            "authorized" => Self::Authorized,
            "denied" => Self::Denied,
            "unsupported" => Self::Unsupported,
            _ => Self::NotDetermined,
        }
    }
}

/// One button on a notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub id: String,
    pub title: String,
}

/// A set of buttons, referenced by [`Notice::category`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub actions: Vec<Action>,
}

/// A notification.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    /// Reusing an id replaces the earlier notification; [`remove`] takes it.
    pub id: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub user_info: HashMap<String, String>,
    /// The user-facing kind (a Settings › Notifications switch); `None` is never muted.
    #[serde(default)]
    pub kind: Option<String>,
}

/// What the user did with a notification: an action id, `open` (clicked the banner) or `dismiss`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub id: String,
    pub action: String,
    #[serde(default)]
    pub user_info: HashMap<String, String>,
}

type Handler = Box<dyn Fn(&Response) + Send + Sync>;
type MutedHandler = Box<dyn Fn() + Send + Sync>;
type Emit = Box<dyn Fn(&str, serde_json::Value) + Send + Sync>;

#[derive(Default)]
struct State {
    categories: Vec<Category>,
    muted: HashSet<String>,
    /// Set by the first [`set_muted`]: until then `muted` is only a default.
    muted_known: bool,
    timed: Vec<(i64, Notice)>,
}

static STATE: OnceLock<Mutex<State>> = OnceLock::new();
/// Separate from `STATE`, so a handler may post or remove notices.
static HANDLERS: OnceLock<Mutex<Vec<Handler>>> = OnceLock::new();
static MUTED_HANDLERS: OnceLock<Mutex<Vec<MutedHandler>>> = OnceLock::new();
static EMIT: OnceLock<Emit> = OnceLock::new();

fn state() -> MutexGuard<'static, State> {
    STATE
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

fn handlers() -> MutexGuard<'static, Vec<Handler>> {
    HANDLERS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

fn muted_handlers() -> MutexGuard<'static, Vec<MutedHandler>> {
    MUTED_HANDLERS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

fn emit(event: &str, payload: impl Serialize) {
    let Some(emit) = EMIT.get() else { return };
    match serde_json::to_value(payload) {
        Ok(value) => emit(event, value),
        Err(error) => log::warn!("[notifications] {event} not sent: {error}"),
    }
}

// ── Permission ──

pub fn status() -> Status {
    bridge::status().map_or(Status::NotDetermined, |reply| Status::parse(&reply.status))
}

/// Raises the macOS prompt when undecided; blocks until answered, so never call it on the main thread.
/// "Don't Allow" also comes with an error, so the status is the answer and the error is only logged.
pub fn request() -> Result<Status, String> {
    let reply = bridge::request()?;
    if let Some(error) = reply.error {
        log::warn!("[notifications] request: {error}");
    }
    let status = Status::parse(&reply.status);
    if status == Status::Authorized {
        requeue_timed();
    }
    Ok(status)
}

// ── Posting ──

/// Adds button sets; macOS keeps one set per app, so all callers' categories are merged and registered together.
pub fn add_categories(categories: &[Category]) {
    let all = {
        let mut state = state();
        state
            .categories
            .retain(|known| !categories.iter().any(|new| new.id == known.id));
        state.categories.extend_from_slice(categories);
        state.categories.clone()
    };
    if let Err(error) = bridge::set_categories(&all) {
        log::info!("[notifications] categories not registered: {error}");
    }
}

/// Kinds the user switched off in Settings › Notifications.
pub fn set_muted(kinds: impl IntoIterator<Item = String>) {
    {
        let mut state = state();
        state.muted = kinds.into_iter().collect();
        state.muted_known = true;
    }
    requeue_timed();
    for handler in muted_handlers().iter() {
        handler();
    }
}

/// Call `handler` after every [`set_muted`], so a watcher reacts to the switch instead of polling it.
pub fn on_muted_changed(handler: impl Fn() + Send + Sync + 'static) {
    muted_handlers().push(Box::new(handler));
}

/// Whether Settings has sent the muted kinds yet; before that every kind reads unmuted.
pub fn muted_known() -> bool {
    state().muted_known
}

/// Whether the user switched `kind` off in Settings › Notifications.
pub fn is_muted(kind: &str) -> bool {
    state().muted.contains(kind)
}

/// Show `notice` now: skipped when its kind is muted or notifications aren't allowed (posting never asks).
pub fn post(notice: &Notice) {
    deliver(notice, None);
}

/// Hands `notice` to macOS for `at_ms` (wall clock), replacing a timed notice with the same id; a past time shows now.
pub fn schedule(notice: Notice, at_ms: i64) {
    {
        let mut state = state();
        state.timed.retain(|(_, timed)| timed.id != notice.id);
        state.timed.push((at_ms, notice.clone()));
    }
    deliver(&notice, Some(at_ms));
}

/// Withdraw notices by id: ones macOS still holds for later, and shown ones.
pub fn remove(ids: &[String]) {
    state().timed.retain(|(_, timed)| !ids.contains(&timed.id));
    if let Err(error) = bridge::remove(&ids) {
        log::debug!("[notifications] remove skipped: {error}");
    }
}

/// Withdraws notices queued with macOS by an earlier run under `prefix`; their owner re-queues what still applies.
pub fn remove_pending_with_prefix(prefix: &str) {
    if let Err(error) = bridge::remove_pending_prefix(prefix) {
        log::debug!("[notifications] pending {prefix}* not removed: {error}");
    }
}

/// What the bridge shows: the notice, and when macOS should deliver it (`None` = now).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Delivery<'a> {
    #[serde(flatten)]
    notice: &'a Notice,
    at_ms: Option<i64>,
}

/// One path for every notice: skipped when its kind is muted or notifications aren't allowed (posting never asks).
fn deliver(notice: &Notice, at_ms: Option<i64>) {
    if notice.kind.as_deref().is_some_and(is_muted) {
        return;
    }
    match status() {
        Status::Authorized => {
            if let Err(error) = bridge::show(&Delivery { notice, at_ms }) {
                log::warn!("[notifications] {} not shown: {error}", notice.id);
            }
        }
        status => log::info!("[notifications] {} not shown: {status:?}", notice.id),
    }
}

/// A switch changed: notices still waiting with macOS follow it (muted ones withdrawn, unmuted ones queued again).
fn requeue_timed() {
    let now_ms = wall_clock_ms();
    let waiting: Vec<(i64, Notice)> = {
        let mut state = state();
        state.timed.retain(|(at_ms, _)| *at_ms > now_ms);
        state.timed.clone()
    };
    for (at_ms, notice) in waiting {
        if notice.kind.as_deref().is_some_and(is_muted) {
            if let Err(error) = bridge::remove(&[notice.id.as_str()]) {
                log::debug!("[notifications] remove skipped: {error}");
            }
        } else {
            deliver(&notice, Some(at_ms));
        }
    }
}

fn wall_clock_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or_default()
}

// ── Answers ──

/// Call `handler` for every response; each handler ignores ids it doesn't own.
pub fn on_response_received(handler: impl Fn(&Response) + Send + Sync + 'static) {
    handlers().push(Box::new(handler));
}

fn respond(response: &Response) {
    for handler in handlers().iter() {
        handler(response);
    }
    emit(RESPONSE_EVENT, response);
}

extern "C" fn on_response(json: *const c_char) {
    let json = unsafe { CStr::from_ptr(json) }.to_string_lossy();
    match serde_json::from_str::<Response>(&json) {
        Ok(response) => respond(&response),
        Err(error) => log::warn!("[notifications] unreadable response: {error}"),
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("notifications")
        .invoke_handler(tauri::generate_handler![
            commands::status,
            commands::request,
            commands::post,
            commands::schedule,
            commands::remove,
            commands::add_categories,
            commands::set_muted,
        ])
        .setup(|app, _api| {
            let handle = app.clone();
            let _ = EMIT.set(Box::new(move |event, payload| {
                if let Err(error) = handle.emit(event, payload) {
                    log::warn!("[notifications] {event} failed: {error}");
                }
            }));
            // Before the app finishes launching, so a response that woke it is kept.
            bridge::setup(on_response);
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_timed_notice_reaches_the_bridge_with_its_time() {
        let notice = Notice {
            id: "todo:1".into(),
            title: "Call Ana".into(),
            body: String::new(),
            category: None,
            user_info: HashMap::new(),
            kind: None,
        };
        let json = serde_json::to_value(Delivery { notice: &notice, at_ms: Some(42) }).unwrap();
        assert_eq!(json["id"], "todo:1");
        assert_eq!(json["atMs"], 42);
        let now = serde_json::to_value(Delivery { notice: &notice, at_ms: None }).unwrap();
        assert!(now["atMs"].is_null());
    }

    #[test]
    fn muted_kind_reports_muted() {
        set_muted(["detectedCalls".into()]);
        assert!(is_muted("detectedCalls"));
        assert!(!is_muted("chatReplies"));
        assert!(muted_known());
    }
}
