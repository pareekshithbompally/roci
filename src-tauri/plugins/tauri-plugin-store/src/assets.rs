//! Every kept file is one `assets` row in one folder, `assets/`, named by its row: its `kind` (recording, image, speech,
//! video, file) says what it is, never its folder. A row has at most one parent (a meeting or a chat), or is `kept` in the
//! Knowledge library; deleting the row queues the file, `drain_files` removes it.

use crate::commands::{now_millis, on_db, ItemCursor, StoreState};
use crate::error::StoreError;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use tauri::State;

/// The one folder every kept file lives in, relative to app data (the same as `StorageConfig.assetsDir` and the asset scope);
/// a file there without a row is a stray and is swept. A folder inside it is a recording's tracks (the frozen audio core's).
pub const ASSETS_DIR: &str = "assets";
/// The folders files lived in by kind before v17, moved into `ASSETS_DIR` at the first open after the upgrade.
const OLD_DIRS: &[&str] = &["recordings", "images", "speech"];
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
        kept             INTEGER NOT NULL DEFAULT 0,
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
    format!("{ASSETS_DIR}/{filename}")
}

/// A recording's file name, as the meeting screens and the frozen audio core name it.
pub(crate) fn recording_filename(path: &str) -> String {
    path.strip_prefix(ASSETS_DIR).and_then(|rest| rest.strip_prefix('/')).unwrap_or(path).to_string()
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
    /// Kept in the Knowledge library: no parent ever claims it and no sweep takes it.
    #[serde(default)]
    pub kept: bool,
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

/// `assets/name`: the only shape an asset path may take.
fn is_managed(path: &str) -> bool {
    let mut parts = Path::new(path).components();
    let folder = parts.next().and_then(|c| match c {
        Component::Normal(name) => name.to_str(),
        _ => None,
    });
    let name_ok = matches!(parts.next(), Some(Component::Normal(_)));
    name_ok && parts.next().is_none() && folder == Some(ASSETS_DIR)
}

pub(crate) fn create(db: &Connection, id: &str, asset: &NewAsset, created_at: i64) -> Result<(), StoreError> {
    let paths_ok = is_managed(&asset.path) && asset.preview_path.as_deref().is_none_or(is_managed);
    if asset.kind.is_empty() || !paths_ok {
        return Err(StoreError::from(format!("Refused asset {} ({})", asset.path, asset.kind)));
    }
    db.execute(
        "INSERT INTO assets (id, kind, path, preview_path, duration_seconds, meta, created_at, kept) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, asset.kind, asset.path, asset.preview_path, asset.duration_seconds, asset.meta, created_at, asset.kept],
    )?;
    Ok(())
}

/// Inside a chat save: the chat claims the unclaimed files its messages reference, and drops the ones they no longer do. A
/// file kept in the library stays the library's, whichever chats show it.
pub(crate) fn sync_chat_assets(tx: &Connection, chat_id: &str, paths: &[String]) -> Result<(), StoreError> {
    let paths_json = serde_json::to_string(paths).map_err(|e| StoreError::from(e.to_string()))?;
    tx.execute(
        "UPDATE assets SET chat_id = ?1
         WHERE chat_id IS NULL AND meeting_id IS NULL AND kept = 0 AND path IN (SELECT value FROM json_each(?2))",
        rusqlite::params![chat_id, paths_json],
    )?;
    tx.execute(
        "DELETE FROM assets WHERE chat_id = ?1 AND path NOT IN (SELECT value FROM json_each(?2))",
        rusqlite::params![chat_id, paths_json],
    )?;
    Ok(())
}

/// Which files a page lists: one kind's (the Gallery), or every file kept in the library (Knowledge).
#[derive(Clone, Copy)]
pub(crate) enum Listing<'a> {
    Kind(&'a str),
    Library,
}

/// One page of the listing's files, newest first, after `before` (the last row of the page before it).
pub(crate) fn page(db: &Connection, listing: Listing, before: Option<&ItemCursor>, limit: u32) -> Result<Vec<AssetRow>, StoreError> {
    let (at, id) = before.map_or((i64::MAX, String::new()), |c| (c.at, c.id.clone()));
    let (kind, library) = match listing {
        Listing::Kind(kind) => (Some(kind), false),
        Listing::Library => (None, true),
    };
    let rows = db
        .prepare(
            "SELECT id, kind, path, preview_path, meeting_id, chat_id, duration_seconds, meta, created_at
             FROM assets WHERE (?1 IS NULL OR kind = ?1) AND (?2 = 0 OR kept = 1)
               AND (created_at < ?3 OR (created_at = ?3 AND id < ?4))
             ORDER BY created_at DESC, id DESC LIMIT ?5",
        )?
        .query_map(rusqlite::params![kind, library, at, id, limit], |row| {
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

/// Deletes a file kept in the library: its row goes, and the triggers queue the file and take its passages and index
/// state. A file a meeting or chat owns goes only with its parent, so it is left alone here. Returns whether one went.
pub(crate) fn delete_kept(db: &Connection, id: &str) -> Result<bool, StoreError> {
    Ok(db.execute("DELETE FROM assets WHERE id = ?1 AND kept = 1", [id])? > 0)
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
    let Ok(entries) = std::fs::read_dir(root.join(ASSETS_DIR)) else { return Ok(found) };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
        if !window.holds(&path) {
            continue;
        }
        let stray = if path.is_dir() { !meeting.exists([&name])? } else { !owned.contains(&format!("{ASSETS_DIR}/{name}")) };
        if stray {
            found.push(path);
        }
    }
    Ok(found)
}

/// At the first open after v17: every file still in a by-kind folder (and a recording's track folder) moves into
/// `ASSETS_DIR` under its own name, then the emptied folder goes. The rows already point there (v17 rewrote them), so a
/// move half done finishes at the next open; a name already in `ASSETS_DIR` is left where it was and logged.
pub(crate) fn move_into_assets(root: &Path) {
    let target = root.join(ASSETS_DIR);
    for dir in OLD_DIRS {
        let Ok(entries) = std::fs::read_dir(root.join(dir)) else { continue };
        if let Err(error) = std::fs::create_dir_all(&target) {
            log::error!("[store] {} not made: {}", ASSETS_DIR, error);
            return;
        }
        for entry in entries.flatten() {
            let to = target.join(entry.file_name());
            let moved = if to.exists() { Err(std::io::Error::from(std::io::ErrorKind::AlreadyExists)) } else { std::fs::rename(entry.path(), &to) };
            if let Err(error) = moved {
                log::warn!("[store] {:?} not moved into {}: {}", entry.path(), ASSETS_DIR, error);
            }
        }
        if std::fs::remove_dir(root.join(dir)).is_ok() {
            log::info!("[store] {} moved into {}", dir, ASSETS_DIR);
        }
    }
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
        "DELETE FROM assets WHERE meeting_id IS NULL AND chat_id IS NULL AND kept = 0 AND created_at < ?1",
        [now_ms - UNCLAIMED_GRACE_MS],
    )?;
    let strays = strays(db, root, &SweepWindow::at(db, now_ms))?;
    strays.iter().for_each(|path| remove_stray(path));
    let drained = drain_files_in(db, root)?;
    log::info!("[store] Sweep: {} unclaimed assets, {} strays, {} queued files", unclaimed, strays.len(), drained);
    Ok(())
}

/// A `data:` URL's media type and bytes (base64 only: the webview's FileReader writes every attachment that way).
fn decode_data_url(url: &str) -> Option<(String, Vec<u8>)> {
    use base64::Engine;
    let (head, body) = url.strip_prefix("data:")?.split_once(',')?;
    let media_type = head.strip_suffix(";base64")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(body).ok()?;
    Some((media_type.to_string(), bytes))
}

/// A file's extension from its name ("plan.PDF" → "pdf"); `bin` when it has none (as `fileExtension` names a new attachment).
fn extension_of(name: &str) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() => ext.to_lowercase(),
        _ => "bin".into(),
    }
}

/// One message's attached files carried inside it as `data:` URLs, written out to `assets/`; each part then keeps its path.
/// Returns the files written (path, meta); a file that can't be written stays inline.
fn write_out_inline(root: &Path, message: &mut serde_json::Value) -> Vec<(String, String)> {
    let mut written = Vec::new();
    let Some(parts) = message.get_mut("parts").and_then(serde_json::Value::as_array_mut) else { return written };
    for part in parts.iter_mut().filter(|part| part["type"] == "file") {
        let Some((media_type, bytes)) = part["url"].as_str().and_then(decode_data_url) else { continue };
        let name = part["filename"].as_str().unwrap_or("attachment").to_string();
        let path = format!("{ASSETS_DIR}/{}.{}", crate::commands::generate_id(), extension_of(&name));
        if let Err(error) = std::fs::write(root.join(&path), &bytes) {
            log::warn!("[store] Attachment {} not written out: {}", name, error);
            continue;
        }
        part["url"] = serde_json::Value::String(path.clone());
        written.push((path, serde_json::json!({ "name": name, "mediaType": media_type }).to_string()));
    }
    written
}

/// At open: files attached before v17 sat inside their messages as `data:` URLs. Each is written out to `assets/` as a `file`
/// asset owned by its chat, and its message keeps the path, one message per transaction (a file written for a message that
/// then fails to update is a stray the sweep takes). Returns how many files were moved.
pub(crate) fn move_inline_attachments(db: &Connection, root: &Path) -> Result<usize, StoreError> {
    let messages: Vec<(String, String, String)> = db
        .prepare("SELECT id, chat_id, data FROM chat_messages WHERE data LIKE '%\"url\":\"data:%'")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    std::fs::create_dir_all(root.join(ASSETS_DIR)).map_err(|e| StoreError::from(format!("{ASSETS_DIR}: {e}")))?;
    let mut moved = 0;
    for (id, chat_id, data) in messages {
        let Ok(mut message) = serde_json::from_str::<serde_json::Value>(&data) else { continue };
        let written = write_out_inline(root, &mut message);
        if written.is_empty() {
            continue;
        }
        let tx = db.unchecked_transaction()?;
        for (path, meta) in &written {
            tx.execute(
                "INSERT INTO assets (id, kind, path, chat_id, meta, created_at) VALUES (?1, 'file', ?2, ?3, ?4, ?5)",
                rusqlite::params![crate::commands::generate_id(), path, chat_id, meta, now_millis()],
            )?;
        }
        tx.execute("UPDATE chat_messages SET data = ?1 WHERE id = ?2", rusqlite::params![message.to_string(), id])?;
        tx.commit()?;
        moved += written.len();
    }
    Ok(moved)
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
    on_db(&state, move |db| page(db, Listing::Kind(&kind), before.as_ref(), limit)).await
}

/// The Knowledge library a page at a time: every file kept there, newest first.
#[tauri::command]
pub async fn assets_library(state: State<'_, StoreState>, before: Option<ItemCursor>, limit: u32) -> Result<Vec<AssetRow>, StoreError> {
    on_db(&state, move |db| page(db, Listing::Library, before.as_ref(), limit)).await
}

/// Deletes a file kept in the library (its file after commit); files a meeting or chat owns go with their parent.
#[tauri::command]
pub async fn assets_delete(state: State<'_, StoreState>, id: String) -> Result<(), StoreError> {
    on_db(&state, move |db| {
        if delete_kept(db, &id)? {
            drain_files(db);
        }
        Ok(())
    })
    .await
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
        std::fs::create_dir_all(root.join(ASSETS_DIR)).unwrap();
        root
    }

    /// A meeting and a chat holding every kind of child: deleting each parent leaves no row, no file and no live notice.
    #[test]
    fn deleting_parents_leaves_nothing_behind() {
        let db = open_migrated_test_db();
        let root = scratch("parents");
        for file in ["assets/m1.wav", "assets/c1.png", "assets/c1.thumb.jpg"] {
            std::fs::write(root.join(file), b"x").unwrap();
        }
        db.execute_batch(
            "INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m1', 'Standup', 0, 0);
             INSERT INTO transcripts (meeting_id, text, created_at) VALUES ('m1', 'hello', 0);
             INSERT INTO notes (id, meeting_id, text, created_at, updated_at) VALUES ('n1', 'm1', 'note', 0, 0);
             INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES ('t1', 'm1', 'ship', 'ai', 0);
             INSERT INTO reminders (todo_id, notification_id, fire_at, status, created_at) VALUES ('t1', 42, 9, 'scheduled', 0);
             INSERT INTO assets (id, kind, path, meeting_id, created_at) VALUES ('a1', 'recording', 'assets/m1.wav', 'm1', 0);
             INSERT INTO chats (id, title, meeting_id, created_at, last_message_at) VALUES ('c1', 'Chat', 'm1', 0, 0);
             INSERT INTO chat_messages (id, chat_id, seq, role, created_at) VALUES ('msg1', 'c1', 0, 'user', 0);
             INSERT INTO assets (id, kind, path, preview_path, chat_id, created_at)
                 VALUES ('a2', 'image', 'assets/c1.png', 'assets/c1.thumb.jpg', 'c1', 0);",
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
        for file in ["assets/m1.wav", "assets/c1.png", "assets/c1.thumb.jpg"] {
            assert!(!root.join(file).exists(), "{file} left on disk");
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    /// A chat save owns exactly the files its messages reference: new ones are claimed, dropped ones are queued.
    #[test]
    fn a_chat_save_claims_referenced_files_and_drops_the_rest() {
        let db = open_migrated_test_db();
        db.execute_batch("INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c1', 'Chat', 0, 0);").unwrap();
        let image = |path: &str| NewAsset { kind: "image".into(), path: path.into(), preview_path: None, duration_seconds: None, meta: None, kept: false };
        create(&db, "a1", &image("assets/kept.png"), 0).unwrap();
        create(&db, "a2", &image("assets/dropped.png"), 0).unwrap();
        create(&db, "a3", &image("assets/other.png"), 0).unwrap();

        sync_chat_assets(&db, "c1", &["assets/kept.png".into(), "assets/dropped.png".into()]).unwrap();
        sync_chat_assets(&db, "c1", &["assets/kept.png".into()]).unwrap();

        let owners: Vec<(String, Option<String>)> = db.prepare("SELECT path, chat_id FROM assets ORDER BY path").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(owners, vec![("assets/kept.png".into(), Some("c1".into())), ("assets/other.png".into(), None)]);
        let queued: String = db.query_row("SELECT ref FROM purge_queue", [], |r| r.get(0)).unwrap();
        assert_eq!(queued, "assets/dropped.png");
    }

    #[test]
    fn create_refuses_paths_outside_managed_folders() {
        let db = open_migrated_test_db();
        let asset = |path: &str| NewAsset { kind: "image".into(), path: path.into(), preview_path: None, duration_seconds: None, meta: None, kept: false };
        assert!(create(&db, "a", &asset("assets/x.png"), 0).is_ok());
        for bad in ["roci.db", "assets/../roci.db", "/etc/x", "cache/x.png", "assets/a/b.png", "images/x.png"] {
            assert!(create(&db, bad, &asset(bad), 0).is_err(), "{bad} accepted");
        }
    }

    #[test]
    fn resolve_refuses_paths_outside_app_data() {
        let root = Path::new("/data");
        assert_eq!(resolve(root, "assets/a.wav"), Some(root.join("assets/a.wav")));
        assert_eq!(resolve(root, "../a.wav"), None);
        assert_eq!(resolve(root, "/etc/passwd"), None);
        assert_eq!(resolve(root, "assets/../../a"), None);
        assert_eq!(resolve(root, "roci.db"), None);
    }

    /// A file kept in the library is never swept as unclaimed and no chat save takes it; an unkept one is swept.
    #[test]
    fn a_kept_file_belongs_to_the_library() {
        let db = open_migrated_test_db();
        let root = scratch("kept");
        db.execute_batch(
            "INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c1', 'Chat', 0, 0);
             INSERT INTO assets (id, kind, path, created_at, kept) VALUES ('k', 'file', 'assets/k.pdf', 0, 1);
             INSERT INTO assets (id, kind, path, created_at) VALUES ('u', 'file', 'assets/u.pdf', 0);",
        )
        .unwrap();
        sync_chat_assets(&db, "c1", &["assets/k.pdf".into()]).unwrap();
        sweep(&db, &root, UNCLAIMED_GRACE_MS + 1).unwrap();
        let left: Vec<(String, Option<String>)> = db.prepare("SELECT id, chat_id FROM assets").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(left, vec![("k".into(), None)], "the kept file stays the library's; the unclaimed one goes");
        std::fs::remove_dir_all(root).unwrap();
    }

    /// The library lists only kept files; deleting one takes its file, passages and index state, and leaves a chat's file be.
    #[test]
    fn a_library_file_is_listed_and_deleted_with_its_index() {
        let db = open_migrated_test_db();
        let root = scratch("library");
        std::fs::write(root.join("assets/k.pdf"), b"x").unwrap();
        db.execute_batch(
            "INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c1', 'Chat', 0, 0);
             INSERT INTO assets (id, kind, path, created_at, kept) VALUES ('k', 'file', 'assets/k.pdf', 0, 1);
             INSERT INTO assets (id, kind, path, chat_id, created_at) VALUES ('a', 'file', 'assets/a.pdf', 'c1', 0);
             INSERT INTO chunks (owner_kind, owner_id, chunk_index, chunk_text, chunk_type) VALUES ('file', 'k', 0, 'Q3 pricing', 'text');
             INSERT INTO index_state (owner_kind, owner_id, text_hash, version, state, attempted_at) VALUES ('file', 'k', 'h', 1, 'ready', 0);",
        )
        .unwrap();
        let listed: Vec<String> = page(&db, Listing::Library, None, 10).unwrap().into_iter().map(|row| row.id).collect();
        assert_eq!(listed, vec!["k".to_string()]);

        assert!(!delete_kept(&db, "a").unwrap(), "a chat's file goes only with its chat");
        assert!(delete_kept(&db, "k").unwrap());
        drain_files_in(&db, &root).unwrap();

        let left = |sql: &str| db.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap();
        assert_eq!(left("SELECT COUNT(*) FROM chunks"), 0);
        assert_eq!(left("SELECT COUNT(*) FROM index_state"), 0);
        assert_eq!(left("SELECT COUNT(*) FROM assets"), 1);
        assert!(!root.join("assets/k.pdf").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    /// The first open after v17 moves every file and track folder out of the by-kind folders into `assets/`.
    #[test]
    fn old_folders_move_into_assets() {
        let root = scratch("move");
        for dir in ["recordings/m1", "images"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in ["recordings/m1.wav", "recordings/m1/mic.raw", "images/c1.png"] {
            std::fs::write(root.join(file), b"x").unwrap();
        }
        move_into_assets(&root);
        for file in ["assets/m1.wav", "assets/m1/mic.raw", "assets/c1.png"] {
            assert!(root.join(file).exists(), "{file} not moved");
        }
        assert!(!root.join("recordings").exists() && !root.join("images").exists(), "old folders left");
        std::fs::remove_dir_all(root).unwrap();
    }

    /// A file a message carried inline becomes a `file` asset its chat owns, written out byte for byte; the message keeps
    /// its path and the rest of the message is untouched.
    #[test]
    fn inline_attachments_move_out_of_their_messages() {
        use base64::Engine;
        let db = open_migrated_test_db();
        let root = scratch("inline");
        let pdf = base64::engine::general_purpose::STANDARD.encode(b"%PDF-1.7");
        let data = format!(r#"{{"parts":[{{"type":"text","text":"read this"}},{{"type":"file","mediaType":"application/pdf","url":"data:application/pdf;base64,{pdf}","filename":"Plan.PDF"}}]}}"#);
        db.execute_batch("INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c1', 'Chat', 0, 0);").unwrap();
        db.execute("INSERT INTO chat_messages (id, chat_id, seq, role, data, created_at) VALUES ('q', 'c1', 0, 'user', ?1, 0)", [&data]).unwrap();

        assert_eq!(move_inline_attachments(&db, &root).unwrap(), 1);
        assert_eq!(move_inline_attachments(&db, &root).unwrap(), 0, "a second open has nothing left to move");

        let (path, chat): (String, String) = db.query_row("SELECT path, chat_id FROM assets WHERE kind = 'file'", [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert!(path.starts_with("assets/") && path.ends_with(".pdf") && chat == "c1", "{path} {chat}");
        assert_eq!(std::fs::read(root.join(&path)).unwrap(), b"%PDF-1.7");
        let message: serde_json::Value = serde_json::from_str(&db.query_row("SELECT data FROM chat_messages", [], |r| r.get::<_, String>(0)).unwrap()).unwrap();
        assert_eq!(message["parts"][1]["url"], path.as_str());
        assert_eq!(message["parts"][0]["text"], "read this");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recording_filename_round_trips() {
        assert_eq!(recording_filename(&recording_path("m1.wav")), "m1.wav");
    }

    #[test]
    fn drain_removes_files_and_keeps_failures_queued() {
        let db = open_migrated_test_db();
        let root = scratch("drain");
        let file = root.join("assets/gone.wav");
        std::fs::write(&file, b"x").unwrap();
        db.execute_batch(
            "INSERT INTO purge_queue (kind, ref) VALUES ('file', 'assets/gone.wav'), ('file', 'assets/missing.wav');",
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
        let file = root.join("assets/m1.wav");
        std::fs::write(&file, b"x").unwrap();
        db.execute_batch(
            "INSERT INTO assets (id, kind, path, created_at) VALUES ('a1', 'recording', 'assets/m1.wav', 0);
             INSERT INTO purge_queue (kind, ref) VALUES ('file', 'assets/m1.wav');",
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
            "INSERT INTO assets (id, kind, path, created_at) VALUES ('old', 'recording', 'assets/old.wav', 0),
                                                                    ('new', 'recording', 'assets/new.wav', {now});"
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
        let old = root.join("assets/from-before.wav");
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
        let stray = root.join("assets/stray.wav");
        std::fs::write(&stray, b"x").unwrap();
        for folder in ["assets/gone", "assets/live"] {
            std::fs::create_dir_all(root.join(folder)).unwrap();
            std::fs::write(root.join(folder).join("system.wav"), b"x").unwrap();
            age(&root.join(folder), 2);
        }
        age(&stray, 2);

        sweep(&db, &root, now_ms()).unwrap();

        assert!(!stray.exists(), "an untracked file this database made is swept");
        assert!(!root.join("assets/gone").exists(), "a deleted meeting's track folder is swept");
        assert!(root.join("assets/live").is_dir(), "a meeting's own track folder stays");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sweep_keeps_fresh_untracked_files_and_folders() {
        let db = open_migrated_test_db();
        let root = scratch("fresh");
        let fresh = root.join("assets/importing.wav");
        std::fs::write(&fresh, b"x").unwrap();
        std::fs::create_dir_all(root.join("assets/rec_1_tracks")).unwrap();
        sweep(&db, &root, 0).unwrap();
        assert!(fresh.exists());
        assert!(root.join("assets/rec_1_tracks").is_dir());
        std::fs::remove_dir_all(root).unwrap();
    }
}
