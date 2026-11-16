//! The recorder's view of the store: create a meeting at Record, move its status, find interrupted ones.

use crate::changes::{notify, MeetingChange};
use crate::commands::{
    meetings_create_impl, meetings_delete_impl, meetings_set_status_impl, MeetingCreateInput, MeetingStatus,
    StoreState,
};
use crate::error::StoreError;
use rusqlite::Connection;
use tauri::{AppHandle, Manager, Runtime};

/// Blocking; never on the main thread. Fails when the database is not open yet.
fn with_db<R: Runtime, T>(
    app: &AppHandle<R>,
    run: impl FnOnce(&Connection) -> Result<T, StoreError>,
) -> Result<T, StoreError> {
    let state = app.state::<StoreState>();
    let guard = state
        .conn
        .lock()
        .map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
    let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
    run(db)
}

pub fn create_meeting<R: Runtime>(app: &AppHandle<R>, input: &MeetingCreateInput) -> Result<(), StoreError> {
    with_db(app, |db| meetings_create_impl(db, input))?;
    notify(MeetingChange::Saved(input.id.clone()));
    Ok(())
}

/// Sets the status, and for `captured` the recording's length.
pub fn set_meeting_status<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    status: &MeetingStatus,
    duration_secs: Option<f64>,
) -> Result<(), StoreError> {
    with_db(app, |db| {
        meetings_set_status_impl(db, id, status)?;
        if let Some(duration) = duration_secs {
            db.execute(
                "UPDATE recordings SET duration_seconds = ?2 WHERE meeting_id = ?1",
                rusqlite::params![id, duration],
            )?;
        }
        Ok(())
    })?;
    notify(MeetingChange::Saved(id.to_string()));
    Ok(())
}

pub fn delete_meeting<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), StoreError> {
    with_db(app, |db| meetings_delete_impl(db, id).map(|_| ()))?;
    notify(MeetingChange::Deleted(id.to_string()));
    Ok(())
}

/// Ids of meetings in `status`, oldest first.
pub fn meetings_with_status<R: Runtime>(app: &AppHandle<R>, status: &str) -> Result<Vec<String>, StoreError> {
    with_db(app, |db| {
        let mut stmt = db.prepare("SELECT id FROM meetings WHERE status = ?1 ORDER BY created_at")?;
        let ids = stmt
            .query_map([status], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(ids)
    })
}
