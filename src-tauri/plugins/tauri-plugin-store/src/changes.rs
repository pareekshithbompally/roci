//! Announces what other Rust code follows (the Spotlight and search indexes): committed meeting writes, chat saves, files
//! you gave Roci (attached or kept in the library), and the database opening.

use crate::commands::{meetings_get_impl, MeetingDetail, StoreState};
use crate::error::StoreError;
use rusqlite::OptionalExtension;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MeetingChange {
    Saved(String),
    Deleted(String),
}

/// The handlers of one event, called on the thread that caused it.
struct Handlers<T: ?Sized>(Mutex<Vec<Arc<T>>>);

impl<T: ?Sized> Handlers<T> {
    const fn new() -> Self {
        Self(Mutex::new(Vec::new()))
    }

    fn add(&self, handler: Arc<T>) {
        if let Ok(mut handlers) = self.0.lock() {
            handlers.push(handler);
        }
    }

    /// Cloned out, so a handler may register another.
    fn all(&self) -> Vec<Arc<T>> {
        self.0.lock().map(|handlers| handlers.clone()).unwrap_or_default()
    }
}

static MEETING_CHANGED: Handlers<dyn Fn(&MeetingChange) + Send + Sync> = Handlers::new();
static CHAT_SAVED: Handlers<dyn Fn(&str) + Send + Sync> = Handlers::new();
static DATABASE_OPEN: Handlers<dyn Fn() + Send + Sync> = Handlers::new();
static FILE_ADDED: Handlers<dyn Fn(&str) + Send + Sync> = Handlers::new();

/// Register a handler called after every committed meeting write, on the writer's thread.
pub fn on_meeting_change(handler: impl Fn(&MeetingChange) + Send + Sync + 'static) {
    MEETING_CHANGED.add(Arc::new(handler));
}

/// Call after commit and lock release.
pub(crate) fn notify(change: MeetingChange) {
    MEETING_CHANGED.all().iter().for_each(|handler| handler(&change));
}

/// Register a handler called after every committed chat save (its id), on the writer's thread.
pub fn on_chat_saved(handler: impl Fn(&str) + Send + Sync + 'static) {
    CHAT_SAVED.add(Arc::new(handler));
}

/// Call after commit and lock release.
pub(crate) fn notify_chat_saved(id: &str) {
    CHAT_SAVED.all().iter().for_each(|handler| handler(id));
}

/// Register a handler called after a file you gave Roci is saved (a chat's attachment) or kept in the Knowledge library (its
/// asset id), on the writer's thread.
pub fn on_file_added(handler: impl Fn(&str) + Send + Sync + 'static) {
    FILE_ADDED.add(Arc::new(handler));
}

/// Call after commit and lock release.
pub(crate) fn notify_file_added(id: &str) {
    FILE_ADDED.all().iter().for_each(|handler| handler(id));
}

/// Register a handler called once the database is open (at launch, when the webview first asks for it).
pub fn on_database_open(handler: impl Fn() + Send + Sync + 'static) {
    DATABASE_OPEN.add(Arc::new(handler));
}

/// Call after the database opens and its lock is released.
pub(crate) fn notify_database_open() {
    DATABASE_OPEN.all().iter().for_each(|handler| handler());
}

/// Blocking; never on the main thread. Empty until the database is open.
pub fn meeting_ids<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<String>, StoreError> {
    let state = app.state::<StoreState>();
    let guard = state
        .conn
        .lock()
        .map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
    let Some(db) = guard.as_ref() else {
        return Ok(Vec::new());
    };
    let mut stmt = db.prepare("SELECT id FROM meetings")?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ids)
}

/// Blocking; never on the main thread. A setting's saved JSON text (`null` once cleared); `None` when it was never saved or
/// the database is not open yet.
pub fn setting<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<Option<String>, StoreError> {
    let state = app.state::<StoreState>();
    let guard = state
        .conn
        .lock()
        .map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
    let Some(db) = guard.as_ref() else {
        return Ok(None);
    };
    let value = db
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| row.get(0))
        .optional()?;
    Ok(value)
}

/// Blocking; never on the main thread. `None` when the meeting is missing or the database is not open yet.
pub fn meeting_detail<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
) -> Result<Option<MeetingDetail>, StoreError> {
    let state = app.state::<StoreState>();
    let guard = state
        .conn
        .lock()
        .map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
    let Some(db) = guard.as_ref() else {
        return Ok(None);
    };
    let exists = db
        .query_row("SELECT 1 FROM meetings WHERE id = ?1", [id], |_| Ok(()))
        .optional()?
        .is_some();
    if !exists {
        return Ok(None);
    }
    meetings_get_impl(db, id).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn notify_reaches_every_handler() {
        let hits = Arc::new(AtomicUsize::new(0));
        for _ in 0..2 {
            let hits = Arc::clone(&hits);
            on_meeting_change(move |change| {
                if matches!(change, MeetingChange::Saved(id) if id == "notify-test") {
                    hits.fetch_add(1, Ordering::SeqCst);
                }
            });
        }
        notify(MeetingChange::Saved("notify-test".into()));
        assert_eq!(hits.load(Ordering::SeqCst), 2);
    }
}
