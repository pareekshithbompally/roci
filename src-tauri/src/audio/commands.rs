use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, TryLockError};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::{MeetingCreateInput, MeetingStatus};

use super::recorder::{Recorder, Sources};
use super::recovery;
use crate::permissions::{self, PermissionKind};

/// Recordings live in this folder of the app data directory, one `{meeting id}.wav` each.
const RECORDINGS_DIR: &str = "recordings";

/// The capture members of the frontend `AudioCaptureSource` union (`file-upload` is never captured).
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

    /// The name the meeting stores as its input source.
    fn name(self) -> &'static str {
        match self {
            AudioCaptureSource::System => "system",
            AudioCaptureSource::Microphone => "microphone",
            AudioCaptureSource::SystemAndMicrophone => "systemAndMicrophone",
        }
    }

    fn sources(self) -> Sources {
        Sources {
            microphone: self != AudioCaptureSource::System,
            system: self != AudioCaptureSource::Microphone,
        }
    }
}

/// What Record needs to create the meeting before capture starts.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureOptions {
    pub source: AudioCaptureSource,
    pub title: String,
    pub calendar_event_id: Option<String>,
    /// The calendar event as JSON, stored with the meeting.
    pub calendar_meta: Option<String>,
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

impl From<tauri_plugin_store::StoreError> for CaptureError {
    fn from(error: tauri_plugin_store::StoreError) -> Self {
        Self::Capture { message: error.message }
    }
}

/// The running recording and the meeting it belongs to.
struct Active {
    meeting_id: String,
    recorder: Recorder,
}

/// What the recorder is doing: the one source of truth for every view of the live recording.
#[derive(Debug, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum RecorderState {
    Idle,
    Recording {
        meeting_id: String,
        /// Time captured so far, pauses excluded.
        recorded_ms: u64,
        paused: bool,
    },
}

impl RecorderState {
    fn of(active: Option<&Active>) -> Self {
        let Some(active) = active else {
            return Self::Idle;
        };
        let progress = active.recorder.progress();
        Self::Recording {
            meeting_id: active.meeting_id.clone(),
            recorded_ms: u64::try_from(progress.recorded.as_millis()).unwrap_or(u64::MAX),
            paused: progress.paused,
        }
    }
}

static RECORDER: Mutex<Option<Active>> = Mutex::new(None);

fn recorder() -> MutexGuard<'static, Option<Active>> {
    RECORDER.lock().unwrap_or_else(|error| error.into_inner())
}

/// Whether a recording is running; never waits, and a start or stop in progress counts as recording.
pub fn is_recording() -> bool {
    match RECORDER.try_lock() {
        Ok(active) => active.is_some(),
        Err(TryLockError::WouldBlock) => true,
        Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner().is_some(),
    }
}

/// Whether a recording is capturing, for the quit and close prompts; a start or stop in progress counts.
pub fn capture_active() -> bool {
    is_recording()
}

/// Finishes a running recording's tracks on exit; the meeting stays `recording` until the next launch mixes it.
pub fn abandon_active() {
    if let Some(active) = recorder().take() {
        active.recorder.abandon();
    }
}

fn recordings_path(app: &AppHandle) -> eyre::Result<PathBuf> {
    let recordings = app.path().app_data_dir()?.join(RECORDINGS_DIR);
    std::fs::create_dir_all(&recordings)?;
    Ok(recordings)
}

/// `rec_{epoch ms}_{8 hex}`, the meeting id and its recording's file stem.
fn new_meeting_id() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    format!("rec_{}_{:08x}", now.as_millis(), now.subsec_nanos() ^ std::process::id())
}

/// Starts recording a new meeting and returns its id.
#[tauri::command]
pub async fn start_audio_capture(
    app: AppHandle,
    options: AudioCaptureOptions,
) -> Result<String, CaptureError> {
    if let Some(kind) = permissions::missing(options.source.needs()) {
        return Err(CaptureError::Permission { kind });
    }
    tauri::async_runtime::spawn_blocking(move || start(&app, options))
        .await
        .map_err(|error| eyre::eyre!("audio start task failed: {error}"))?
}

/// Creates the meeting, then starts capture under the recorder lock; a refused capture removes the meeting.
fn start(app: &AppHandle, options: AudioCaptureOptions) -> Result<String, CaptureError> {
    let mut active = recorder();
    if let Some(previous) = active.take() {
        finish(app, previous)?;
    }
    let meeting_id = new_meeting_id();
    let file_name = format!("{meeting_id}.wav");
    tauri_plugin_store::create_meeting(
        app,
        &MeetingCreateInput {
            id: meeting_id.clone(),
            title: options.title,
            status: "recording".into(),
            input_source: Some(options.source.name().into()),
            recording_filename: Some(file_name.clone()),
            calendar_event_id: options.calendar_event_id,
            calendar_meta: options.calendar_meta,
            created_at: None,
        },
    )?;
    let output = recordings_path(app)?.join(file_name);
    tracing::info!(output = %output.display(), "audio capture starting");
    match Recorder::start(options.source.sources(), output, app.clone()) {
        Ok(started) => {
            *active = Some(Active { meeting_id: meeting_id.clone(), recorder: started });
            Ok(meeting_id)
        }
        Err(error) => {
            if let Err(cleanup) = tauri_plugin_store::delete_meeting(app, &meeting_id) {
                tracing::error!(%cleanup, meeting_id, "could not remove a meeting whose capture never started");
            }
            Err(error.into())
        }
    }
}

/// Stops the recording and returns its meeting id (`None` when none was running); the meeting becomes `captured`.
#[tauri::command]
pub async fn stop_audio_capture(app: AppHandle) -> Result<Option<String>, CaptureError> {
    // The recorder stays held while stopping so nothing sees the tracks as abandoned.
    tauri::async_runtime::spawn_blocking(move || {
        let mut active = recorder();
        active.take().map(|running| finish(&app, running)).transpose()
    })
    .await
    .map_err(|error| eyre::eyre!("audio stop task failed: {error}"))?
}

/// Stops capture and records the outcome on the meeting: `captured`, or `failed` at `record`.
fn finish(app: &AppHandle, active: Active) -> Result<String, CaptureError> {
    let Active { meeting_id, recorder } = active;
    let (status, duration) = outcome(recorder.stop());
    tauri_plugin_store::set_meeting_status(app, &meeting_id, &status, duration)?;
    tracing::info!(meeting_id, status = status.status, "audio capture stopped");
    Ok(meeting_id)
}

fn outcome(mixed: eyre::Result<f64>) -> (MeetingStatus, Option<f64>) {
    match mixed {
        Ok(duration) => (MeetingStatus::at("captured"), Some(duration)),
        Err(error) => (MeetingStatus::failed("record", format!("{error:#}")), None),
    }
}

/// The recorder's state; waits out a start or stop in progress, so it never reports a half-made recording.
#[tauri::command]
pub async fn recorder_state() -> Result<RecorderState, CaptureError> {
    let state = tauri::async_runtime::spawn_blocking(|| RecorderState::of(recorder().as_ref()))
        .await
        .map_err(|error| eyre::eyre!("recorder state task failed: {error}"))?;
    Ok(state)
}

#[tauri::command]
pub async fn pause_audio_capture() {
    if let Some(active) = recorder().as_ref() {
        active.recorder.pause();
    }
}

#[tauri::command]
pub async fn resume_audio_capture() {
    if let Some(active) = recorder().as_ref() {
        active.recorder.resume();
    }
}

/// At launch: mixes every meeting a quit or crash left `recording` (→ `captured`, or `failed`), and
/// returns the meetings left mid-transcription or mid-summary for the pipeline to resume.
#[tauri::command]
pub async fn recover_meetings(app: AppHandle) -> Result<Vec<String>, CaptureError> {
    tauri::async_runtime::spawn_blocking(move || {
        let active = recorder();
        let running = active.as_ref().map(|current| current.meeting_id.clone());
        let recordings = recordings_path(&app)?;
        for id in tauri_plugin_store::meetings_with_status(&app, "recording")? {
            if Some(&id) == running.as_ref() {
                continue;
            }
            let (status, duration) = outcome(recover_meeting(&recordings, &id));
            tauri_plugin_store::set_meeting_status(&app, &id, &status, duration)?;
        }
        let mut resumable = tauri_plugin_store::meetings_with_status(&app, "transcribing")?;
        resumable.extend(tauri_plugin_store::meetings_with_status(&app, "summarizing")?);
        Ok(resumable)
    })
    .await
    .map_err(|error| eyre::eyre!("recording recovery task failed: {error}"))?
}

fn recover_meeting(recordings: &Path, id: &str) -> eyre::Result<f64> {
    recovery::recover(&recordings.join(id), &recordings.join(format!("{id}.wav")))
}
