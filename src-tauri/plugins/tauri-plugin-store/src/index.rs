//! Search indexing for Rust callers (the app's search indexer): the text a meeting or chat is indexed from, its saved pieces
//! and which have vectors, the items still without vectors, clearing everything for a rebuild, and search itself.
//! The webview never handles pieces or vectors.

use crate::commands::{
    append_chunks_impl, chats_get_impl, embedded_chunk_texts_impl, meetings_get_impl, save_chunks, ChatSearchHit, StoreState,
};
use crate::error::StoreError;
use crate::search::{hybrid_search, ChunkHit, SearchHit, SearchQuery};
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

pub use crate::commands::{ChunkData, ItemKind};

/// A meeting's searchable text.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct MeetingText {
    pub title: String,
    /// The summary's words: its overview and every line it lists.
    pub summary: String,
    pub transcript: String,
    /// Notes, then to-dos, one entry each.
    pub notes: Vec<String>,
    /// Still recording or waiting for its transcript: indexed once the transcript is in.
    pub waiting: bool,
}

/// One chat message as indexing reads it.
#[derive(Debug, Clone, PartialEq)]
pub struct ChatLine {
    pub from_user: bool,
    pub text: String,
}

/// Statuses whose transcript isn't in yet.
const WAITING: [&str; 3] = ["recording", "captured", "transcribing"];

/// Blocking, off the main thread; `Ok(None)` before the database is open.
fn with_db<R: Runtime, T>(app: &AppHandle<R>, run: impl FnOnce(&Connection) -> Result<T, StoreError>) -> Result<Option<T>, StoreError> {
    let state = app.state::<StoreState>();
    let guard = state.conn.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
    guard.as_ref().map(run).transpose()
}

/// Every string a summary's data holds, in order (its lists, and the text of each item in them).
fn summary_words(data: &str, out: &mut Vec<String>) {
    fn walk(value: &Value, out: &mut Vec<String>) {
        match value {
            Value::String(s) if !s.trim().is_empty() => out.push(s.trim().to_string()),
            Value::Array(items) => items.iter().for_each(|v| walk(v, out)),
            Value::Object(fields) => fields.values().for_each(|v| walk(v, out)),
            _ => {}
        }
    }
    if let Ok(value) = serde_json::from_str::<Value>(data) {
        walk(&value, out);
    }
}

/// A summary as searched: its overview, then every line its data lists (one per line).
fn summary_text(overview: &str, data: &str) -> String {
    let mut words = vec![overview.trim().to_string()];
    summary_words(data, &mut words);
    words.retain(|w| !w.is_empty());
    words.dedup();
    words.join("\n")
}

/// The meeting's searchable text; `None` when it doesn't exist.
pub fn meeting_text<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Option<MeetingText>, StoreError> {
    Ok(with_db(app, |db| {
        let exists = db.query_row("SELECT 1 FROM meetings WHERE id = ?1", [id], |_| Ok(())).optional()?.is_some();
        if !exists {
            return Ok(None);
        }
        let detail = meetings_get_impl(db, id)?;
        let summary = detail.summary.map(|s| summary_text(&s.overview, &s.data));
        Ok(Some(MeetingText {
            title: detail.title,
            summary: summary.unwrap_or_default(),
            transcript: detail.transcript.map(|t| t.text).unwrap_or_default(),
            notes: detail.notes.into_iter().map(|n| n.text).chain(detail.todos.into_iter().map(|t| t.text)).collect(),
            waiting: WAITING.contains(&detail.status.status.as_str()),
        }))
    })?
    .flatten())
}

/// The chat's messages in order; `None` when it doesn't exist.
pub fn chat_lines<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Option<Vec<ChatLine>>, StoreError> {
    Ok(with_db(app, |db| {
        let exists = db.query_row("SELECT 1 FROM chats WHERE id = ?1", [id], |_| Ok(())).optional()?.is_some();
        if !exists {
            return Ok(None);
        }
        let chat = chats_get_impl(db, id)?;
        Ok(Some(chat.messages.into_iter().map(|m| ChatLine { from_user: m.role == "user", text: m.text }).collect()))
    })?
    .flatten())
}

/// The texts of the owner's pieces that already have a vector.
pub fn embedded_texts<R: Runtime>(app: &AppHandle<R>, owner: ItemKind, id: &str) -> Result<Vec<String>, StoreError> {
    Ok(with_db(app, |db| embedded_chunk_texts_impl(db, owner, id))?.unwrap_or_default())
}

/// Saves the owner's pieces in one transaction, keeping unchanged ones (and their vectors) as they are.
pub fn save_pieces<R: Runtime>(app: &AppHandle<R>, owner: ItemKind, id: &str, pieces: &[ChunkData]) -> Result<(), StoreError> {
    with_db(app, |db| {
        let tx = db.unchecked_transaction()?;
        save_chunks(&tx, owner, id, pieces)?;
        tx.commit()?;
        Ok(())
    })?;
    Ok(())
}

/// Adds pieces after the meeting's last one (a meeting indexed stretch by stretch while it records).
pub fn append_pieces<R: Runtime>(app: &AppHandle<R>, meeting_id: &str, pieces: &[ChunkData]) -> Result<(), StoreError> {
    with_db(app, |db| append_chunks_impl(db, meeting_id, pieces))?;
    Ok(())
}

/// Meetings and chats with a piece that has no vector yet, on an open database.
fn without_vectors_impl(db: &Connection) -> Result<Vec<(ItemKind, String)>, StoreError> {
    let rows = db
        .prepare("SELECT DISTINCT c.owner_kind, c.owner_id FROM chunks c WHERE NOT EXISTS (SELECT 1 FROM vec_chunks v WHERE v.chunk_id = c.id)")?
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    let owner = |kind: &str| [ItemKind::Meeting, ItemKind::Chat].into_iter().find(|k| k.index_kind() == kind);
    Ok(rows.into_iter().filter_map(|(kind, id)| owner(&kind).map(|k| (k, id))).collect())
}

/// Meetings and chats with a piece that has no vector yet.
pub fn without_vectors<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<(ItemKind, String)>, StoreError> {
    Ok(with_db(app, without_vectors_impl)?.unwrap_or_default())
}

/// Every meeting or chat (with messages) id, newest first: what a rebuild indexes.
pub fn all_ids<R: Runtime>(app: &AppHandle<R>, owner: ItemKind) -> Result<Vec<String>, StoreError> {
    let sql = match owner {
        ItemKind::Meeting => "SELECT id FROM meetings ORDER BY created_at DESC",
        ItemKind::Chat => "SELECT c.id FROM chats c WHERE EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = c.id) ORDER BY last_message_at DESC",
    };
    Ok(with_db(app, |db| Ok(db.prepare(sql)?.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?))?.unwrap_or_default())
}

/// Clears one owner's pieces and vectors (a rebuild then indexes everything again).
pub fn clear<R: Runtime>(app: &AppHandle<R>, owner: ItemKind) -> Result<(), StoreError> {
    // Their keyword entries and vectors follow by trigger.
    with_db(app, |db| Ok(db.execute("DELETE FROM chunks WHERE owner_kind = ?1", [owner.index_kind()]).map(|_| ())?))?;
    Ok(())
}

/// Meeting pieces matching `query` (by meaning when `embedding` is given, by words always), best first: the best piece of
/// each meeting, or every matching piece within `meeting_ids` when given. One lock: the ranking and the titles agree.
pub fn search_meetings<R: Runtime>(
    app: &AppHandle<R>,
    query: &str,
    embedding: Option<Vec<f32>>,
    limit: usize,
    meeting_ids: Option<Vec<String>>,
) -> Result<Vec<SearchHit>, StoreError> {
    let q = SearchQuery { kind: ItemKind::Meeting.index_kind(), text: query, embedding: embedding.as_deref(), limit, within: meeting_ids.as_deref() };
    Ok(with_db(app, |db| {
        let hits = hybrid_search(db, &q).map_err(StoreError::from)?;
        titled(db, hits, "SELECT title, created_at FROM meetings WHERE id = ?1", |hit, (title, at)| SearchHit {
            meeting_id: hit.owner_id,
            meeting_title: title,
            chunk_text: hit.chunk_text,
            chunk_type: hit.chunk_type,
            score: hit.score,
            created_at: at,
        })
    })?
    .unwrap_or_default())
}

/// Chat pieces matching `query`, the best piece of each chat, best first.
pub fn search_chats<R: Runtime>(app: &AppHandle<R>, query: &str, embedding: Option<Vec<f32>>, limit: usize) -> Result<Vec<ChatSearchHit>, StoreError> {
    let q = SearchQuery { kind: ItemKind::Chat.index_kind(), text: query, embedding: embedding.as_deref(), limit, within: None };
    Ok(with_db(app, |db| {
        let hits = hybrid_search(db, &q).map_err(StoreError::from)?;
        titled(db, hits, "SELECT title, last_message_at FROM chats WHERE id = ?1", |hit, (title, at)| ChatSearchHit {
            chat_id: hit.owner_id,
            chat_title: title,
            chunk_text: hit.chunk_text,
            chunk_type: hit.chunk_type,
            score: hit.score,
            last_message_at: at,
        })
    })?
    .unwrap_or_default())
}

/// Each hit with its owner's title and time (`sql` reads them by id), in order; an owner gone meanwhile is left out.
fn titled<T>(db: &Connection, hits: Vec<ChunkHit>, sql: &str, hit: impl Fn(ChunkHit, (String, i64)) -> T) -> Result<Vec<T>, StoreError> {
    let mut stmt = db.prepare(sql)?;
    let mut out = Vec::with_capacity(hits.len());
    for h in hits {
        let owner: Option<(String, i64)> = stmt.query_row([&h.owner_id], |row| Ok((row.get(0)?, row.get(1)?))).optional()?;
        if let Some(owner) = owner {
            out.push(hit(h, owner));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tests::{db, seed_meeting};

    #[test]
    fn a_summary_is_searched_as_its_overview_then_every_line_it_lists() {
        let data = r#"{"keyDiscussionPoints":["Budget"],"actionItems":[{"text":"Send the brief","owner":"Ana"}],"nextSteps":[]}"#;
        let text = summary_text("We met.", data);
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines[0], "We met.");
        for line in ["Budget", "Send the brief", "Ana"] {
            assert!(lines.contains(&line), "{line} is searchable");
        }
        assert_eq!(summary_text("Only this.", "not json"), "Only this.");
    }

    #[test]
    fn items_with_pieces_still_without_vectors_are_found() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_meeting(&conn, "m2");
        let piece = |text: &str, embedded: bool| ChunkData {
            chunk_index: 0, chunk_text: text.into(), chunk_type: "transcript".into(),
            embedding: embedded.then(|| vec![0.5; crate::schema::DEFAULT_DIM as usize]), start_pos: None, end_pos: None,
        };
        let tx = conn.unchecked_transaction().unwrap();
        save_chunks(&tx, ItemKind::Meeting, "m1", &[piece("has one", true)]).unwrap();
        save_chunks(&tx, ItemKind::Meeting, "m2", &[piece("has none", false)]).unwrap();
        tx.commit().unwrap();
        assert_eq!(without_vectors_impl(&conn).unwrap(), vec![(ItemKind::Meeting, "m2".to_string())]);
    }

    #[test]
    fn a_search_within_meetings_finds_their_words_only() {
        let conn = db();
        let others: Vec<String> = (0..8).map(|n| format!("other{n}")).collect();
        for id in ["m1", "m2", "m3"].into_iter().chain(others.iter().map(String::as_str)) {
            seed_meeting(&conn, id);
        }
        let piece = |text: &str| ChunkData {
            chunk_index: 0, chunk_text: text.into(), chunk_type: "transcript".into(), embedding: None, start_pos: None, end_pos: None,
        };
        let tx = conn.unchecked_transaction().unwrap();
        save_chunks(&tx, ItemKind::Meeting, "m1", &[piece("the quarterly budget review")]).unwrap();
        save_chunks(&tx, ItemKind::Meeting, "m2", &[piece("budget for the offsite")]).unwrap();
        save_chunks(&tx, ItemKind::Meeting, "m3", &[piece("budget numbers again")]).unwrap();
        // talk without the word, so it is a word worth matching
        for id in &others {
            save_chunks(&tx, ItemKind::Meeting, id, &[piece("hiring plans and the roadmap")]).unwrap();
        }
        tx.commit().unwrap();
        let within = |ids: &[&str]| {
            let ids: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
            let q = SearchQuery { kind: "meeting", text: "budget", embedding: None, limit: 5, within: Some(&ids) };
            let mut found: Vec<String> = hybrid_search(&conn, &q).unwrap().into_iter().map(|hit| hit.owner_id).collect();
            found.sort();
            found
        };
        assert_eq!(within(&["m1"]), vec!["m1"]);
        assert_eq!(within(&["m1", "m2"]), vec!["m1", "m2"]);
    }
}
