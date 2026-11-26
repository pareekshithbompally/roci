//! Knowledge sources (meetings, chats, files kept in the library): each one's index state, so a source is indexed again
//! only when its text or the indexer changes and a failed one is retried; and the sources about the same thing as one, by
//! meaning (the mean of its pieces' vectors against everyone else's pieces), worked out when asked, never stored.

use crate::commands::{on_db, ItemKind, StoreState};
use crate::error::StoreError;
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

/// Where indexing a source stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub enum SourceState {
    Pending,
    Ready,
    Failed,
}

impl SourceState {
    const fn as_str(self) -> &'static str {
        match self {
            SourceState::Pending => "pending",
            SourceState::Ready => "ready",
            SourceState::Failed => "failed",
        }
    }
}

/// What a source was last indexed from: its text's hash, by which indexer version, and whether it went well.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexState {
    pub text_hash: String,
    pub version: i64,
    pub ready: bool,
}

/// One source's state as the webview shows it (Indexing… / Ready / Couldn't read).
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct SourceStatus {
    pub owner_id: String,
    pub state: SourceState,
    pub error: Option<String>,
}

/// A source about the same thing as another, best first.
#[derive(Debug, Serialize, PartialEq)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct RelatedSource {
    /// `meeting`, `chat` or `file`.
    pub kind: String,
    pub id: String,
    pub title: String,
    /// Cosine similarity of its closest piece to the source, 0–1.
    pub score: f64,
    #[cfg_attr(test, ts(type = "number"))]
    pub at: i64,
}

/// The kinds a related source can be, searched one partition at a time.
const KINDS: [ItemKind; 3] = [ItemKind::Meeting, ItemKind::Chat, ItemKind::File];
/// Pieces each kind's nearest-vector search returns before they're grouped by owner.
const NEIGHBOURS: i64 = 64;

pub(crate) fn state_impl(db: &Connection, owner: ItemKind, id: &str) -> Result<Option<IndexState>, StoreError> {
    Ok(db
        .query_row(
            "SELECT text_hash, version, state FROM index_state WHERE owner_kind = ?1 AND owner_id = ?2",
            [owner.index_kind(), id],
            |row| Ok(IndexState { text_hash: row.get(0)?, version: row.get(1)?, ready: row.get::<_, String>(2)? == "ready" }),
        )
        .optional()?)
}

/// Records how indexing a source went; nothing for a source deleted meanwhile (its delete took its state).
pub(crate) fn set_state_impl(
    db: &Connection,
    owner: ItemKind,
    id: &str,
    text_hash: &str,
    version: i64,
    state: SourceState,
    error: Option<&str>,
    now_ms: i64,
) -> Result<(), StoreError> {
    if !owner.exists(db, id)? {
        return Ok(());
    }
    db.execute(
        "INSERT INTO index_state (owner_kind, owner_id, text_hash, version, state, error, attempted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (owner_kind, owner_id) DO UPDATE SET
             text_hash = excluded.text_hash, version = excluded.version, state = excluded.state,
             error = excluded.error, attempted_at = excluded.attempted_at",
        rusqlite::params![owner.index_kind(), id, text_hash, version, state.as_str(), error, now_ms],
    )?;
    Ok(())
}

/// Sources to index at launch: files (in the library or attached) not ready at `version` (new, failed, or read by an older
/// indexer), and meetings and chats whose last indexing failed (the rest are indexed as they're saved).
pub(crate) fn needing_index_impl(db: &Connection, version: i64) -> Result<Vec<(ItemKind, String)>, StoreError> {
    let files = db
        .prepare(
            "SELECT a.id FROM assets a
             LEFT JOIN index_state s ON s.owner_kind = 'file' AND s.owner_id = a.id
             WHERE a.kind = 'file' AND (s.state IS NULL OR s.state != 'ready' OR s.version != ?1)
             ORDER BY a.created_at DESC",
        )?
        .query_map([version], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let failed = db
        .prepare("SELECT owner_kind, owner_id FROM index_state WHERE state = 'failed' AND owner_kind IN ('meeting', 'chat')")?
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    let owner = |kind: &str| KINDS.into_iter().find(|k| k.index_kind() == kind);
    Ok(files
        .into_iter()
        .map(|id| (ItemKind::File, id))
        .chain(failed.into_iter().filter_map(|(kind, id)| owner(&kind).map(|k| (k, id))))
        .collect())
}

/// Every source of `kind` with a state, for the webview's list.
fn statuses_impl(db: &Connection, kind: ItemKind) -> Result<Vec<SourceStatus>, StoreError> {
    let state = |s: String| match s.as_str() {
        "ready" => SourceState::Ready,
        "failed" => SourceState::Failed,
        _ => SourceState::Pending,
    };
    Ok(db
        .prepare("SELECT owner_id, state, error FROM index_state WHERE owner_kind = ?1")?
        .query_map([kind.index_kind()], |row| Ok(SourceStatus { owner_id: row.get(0)?, state: state(row.get(1)?), error: row.get(2)? }))?
        .collect::<Result<_, _>>()?)
}

/// The mean of the source's piece vectors, made unit length; none when it has no vectors yet.
fn source_vector(db: &Connection, owner: ItemKind, id: &str) -> Result<Option<Vec<f32>>, StoreError> {
    let blobs: Vec<Vec<u8>> = db
        .prepare("SELECT v.embedding FROM chunks c JOIN vec_chunks v ON v.chunk_id = c.id WHERE c.owner_kind = ?1 AND c.owner_id = ?2")?
        .query_map([owner.index_kind(), id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let vectors: Vec<Vec<f32>> = blobs
        .iter()
        .map(|blob| blob.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect())
        .collect();
    let Some(first) = vectors.first() else { return Ok(None) };
    let mut mean = vec![0.0f32; first.len()];
    for vector in &vectors {
        mean.iter_mut().zip(vector).for_each(|(m, v)| *m += v);
    }
    let norm = mean.iter().map(|m| m * m).sum::<f32>().sqrt();
    Ok((norm > 0.0).then(|| mean.into_iter().map(|m| m / norm).collect()))
}

/// Each owner of `kind` nearest to `vector` with its best cosine similarity (vectors are unit length, so cos = 1 − d²/2).
fn nearest_owners(db: &Connection, kind: ItemKind, vector: &[f32]) -> Result<HashMap<String, f64>, StoreError> {
    let rows: Vec<(String, f64)> = db
        .prepare(
            "SELECT c.owner_id, v.distance FROM vec_chunks v JOIN chunks c ON c.id = v.chunk_id
             WHERE v.embedding MATCH ?1 AND v.k = ?2 AND v.owner_kind = ?3",
        )?
        .query_map(rusqlite::params![crate::search::vector_bytes(vector), NEIGHBOURS, kind.index_kind()], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<Result<_, _>>()?;
    let mut best: HashMap<String, f64> = HashMap::new();
    for (owner_id, distance) in rows {
        let score = 1.0 - distance * distance / 2.0;
        let kept = best.entry(owner_id).or_insert(score);
        *kept = kept.max(score);
    }
    Ok(best)
}

/// A related source's title and time, by kind; none when it is gone.
fn titled(db: &Connection, kind: ItemKind, id: &str) -> Result<Option<(String, i64)>, StoreError> {
    let sql = match kind {
        ItemKind::Meeting => "SELECT title, created_at FROM meetings WHERE id = ?1",
        ItemKind::Chat => "SELECT title, last_message_at FROM chats WHERE id = ?1",
        ItemKind::File => "SELECT COALESCE(json_extract(meta, '$.name'), path), created_at FROM assets WHERE id = ?1 AND kept = 1",
    };
    Ok(db.query_row(sql, [id], |row| Ok((row.get(0)?, row.get(1)?))).optional()?)
}

/// The sources about the same thing as this one (itself left out), at least `min_score` alike, best first, at most `limit`.
pub(crate) fn related_impl(db: &Connection, owner: ItemKind, id: &str, min_score: f64, limit: usize) -> Result<Vec<RelatedSource>, StoreError> {
    let Some(vector) = source_vector(db, owner, id)? else { return Ok(Vec::new()) };
    let mut found = Vec::new();
    for kind in KINDS {
        for (other, score) in nearest_owners(db, kind, &vector)? {
            if (kind == owner && other == id) || score < min_score {
                continue;
            }
            if let Some((title, at)) = titled(db, kind, &other)? {
                found.push(RelatedSource { kind: kind.index_kind().into(), id: other, title, score, at });
            }
        }
    }
    found.sort_by(|a, b| b.score.total_cmp(&a.score));
    found.truncate(limit);
    Ok(found)
}

/// Every source of `kind` with an index state (Indexing… / Ready / Couldn't read).
#[tauri::command]
pub async fn index_states(state: State<'_, StoreState>, kind: ItemKind) -> Result<Vec<SourceStatus>, StoreError> {
    on_db(&state, move |db| statuses_impl(db, kind)).await
}

/// The sources about the same thing as this one, best first.
#[tauri::command]
pub async fn related_sources(
    state: State<'_, StoreState>,
    kind: ItemKind,
    id: String,
    min_score: f64,
    limit: usize,
) -> Result<Vec<RelatedSource>, StoreError> {
    on_db(&state, move |db| related_impl(db, kind, &id, min_score, limit)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{save_chunks, tests::db, ChunkData};
    use crate::schema::DEFAULT_DIM;

    /// A unit vector leaning on axis `a`, with a little of axis `b` (`lean` of it), so similarity is easy to reason about.
    fn vector(a: usize, b: usize, lean: f32) -> Vec<f32> {
        let mut v = vec![0.0; DEFAULT_DIM as usize];
        v[a] = 1.0;
        v[b] += lean;
        let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        v.into_iter().map(|x| x / norm).collect()
    }

    fn piece(text: &str, embedding: Vec<f32>) -> ChunkData {
        ChunkData { chunk_index: 0, chunk_text: text.into(), chunk_type: "page".into(), embedding: Some(embedding), start_pos: None, end_pos: None, page: Some(1) }
    }

    fn seed(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m1', 'Acme renewal prep', 5, 5);
             INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c1', 'Lunch plans', 6, 6);
             INSERT INTO assets (id, kind, path, meta, created_at, kept)
                 VALUES ('f1', 'file', 'assets/f1.pdf', '{\"name\":\"Q3 pricing.pdf\"}', 7, 1);",
        )
        .unwrap();
        let tx = conn.unchecked_transaction().unwrap();
        save_chunks(&tx, ItemKind::File, "f1", &[piece("Pricing tiers for Q3", vector(0, 1, 0.1))]).unwrap();
        save_chunks(&tx, ItemKind::Meeting, "m1", &[piece("Acme wants SSO in Team pricing", vector(0, 2, 0.3))]).unwrap();
        save_chunks(&tx, ItemKind::Chat, "c1", &[piece("Where shall we eat", vector(5, 6, 0.1))]).unwrap();
        tx.commit().unwrap();
    }

    #[test]
    fn a_document_finds_what_is_about_the_same_thing_and_not_itself_or_what_is_not() {
        let conn = db();
        seed(&conn);
        let related = related_impl(&conn, ItemKind::File, "f1", 0.5, 5).unwrap();
        assert_eq!(related.iter().map(|r| (r.kind.as_str(), r.title.as_str())).collect::<Vec<_>>(), vec![("meeting", "Acme renewal prep")]);
        assert!(related[0].score > 0.9);
    }

    #[test]
    fn a_source_is_indexed_again_only_when_new_failed_or_read_by_an_older_indexer() {
        let conn = db();
        seed(&conn);
        assert_eq!(needing_index_impl(&conn, 1).unwrap(), vec![(ItemKind::File, "f1".to_string())], "no state yet");
        set_state_impl(&conn, ItemKind::File, "f1", "h", 1, SourceState::Ready, None, 0).unwrap();
        assert!(needing_index_impl(&conn, 1).unwrap().is_empty(), "ready at this version");
        assert_eq!(needing_index_impl(&conn, 2).unwrap().len(), 1, "a newer indexer reads it again");
        set_state_impl(&conn, ItemKind::Chat, "c1", "h", 1, SourceState::Failed, Some("busy"), 0).unwrap();
        assert!(needing_index_impl(&conn, 1).unwrap().contains(&(ItemKind::Chat, "c1".to_string())), "a failed chat is retried");
        set_state_impl(&conn, ItemKind::Chat, "gone", "h", 1, SourceState::Ready, None, 0).unwrap();
        assert!(state_impl(&conn, ItemKind::Chat, "gone").unwrap().is_none(), "a source deleted meanwhile gets no state");
    }
}
