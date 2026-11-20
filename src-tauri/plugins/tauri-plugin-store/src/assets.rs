//! Every kept file is one `assets` row with at most one parent; deleting the row queues the file, `drain_files` removes it.

use crate::commands::{now_millis, on_db, ItemCursor, StoreState};
use crate::error::StoreError;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use tauri::State;

/// Meeting recordings, relative to app data.
pub(crate) const RECORDINGS_DIR: &str = "recordings";
/// Images a chat made.
pub(crate) const IMAGES_DIR: &str = "images";
/// Speech a chat read aloud.
const SPEECH_DIR: &str = "speech";
/// Folders where every file must be an asset row (the same as `assetKinds` and the asset scope); strays are swept.
const MANAGED_DIRS: &[&str] = &[RECORDINGS_DIR, IMAGES_DIR, SPEECH_DIR];
/// How long an unclaimed asset or an untracked file waits for its owner (a save in flight, an import half done).
const UNCLAIMED_GRACE_MS: i64 = 24 * 60 * 60 * 1000;

/// Tables and triggers of the asset store; part of the baseline and of migration v8.
pub(crate) const DDL: &str = "
    CREATE TABLE IF NOT EXISTS assets (
        id               TEXT PRIMARY KEY,
        kind             TEXT    NOT NULL,
        path             TEXT    NOT NULL UNIQUE,
        preview_path     TEXT,
        meeting_id       TEXT REFERENCES meetings(id) ON DELETE CASCADE,
        chat_id          TEXT REFERENCES chats(id)    ON DELETE CASCADE,
        duration_seconds REAL,
        meta             TEXT,
        created_at       INTEGER NOT NULL,
        CHECK (meeting_id IS NULL OR chat_id IS NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_assets_meeting ON assets(meeting_id);
    CREATE INDEX IF NOT EXISTS idx_assets_chat ON assets(chat_id);
    CREATE INDEX IF NOT EXISTS idx_assets_kind_created ON assets(kind, created_at);

    CREATE TABLE IF NOT EXISTS purge_queue (
        id   INTEGER PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('file','notice')),
        ref  TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
        INSERT INTO purge_queue (kind, ref) VALUES ('file', old.path);
        INSERT INTO purge_queue (kind, ref) SELECT 'file', old.preview_path WHERE old.preview_path IS NOT NULL;
    END;
    CREATE TRIGGER IF NOT EXISTS reminders_ad AFTER DELETE ON reminders WHEN old.status = 'scheduled' BEGIN
        INSERT INTO purge_queue (kind, ref) VALUES ('notice', old.todo_id);
    END;";

/// A meeting whose recording was cut remembers when, to say "Audio removed"; a whole-meeting delete stamps nothing.
pub(crate) const RECORDING_REMOVED_TRIGGER: &str = "
    CREATE TRIGGER IF NOT EXISTS assets_recording_removed AFTER DELETE ON assets
    WHEN old.kind = 'recording' AND old.meeting_id IS NOT NULL BEGIN
        UPDATE meetings SET audio_removed_at = CAST(unixepoch('subsec') * 1000 AS INTEGER) WHERE id = old.meeting_id;
    END;";

static APP_DATA: OnceLock<PathBuf> = OnceLock::new();

/// Where asset paths are rooted; set once when the database opens.
pub(crate) fn set_app_data(dir: PathBuf) {
    let _ = APP_DATA.set(dir);
}

pub(crate) fn recording_path(filename: &str) -> String {
    format!("{RECORDINGS_DIR}/{filename}")
}

/// A recording's file name, as the meeting screens and the frozen audio core name it.
pub(crate) fn recording_filename(path: &str) -> String {
    path.strip_prefix(RECORDINGS_DIR).and_then(|rest| rest.strip_prefix('/')).unwrap_or(path).to_string()
}

pub(crate) fn insert_recording(db: &Connection, id: &str, meeting_id: &str, filename: &str, created_at: i64) -> Result<(), StoreError> {
    db.execute(
        "INSERT INTO assets (id, kind, path, meeting_id, created_at) VALUES (?1, 'recording', ?2, ?3, ?4)",
        rusqlite::params![id, recording_path(filename), meeting_id, created_at],
    )?;
    Ok(())
}

/// A file a feature just wrote: unclaimed until a chat save that references it claims it.
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct NewAsset {
    pub kind: String,
    pub path: String,
    pub preview_path: Option<String>,
    pub duration_seconds: Option<f64>,
    /// JSON the kind defines (an image: prompt, model, aspect ratio).
    pub meta: Option<String>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct AssetRow {
    pub id: String,
    pub kind: String,
    pub path: String,
    pub preview_path: Option<String>,
    pub meeting_id: Option<String>,
    pub chat_id: Option<String>,
    pub duration_seconds: Option<f64>,
    pub meta: Option<String>,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
}

/// A scheduled to-do notice whose reminder was deleted with its parent; the app removes it from macOS.
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct OwedNotice {
    #[cfg_attr(test, ts(type = "number"))]
    pub id: i64,
    pub todo_id: String,
}

/// `folder/name` in a managed folder: the only shape an asset path may take.
fn is_managed(path: &str) -> bool {
    let mut parts = Path::new(path).components();
    let folder = parts.next().and_then(|c| match c {
        Component::Normal(name) => name.to_str(),
        _ => None,
    });
    let name_ok = matches!(parts.next(), Some(Component::Normal(_)));
    name_ok && parts.next().is_none() && folder.is_some_and(|f| MANAGED_DIRS.contains(&f))
}

pub(crate) fn create(db: &Connection, id: &str, asset: &NewAsset, created_at: i64) -> Result<(), StoreError> {
    let paths_ok = is_managed(&asset.path) && asset.preview_path.as_deref().is_none_or(is_managed);
    if asset.kind.is_empty() || !paths_ok {
        return Err(StoreError::from(format!("Refused asset {} ({})", asset.path, asset.kind)));
    }
    db.execute(
        "INSERT INTO assets (id, kind, path, preview_path, duration_seconds, meta, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, asset.kind, asset.path, asset.preview_path, asset.duration_seconds, asset.meta, created_at],
    )?;
    Ok(())
}

/// Inside a chat save: the chat claims the unclaimed files its messages reference, and drops the ones they no longer do.
pub(crate) fn sync_chat_assets(tx: &Connection, chat_id: &str, paths: &[String]) -> Result<(), StoreError> {
    let paths_json = serde_json::to_string(paths).map_err(|e| StoreError::from(e.to_string()))?;
    tx.execute(
        "UPDATE assets SET chat_id = ?1
         WHERE chat_id IS NULL AND meeting_id IS NULL AND path IN (SELECT value FROM json_each(?2))",
        rusqlite::params![chat_id, paths_json],
    )?;
    tx.execute(
        "DELETE FROM assets WHERE chat_id = ?1 AND path NOT IN (SELECT value FROM json_each(?2))",
        rusqlite::params![chat_id, paths_json],
    )?;
    Ok(())
}

/// One page of `kind`'s files, newest first, after `before` (the last row of the page before it).
pub(crate) fn page(db: &Connection, kind: &str, before: Option<&ItemCursor>, limit: u32) -> Result<Vec<AssetRow>, StoreError> {
    let (at, id) = before.map_or((i64::MAX, String::new()), |c| (c.at, c.id.clone()));
    let rows = db
        .prepare(
            "SELECT id, kind, path, preview_path, meeting_id, chat_id, duration_seconds, meta, created_at
             FROM assets WHERE kind = ?1 AND (created_at < ?2 OR (created_at = ?2 AND id < ?3))
             ORDER BY created_at DESC, id DESC LIMIT ?4",
        )?
        .query_map(rusqlite::params![kind, at, id, limit], |row| {
            Ok(AssetRow {
                id: row.get(0)?,
                kind: row.get(1)?,
                path: row.get(2)?,
                preview_path: row.get(3)?,
                meeting_id: row.get(4)?,
                chat_id: row.get(5)?,
                duration_seconds: row.get(6)?,
                meta: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

fn owed_notices(db: &Connection) -> Result<Vec<OwedNotice>, StoreError> {
    let rows = db
        .prepare("SELECT id, ref FROM purge_queue WHERE kind = 'notice'")?
        .query_map([], |row| Ok(OwedNotice { id: row.get(0)?, todo_id: row.get(1)? }))?
        .collect::<Result<_, _>>()?;
    Ok(rows)
}

fn clear_notices(db: &Connection, ids: &[i64]) -> Result<(), StoreError> {
    let ids_json = serde_json::to_string(ids).map_err(|e| StoreError::from(e.to_string()))?;
    db.execute(
        "DELETE FROM purge_queue WHERE kind = 'notice' AND id IN (SELECT value FROM json_each(?1))",
        [ids_json],
    )?;
    Ok(())
}

/// An app-data path made only of plain names; anything absolute or climbing out is refused.
fn resolve(root: &Path, path: &str) -> Option<PathBuf> {
    let relative = Path::new(path);
    let plain = relative.components().all(|c| matches!(c, Component::Normal(_)));
    (plain && relative.components().count() >= 2).then(|| root.join(relative))
}

/// Removes one queued file. Gone already counts as removed; a path an asset owns again is left alone.
fn remove_queued(db: &Connection, root: &Path, path: &str) -> bool {
    let owned = db
        .query_row("SELECT 1 FROM assets WHERE path = ?1 OR preview_path = ?1", [path], |_| Ok(()))
        .optional()
        .unwrap_or(None)
        .is_some();
    let Some(file) = resolve(root, path).filter(|_| !owned) else {
        return true;
    };
    match std::fs::remove_file(&file) {
        Ok(()) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(error) => {
            log::warn!("[store] Kept {} queued for removal: {}", path, error);
            false
        }
    }
}

/// Removes queued files under `root`; a failure stays queued for the next drain. Returns how many were cleared.
pub(crate) fn drain_files_in(db: &Connection, root: &Path) -> Result<usize, StoreError> {
    let queued: Vec<(i64, String)> = db
        .prepare("SELECT id, ref FROM purge_queue WHERE kind = 'file'")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut cleared = 0;
    for (id, path) in queued {
        if remove_queued(db, root, &path) {
            db.execute("DELETE FROM purge_queue WHERE id = ?1", [id])?;
            cleared += 1;
        }
    }
    Ok(cleared)
}

/// After a commit that deleted assets, their files go; a failure is logged and stays queued for the next drain.
pub(crate) fn drain_files(db: &Connection) {
    let Some(root) = APP_DATA.get() else { return };
    if let Err(error) = drain_files_in(db, root) {
        log::warn!("[store] Queued files not drained: {}", error.message);
    }
}

/// Strays this database may sweep: older than the grace period and newer than the database (older ones outlived a lost DB).
struct SweepWindow {
    before: SystemTime,
    after: SystemTime,
}

impl SweepWindow {
    fn at(db: &Connection, now_ms: i64) -> Self {
        let created_ms: i64 = db
            .query_row("SELECT value FROM meta WHERE key = 'created_at'", [], |row| row.get::<_, String>(0))
            .optional()
            .unwrap_or(None)
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let at = |ms: i64| SystemTime::UNIX_EPOCH + Duration::from_millis(ms.max(0) as u64);
        Self { before: at(now_ms - UNCLAIMED_GRACE_MS), after: at(created_ms) }
    }

    fn holds(&self, path: &Path) -> bool {
        std::fs::metadata(path).and_then(|m| m.modified()).is_ok_and(|t| t < self.before && t > self.after)
    }
}

/// Every file an asset owns (its path and preview), read once so the sweep checks files in memory, not one query each.
fn owned_paths(db: &Connection) -> Result<std::collections::HashSet<String>, StoreError> {
    let mut owned = std::collections::HashSet::new();
    let mut stmt = db.prepare("SELECT path, preview_path FROM assets")?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)))?;
    for row in rows {
        let (path, preview) = row?;
        owned.insert(path);
        owned.extend(preview);
    }
    Ok(owned)
}

/// Strays in the window: files no asset owns, and track folders of deleted meetings (recovery reads only live ones).
fn strays(db: &Connection, root: &Path, window: &SweepWindow) -> Result<Vec<PathBuf>, StoreError> {
    let owned = owned_paths(db)?;
    let mut meeting = db.prepare("SELECT 1 FROM meetings WHERE id = ?1")?;
    let mut found = Vec::new();
    for dir in MANAGED_DIRS {
        let Ok(entries) = std::fs::read_dir(root.join(dir)) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
            if !window.holds(&path) {
                continue;
            }
            let stray = if path.is_dir() {
                *dir == RECORDINGS_DIR && !meeting.exists([&name])?
            } else {
                !owned.contains(&format!("{dir}/{name}"))
            };
            if stray {
                found.push(path);
            }
        }
    }
    Ok(found)
}

fn remove_stray(path: &Path) {
    let removed = if path.is_dir() { std::fs::remove_dir_all(path) } else { std::fs::remove_file(path) };
    if let Err(error) = removed {
        log::warn!("[store] Stray {:?} not removed: {}", path, error);
    }
}

/// At open: unclaimed rows and stray entries past the grace period go, then every queued file.
pub(crate) fn sweep(db: &Connection, root: &Path, now_ms: i64) -> Result<(), StoreError> {
    let unclaimed = db.execute(
        "DELETE FROM assets WHERE meeting_id IS NULL AND chat_id IS NULL AND created_at < ?1",
        [now_ms - UNCLAIMED_GRACE_MS],
    )?;
    let strays = strays(db, root, &SweepWindow::at(db, now_ms))?;
    strays.iter().for_each(|path| remove_stray(path));
    let drained = drain_files_in(db, root)?;
    log::info!("[store] Sweep: {} unclaimed assets, {} strays, {} queued files", unclaimed, strays.len(), drained);
    Ok(())
}

#[tauri::command]
pub async fn assets_create(state: State<'_, StoreState>, asset: NewAsset) -> Result<String, StoreError> {
    on_db(&state, move |db| {
        let id = crate::commands::generate_id();
        create(db, &id, &asset, now_millis())?;
        Ok(id)
    })
    .await
}

/// The Gallery a page at a time.
#[tauri::command]
pub async fn assets_page(state: State<'_, StoreState>, kind: String, before: Option<ItemCursor>, limit: u32) -> Result<Vec<AssetRow>, StoreError> {
    on_db(&state, move |db| page(db, &kind, before.as_ref(), limit)).await
}

/// How many files of `kind` are kept (the Gallery's "N images").
#[tauri::command]
pub async fn assets_count(state: State<'_, StoreState>, kind: String) -> Result<i64, StoreError> {
    on_db(&state, move |db| Ok(db.query_row("SELECT COUNT(*) FROM assets WHERE kind = ?1", [kind], |row| row.get(0))?)).await
}

/// Whether a file is still kept (its row exists); a chat shows "removed" where it isn't.
#[tauri::command]
pub async fn assets_exists(state: State<'_, StoreState>, path: String) -> Result<bool, StoreError> {
    on_db(&state, move |db| Ok(db.prepare("SELECT 1 FROM assets WHERE path = ?1")?.exists([path])?)).await
}

#[tauri::command]
pub async fn notices_owed(state: State<'_, StoreState>) -> Result<Vec<OwedNotice>, StoreError> {
    on_db(&state, owed_notices).await
}

#[tauri::command]
pub async fn notices_cleared(state: State<'_, StoreState>, ids: Vec<i64>) -> Result<(), StoreError> {
    on_db(&state, move |db| clear_notices(db, &ids)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::open_migrated_test_db;

    fn scratch(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("roci-assets-{name}-{}", std::process::id()));
        std::fs::create_dir_all(root.join(RECORDINGS_DIR)).unwrap();
        root
    }

    /// A meeting and a chat holding every kind of child: deleting each parent leaves no row, no file and no live notice.
    #[test]
    fn deleting_parents_leaves_nothing_behind() {
        let db = open_migrated_test_db();
        let root = scratch("parents");
        std::fs::create_dir_all(root.join("images")).unwrap();
        for file in ["recordings/m1.wav", "images/c1.png", "images/c1.thumb.jpg"] {
            std::fs::write(root.join(file), b"x").unwrap();
        }
        db.execute_batch(
            "INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m1', 'Standup', 0, 0);
             INSERT INTO transcripts (meeting_id, text, created_at) VALUES ('m1', 'hello', 0);
             INSERT INTO notes (id, meeting_id, text, created_at, updated_at) VALUES ('n1', 'm1', 'note', 0, 0);
             INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES ('t1', 'm1', 'ship', 'ai', 0);
             INSERT INTO reminders (todo_id, notification_id, fire_at, status, created_at) VALUES ('t1', 42, 9, 'scheduled', 0);
             INSERT INTO assets (id, kind, path, meeting_id, created_at) VALUES ('a1', 'recording', 'recordings/m1.wav', 'm1', 0);
             INSERT INTO chats (id, title, meeting_id, created_at, last_message_at) VALUES ('c1', 'Chat', 'm1', 0, 0);
             INSERT INTO chat_messages (id, chat_id, seq, role, created_at) VALUES ('msg1', 'c1', 0, 'user', 0);
             INSERT INTO assets (id, kind, path, preview_path, chat_id, created_at)
                 VALUES ('a2', 'image', 'images/c1.png', 'images/c1.thumb.jpg', 'c1', 0);",
        )
        .unwrap();

        crate::commands::meetings_delete_impl(&db, "m1").unwrap();
        crate::commands::chats_delete_impl(&db, "c1").unwrap();
        drain_files_in(&db, &root).unwrap();

        let count = |sql: &str| -> i64 { db.query_row(sql, [], |r| r.get(0)).unwrap() };
        for table in ["meetings", "transcripts", "notes", "todos", "reminders", "assets", "chats", "chat_messages"] {
            assert_eq!(count(&format!("SELECT COUNT(*) FROM {table}")), 0, "{table} left behind");
        }
        assert_eq!(count("SELECT COUNT(*) FROM purge_queue WHERE kind = 'file'"), 0, "files left queued");
        let notices: Vec<String> = db.prepare("SELECT ref FROM purge_queue WHERE kind = 'notice'").unwrap()
            .query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(notices, vec!["t1".to_string()], "the scheduled notice is owed a cancel");
        for file in ["recordings/m1.wav", "images/c1.png", "images/c1.thumb.jpg"] {
            assert!(!root.join(file).exists(), "{file} left on disk");
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    /// A chat save owns exactly the files its messages reference: new ones are claimed, dropped ones are queued.
    #[test]
    fn a_chat_save_claims_referenced_files_and_drops_the_rest() {
        let db = open_migrated_test_db();
        db.execute_batch("INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c1', 'Chat', 0, 0);").unwrap();
        let image = |path: &str| NewAsset { kind: "image".into(), path: path.into(), preview_path: None, duration_seconds: None, meta: None };
        create(&db, "a1", &image("images/kept.png"), 0).unwrap();
        create(&db, "a2", &image("images/dropped.png"), 0).unwrap();
        create(&db, "a3", &image("images/other.png"), 0).unwrap();

        sync_chat_assets(&db, "c1", &["images/kept.png".into(), "images/dropped.png".into()]).unwrap();
        sync_chat_assets(&db, "c1", &["images/kept.png".into()]).unwrap();

        let owners: Vec<(String, Option<String>)> = db.prepare("SELECT path, chat_id FROM assets ORDER BY path").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(owners, vec![("images/kept.png".into(), Some("c1".into())), ("images/other.png".into(), None)]);
        let queued: String = db.query_row("SELECT ref FROM purge_queue", [], |r| r.get(0)).unwrap();
        assert_eq!(queued, "images/dropped.png");
    }

    #[test]
    fn create_refuses_paths_outside_managed_folders() {
        let db = open_migrated_test_db();
        let asset = |path: &str| NewAsset { kind: "image".into(), path: path.into(), preview_path: None, duration_seconds: None, meta: None };
        assert!(create(&db, "a", &asset("images/x.png"), 0).is_ok());
        for bad in ["roci.db", "images/../roci.db", "/etc/x", "cache/x.png", "images/a/b.png"] {
            assert!(create(&db, bad, &asset(bad), 0).is_err(), "{bad} accepted");
        }
    }

    #[test]
    fn resolve_refuses_paths_outside_app_data() {
        let root = Path::new("/data");
        assert_eq!(resolve(root, "recordings/a.wav"), Some(root.join("recordings/a.wav")));
        assert_eq!(resolve(root, "../a.wav"), None);
        assert_eq!(resolve(root, "/etc/passwd"), None);
        assert_eq!(resolve(root, "recordings/../../a"), None);
        assert_eq!(resolve(root, "roci.db"), None);
    }

    #[test]
    fn recording_filename_round_trips() {
        assert_eq!(recording_filename(&recording_path("m1.wav")), "m1.wav");
    }

    #[test]
    fn drain_removes_files_and_keeps_failures_queued() {
        let db = open_migrated_test_db();
        let root = scratch("drain");
        let file = root.join("recordings/gone.wav");
        std::fs::write(&file, b"x").unwrap();
        db.execute_batch(
            "INSERT INTO purge_queue (kind, ref) VALUES ('file', 'recordings/gone.wav'), ('file', 'recordings/missing.wav');",
        )
        .unwrap();
        assert_eq!(drain_files_in(&db, &root).unwrap(), 2);
        assert!(!file.exists());
        let left: i64 = db.query_row("SELECT COUNT(*) FROM purge_queue", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn drain_leaves_a_path_an_asset_owns_again() {
        let db = open_migrated_test_db();
        let root = scratch("reowned");
        let file = root.join("recordings/m1.wav");
        std::fs::write(&file, b"x").unwrap();
        db.execute_batch(
            "INSERT INTO assets (id, kind, path, created_at) VALUES ('a1', 'recording', 'recordings/m1.wav', 0);
             INSERT INTO purge_queue (kind, ref) VALUES ('file', 'recordings/m1.wav');",
        )
        .unwrap();
        drain_files_in(&db, &root).unwrap();
        assert!(file.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sweep_removes_old_unclaimed_rows_but_keeps_new_ones() {
        let db = open_migrated_test_db();
        let root = scratch("sweep");
        let now = 10 * UNCLAIMED_GRACE_MS;
        db.execute_batch(&format!(
            "INSERT INTO assets (id, kind, path, created_at) VALUES ('old', 'recording', 'recordings/old.wav', 0),
                                                                    ('new', 'recording', 'recordings/new.wav', {now});"
        ))
        .unwrap();
        sweep(&db, &root, now).unwrap();
        let ids: Vec<String> = db.prepare("SELECT id FROM assets").unwrap()
            .query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(ids, vec!["new".to_string()]);
        std::fs::remove_dir_all(root).unwrap();
    }

    /// Backdates `path` by `days`, as if it were written then.
    fn age(path: &Path, days: u64) {
        let file = std::fs::File::options().write(true).open(path).or_else(|_| std::fs::File::open(path)).unwrap();
        file.set_modified(SystemTime::now() - Duration::from_secs(days * 24 * 60 * 60)).unwrap();
    }

    fn now_ms() -> i64 {
        SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_millis() as i64
    }

    #[test]
    fn sweep_keeps_files_that_outlived_a_lost_database() {
        let db = open_migrated_test_db();
        let root = scratch("lost-db");
        let old = root.join("recordings/from-before.wav");
        std::fs::write(&old, b"x").unwrap();
        age(&old, 30);
        sweep(&db, &root, now_ms()).unwrap();
        assert!(old.exists(), "a file older than the database is the user's, never swept");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sweep_removes_this_databases_strays_and_dead_track_folders() {
        let db = open_migrated_test_db();
        let root = scratch("strays");
        db.execute_batch(&format!(
            "UPDATE meta SET value = '{}' WHERE key = 'created_at';
             INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('live', 'Live', 0, 0);",
            now_ms() - 10 * UNCLAIMED_GRACE_MS
        ))
        .unwrap();
        let stray = root.join("recordings/stray.wav");
        std::fs::write(&stray, b"x").unwrap();
        for folder in ["recordings/gone", "recordings/live"] {
            std::fs::create_dir_all(root.join(folder)).unwrap();
            std::fs::write(root.join(folder).join("system.wav"), b"x").unwrap();
            age(&root.join(folder), 2);
        }
        age(&stray, 2);

        sweep(&db, &root, now_ms()).unwrap();

        assert!(!stray.exists(), "an untracked file this database made is swept");
        assert!(!root.join("recordings/gone").exists(), "a deleted meeting's track folder is swept");
        assert!(root.join("recordings/live").is_dir(), "a meeting's own track folder stays");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sweep_keeps_fresh_untracked_files_and_folders() {
        let db = open_migrated_test_db();
        let root = scratch("fresh");
        let fresh = root.join("recordings/importing.wav");
        std::fs::write(&fresh, b"x").unwrap();
        std::fs::create_dir_all(root.join("recordings/rec_1_tracks")).unwrap();
        sweep(&db, &root, 0).unwrap();
        assert!(fresh.exists());
        assert!(root.join("recordings/rec_1_tracks").is_dir());
        std::fs::remove_dir_all(root).unwrap();
    }
}
