//! Announces committed meeting writes so other Rust code (e.g. the Spotlight index) can follow.

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

type Handler = Arc<dyn Fn(&MeetingChange) + Send + Sync>;

static HANDLERS: Mutex<Vec<Handler>> = Mutex::new(Vec::new());

/// Register a handler called after every committed meeting write, on the writer's thread.
pub fn on_meeting_change(handler: impl Fn(&MeetingChange) + Send + Sync + 'static) {
    if let Ok(mut handlers) = HANDLERS.lock() {
        handlers.push(Arc::new(handler));
    }
}

/// Call after the write has committed and the connection lock is released. Handlers are cloned
/// out first so none runs under the registry lock and a handler may itself register another.
pub(crate) fn notify(change: MeetingChange) {
    let handlers: Vec<Handler> = match HANDLERS.lock() {
        Ok(handlers) => handlers.clone(),
        Err(_) => return,
    };
    for handler in handlers {
        handler(&change);
    }
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

/// Blocking; never on the main thread. `None` when the meeting is missing or the database is
/// not open yet.
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
