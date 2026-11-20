//! Settings › Storage figures: counts from the database, sizes measured from disk each time, never stored.

use crate::commands::{on_db, StoreState};
use crate::error::StoreError;
use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager, Runtime, State};

const DATABASE_FILES: &[&str] = &["roci.db", "roci.db-wal", "roci.db-shm"];
const CACHE_DIR: &str = "cache";
const MODELS_DIR: &str = "models";

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct KindUsage {
    pub kind: String,
    pub count: u32,
    #[cfg_attr(test, ts(type = "number"))]
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct StorageUsage {
    pub meetings: u32,
    pub chats: u32,
    pub dictations: u32,
    /// One entry per asset kind that has any.
    pub assets: Vec<KindUsage>,
    #[cfg_attr(test, ts(type = "number"))]
    pub database_bytes: u64,
    #[cfg_attr(test, ts(type = "number"))]
    pub cache_bytes: u64,
    #[cfg_attr(test, ts(type = "number"))]
    pub models_bytes: u64,
}

fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map_or(0, |m| m.len())
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|entry| match entry.file_type() {
            Ok(kind) if kind.is_dir() => dir_size(&entry.path()),
            Ok(kind) if kind.is_file() => file_size(&entry.path()),
            _ => 0,
        })
        .sum()
}

fn count(db: &Connection, table: &str) -> Result<u32, StoreError> {
    Ok(db.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))?)
}

/// What the database knows, read under the lock: counts and every asset's files.
struct Rows {
    meetings: u32,
    chats: u32,
    dictations: u32,
    assets: Vec<(String, String, Option<String>)>,
}

fn rows(db: &Connection) -> Result<Rows, StoreError> {
    let assets = db
        .prepare("SELECT kind, path, preview_path FROM assets ORDER BY kind")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    Ok(Rows { meetings: count(db, "meetings")?, chats: count(db, "chats")?, dictations: count(db, "dictations")?, assets })
}

/// Each asset kind's count and bytes (file plus preview), in kind order; measured from disk, outside the lock.
fn asset_usage(assets: Vec<(String, String, Option<String>)>, root: &Path) -> Vec<KindUsage> {
    let mut usage: Vec<KindUsage> = Vec::new();
    for (kind, path, preview) in assets {
        let bytes = file_size(&root.join(&path)) + preview.map_or(0, |p| file_size(&root.join(p)));
        match usage.last_mut().filter(|last| last.kind == kind) {
            Some(last) => {
                last.count += 1;
                last.bytes += bytes;
            }
            None => usage.push(KindUsage { kind, count: 1, bytes }),
        }
    }
    usage
}

fn measure(rows: Rows, root: &Path) -> StorageUsage {
    StorageUsage {
        meetings: rows.meetings,
        chats: rows.chats,
        dictations: rows.dictations,
        assets: asset_usage(rows.assets, root),
        database_bytes: DATABASE_FILES.iter().map(|name| file_size(&root.join(name))).sum(),
        cache_bytes: dir_size(&root.join(CACHE_DIR)),
        models_bytes: dir_size(&root.join(MODELS_DIR)),
    }
}

#[tauri::command]
pub async fn storage_usage<R: Runtime>(app: AppHandle<R>, state: State<'_, StoreState>) -> Result<StorageUsage, StoreError> {
    let root = app.path().app_data_dir().map_err(|e| StoreError::from(format!("Failed to get app data dir: {}", e)))?;
    let rows = on_db(&state, rows).await?;
    tauri::async_runtime::spawn_blocking(move || measure(rows, &root))
        .await
        .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::open_migrated_test_db;

    #[test]
    fn sizes_come_from_disk_per_kind() {
        let db = open_migrated_test_db();
        let root = std::env::temp_dir().join(format!("roci-usage-{}", std::process::id()));
        for dir in ["recordings", "images", "cache/api", "models/m1"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        std::fs::write(root.join("recordings/a.wav"), [0u8; 10]).unwrap();
        std::fs::write(root.join("images/b.png"), [0u8; 4]).unwrap();
        std::fs::write(root.join("images/b.thumb.jpg"), [0u8; 1]).unwrap();
        std::fs::write(root.join("cache/api/x.json"), [0u8; 3]).unwrap();
        std::fs::write(root.join("models/m1/w.bin"), [0u8; 7]).unwrap();
        db.execute_batch(
            "INSERT INTO assets (id, kind, path, created_at) VALUES ('a', 'recording', 'recordings/a.wav', 0),
                                                                  ('gone', 'recording', 'recordings/gone.wav', 0);
             INSERT INTO assets (id, kind, path, preview_path, created_at) VALUES ('b', 'image', 'images/b.png', 'images/b.thumb.jpg', 0);",
        )
        .unwrap();

        let usage = measure(rows(&db).unwrap(), &root);
        let kinds: Vec<(String, u32, u64)> = usage.assets.into_iter().map(|k| (k.kind, k.count, k.bytes)).collect();
        assert_eq!(kinds, vec![("image".into(), 1, 5), ("recording".into(), 2, 10)]);
        assert_eq!((usage.cache_bytes, usage.models_bytes), (3, 7));
        std::fs::remove_dir_all(root).unwrap();
    }
}
