use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, TryLockError};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::recorder::{Recorder, Sources};
use super::recovery::{self, Recovered};
use crate::permissions::{self, PermissionKind};

/// Capture source: the three capture members of the frontend
/// `AudioCaptureSource` union (its `file-upload` is never captured).
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AudioCaptureSource {
    System,
    Microphone,
    SystemAndMicrophone,
}

impl AudioCaptureSource {
    /// The permissions this source records with.
    fn needs(self) -> &'static [PermissionKind] {
        match self {
            AudioCaptureSource::System => &[PermissionKind::SystemAudio],
            AudioCaptureSource::Microphone => &[PermissionKind::Microphone],
            AudioCaptureSource::SystemAndMicrophone => {
                &[PermissionKind::Microphone, PermissionKind::SystemAudio]
            }
        }
    }

    /// The source a recovered recording was captured with, from its tracks.
    fn recorded(has_system: bool, has_microphone: bool) -> Self {
        match (has_system, has_microphone) {
            (true, true) => AudioCaptureSource::SystemAndMicrophone,
            (true, false) => AudioCaptureSource::System,
            _ => AudioCaptureSource::Microphone,
        }
    }

    fn sources(self) -> Sources {
        Sources {
            microphone: self != AudioCaptureSource::System,
            system: self != AudioCaptureSource::Microphone,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureOptions {
    pub source: AudioCaptureSource,
    pub file_name: Option<String>,
    pub recordings_dir: Option<String>,
}

/// Why a capture command failed, for the frontend to branch on `code`.
#[derive(Debug, Serialize)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum CaptureError {
    /// A permission is missing: no error tone, the checklist opens.
    Permission { kind: PermissionKind },
    Capture { message: String },
}

impl From<eyre::Report> for CaptureError {
    fn from(error: eyre::Report) -> Self {
        Self::Capture {
            message: format!("{error:#}"),
        }
    }
}

static RECORDER: Mutex<Option<Recorder>> = Mutex::new(None);

fn recorder() -> MutexGuard<'static, Option<Recorder>> {
    RECORDER.lock().unwrap_or_else(|error| error.into_inner())
}

/// Whether a recording is running. Never waits: a start or stop in progress
/// holds the slot, and counts as recording.
pub fn is_recording() -> bool {
    match RECORDER.try_lock() {
        Ok(active) => active.is_some(),
        Err(TryLockError::WouldBlock) => true,
        Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner().is_some(),
    }
}

/// Whether a recording is capturing, for the quit and window-close prompts.
/// A recorder held by a start or stop in progress counts as capturing.
pub fn capture_active() -> bool {
    match RECORDER.try_lock() {
        Ok(active) => active.is_some(),
        Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner().is_some(),
        Err(TryLockError::WouldBlock) => true,
    }
}

/// Finishes a running recording's tracks so the next launch recovers it;
/// called as the app exits.
pub fn abandon_active() {
    if let Some(active) = recorder().take() {
        active.abandon();
    }
}

fn recordings_path(app: &AppHandle, recordings_dir: Option<String>) -> eyre::Result<PathBuf> {
    let data_dir = app.path().app_data_dir()?;
    let recordings_path = data_dir.join(recordings_dir.unwrap_or_else(|| "recordings".into()));
    std::fs::create_dir_all(&recordings_path)?;
    Ok(recordings_path)
}

fn create_output_path(
    app: &AppHandle,
    file_name: Option<String>,
    recordings_dir: Option<String>,
) -> eyre::Result<PathBuf> {
    let recordings_path = recordings_path(app, recordings_dir)?;
    let filename = file_name.unwrap_or_else(|| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("recording_{ts}.wav")
    });
    Ok(recordings_path.join(filename))
}

#[tauri::command]
pub async fn start_audio_capture(
    app: AppHandle,
    options: AudioCaptureOptions,
) -> Result<(), CaptureError> {
    if let Some(kind) = permissions::missing(options.source.needs()) {
        return Err(CaptureError::Permission { kind });
    }
    tauri::async_runtime::spawn_blocking(move || start(app, options))
        .await
        .map_err(|error| eyre::eyre!("audio start task failed: {error}"))??;
    Ok(())
}

/// Starts a recording, holding the recorder for the whole start so two
/// starts never interleave. A recording still running (the frontend lost
/// it, e.g. on reload) is left for recovery, never discarded.
fn start(app: AppHandle, options: AudioCaptureOptions) -> eyre::Result<()> {
    let mut active = recorder();
    if let Some(previous) = active.take() {
        previous.abandon();
    }
    let output = create_output_path(&app, options.file_name, options.recordings_dir)?;
    tracing::info!(output = %output.display(), "audio capture starting");
    *active = Some(Recorder::start(options.source.sources(), output, app)?);
    Ok(())
}

/// Stops the recording and returns the mixed file's path; `None` when no
/// recording was running.
#[tauri::command]
pub async fn stop_audio_capture() -> Result<Option<String>, CaptureError> {
    // Stopping joins the capture threads and writes the mix: blocking work,
    // kept off the async runtime so other IPC never stalls. The recorder stays
    // held until the mix is written, so nothing (recovery, a quit) sees its
    // tracks as abandoned mid-stop.
    let output = tauri::async_runtime::spawn_blocking(|| {
        let mut active = recorder();
        active.take().map(Recorder::stop).transpose()
    })
    .await
    .map_err(|error| eyre::eyre!("audio stop task failed: {error}"))??;
    if let Some(output) = &output {
        tracing::info!(output = %output.display(), "audio capture stopped");
    }
    Ok(output.map(|output| output.to_string_lossy().into_owned()))
}

#[tauri::command]
pub async fn pause_audio_capture() {
    if let Some(active) = recorder().as_ref() {
        active.pause();
    }
}

#[tauri::command]
pub async fn resume_audio_capture() {
    if let Some(active) = recorder().as_ref() {
        active.resume();
    }
}

/// A recording recovered at launch, for the frontend to add to history.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredRecording {
    /// The mixed file's name inside the recordings directory.
    pub file_name: String,
    pub source: AudioCaptureSource,
    pub duration_secs: u64,
    pub size: u64,
    pub recorded_at_ms: u64,
}

impl From<Recovered> for RecoveredRecording {
    fn from(recovered: Recovered) -> Self {
        Self {
            file_name: recovered
                .path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            source: AudioCaptureSource::recorded(recovered.has_system, recovered.has_microphone),
            duration_secs: recovered.duration_secs,
            size: recovered.size,
            recorded_at_ms: recovered.recorded_at_ms,
        }
    }
}

/// Mixes down recordings a quit, crash, or failed mix left as tracks. It holds
/// the recorder, and does nothing while a recording runs, so a recording's
/// own tracks are never touched.
#[tauri::command]
pub async fn recover_recordings(
    app: AppHandle,
    recordings_dir: Option<String>,
) -> Result<Vec<RecoveredRecording>, CaptureError> {
    let recordings = recordings_path(&app, recordings_dir)?;
    let recovered = tauri::async_runtime::spawn_blocking(move || {
        let active = recorder();
        if active.is_some() {
            return Ok(Vec::new());
        }
        recovery::recover(&recordings)
    })
    .await
        .map_err(|error| eyre::eyre!("recording recovery task failed: {error}"))??;
    Ok(recovered.into_iter().map(RecoveredRecording::from).collect())
}
