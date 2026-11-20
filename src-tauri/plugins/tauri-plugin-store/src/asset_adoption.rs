//! One-time: images made before assets become rows of the chat that shows them; an image no chat shows is swept.

use crate::assets::IMAGES_DIR;
use crate::commands::generate_id;
use crate::error::StoreError;
use rusqlite::{Connection, OptionalExtension};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const DONE_KEY: &str = "images_adopted";
const SIDECAR: &str = ".json";
const THUMB: &str = ".thumb.jpg";

fn is_done(db: &Connection) -> Result<bool, StoreError> {
    Ok(db.query_row("SELECT 1 FROM meta WHERE key = ?1", [DONE_KEY], |_| Ok(())).optional()?.is_some())
}

/// The chat whose messages first show `path`.
fn owning_chat(db: &Connection, path: &str) -> Result<Option<String>, StoreError> {
    Ok(db
        .query_row(
            "SELECT chat_id FROM chat_messages WHERE instr(data, ?1) > 0 ORDER BY created_at LIMIT 1",
            [path],
            |row| row.get(0),
        )
        .optional()?)
}

fn modified_ms(file: &Path) -> i64 {
    std::fs::metadata(file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as i64)
}

/// The sidecar's prompt, model and aspect ratio as the row's meta, and its creation time.
fn sidecar_details(sidecar: &Path) -> (Option<String>, Option<i64>) {
    let Some(details) = std::fs::read_to_string(sidecar).ok().and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok()) else {
        return (None, None);
    };
    let meta = serde_json::json!({
        "prompt": details.get("prompt"),
        "model": details.get("model"),
        "aspectRatio": details.get("aspectRatio"),
    });
    (Some(meta.to_string()), details.get("createdAt").and_then(serde_json::Value::as_i64))
}

/// Adopts one image file; returns its sidecar when adopted, to remove after commit.
fn adopt_one(db: &Connection, dir: &Path, name: &str) -> Result<Option<PathBuf>, StoreError> {
    let path = format!("{IMAGES_DIR}/{name}");
    let Some(chat_id) = owning_chat(db, &path)? else { return Ok(None) };
    let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
    let sidecar = dir.join(format!("{stem}{SIDECAR}"));
    let (meta, created_at) = sidecar_details(&sidecar);
    let preview = dir.join(format!("{stem}{THUMB}")).is_file().then(|| format!("{IMAGES_DIR}/{stem}{THUMB}"));
    db.execute(
        "INSERT OR IGNORE INTO assets (id, kind, path, preview_path, chat_id, meta, created_at)
         VALUES (?1, 'image', ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![generate_id(), path, preview, chat_id, meta, created_at.unwrap_or_else(|| modified_ms(&dir.join(name)))],
    )?;
    Ok(Some(sidecar))
}

pub(crate) fn adopt_images(db: &Connection, root: &Path) -> Result<(), StoreError> {
    if is_done(db)? {
        return Ok(());
    }
    let dir = root.join(IMAGES_DIR);
    let names: Vec<String> = std::fs::read_dir(&dir)
        .map(|entries| entries.flatten().filter_map(|e| e.file_name().to_str().map(str::to_owned)).collect())
        .unwrap_or_default();
    let tx = db.unchecked_transaction()?;
    let mut sidecars = Vec::new();
    for name in names.iter().filter(|n| !n.ends_with(SIDECAR) && !n.ends_with(THUMB)) {
        sidecars.extend(adopt_one(&tx, &dir, name)?);
    }
    tx.execute("INSERT INTO meta (key, value) VALUES (?1, '1')", [DONE_KEY])?;
    tx.commit()?;
    for sidecar in &sidecars {
        if let Err(error) = std::fs::remove_file(sidecar) {
            if error.kind() != std::io::ErrorKind::NotFound {
                log::warn!("[store] Sidecar {:?} not removed: {}", sidecar, error);
            }
        }
    }
    log::info!("[store] Adopted {} images into the asset store", sidecars.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::open_migrated_test_db;

    #[test]
    fn images_a_chat_shows_are_adopted_once_and_loners_are_left_for_the_sweep() {
        let db = open_migrated_test_db();
        let root = std::env::temp_dir().join(format!("roci-adopt-{}", std::process::id()));
        let dir = root.join(IMAGES_DIR);
        std::fs::create_dir_all(&dir).unwrap();
        for file in ["shown.png", "shown.thumb.jpg", "loner.png"] {
            std::fs::write(dir.join(file), b"x").unwrap();
        }
        std::fs::write(dir.join("shown.json"), r#"{"prompt":"a ship","model":"m","aspectRatio":"1:1","createdAt":7}"#).unwrap();
        db.execute_batch(
            r#"INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c1', 'Chat', 0, 0);
               INSERT INTO chat_messages (id, chat_id, seq, role, data, created_at)
                   VALUES ('m1', 'c1', 0, 'model', '{"parts":[{"source":{"kind":"file","path":"images/shown.png"}}]}', 0);"#,
        )
        .unwrap();

        adopt_images(&db, &root).unwrap();
        adopt_images(&db, &root).unwrap();

        let rows: Vec<(String, Option<String>, Option<String>, i64)> = db
            .prepare("SELECT path, preview_path, chat_id, created_at FROM assets").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))).unwrap()
            .collect::<Result<_, _>>().unwrap();
        assert_eq!(rows, vec![("images/shown.png".into(), Some("images/shown.thumb.jpg".into()), Some("c1".into()), 7)]);
        assert!(!dir.join("shown.json").exists(), "the sidecar is folded into the row");
        assert!(dir.join("loner.png").exists(), "a loner is left for the sweep, not removed here");
        std::fs::remove_dir_all(root).unwrap();
    }
}
