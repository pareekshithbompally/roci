//! Kasset meetings in macOS Spotlight. The store plugin announces every
//! committed meeting write; one `meeting-spotlight` thread follows those
//! changes and keeps the Core Spotlight index in step while the user has
//! Spotlight on. Saves are coalesced for [`DEBOUNCE`]; a delete is removed at
//! once. Turning Spotlight on re-indexes every meeting; turning it off removes
//! them all.
//!
//! A Spotlight result the user opens goes through `url_actions`, so it waits
//! for the webview on a cold launch.
//!
//! Core Spotlight needs an app bundle: without one the thread never starts and
//! [`configure_meeting_spotlight`] does nothing.

mod item;

use std::collections::BTreeSet;
use std::sync::OnceLock;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_core_spotlight as spotlight;
use tauri_plugin_store::{MeetingChange, meeting_detail, meeting_ids};

use item::item_for;

use crate::url_actions;

/// How long saves gather before the changed meetings are re-indexed.
const DEBOUNCE: Duration = Duration::from_secs(1);
/// Meetings handed to Core Spotlight per call during a full re-index.
const BATCH: usize = 50;

/// What the worker hears: a meeting write, or Spotlight turned on or off.
#[derive(Debug)]
enum Input {
    Change(MeetingChange),
    Enable(bool),
}

/// What the worker asks Core Spotlight to do.
#[derive(Debug, PartialEq, Eq)]
enum Work {
    Reindex(Vec<String>),
    Remove(Vec<String>),
    ReindexAll,
    RemoveAll,
}

/// The pure state of the sync: on, off, or not yet known (a fresh launch, so
/// the first switch value always runs, and clears stale items when off), and
/// the saved meetings waiting for [`DEBOUNCE`].
#[derive(Debug, Default)]
struct IndexState {
    enabled: Option<bool>,
    pending: BTreeSet<String>,
}

impl IndexState {
    /// The work `input` needs now. Saves wait in `pending` for [`IndexState::flush`].
    fn plan(&mut self, input: Input) -> Option<Work> {
        match input {
            Input::Enable(enabled) => self.set_enabled(enabled),
            Input::Change(_) if self.enabled != Some(true) => None,
            Input::Change(MeetingChange::Saved(id)) => {
                self.pending.insert(id);
                None
            }
            Input::Change(MeetingChange::Deleted(id)) => {
                self.pending.remove(&id);
                Some(Work::Remove(vec![id]))
            }
        }
    }

    fn set_enabled(&mut self, enabled: bool) -> Option<Work> {
        if self.enabled == Some(enabled) {
            return None;
        }
        self.enabled = Some(enabled);
        self.pending.clear();
        Some(if enabled {
            Work::ReindexAll
        } else {
            Work::RemoveAll
        })
    }

    /// The waiting saves, once the debounce has passed.
    fn flush(&mut self) -> Option<Work> {
        if self.pending.is_empty() {
            return None;
        }
        Some(Work::Reindex(
            std::mem::take(&mut self.pending).into_iter().collect(),
        ))
    }
}

static SENDER: OnceLock<Sender<Input>> = OnceLock::new();

// ── Lifecycle ──

/// Follow meeting writes and open chosen results. Called once from setup
/// (Core Spotlight's open hook needs the app delegate, which exists then).
pub fn start(app: AppHandle) {
    if !spotlight::supported() {
        log::info!("[meeting-spotlight] Core Spotlight unavailable (no app bundle); indexing off");
        return;
    }
    let opener = app.clone();
    // Runs on the far side of an `extern "C"` call: only enqueue.
    spotlight::on_open(move |id| url_actions::open_meeting(&opener, id));

    let (sender, receiver) = mpsc::channel();
    let spawned = thread::Builder::new()
        .name("meeting-spotlight".into())
        .spawn(move || follow(&app, &receiver));
    if let Err(error) = spawned {
        log::error!("[meeting-spotlight] thread failed to start: {error}");
        return;
    }
    let changes = sender.clone();
    tauri_plugin_store::on_meeting_change(move |change| {
        let _ = changes.send(Input::Change(change.clone()));
    });
    let _ = SENDER.set(sender);
}

/// Spotlight on or off (Settings). Off removes every Kasset meeting from it.
/// The webview calls this only after settings load from the open store DB,
/// which `ReindexAll` relies on to read the meetings.
#[tauri::command]
pub fn configure_meeting_spotlight(enabled: bool) {
    let Some(sender) = SENDER.get() else {
        return;
    };
    if let Err(error) = sender.send(Input::Enable(enabled)) {
        log::error!("[meeting-spotlight] worker gone: {error}");
    }
}

// ── Worker ──

fn follow(app: &AppHandle, receiver: &Receiver<Input>) {
    let mut sync = IndexState::default();
    let mut due: Option<Instant> = None;
    loop {
        let work = match next(receiver, due) {
            Ok(input) => {
                let work = sync.plan(input);
                due = due_after(&sync, due);
                work
            }
            Err(RecvTimeoutError::Timeout) => {
                due = None;
                sync.flush()
            }
            Err(RecvTimeoutError::Disconnected) => return,
        };
        if let Some(work) = work {
            perform(app, work);
        }
    }
}

/// The next input, waiting no later than `due` when saves are pending.
fn next(receiver: &Receiver<Input>, due: Option<Instant>) -> Result<Input, RecvTimeoutError> {
    match due {
        Some(due) => receiver.recv_timeout(due.saturating_duration_since(Instant::now())),
        None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
    }
}

/// The debounce runs from the first pending save, so steady writes still flush.
fn due_after(sync: &IndexState, due: Option<Instant>) -> Option<Instant> {
    if sync.pending.is_empty() {
        return None;
    }
    Some(due.unwrap_or_else(|| Instant::now() + DEBOUNCE))
}

fn perform(app: &AppHandle, work: Work) {
    let result = match work {
        Work::Reindex(ids) => reindex(app, &ids),
        Work::Remove(ids) => spotlight::remove(&ids),
        Work::ReindexAll => reindex_all(app),
        Work::RemoveAll => spotlight::remove_all(),
    };
    if let Err(error) = result {
        log::error!("[meeting-spotlight] index update failed: {error}");
    }
}

fn reindex_all(app: &AppHandle) -> Result<(), String> {
    spotlight::remove_all()?;
    let ids = meeting_ids(app).map_err(|e| e.to_string())?;
    for batch in ids.chunks(BATCH) {
        if let Err(error) = reindex(app, batch) {
            log::error!("[meeting-spotlight] index batch failed: {error}");
        }
    }
    log::info!("[meeting-spotlight] indexed meetings: {}", ids.len());
    Ok(())
}

/// Index the meetings that still exist; remove the ones that are gone.
fn reindex(app: &AppHandle, ids: &[String]) -> Result<(), String> {
    let mut items = Vec::new();
    let mut missing = Vec::new();
    for id in ids {
        match meeting_detail(app, id) {
            Ok(Some(detail)) => items.push(item_for(&detail)),
            Ok(None) => missing.push(id.clone()),
            Err(error) => log::error!("[meeting-spotlight] could not read meeting {id}: {error}"),
        }
    }
    if !items.is_empty() {
        spotlight::index(&items)?;
    }
    if !missing.is_empty() {
        spotlight::remove(&missing)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(id: &str) -> Input {
        Input::Change(MeetingChange::Saved(id.into()))
    }

    fn enabled() -> IndexState {
        let mut sync = IndexState::default();
        sync.plan(Input::Enable(true));
        sync
    }

    #[test]
    fn changes_ignored_while_disabled() {
        let mut sync = IndexState::default();
        assert_eq!(sync.plan(saved("a")), None);
        assert_eq!(
            sync.plan(Input::Change(MeetingChange::Deleted("a".into()))),
            None
        );
        assert_eq!(sync.flush(), None);
    }

    #[test]
    fn first_disable_removes_all() {
        let mut sync = IndexState::default();
        assert_eq!(sync.plan(Input::Enable(false)), Some(Work::RemoveAll));
        assert_eq!(sync.plan(Input::Enable(false)), None);
    }

    #[test]
    fn enable_reindexes_all() {
        let mut sync = IndexState::default();
        assert_eq!(sync.plan(Input::Enable(true)), Some(Work::ReindexAll));
        assert_eq!(sync.plan(Input::Enable(true)), None);
    }

    #[test]
    fn disable_removes_all() {
        let mut sync = enabled();
        sync.plan(saved("a"));
        assert_eq!(sync.plan(Input::Enable(false)), Some(Work::RemoveAll));
        assert_eq!(sync.flush(), None);
        assert_eq!(sync.plan(Input::Enable(false)), None);
    }

    #[test]
    fn deleted_change_removes_the_item() {
        let mut sync = enabled();
        sync.plan(saved("a"));
        assert_eq!(
            sync.plan(Input::Change(MeetingChange::Deleted("a".into()))),
            Some(Work::Remove(vec!["a".into()]))
        );
        assert_eq!(sync.flush(), None);
    }

    #[test]
    fn saves_coalesce_per_meeting() {
        let mut sync = enabled();
        for id in ["b", "a", "b", "a"] {
            assert_eq!(sync.plan(saved(id)), None);
        }
        assert_eq!(
            sync.flush(),
            Some(Work::Reindex(vec!["a".into(), "b".into()]))
        );
        assert_eq!(sync.flush(), None);
    }
}
