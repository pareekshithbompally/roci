//! Model storage under `<app data>/models/<id>/`: resumable `.part` downloads checked by size and SHA-256.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use super::catalog::{LocalModel, ModelFile};
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

/// The model's folder (created on first use).
pub fn model_dir(app: &AppHandle, model: &LocalModel) -> Result<PathBuf, LocalError> {
    let dir = app.path().app_data_dir().map_err(|e| LocalError::Io(e.to_string()))?.join("models").join(model.id);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn has_file(dir: &Path, file: &ModelFile) -> bool {
    fs::metadata(dir.join(file.name)).is_ok_and(|m| m.len() == file.bytes)
}

pub fn is_installed(dir: &Path, model: &LocalModel) -> bool {
    model.files.iter().all(|f| has_file(dir, f))
}

/// The model's folder, or `NotDownloaded` until every file is there.
pub fn installed_dir(app: &AppHandle, model: &LocalModel) -> Result<PathBuf, LocalError> {
    let dir = model_dir(app, model)?;
    if is_installed(&dir, model) { Ok(dir) } else { Err(LocalError::NotDownloaded) }
}

/// Deletes the model's folder, partial downloads included.
pub fn remove(app: &AppHandle, model: &LocalModel) -> Result<(), LocalError> {
    let dir = model_dir(app, model)?;
    fs::remove_dir_all(dir)?;
    Ok(())
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
    let outcome = match model_dir(app, model) {
        Ok(dir) => fetch_all(model, &dir, cancel, &mut reporter).await,
        Err(error) => Err(error),
    };
    match outcome {
        Ok(state) => reporter.emit(state, model.bytes(), None),
        Err(error) => {
            log::error!("[models] download of {} failed: {error}", model.id);
            reporter.emit(DownloadState::Failed, 0, Some(error.to_string()));
        }
    }
}

/// Every file not already in place, in order; Done, or Cancelled midway.
async fn fetch_all(model: &'static LocalModel, dir: &Path, cancel: &AtomicBool, reporter: &mut Reporter<'_>) -> Result<DownloadState, LocalError> {
    let mut done = 0;
    for file in model.files {
        if !has_file(dir, file) {
            let part = dir.join(format!("{}.part", file.name));
            if let Some(parent) = part.parent() {
                fs::create_dir_all(parent)?; // voice files sit in a subfolder
            }
            if !fetch(&model.url(file), file, &part, done, cancel, reporter).await? {
                return Ok(DownloadState::Cancelled);
            }
            reporter.emit(DownloadState::Verifying, done + file.bytes, None);
            verify_and_place(file, &part, &dir.join(file.name)).await?;
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
    fs::rename(part, target)?;
    Ok(())
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
    fn one_download_per_model() {
        let downloads = Downloads::default();
        assert!(downloads.begin("a").is_some());
        assert!(downloads.begin("a").is_none());
        downloads.end("a");
        assert!(downloads.begin("a").is_some());
    }
}
