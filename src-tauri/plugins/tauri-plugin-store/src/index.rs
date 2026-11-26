//! Search indexing for Rust callers (the app's search indexer): the text a meeting or chat is indexed from, its saved pieces
//! and which have vectors, the items still without vectors, clearing everything for a rebuild, and search itself.
//! The webview never handles pieces or vectors.

use crate::assets::{DOCUMENT, FILE_NAME};
use crate::commands::{
    append_chunks_impl, chats_get_impl, embedded_chunk_texts_impl, meetings_get_impl, save_chunks, ChatSearchHit, StoreState,
};
use crate::error::StoreError;
use crate::search::{hybrid_search, ChunkHit, SearchHit, SearchQuery};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

pub use crate::commands::{ChunkData, ItemKind};
pub use crate::sources::{IndexState, SourceState};

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

/// Every meeting, chat (with messages) or document id, newest first: what a rebuild indexes.
pub fn all_ids<R: Runtime>(app: &AppHandle<R>, owner: ItemKind) -> Result<Vec<String>, StoreError> {
    let sql = match owner {
        ItemKind::Meeting => "SELECT id FROM meetings ORDER BY created_at DESC".to_string(),
        ItemKind::Chat => "SELECT c.id FROM chats c WHERE EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = c.id) ORDER BY last_message_at DESC".to_string(),
        ItemKind::File => format!("SELECT id FROM assets WHERE kind = 'file' AND {DOCUMENT} ORDER BY created_at DESC"),
    };
    Ok(with_db(app, |db| Ok(db.prepare(&sql)?.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?))?.unwrap_or_default())
}

/// A document you gave Roci as indexing reads it: where it is (its app-data path) and what it is.
#[derive(Debug, Clone, PartialEq)]
pub struct FileSource {
    pub path: String,
    pub name: String,
    pub media_type: String,
}

/// The document's path, name and media type (in the library or a chat's attachment); `None` when it is gone or is no
/// document (an image, a sound: never indexed).
pub fn file_source<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Option<FileSource>, StoreError> {
    let sql = format!(
        "SELECT path, {FILE_NAME}, COALESCE(json_extract(meta, '$.mediaType'), '') FROM assets
         WHERE id = ?1 AND kind = 'file' AND {DOCUMENT}"
    );
    Ok(with_db(app, |db| {
        Ok(db
            .query_row(&sql, [id], |row| Ok(FileSource { path: row.get(0)?, name: row.get(1)?, media_type: row.get(2)? }))
            .optional()?)
    })?
    .flatten())
}

/// The id of the file at this app-data path (what the model and the webview know a document by); `None` when it is gone.
pub fn file_id_of<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<Option<String>, StoreError> {
    Ok(with_db(app, |db| Ok(db.query_row("SELECT id FROM assets WHERE path = ?1 AND kind = 'file'", [path], |row| row.get(0)).optional()?))?
        .flatten())
}

/// A passage of a document as search returns it: the document (by its path), the words, its page.
#[derive(Debug, Clone, Serialize)]
pub struct FileHit {
    pub path: String,
    pub name: String,
    pub chunk_text: String,
    pub page: Option<i32>,
    pub score: f64,
}

/// How alike a passage must be to the question to match it by meaning (cosine, 0–1); a weaker one is no match, so an
/// answer never cites a page that isn't about the question. Tuned on real documents.
const DOCUMENT_MIN_SIMILARITY: f64 = 0.5;

/// The ids of the files at `paths` (a chat's attachments).
fn files_at(db: &Connection, paths: &[String]) -> Result<Vec<String>, StoreError> {
    let json = serde_json::to_string(paths).map_err(|e| StoreError::from(e.to_string()))?;
    Ok(db
        .prepare("SELECT id FROM assets WHERE kind = 'file' AND path IN (SELECT value FROM json_each(?1))")?
        .query_map([json], |row| row.get(0))?
        .collect::<Result<_, _>>()?)
}

/// Documents' passages matching `query` on an open database: within the files at `paths`, or the whole library.
fn search_files_impl(db: &Connection, query: &str, embedding: Option<&[f32]>, limit: usize, paths: Option<&[String]>) -> Result<Vec<FileHit>, StoreError> {
    let ids = paths.map(|paths| files_at(db, paths)).transpose()?;
    if ids.as_ref().is_some_and(Vec::is_empty) {
        return Ok(Vec::new());
    }
    let max_distance = Some((2.0 * (1.0 - DOCUMENT_MIN_SIMILARITY)).sqrt());
    let q = SearchQuery { within: ids.as_deref(), library: ids.is_none(), max_distance, ..SearchQuery::owners(ItemKind::File.index_kind(), query, embedding, limit) };
    let hits = hybrid_search(db, &q).map_err(StoreError::from)?;
    let mut file = db.prepare(&format!("SELECT path, {FILE_NAME} FROM assets WHERE id = ?1"))?;
    let mut out = Vec::with_capacity(hits.len());
    for hit in hits {
        let found: Option<(String, String)> = file.query_row([&hit.owner_id], |row| Ok((row.get(0)?, row.get(1)?))).optional()?;
        if let Some((path, name)) = found {
            out.push(FileHit { path, name, chunk_text: hit.chunk_text, page: hit.page, score: hit.score });
        }
    }
    Ok(out)
}

/// Documents' passages matching `query` (by meaning, above a floor, when `embedding` is given; by words always), best
/// first, each with its page: within the files at `paths`, or the whole library.
pub fn search_files<R: Runtime>(
    app: &AppHandle<R>,
    query: &str,
    embedding: Option<Vec<f32>>,
    limit: usize,
    paths: Option<Vec<String>>,
) -> Result<Vec<FileHit>, StoreError> {
    Ok(with_db(app, |db| search_files_impl(db, query, embedding.as_deref(), limit, paths.as_deref()))?.unwrap_or_default())
}

/// How far indexing the source got, by which indexer version; `None` before its first.
pub fn state_of<R: Runtime>(app: &AppHandle<R>, owner: ItemKind, id: &str) -> Result<Option<IndexState>, StoreError> {
    Ok(with_db(app, |db| crate::sources::state_impl(db, owner, id))?.flatten())
}

/// Records how far indexing the source got (nothing for one deleted meanwhile).
pub fn set_state<R: Runtime>(app: &AppHandle<R>, owner: ItemKind, id: &str, version: i64, state: SourceState, error: Option<&str>) -> Result<(), StoreError> {
    let now = crate::commands::now_millis();
    with_db(app, |db| crate::sources::set_state_impl(db, owner, id, version, state, error, now))?;
    Ok(())
}

/// The sources to read at launch: documents new to `version`, and sources indexed before states were kept.
pub fn unindexed<R: Runtime>(app: &AppHandle<R>, version: i64) -> Result<Vec<(ItemKind, String)>, StoreError> {
    Ok(with_db(app, |db| crate::sources::unindexed_impl(db, version))?.unwrap_or_default())
}

/// The sources with pieces still waiting for a vector.
pub fn pending<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<(ItemKind, String)>, StoreError> {
    Ok(with_db(app, crate::sources::pending_impl)?.unwrap_or_default())
}

/// Clears one owner kind's pieces, vectors and index states (a rebuild then indexes everything again).
pub fn clear<R: Runtime>(app: &AppHandle<R>, owner: ItemKind) -> Result<(), StoreError> {
    // Their keyword entries and vectors follow by trigger.
    with_db(app, |db| {
        db.execute("DELETE FROM chunks WHERE owner_kind = ?1", [owner.index_kind()])?;
        db.execute("DELETE FROM index_state WHERE owner_kind = ?1", [owner.index_kind()])?;
        Ok(())
    })?;
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
    let q = SearchQuery { within: meeting_ids.as_deref(), ..SearchQuery::owners(ItemKind::Meeting.index_kind(), query, embedding.as_deref(), limit) };
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
    let q = SearchQuery::owners(ItemKind::Chat.index_kind(), query, embedding.as_deref(), limit);
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

    /// A unit vector along `axis` (with a little of the next), so similarity is easy to reason about.
    fn along(axis: usize, lean: f32) -> Vec<f32> {
        let mut v = vec![0.0; crate::schema::DEFAULT_DIM as usize];
        v[axis] = 1.0;
        v[axis + 1] = lean;
        let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        v.into_iter().map(|x| x / norm).collect()
    }

    #[test]
    fn a_document_search_finds_passages_by_meaning_with_their_pages_in_the_library_or_one_attachment() {
        let conn = db();
        conn.execute_batch(
            "INSERT INTO assets (id, kind, path, meta, created_at, kept) VALUES
                 ('lib', 'file', 'assets/lib.pdf', '{\"name\":\"Q3 pricing.pdf\",\"mediaType\":\"application/pdf\"}', 0, 1),
                 ('att', 'file', 'assets/att.pdf', '{\"name\":\"Draft.pdf\",\"mediaType\":\"application/pdf\"}', 0, 0);",
        )
        .unwrap();
        let page = |index: i32, page: i32, text: &str, axis: usize| ChunkData {
            chunk_index: index, chunk_text: text.into(), chunk_type: "page".into(), embedding: Some(along(axis, 0.1)),
            start_pos: None, end_pos: None, page: Some(page),
        };
        let tx = conn.unchecked_transaction().unwrap();
        save_chunks(&tx, ItemKind::File, "lib", &[page(0, 1, "Contents", 9), page(1, 3, "Priya leads the rollout", 0)]).unwrap();
        save_chunks(&tx, ItemKind::File, "att", &[page(0, 1, "Who runs the launch in the draft", 0)]).unwrap();
        tx.commit().unwrap();
        let question = along(0, 0.2);

        let library = search_files_impl(&conn, "who runs it", Some(&question), 5, None).unwrap();
        assert_eq!(library.iter().map(|h| (h.name.as_str(), h.page)).collect::<Vec<_>>(), vec![("Q3 pricing.pdf", Some(3))], "the far page and the attachment are no match");
        let attached = search_files_impl(&conn, "who runs it", Some(&question), 5, Some(&["assets/att.pdf".into()])).unwrap();
        assert_eq!(attached.iter().map(|h| h.name.as_str()).collect::<Vec<_>>(), vec!["Draft.pdf"]);
    }

    #[test]
    fn a_search_within_meetings_finds_their_words_only() {
        let conn = db();
        let others: Vec<String> = (0..8).map(|n| format!("other{n}")).collect();
        for id in ["m1", "m2", "m3"].into_iter().chain(others.iter().map(String::as_str)) {
            seed_meeting(&conn, id);
        }
        let piece = |text: &str| ChunkData {
            chunk_index: 0, chunk_text: text.into(), chunk_type: "transcript".into(), embedding: None, start_pos: None, end_pos: None, page: None,
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
            let q = SearchQuery { within: Some(&ids), ..SearchQuery::owners("meeting", "budget", None, 5) };
            let mut found: Vec<String> = hybrid_search(&conn, &q).unwrap().into_iter().map(|hit| hit.owner_id).collect();
            found.sort();
            found
        };
        assert_eq!(within(&["m1"]), vec!["m1"]);
        assert_eq!(within(&["m1", "m2"]), vec!["m1", "m2"]);
    }
}
