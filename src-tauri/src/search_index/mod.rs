//! The search index, owned here end to end: meetings and chats are split into pieces from the store and embedded on MLX (the
//! GPU's background queue) when they're saved — never at launch — and only pieces without a vector are embedded. The webview
//! only asks: search, a recording's new stretch, a rebuild. No piece or vector crosses to it.

mod pieces;

use std::collections::BTreeSet;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::index::{self, ChatLine, MeetingText, ItemKind, ChunkData};
use tauri_plugin_store::{ChatSearchHit, MeetingChange, SearchHit};

use crate::mlx;
use crate::models::gpu::Priority;
use crate::models::LocalError;

/// How long saves settle before their meeting or chat is indexed (typing a note indexes once).
const SETTLE: Duration = Duration::from_secs(2);
/// Texts per embedding call (bounds the memory one call takes).
const EMBED_BATCH: usize = 8;
/// What a search query is prefixed with for Qwen3 Embedding (documents go in as they are).
const QUERY_INSTRUCTION: &str = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:";
/// Rust → webview: a rebuild's progress (`{ kind, current, total }`, then `{ done: true }`).
const PROGRESS_EVENT: &str = "search-index://progress";

/// What a rebuild covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    All,
    Meetings,
    Chats,
}

enum Input {
    Saved(ItemKind, String),
    /// Search's embedding model just finished downloading.
    EmbedderReady,
    Rebuild(Scope, Sender<Result<(), String>>),
}

static SENDER: OnceLock<Sender<Input>> = OnceLock::new();

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    kind: Option<&'static str>,
    current: usize,
    total: usize,
    done: bool,
}

// ── Lifecycle ──

/// Follows meeting and chat saves; called once from setup. Once the database opens, with search's model already
/// downloaded, the pieces still without a vector (after an upgrade, or a save while the model was busy) get one.
pub fn start(app: AppHandle) {
    let (sender, receiver) = mpsc::channel();
    let ready = sender.clone();
    let opened = app.clone();
    tauri_plugin_store::on_database_open(move || {
        if embedder_installed(&opened) {
            let _ = ready.send(Input::EmbedderReady);
        }
    });
    if let Err(error) = thread::Builder::new().name("search-index".into()).spawn(move || follow(&app, &receiver)) {
        log::error!("[search-index] thread failed to start: {error}");
        return;
    }
    let meetings = sender.clone();
    tauri_plugin_store::on_meeting_change(move |change| {
        if let MeetingChange::Saved(id) = change {
            let _ = meetings.send(Input::Saved(ItemKind::Meeting, id.clone()));
        }
    });
    let chats = sender.clone();
    tauri_plugin_store::on_chat_saved(move |id| {
        let _ = chats.send(Input::Saved(ItemKind::Chat, id.to_string()));
    });
    let _ = SENDER.set(sender);
}

/// Whether search's embedding model is downloaded.
fn embedder_installed(app: &AppHandle) -> bool {
    crate::models::catalog::search_embedder().and_then(|model| crate::models::store::installed_dir(app, model)).is_ok()
}

/// Search's embedding model finished downloading: the pieces without a vector get one.
pub fn embedder_ready() {
    if let Some(sender) = SENDER.get() {
        let _ = sender.send(Input::EmbedderReady);
    }
}

// ── Worker ──

/// The worker: saves gather until [`SETTLE`] passes, then each saved item is indexed once; downloads and rebuilds run as they come.
fn follow(app: &AppHandle, receiver: &Receiver<Input>) {
    let mut pending: BTreeSet<(ItemKind, String)> = BTreeSet::new();
    let mut due: Option<Instant> = None;
    loop {
        let input = match due {
            Some(at) => receiver.recv_timeout(at.saturating_duration_since(Instant::now())),
            None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
        };
        match input {
            Ok(Input::Saved(owner, id)) => {
                pending.insert((owner, id));
                due = due.or_else(|| Some(Instant::now() + SETTLE));
            }
            Ok(Input::EmbedderReady) => catch_up(app),
            Ok(Input::Rebuild(scope, done)) => {
                let _ = done.send(rebuild(app, scope));
            }
            Err(RecvTimeoutError::Timeout) => {
                due = None;
                for (owner, id) in std::mem::take(&mut pending) {
                    report(index_one(app, owner, &id), owner, &id);
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// Logs an item that couldn't be indexed (the next save tries again).
fn report(result: Result<(), String>, owner: ItemKind, id: &str) {
    if let Err(error) = result {
        log::error!("[search-index] indexing {owner:?} {id} failed: {error}");
    }
}

/// One meeting or chat, from the store: its pieces saved, the ones without a vector embedded. A meeting still waiting for its
/// transcript, or one that's gone, is left as it is.
fn index_one(app: &AppHandle, owner: ItemKind, id: &str) -> Result<(), String> {
    let source = match owner {
        ItemKind::Meeting => Source::Meeting(index::meeting_text(app, id).map_err(|e| e.to_string())?),
        ItemKind::Chat => Source::Chat(index::chat_lines(app, id).map_err(|e| e.to_string())?),
    };
    let Some(pieces) = pieces_of(source) else { return Ok(()) };
    let pieces = with_new_vectors(app, owner, id, pieces)?;
    index::save_pieces(app, owner, id, &pieces).map_err(|e| e.to_string())
}

/// What an item is indexed from, as the store has it (`None`: it's gone).
enum Source {
    Meeting(Option<MeetingText>),
    Chat(Option<Vec<ChatLine>>),
}

/// The pieces an item is saved as; `None` leaves its index as it is (gone, or a meeting still waiting for its transcript,
/// whose live stretches stay until it's in).
fn pieces_of(source: Source) -> Option<Vec<ChunkData>> {
    match source {
        Source::Meeting(Some(text)) if !text.waiting => Some(pieces::meeting(&text)),
        Source::Chat(Some(lines)) => Some(pieces::chat(&lines)),
        _ => None,
    }
}

/// Vectors for the pieces whose text has none yet (an unchanged piece keeps its own); none while the model isn't downloaded.
fn with_new_vectors(app: &AppHandle, owner: ItemKind, id: &str, mut pieces: Vec<ChunkData>) -> Result<Vec<ChunkData>, String> {
    let have: BTreeSet<String> = index::embedded_texts(app, owner, id).map_err(|e| e.to_string())?.into_iter().collect();
    let missing: Vec<usize> = (0..pieces.len()).filter(|&i| !have.contains(&pieces[i].chunk_text)).collect();
    let texts: Vec<String> = missing.iter().map(|&i| pieces[i].chunk_text.clone()).collect();
    if let Some(vectors) = embed(app, &texts, Priority::Background)? {
        for (i, vector) in missing.into_iter().zip(vectors) {
            pieces[i].embedding = Some(vector);
        }
    }
    Ok(pieces)
}

/// Vectors for `texts` in batches, each a GPU turn at `priority`; `None` while search's model isn't downloaded (search then
/// matches words only).
fn embed(app: &AppHandle, texts: &[String], priority: Priority) -> Result<Option<Vec<Vec<f32>>>, String> {
    let mut vectors = Vec::with_capacity(texts.len());
    for batch in texts.chunks(EMBED_BATCH) {
        match mlx::embed(app, batch, priority) {
            Ok(v) => vectors.extend(v),
            Err(LocalError::NotDownloaded) => return Ok(None),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(Some(vectors))
}

/// The meetings and chats with pieces still without a vector.
fn catch_up(app: &AppHandle) {
    match index::without_vectors(app) {
        Ok(items) => items.into_iter().for_each(|(owner, id)| report(index_one(app, owner, &id), owner, &id)),
        Err(error) => log::error!("[search-index] finding pieces without vectors failed: {error}"),
    }
}

/// Everything in `scope` cleared and indexed again, reporting progress.
fn rebuild(app: &AppHandle, scope: Scope) -> Result<(), String> {
    let owners: &[ItemKind] = match scope {
        Scope::All => &[ItemKind::Meeting, ItemKind::Chat],
        Scope::Meetings => &[ItemKind::Meeting],
        Scope::Chats => &[ItemKind::Chat],
    };
    for &owner in owners {
        index::clear(app, owner).map_err(|e| e.to_string())?;
        let ids = index::all_ids(app, owner).map_err(|e| e.to_string())?;
        let kind = Some(if owner == ItemKind::Meeting { "meetings" } else { "chats" });
        for (i, id) in ids.iter().enumerate() {
            emit(app, Progress { kind, current: i + 1, total: ids.len(), done: false });
            report(index_one(app, owner, id), owner, id);
        }
    }
    emit(app, Progress { kind: None, current: 0, total: 0, done: true });
    Ok(())
}

/// Sends a rebuild's progress to the webview.
fn emit(app: &AppHandle, progress: Progress) {
    if let Err(error) = app.emit(PROGRESS_EVENT, progress) {
        log::warn!("[search-index] progress event failed: {error}");
    }
}

// ── Commands ──

/// One query's vector, or none (words only) while the model isn't downloaded.
fn query_vector(app: &AppHandle, query: &str) -> Result<Option<Vec<f32>>, String> {
    Ok(embed(app, &[format!("{QUERY_INSTRUCTION}{query}")], Priority::Interactive)?.and_then(|mut v| v.pop()))
}

async fn off_main<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| e.to_string())?
}

/// Meeting pieces matching `query`, by meaning and words, best first; within `meeting_ids` when given.
#[tauri::command]
pub async fn search_meetings(app: AppHandle, query: String, limit: usize, meeting_ids: Option<Vec<String>>) -> Result<Vec<SearchHit>, String> {
    off_main(move || {
        let vector = query_vector(&app, &query)?;
        index::search_meetings(&app, &query, vector, limit, meeting_ids).map_err(|e| e.to_string())
    })
    .await
}

/// Several queries within one meeting (a recording's live notes recalling what was said), their vectors in one call.
#[tauri::command]
pub async fn search_meeting_within(app: AppHandle, meeting_id: String, queries: Vec<String>, limit: usize) -> Result<Vec<Vec<SearchHit>>, String> {
    off_main(move || {
        let texts: Vec<String> = queries.iter().map(|q| format!("{QUERY_INSTRUCTION}{q}")).collect();
        let vectors = embed(&app, &texts, Priority::Interactive)?;
        queries
            .iter()
            .enumerate()
            .map(|(i, q)| {
                let vector = vectors.as_ref().and_then(|v| v.get(i).cloned());
                index::search_meetings(&app, q, vector, limit, Some(vec![meeting_id.clone()])).map_err(|e| e.to_string())
            })
            .collect()
    })
    .await
}

/// Chat pieces matching `query`, best first.
#[tauri::command]
pub async fn search_chats(app: AppHandle, query: String, limit: usize) -> Result<Vec<ChatSearchHit>, String> {
    off_main(move || {
        let vector = query_vector(&app, &query)?;
        index::search_chats(&app, &query, vector, limit).map_err(|e| e.to_string())
    })
    .await
}

/// A recording's new stretch of transcript, added to its meeting's pieces as it's spoken; resolves the piece texts it added.
#[tauri::command]
pub async fn index_stretch(app: AppHandle, meeting_id: String, text: String) -> Result<Vec<String>, String> {
    off_main(move || {
        let mut pieces = pieces::transcript(&text);
        let texts: Vec<String> = pieces.iter().map(|p| p.chunk_text.clone()).collect();
        if let Some(vectors) = embed(&app, &texts, Priority::Background)? {
            pieces.iter_mut().zip(vectors).for_each(|(p, v)| p.embedding = Some(v));
        }
        index::append_pieces(&app, &meeting_id, &pieces).map_err(|e| e.to_string())?;
        Ok(texts)
    })
    .await
}

/// Clears `scope`'s index and indexes everything in it again (Settings › Search Index), on the indexer's thread.
#[tauri::command]
pub async fn rebuild_search_index(scope: Scope) -> Result<(), String> {
    let sender = SENDER.get().ok_or("The search index isn't running")?.clone();
    off_main(move || {
        let (done, finished) = mpsc::channel();
        sender.send(Input::Rebuild(scope, done)).map_err(|e| e.to_string())?;
        finished.recv().map_err(|e| e.to_string())?
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meeting(waiting: bool) -> MeetingText {
        MeetingText { title: "Weekly sync".into(), transcript: "We ship on Friday.".into(), waiting, ..Default::default() }
    }

    #[test]
    fn a_ready_meeting_is_indexed_and_one_still_waiting_for_its_transcript_is_left_as_it_is() {
        let ready = pieces_of(Source::Meeting(Some(meeting(false)))).unwrap();
        assert_eq!(ready.iter().map(|p| p.chunk_text.as_str()).collect::<Vec<_>>(), vec!["Weekly sync", "We ship on Friday."]);
        assert!(pieces_of(Source::Meeting(Some(meeting(true)))).is_none());
    }

    #[test]
    fn an_item_that_is_gone_leaves_nothing_to_save() {
        assert!(pieces_of(Source::Meeting(None)).is_none());
        assert!(pieces_of(Source::Chat(None)).is_none());
    }

    #[test]
    fn a_chat_is_saved_as_its_turns() {
        let lines = vec![
            ChatLine { from_user: true, text: "What did we decide about the launch?".into() },
            ChatLine { from_user: false, text: "We ship on Friday.".into() },
        ];
        let pieces = pieces_of(Source::Chat(Some(lines))).unwrap();
        assert_eq!(pieces[0].chunk_text, "User: What did we decide about the launch?\nAssistant: We ship on Friday.");
    }
}
