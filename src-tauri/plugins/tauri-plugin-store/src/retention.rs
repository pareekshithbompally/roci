//! Keep policies in one transaction by the delete paths; busy meetings, untranscribed meetings' files and unclaimed files stay.

use crate::assets;
use crate::changes::{notify, MeetingChange};
use crate::commands::{delete_chat_rows, delete_meeting_rows, on_db, StoreState};
use crate::error::StoreError;
use rusqlite::{Connection, ToSql};
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// A meeting not being recorded, transcribed or summarized right now.
const IDLE: &str = "status NOT IN ('recording','transcribing','summarizing')";

/// What one purge removed, and when the next item comes due (epoch ms) so the app arms one timer for it.
#[derive(Debug, Default, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct PurgeResult {
    pub meetings: u32,
    pub chats: u32,
    pub dictations: u32,
    pub assets: u32,
    /// The chats removed, so an open one is left rather than saved back.
    pub chat_ids: Vec<String>,
    #[cfg_attr(test, ts(type = "number | null"))]
    pub next_due_at: Option<i64>,
}

/// One class's eligible rows: table, the time they age by, and the filter (`:kind` is the asset kind where there is one).
fn eligible(class: &str) -> (&'static str, &'static str, String) {
    match class {
        "meetings" => ("meetings", "created_at", IDLE.to_string()),
        "chats" => ("chats", "last_message_at", "1".into()),
        "dictations" => ("dictations", "created_at", "1".into()),
        _ => (
            "assets",
            "created_at",
            format!(
                "kind = :kind AND (chat_id IS NOT NULL OR meeting_id IN (
                     SELECT id FROM meetings WHERE {IDLE} AND id IN (SELECT meeting_id FROM transcripts)))"
            ),
        ),
    }
}

/// The named parameters a query over `class` takes: its kind (assets only) and, when given, the cutoff.
fn params_for<'a>(class: &'a String, cutoff: Option<&'a i64>) -> Vec<(&'static str, &'a dyn ToSql)> {
    let mut params: Vec<(&'static str, &dyn ToSql)> = Vec::new();
    if eligible(class).0 == "assets" {
        params.push((":kind", class));
    }
    if let Some(cutoff) = cutoff {
        params.push((":cutoff", cutoff));
    }
    params
}

fn expired_ids(tx: &Connection, class: &String, cutoff: i64) -> Result<Vec<String>, StoreError> {
    let (table, time, filter) = eligible(class);
    let mut stmt = tx.prepare(&format!("SELECT id FROM {table} WHERE {time} < :cutoff AND {filter}"))?;
    let rows = stmt
        .query_map(params_for(class, Some(&cutoff)).as_slice(), |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

/// When the oldest eligible item of `class` comes due; with none, a keep period from now so new items are still caught.
fn next_due(db: &Connection, class: &String, keep_ms: i64, now: i64) -> Result<i64, StoreError> {
    let (table, time, filter) = eligible(class);
    let oldest: Option<i64> = db.query_row(
        &format!("SELECT MIN({time}) FROM {table} WHERE {filter}"),
        params_for(class, None).as_slice(),
        |row| row.get(0),
    )?;
    Ok(oldest.unwrap_or(now) + keep_ms)
}

/// Removes one class's expired rows inside `tx`; returns their ids.
fn purge_class(tx: &Connection, class: &String, cutoff: i64) -> Result<Vec<String>, StoreError> {
    let ids = expired_ids(tx, class, cutoff)?;
    for id in &ids {
        match class.as_str() {
            "meetings" => delete_meeting_rows(tx, id)?,
            "chats" => delete_chat_rows(tx, id)?,
            "dictations" => {
                tx.execute("DELETE FROM dictations WHERE id = ?1", [id])?;
            }
            _ => {
                tx.execute("DELETE FROM assets WHERE id = ?1", [id])?;
            }
        }
    }
    Ok(ids)
}

/// Applies `keep_days` (absent class = forever) at `now`; returns the result and the deleted meetings to announce.
pub(crate) fn purge(db: &Connection, keep_days: &HashMap<String, u32>, now: i64) -> Result<(PurgeResult, Vec<String>), StoreError> {
    let mut result = PurgeResult::default();
    let mut deleted_meetings = Vec::new();
    let tx = db.unchecked_transaction()?;
    for (class, days) in keep_days {
        let ids = purge_class(&tx, class, now - i64::from(*days) * DAY_MS)?;
        let removed = ids.len() as u32;
        match class.as_str() {
            "meetings" => {
                result.meetings += removed;
                deleted_meetings.extend(ids);
            }
            "chats" => {
                result.chats += removed;
                result.chat_ids.extend(ids);
            }
            "dictations" => result.dictations += removed,
            _ => result.assets += removed,
        }
    }
    tx.commit()?;
    for (class, days) in keep_days {
        let due = next_due(db, class, i64::from(*days) * DAY_MS, now)?;
        result.next_due_at = Some(result.next_due_at.map_or(due, |at| at.min(due)));
    }
    Ok((result, deleted_meetings))
}

#[tauri::command]
pub async fn storage_purge(
    state: State<'_, StoreState>,
    keep_days: HashMap<String, u32>,
) -> Result<PurgeResult, StoreError> {
    let (result, deleted_meetings) = on_db(&state, move |db| {
        let purged = purge(db, &keep_days, crate::commands::now_millis())?;
        assets::drain_files(db);
        Ok(purged)
    })
    .await?;
    for id in deleted_meetings {
        notify(MeetingChange::Deleted(id));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::open_migrated_test_db;

    const NOW: i64 = 1_000 * DAY_MS;

    fn seed(db: &Connection) {
        let old = NOW - 40 * DAY_MS;
        let new = NOW - 5 * DAY_MS;
        db.execute_batch(&format!(
            "INSERT INTO meetings (id, title, status, created_at, updated_at) VALUES
                 ('old', 'Old', 'ready', {old}, 0), ('new', 'New', 'ready', {new}, 0), ('busy', 'Busy', 'transcribing', {old}, 0),
                 ('raw', 'Not transcribed', 'captured', {old}, 0);
             INSERT INTO transcripts (meeting_id, text, created_at) VALUES ('old', 't', 0), ('new', 't', 0), ('busy', 't', 0);
             INSERT INTO assets (id, kind, path, meeting_id, created_at) VALUES
                 ('r-old', 'recording', 'recordings/old.wav', 'old', {old}),
                 ('r-new', 'recording', 'recordings/new.wav', 'new', {old}),
                 ('r-busy', 'recording', 'recordings/busy.wav', 'busy', {old}),
                 ('r-raw', 'recording', 'recordings/raw.wav', 'raw', {old});
             INSERT INTO assets (id, kind, path, created_at) VALUES ('unclaimed', 'image', 'images/u.png', {old});
             INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c-old', 'C', 0, {old}), ('c-new', 'C', 0, {new});
             INSERT INTO dictations (id, text, created_at) VALUES ('d-old', 'x', {old}), ('d-new', 'y', {new});"
        ))
        .unwrap();
    }

    fn ids(db: &Connection, table: &str) -> Vec<String> {
        db.prepare(&format!("SELECT id FROM {table} ORDER BY id")).unwrap()
            .query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
    }

    #[test]
    fn expired_items_go_and_busy_meetings_stay_while_idle_untranscribed_ones_go() {
        let db = open_migrated_test_db();
        seed(&db);
        let keep = HashMap::from([("meetings".to_string(), 30), ("chats".to_string(), 30), ("dictations".to_string(), 30)]);
        let (result, mut deleted) = purge(&db, &keep, NOW).unwrap();
        deleted.sort();
        assert_eq!(ids(&db, "meetings"), vec!["busy", "new"]);
        assert_eq!(ids(&db, "chats"), vec!["c-new"]);
        assert_eq!(ids(&db, "dictations"), vec!["d-new"]);
        assert_eq!(deleted, vec!["old", "raw"]);
        assert_eq!(result.chat_ids, vec!["c-old"]);
        assert_eq!((result.meetings, result.chats, result.dictations), (2, 1, 1));
        // The next to come due: the new meeting, chat and dictation, all made 5 days ago, kept 30.
        assert_eq!(result.next_due_at, Some(NOW + 25 * DAY_MS));
    }

    #[test]
    fn a_tail_cut_removes_audio_but_keeps_its_meeting_and_never_touches_busy_untranscribed_or_unclaimed_files() {
        let db = open_migrated_test_db();
        seed(&db);
        let keep = HashMap::from([("recording".to_string(), 30), ("image".to_string(), 0)]);
        let (result, _) = purge(&db, &keep, NOW).unwrap();
        assert_eq!(ids(&db, "assets"), vec!["r-busy", "r-raw", "unclaimed"]);
        assert_eq!(ids(&db, "meetings"), vec!["busy", "new", "old", "raw"]);
        assert_eq!(result.assets, 2);
        let queued: i64 = db.query_row("SELECT COUNT(*) FROM purge_queue WHERE kind = 'file'", [], |r| r.get(0)).unwrap();
        assert_eq!(queued, 2, "each removed recording queues its file");
        let stamped: Vec<String> = db.prepare("SELECT id FROM meetings WHERE audio_removed_at IS NOT NULL ORDER BY id").unwrap()
            .query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(stamped, vec!["new", "old"], "a meeting whose audio went says so");
    }

    #[test]
    fn an_empty_class_still_arms_a_timer_a_keep_period_out() {
        let db = open_migrated_test_db();
        let (result, _) = purge(&db, &HashMap::from([("chats".to_string(), 30)]), NOW).unwrap();
        assert_eq!(result.next_due_at, Some(NOW + 30 * DAY_MS));
    }

    #[test]
    fn keeping_forever_removes_nothing_and_arms_no_timer() {
        let db = open_migrated_test_db();
        seed(&db);
        let (result, deleted) = purge(&db, &HashMap::new(), NOW).unwrap();
        assert!(deleted.is_empty());
        assert_eq!(result.next_due_at, None);
        assert_eq!(ids(&db, "meetings").len(), 4);
    }
}
