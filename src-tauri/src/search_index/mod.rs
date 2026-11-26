//! The search index, owned here end to end: every knowledge source (a meeting, a chat, a file kept in the library) is split
//! into pieces from the store and embedded on device (the GPU's background queue) when it's saved, and only pieces without a
//! vector are embedded. Each source's index state records how that went (the webview hears of each change); at launch only
//! library files not yet ready and sources that failed are indexed again. The webview only asks: search, a recording's new
//! stretch, a rebuild. No piece or vector crosses to it.

mod pieces;

use std::collections::BTreeSet;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::index::{self, ChatLine, ChunkData, FileSource, ItemKind, MeetingText, SourceState};
use tauri_plugin_store::{ChatSearchHit, MeetingChange, SearchHit};

#[cfg(mobile)]
use crate::llama;
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
/// Rust → webview: a source's index state changed (`{ kind, id, state }`).
const SOURCE_EVENT: &str = "knowledge://source";
/// The indexer's version: raise it when how sources are read or split changes, and every library file is indexed again.
const INDEXER_VERSION: i64 = 1;
/// A file read as PDF pages (the webview saves every PDF with this type).
const PDF_MEDIA_TYPE: &str = "application/pdf";
/// Why a file with no text (a scan, an empty file) isn't ready.
const NO_TEXT: &str = "No text in it";

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
    /// The database just opened.
    Opened,
    /// Search's embedding model just finished downloading.
    EmbedderReady,
    Rebuild(Scope, Sender<Result<(), String>>),
}

static SENDER: OnceLock<Sender<Input>> = OnceLock::new();

/// A source's index state, as the webview hears of it.
#[derive(Clone, Serialize)]
struct SourceChange<'a> {
    kind: &'static str,
    id: &'a str,
    state: SourceState,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    kind: Option<&'static str>,
    current: usize,
    total: usize,
    done: bool,
}

// ── Lifecycle ──

/// Follows meeting and chat saves and files kept in the library; called once from setup. Once the database opens, the library
/// files not yet ready and the sources that failed are indexed again, and (with search's model downloaded) the pieces still
/// without a vector (after an upgrade, or a save while the model was busy) get one.
pub fn start(app: AppHandle) {
    let (sender, receiver) = mpsc::channel();
    let opened = sender.clone();
    tauri_plugin_store::on_database_open(move || {
        let _ = opened.send(Input::Opened);
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
    let files = sender.clone();
    tauri_plugin_store::on_file_kept(move |id| {
        let _ = files.send(Input::Saved(ItemKind::File, id.to_string()));
    });
    let _ = SENDER.set(sender);
}

/// Whether search's embedding model is downloaded.
pub fn embedder_installed(app: &AppHandle) -> bool {
    crate::models::catalog::search_embedder().is_ok_and(|model| crate::models::store::is_installed(app, model))
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
            Ok(Input::Opened) => {
                retry(app);
                if embedder_installed(app) {
                    catch_up(app);
                }
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

/// Logs a source that couldn't be indexed (its state says so; the next save or launch tries again).
fn report(result: Result<(), String>, owner: ItemKind, id: &str) {
    if let Err(error) = result {
        log::error!("[search-index] indexing {owner:?} {id} failed: {error}");
    }
}

/// One source, from the store: its pieces saved, the ones without a vector embedded, and how that went kept as its index
/// state. Left as it is when unchanged since it was last indexed (same text, same indexer) with every piece embedded, when
/// it's gone, or when it's a meeting still waiting for its transcript.
fn index_one(app: &AppHandle, owner: ItemKind, id: &str) -> Result<(), String> {
    let pieces = match read(app, owner, id) {
        Ok(Some(pieces)) => pieces,
        Ok(None) => return Ok(()),
        Err(error) => return failed(app, owner, id, "", error),
    };
    let hash = text_hash(&pieces);
    let have: BTreeSet<String> = index::embedded_texts(app, owner, id).map_err(|e| e.to_string())?.into_iter().collect();
    let state = index::state_of(app, owner, id).map_err(|e| e.to_string())?;
    let current = state.is_some_and(|s| s.ready && s.text_hash == hash && s.version == INDEXER_VERSION);
    if current && pieces.iter().all(|p| have.contains(&p.chunk_text)) {
        return Ok(());
    }
    let saved = with_new_vectors(app, &have, pieces).and_then(|pieces| index::save_pieces(app, owner, id, &pieces).map_err(|e| e.to_string()));
    match saved {
        Ok(()) => {
            record(app, owner, id, &hash, SourceState::Ready, None);
            Ok(())
        }
        Err(error) => failed(app, owner, id, &hash, error),
    }
}

/// The source's pieces as the store has it now; `None` leaves its index as it is.
fn read(app: &AppHandle, owner: ItemKind, id: &str) -> Result<Option<Vec<ChunkData>>, String> {
    let source = match owner {
        ItemKind::Meeting => Source::Meeting(index::meeting_text(app, id).map_err(|e| e.to_string())?),
        ItemKind::Chat => Source::Chat(index::chat_lines(app, id).map_err(|e| e.to_string())?),
        ItemKind::File => match index::file_source(app, id).map_err(|e| e.to_string())? {
            Some(file) => Source::File(Some(document_text(app, &file)?)),
            None => Source::File(None),
        },
    };
    pieces_of(source)
}

/// What a source is indexed from, as the store has it (`None`: it's gone).
enum Source {
    Meeting(Option<MeetingText>),
    Chat(Option<Vec<ChatLine>>),
    File(Option<DocumentText>),
}

/// A library file's text: a PDF's pages (through PDFKit), or a text file whole as one page.
struct DocumentText {
    pages: Vec<String>,
    /// Its pieces' type: `page` for a PDF's, `text` for a text file's.
    kind: &'static str,
}

/// Reads a library file's text from disk; an error when it can't be opened.
fn document_text(app: &AppHandle, file: &FileSource) -> Result<DocumentText, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join(&file.path);
    if file.media_type == PDF_MEDIA_TYPE {
        return Ok(DocumentText { pages: document_reader::pdf_pages(&path)?, kind: "page" });
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", file.name))?;
    Ok(DocumentText { pages: vec![String::from_utf8_lossy(&bytes).into_owned()], kind: "text" })
}

/// The pieces a source is saved as; `None` leaves its index as it is (gone, or a meeting still waiting for its transcript,
/// whose live stretches stay until it's in); an error for a file with no text to search.
fn pieces_of(source: Source) -> Result<Option<Vec<ChunkData>>, String> {
    Ok(match source {
        Source::Meeting(Some(text)) if !text.waiting => Some(pieces::meeting(&text)),
        Source::Chat(Some(lines)) => Some(pieces::chat(&lines)),
        Source::File(Some(text)) => {
            let pieces = pieces::document(&text.pages, text.kind);
            if pieces.is_empty() {
                return Err(NO_TEXT.into());
            }
            Some(pieces)
        }
        _ => None,
    })
}

/// What a source's pieces say, as one hash (their pages included): unchanged text is not indexed again.
fn text_hash(pieces: &[ChunkData]) -> String {
    let mut hasher = Sha256::new();
    for piece in pieces {
        hasher.update(piece.page.unwrap_or(0).to_le_bytes());
        hasher.update(piece.chunk_text.as_bytes());
        hasher.update([0]);
    }
    format!("{:x}", hasher.finalize())
}

/// Keeps how indexing the source went and tells the webview.
fn record(app: &AppHandle, owner: ItemKind, id: &str, hash: &str, state: SourceState, error: Option<&str>) {
    if let Err(e) = index::set_state(app, owner, id, hash, INDEXER_VERSION, state, error) {
        log::error!("[search-index] {owner:?} {id} state not kept: {e}");
        return;
    }
    if let Err(e) = app.emit(SOURCE_EVENT, SourceChange { kind: owner.index_kind(), id, state }) {
        log::warn!("[search-index] source event failed: {e}");
    }
}

/// Keeps the failure as the source's state (the next save or launch tries again) and returns it.
fn failed(app: &AppHandle, owner: ItemKind, id: &str, hash: &str, error: String) -> Result<(), String> {
    record(app, owner, id, hash, SourceState::Failed, Some(&error));
    Err(error)
}

/// Vectors for the pieces whose text has none yet (`have`: the texts that do; an unchanged piece keeps its own); none
/// while the model isn't downloaded.
fn with_new_vectors(app: &AppHandle, have: &BTreeSet<String>, mut pieces: Vec<ChunkData>) -> Result<Vec<ChunkData>, String> {
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
        #[cfg(desktop)]
        let embedded = crate::llama_server::embed(app, batch, priority);
        #[cfg(mobile)]
        let embedded = llama::embed(app, batch, priority);
        match embedded {
            Ok(v) => vectors.extend(v),
            Err(LocalError::NotDownloaded) => return Ok(None),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(Some(vectors))
}

/// The library files not ready at this indexer's version and the sources that failed, indexed again (at launch).
fn retry(app: &AppHandle) {
    match index::needing_index(app, INDEXER_VERSION) {
        Ok(sources) => sources.into_iter().for_each(|(owner, id)| report(index_one(app, owner, &id), owner, &id)),
        Err(error) => log::error!("[search-index] finding sources to index failed: {error}"),
    }
}

/// The sources with pieces still without a vector.
fn catch_up(app: &AppHandle) {
    match index::without_vectors(app) {
        Ok(items) => items.into_iter().for_each(|(owner, id)| report(index_one(app, owner, &id), owner, &id)),
        Err(error) => log::error!("[search-index] finding pieces without vectors failed: {error}"),
    }
}

/// Everything in `scope` cleared and indexed again, reporting progress.
fn rebuild(app: &AppHandle, scope: Scope) -> Result<(), String> {
    let owners: &[ItemKind] = match scope {
        Scope::All => &[ItemKind::Meeting, ItemKind::Chat, ItemKind::File],
        Scope::Meetings => &[ItemKind::Meeting],
        Scope::Chats => &[ItemKind::Chat],
    };
    for &owner in owners {
        index::clear(app, owner).map_err(|e| e.to_string())?;
        let ids = index::all_ids(app, owner).map_err(|e| e.to_string())?;
        let kind = Some(match owner {
            ItemKind::Meeting => "meetings",
            ItemKind::Chat => "chats",
            ItemKind::File => "documents",
        });
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

/// Meeting pieces matching `query`, by meaning and words, best first: the best of each meeting, or every matching piece of
/// `meeting_id` when given (a long meeting, or the one being recorded).
#[tauri::command]
pub async fn search_meetings(app: AppHandle, query: String, limit: usize, meeting_id: Option<String>) -> Result<Vec<SearchHit>, String> {
    off_main(move || {
        let vector = query_vector(&app, &query)?;
        index::search_meetings(&app, &query, vector, limit, meeting_id.map(|id| vec![id])).map_err(|e| e.to_string())
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

/// A recording's new stretch of transcript, added to its meeting's pieces as it's spoken (chat finds it mid-meeting); resolves
/// the piece texts it added.
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
        let ready = pieces_of(Source::Meeting(Some(meeting(false)))).unwrap().unwrap();
        assert_eq!(ready.iter().map(|p| p.chunk_text.as_str()).collect::<Vec<_>>(), vec!["Weekly sync", "We ship on Friday."]);
        assert!(pieces_of(Source::Meeting(Some(meeting(true)))).unwrap().is_none());
    }

    #[test]
    fn an_item_that_is_gone_leaves_nothing_to_save() {
        assert!(pieces_of(Source::Meeting(None)).unwrap().is_none());
        assert!(pieces_of(Source::Chat(None)).unwrap().is_none());
        assert!(pieces_of(Source::File(None)).unwrap().is_none());
    }

    #[test]
    fn a_file_with_no_text_is_not_ready_and_says_why() {
        let scan = DocumentText { pages: vec![String::new(), "  ".into()], kind: "page" };
        assert_eq!(pieces_of(Source::File(Some(scan))).unwrap_err(), NO_TEXT);
    }

    #[test]
    fn the_same_text_hashes_the_same_and_a_page_moved_does_not() {
        let on = |page: i32| {
            let mut pieces = pieces::document(&vec![String::new(); page as usize - 1].into_iter().chain(["Q3 pricing.".to_string()]).collect::<Vec<_>>(), "page");
            pieces.iter_mut().for_each(|p| p.embedding = None);
            pieces
        };
        assert_eq!(text_hash(&on(1)), text_hash(&on(1)));
        assert_ne!(text_hash(&on(1)), text_hash(&on(2)));
    }

    #[test]
    fn a_chat_is_saved_as_its_turns() {
        let lines = vec![
            ChatLine { from_user: true, text: "What did we decide about the launch?".into() },
            ChatLine { from_user: false, text: "We ship on Friday.".into() },
        ];
        let pieces = pieces_of(Source::Chat(Some(lines))).unwrap().unwrap();
        assert_eq!(pieces[0].chunk_text, "User: What did we decide about the launch?\nAssistant: We ship on Friday.");
    }
}
