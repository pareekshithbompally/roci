//! Model storage in the model directory (Settings; default `<app data>/models`): resumable downloads checked by size and
//! SHA-256. Roci's own layout keeps a model's files in `<dir>/<id>/`; a Hugging Face cache directory is read and written
//! in its layout (`models--org--repo/snapshots/<revision>/<file>` linked to `blobs/<sha256>`), so other apps share them.
//! Only the catalog's exact files count; nothing else in the directory is looked at.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

use serde::Serialize;
use sha2::{Digest, Sha256};
use objc2_foundation::{NSArray, NSNumber, NSString, NSURL, NSURLVolumeAvailableCapacityForImportantUsageKey};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use super::catalog::{self, LocalModel, ModelFile, Source};
use super::LocalError;
use crate::sync::lock;

/// Rust → webview: one download's progress or outcome.
pub const DOWNLOAD_EVENT: &str = "models://download";

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DownloadState {
    Downloading,
    Verifying,
    Done,
    Cancelled,
    Failed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: &'static str,
    pub state: DownloadState,
    pub received: u64,
    pub total: u64,
    pub error: Option<String>,
}

/// Cancel flags of the downloads running now, by model id.
#[derive(Default)]
pub struct Downloads {
    active: Mutex<HashMap<&'static str, Arc<AtomicBool>>>,
}

impl Downloads {
    /// Registers a download; None when that model is already downloading.
    pub fn begin(&self, id: &'static str) -> Option<Arc<AtomicBool>> {
        let mut active = lock(&self.active);
        if active.contains_key(id) {
            return None;
        }
        let cancel = Arc::new(AtomicBool::new(false));
        active.insert(id, Arc::clone(&cancel));
        Some(cancel)
    }

    pub fn end(&self, id: &str) {
        lock(&self.active).remove(id);
    }

    pub fn cancel(&self, id: &str) {
        if let Some(flag) = lock(&self.active).get(id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn is_active(&self, id: &str) -> bool {
        lock(&self.active).contains_key(id)
    }
}

/// The model directory the user chose; None: Roci's own (`<app data>/models`).
static DIRECTORY: LazyLock<Mutex<Option<PathBuf>>> = LazyLock::new(Mutex::default);

/// How files sit in the model directory.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Layout {
    /// `<dir>/<id>/<file>`.
    Roci,
    /// `<dir>/models--org--repo/snapshots/<revision>/<file>` → `blobs/<sha256>`.
    HuggingFace,
}

/// Characters a model path can't hold: the engine's preset file ends a value at `;` or `#`, and a line at a line break.
const UNWRITABLE: &[char] = &[';', '#', '\n', '\r'];

/// Uses `dir` as the model directory from now on (None: Roci's own); true when that changed it. Refused when it can't be
/// read or written, or its path can't go into the engine's presets, so the one in use stays.
pub fn set_directory(dir: Option<PathBuf>) -> Result<bool, LocalError> {
    if let Some(dir) = &dir {
        if dir.to_string_lossy().contains(UNWRITABLE) {
            return Err(LocalError::BadInput(format!("a model folder's path can't contain ; # or a line break: {}", dir.display())));
        }
        fs::create_dir_all(dir)?;
        fs::read_dir(dir)?;
    }
    let mut current = lock(&DIRECTORY);
    let changed = *current != dir;
    *current = dir;
    Ok(changed)
}

fn root(app: &AppHandle) -> Result<PathBuf, LocalError> {
    match lock(&DIRECTORY).clone() {
        Some(dir) => Ok(dir),
        None => Ok(app.path().app_data_dir().map_err(|e| LocalError::Io(e.to_string()))?.join("models")),
    }
}

/// A Hugging Face cache: named `…/huggingface/hub`, or already holding `models--…` folders.
fn layout_of(root: &Path) -> Layout {
    let named = root.ends_with("huggingface/hub");
    let holds = fs::read_dir(root).is_ok_and(|entries| entries.flatten().any(|e| e.file_name().to_string_lossy().starts_with("models--")));
    if named || holds { Layout::HuggingFace } else { Layout::Roci }
}

/// Where `file` of `model` lives (or will) in the model directory.
pub fn file_path(app: &AppHandle, model: &LocalModel, file: &ModelFile) -> Result<PathBuf, LocalError> {
    Ok(path_in(&root(app)?, model, file))
}

fn path_in(root: &Path, model: &LocalModel, file: &ModelFile) -> PathBuf {
    match layout_of(root) {
        Layout::Roci => root.join(model.id).join(file.name),
        Layout::HuggingFace => repo_dir(root, model.source_of(file)).join("snapshots").join(model.source_of(file).revision).join(file.name),
    }
}

/// `models--org--repo` for a repository, as the Hugging Face cache names it.
fn repo_dir(root: &Path, source: &Source) -> PathBuf {
    root.join(format!("models--{}", source.repository.replace('/', "--")))
}

/// Where an unfinished download of `file` grows: beside it (Roci) or as the cache's `blobs/<sha256>.incomplete`.
fn part_path(app: &AppHandle, model: &LocalModel, file: &ModelFile) -> Result<PathBuf, LocalError> {
    let root = root(app)?;
    Ok(match layout_of(&root) {
        Layout::Roci => root.join(model.id).join(format!("{}.part", file.name)),
        Layout::HuggingFace => repo_dir(&root, model.source_of(file)).join("blobs").join(format!("{}.incomplete", file.sha256)),
    })
}

fn has_file(app: &AppHandle, model: &LocalModel, file: &ModelFile) -> bool {
    file_path(app, model, file).is_ok_and(|path| fs::metadata(path).is_ok_and(|m| m.len() == file.bytes))
}

pub fn is_installed(app: &AppHandle, model: &LocalModel) -> bool {
    model.files.iter().all(|f| has_file(app, model, f))
}

/// Some of the model is here: a whole file, or part of one.
pub fn is_started(app: &AppHandle, model: &LocalModel) -> bool {
    model.files.iter().any(|f| has_file(app, model, f) || part_path(app, model, f).is_ok_and(|p| p.exists()))
}

/// The path of `file` once every file of `model` is in place; `NotDownloaded` until then.
pub fn installed_path(app: &AppHandle, model: &LocalModel, file: &ModelFile) -> Result<PathBuf, LocalError> {
    if !is_installed(app, model) {
        return Err(LocalError::NotDownloaded);
    }
    file_path(app, model, file)
}

/// What the system can free for a download the user asked for (purgeable space included).
pub fn free_space(app: &AppHandle) -> Result<u64, LocalError> {
    let dir = app.path().app_data_dir().map_err(|e| LocalError::Io(e.to_string()))?;
    let url = NSURL::fileURLWithPath(&NSString::from_str(&dir.to_string_lossy()));
    // SAFETY: the key is a Foundation constant.
    let key = unsafe { NSURLVolumeAvailableCapacityForImportantUsageKey };
    let values = url.resourceValuesForKeys_error(&NSArray::from_slice(&[key])).map_err(|e| LocalError::Io(e.localizedDescription().to_string()))?;
    values
        .objectForKey(key)
        .and_then(|value| value.downcast::<NSNumber>().ok())
        .map(|bytes| bytes.unsignedLongLongValue())
        .ok_or_else(|| LocalError::Io("free space is unknown".into()))
}

/// Deletes the model's files and partial downloads (in a Hugging Face cache, each file's snapshot link and blob).
pub fn remove(app: &AppHandle, model: &LocalModel) -> Result<(), LocalError> {
    for file in model.files {
        let path = file_path(app, model, file)?;
        let blob = fs::canonicalize(&path).ok();
        remove_if_there(&path)?;
        remove_if_there(&part_path(app, model, file)?)?;
        if let Some(blob) = blob.filter(|b| *b != path) {
            remove_if_there(&blob)?;
        }
    }
    let own = root(app)?.join(model.id);
    if own.exists() && layout_of(&root(app)?) == Layout::Roci {
        fs::remove_dir_all(own)?;
    }
    Ok(())
}

fn remove_if_there(path: &Path) -> Result<(), LocalError> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Emits progress whenever the whole-percent value changes.
struct Reporter<'a> {
    app: &'a AppHandle,
    model: &'static LocalModel,
    last_percent: u64,
}

impl Reporter<'_> {
    fn emit(&self, state: DownloadState, received: u64, error: Option<String>) {
        let progress = DownloadProgress { id: self.model.id, state, received, total: self.model.bytes(), error };
        if let Err(e) = self.app.emit(DOWNLOAD_EVENT, progress) {
            log::warn!("[models] download event failed: {e}");
        }
    }

    fn progress(&mut self, received: u64) {
        let percent = received * 100 / self.model.bytes().max(1);
        if percent != self.last_percent {
            self.last_percent = percent;
            self.emit(DownloadState::Downloading, received, None);
        }
    }
}

/// Downloads one model to completion, reporting every step as an event.
pub async fn download(app: &AppHandle, model: &'static LocalModel, cancel: &AtomicBool) {
    let mut reporter = Reporter { app, model, last_percent: u64::MAX };
    let outcome = fetch_all(app, model, cancel, &mut reporter).await;
    match outcome {
        Ok(state) => {
            #[cfg(desktop)]
            if matches!(state, DownloadState::Done) {
                let kind = model.kind;
                let _ = tauri::async_runtime::spawn_blocking(move || crate::llama_server::model_changed(kind)).await;
            }
            reporter.emit(state, model.bytes(), None);
            // Search's model is in: the meetings and chats without vectors get them now.
            if matches!(state, DownloadState::Done) && model.kind == catalog::Kind::Embedding {
                crate::search_index::embedder_ready();
            }
        }
        Err(error) => {
            log::error!("[models] download of {} failed: {error}", model.id);
            reporter.emit(DownloadState::Failed, 0, Some(error.to_string()));
        }
    }
}

/// Every file not already in place, in order; Done, or Cancelled midway.
async fn fetch_all(app: &AppHandle, model: &'static LocalModel, cancel: &AtomicBool, reporter: &mut Reporter<'_>) -> Result<DownloadState, LocalError> {
    let mut done = 0;
    for file in model.files {
        if !has_file(app, model, file) {
            let (part, target) = (part_path(app, model, file)?, file_path(app, model, file)?);
            for dir in [part.parent(), target.parent()].into_iter().flatten() {
                fs::create_dir_all(dir)?;
            }
            if !fetch(&model.url(file), file, &part, done, cancel, reporter).await? {
                return Ok(DownloadState::Cancelled);
            }
            reporter.emit(DownloadState::Verifying, done + file.bytes, None);
            verify_and_place(file, &part, &target).await?;
        }
        done += file.bytes;
    }
    Ok(DownloadState::Done)
}

async fn verify_and_place(file: &ModelFile, part: &Path, target: &Path) -> Result<(), LocalError> {
    let checked = part.to_path_buf();
    let digest = super::blocking(move || sha256_hex(&checked)).await?;
    if digest != file.sha256 {
        fs::remove_file(part)?;
        return Err(LocalError::Download(format!("{} didn't match its checksum; download it again", file.name)));
    }
    place(part, target)
}

/// Moves a checked download into place: beside its name (Roci), or as its blob with the snapshot linked to it (a Hugging
/// Face cache, where the part is `blobs/<sha256>.incomplete`).
fn place(part: &Path, target: &Path) -> Result<(), LocalError> {
    let Some(blob) = part.to_str().and_then(|p| p.strip_suffix(".incomplete")).map(PathBuf::from) else {
        fs::rename(part, target)?;
        return Ok(());
    };
    fs::rename(part, &blob)?;
    remove_if_there(target)?;
    std::os::unix::fs::symlink(relative_blob(target, &blob), target)?;
    Ok(())
}

/// The blob as the cache links it from a snapshot: `../../blobs/<sha256>`.
fn relative_blob(target: &Path, blob: &Path) -> PathBuf {
    let depth = target.parent().map_or(0, |snapshot| snapshot.strip_prefix(blob.parent().and_then(Path::parent).unwrap_or(snapshot)).map_or(0, |p| p.components().count()));
    let mut path = PathBuf::new();
    (0..depth).for_each(|_| path.push(".."));
    path.join("blobs").join(blob.file_name().unwrap_or_default())
}

/// How much of a file a `.part` already holds: all of it (the app stopped before checking it), so nothing is fetched and the
/// checksum decides; a resumable start; or 0 when it's longer than the file can be, so it downloads again from the start.
fn resume_from(have: u64, bytes: u64) -> Option<u64> {
    match have {
        _ if have == bytes => None,
        _ if have > bytes => Some(0),
        _ => Some(have),
    }
}

/// Streams one file into `part`, resuming what's there. False when cancelled.
async fn fetch(url: &str, file: &ModelFile, part: &Path, before: u64, cancel: &AtomicBool, reporter: &mut Reporter<'_>) -> Result<bool, LocalError> {
    let Some(have) = resume_from(fs::metadata(part).map(|m| m.len()).unwrap_or(0), file.bytes) else {
        reporter.progress(before + file.bytes);
        return Ok(true);
    };
    let mut request = reqwest::Client::new().get(url);
    if have > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let mut response = request.send().await.and_then(|r| r.error_for_status()).map_err(download_error)?;
    let resumed = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let mut out = tokio::fs::OpenOptions::new().create(true).write(true).append(resumed).truncate(!resumed).open(part).await?;
    let mut received = if resumed { have } else { 0 };

    while let Some(chunk) = response.chunk().await.map_err(download_error)? {
        if cancel.load(Ordering::Relaxed) {
            return Ok(false);
        }
        out.write_all(&chunk).await?;
        received += chunk.len() as u64;
        reporter.progress(before + received);
    }
    out.flush().await?;
    if received != file.bytes {
        return Err(LocalError::Download(format!("{}: received {received} of {} bytes", file.name, file.bytes)));
    }
    Ok(true)
}

fn download_error(error: reqwest::Error) -> LocalError {
    LocalError::Download(error.to_string())
}

fn sha256_hex(path: &Path) -> Result<String, LocalError> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_whole_part_is_checked_not_fetched_and_an_oversized_one_starts_over() {
        assert_eq!(resume_from(0, 100), Some(0));
        assert_eq!(resume_from(40, 100), Some(40));
        assert_eq!(resume_from(100, 100), None);
        assert_eq!(resume_from(120, 100), Some(0));
    }

    #[test]
    fn sha256_of_known_bytes() {
        let path = std::env::temp_dir().join("roci-models-sha-test");
        fs::write(&path, b"abc").unwrap();
        assert_eq!(sha256_hex(&path).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn a_file_sits_where_the_directory_s_layout_puts_it() {
        let model = catalog::find("nemotron-3.5-bolt-e4b").unwrap();
        let draft = model.files.iter().find(|f| f.name.contains("DFlash")).unwrap();
        let roci = std::env::temp_dir().join("roci-store-layout-roci");
        fs::create_dir_all(&roci).unwrap();
        assert_eq!(path_in(&roci, model, draft), roci.join("nemotron-3.5-bolt-e4b").join(draft.name));
        let hub = std::env::temp_dir().join("roci-store-layout/huggingface/hub");
        let path = path_in(&hub, model, draft);
        assert!(path.starts_with(hub.join("models--nvidia--NVIDIA-Nemotron-3.5-Bolt-E4B-4GB-DFlash/snapshots")));
        assert!(path.ends_with(draft.name));
    }

    #[test]
    fn a_snapshot_links_to_its_blob_two_levels_up() {
        let repo = Path::new("/hub/models--org--repo");
        let blob = repo.join("blobs/abc");
        assert_eq!(relative_blob(&repo.join("snapshots/rev1/model.gguf"), &blob), PathBuf::from("../../blobs/abc"));
    }

    /// Which catalog models a real directory holds, by exact file and size: `ROCI_MODEL_DIR` (e.g. a Hugging Face cache).
    #[test]
    #[ignore = "reads a real model directory"]
    fn a_real_directory_s_models() {
        let root = PathBuf::from(std::env::var("ROCI_MODEL_DIR").unwrap());
        println!("LAYOUT {:?}", layout_of(&root));
        for model in catalog::MODELS {
            let have = model.files.iter().filter(|f| fs::metadata(path_in(&root, model, f)).is_ok_and(|m| m.len() == f.bytes)).count();
            println!("MODEL {:<24} {have}/{} files", model.id, model.files.len());
        }
    }

    #[test]
    fn a_folder_the_presets_cant_hold_is_refused() {
        for name in ["a;b", "a#b", "a\nb", "a\rb"] {
            let dir = std::env::temp_dir().join(name);
            assert!(matches!(set_directory(Some(dir.clone())), Err(LocalError::BadInput(_))), "{name:?}");
            assert!(!dir.exists());
        }
    }

    #[test]
    fn one_download_per_model() {
        let downloads = Downloads::default();
        assert!(downloads.begin("a").is_some());
        assert!(downloads.begin("a").is_none());
        downloads.end("a");
        assert!(downloads.begin("a").is_some());
    }
}
