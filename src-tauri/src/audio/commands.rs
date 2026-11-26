use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, TryLockError};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::{MeetingCreateInput, MeetingStatus};

use super::recorder::{Recorder, Sources};
use super::recovery;
use crate::permissions::{self, PermissionKind};

/// Recordings live in the store's one folder of kept files, one `{meeting id}.wav` each (and its track folder while it records).
const RECORDINGS_DIR: &str = tauri_plugin_store::ASSETS_DIR;

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
    /// The chosen speech model streams: the in-call audio goes to the webview as frames, not chunks.
    #[serde(default)]
    pub live_streaming: bool,
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
    /// A call paused it (not the user), so the call's end may resume it; iPhone only.
    paused_by_call: bool,
    /// Its in-call audio goes out as frames for a streaming speech model.
    live_streaming: bool,
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
        /// The in-call audio goes out as frames (the speech model chosen at Record streams), not chunks.
        live_streaming: bool,
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
            live_streaming: active.live_streaming,
        }
    }
}

static RECORDER: Mutex<Option<Active>> = Mutex::new(None);

fn recorder() -> MutexGuard<'static, Option<Active>> {
    RECORDER.lock().unwrap_or_else(|error| error.into_inner())
}

/// Webview: the recorder changed by itself (an iPhone call paused or resumed it); the views read its state again.
#[cfg(target_os = "ios")]
pub const CHANGED_EVENT: &str = "recorder://changed";

/// Whether a recording is running; never waits, and a start or stop in progress counts as recording.
pub fn is_recording() -> bool {
    match RECORDER.try_lock() {
        Ok(active) => active.is_some(),
        Err(TryLockError::WouldBlock) => true,
        Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner().is_some(),
    }
}

/// Whether a recording is capturing, for the quit and close prompts; a start or stop in progress counts.
#[cfg(target_os = "macos")]
pub fn capture_active() -> bool {
    is_recording()
}

/// Finishes a running recording's tracks on exit; the meeting stays `recording` until the next launch mixes it.
#[cfg(target_os = "macos")]
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
    #[cfg(target_os = "ios")]
    {
        if options.source != AudioCaptureSource::Microphone {
            return Err(eyre::eyre!("this device records the microphone only").into());
        }
        // The first Record shows iOS's microphone prompt here, at the point of use.
        permissions::ios::ask_microphone_if_undecided().await;
    }
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
            transcript: None,
        },
    )?;
    let output = recordings_path(app)?.join(file_name);
    tracing::info!(output = %output.display(), "audio capture starting");
    match open_session().and_then(|()| Recorder::start(options.source.sources(), output, app.clone(), options.live_streaming)) {
        Ok(started) => {
            *active = Some(Active { meeting_id: meeting_id.clone(), recorder: started, paused_by_call: false, live_streaming: options.live_streaming });
            Ok(meeting_id)
        }
        Err(error) => {
            close_session();
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
    let Active { meeting_id, recorder, .. } = active;
    let (status, duration) = outcome(recorder.stop());
    close_session();
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

/// iPhone and iPad: hold the audio session for recording while a recording runs; the Mac has none.
/// iPhone: the session opens with the recording (start, resume), so meeting reminders hold off meanwhile, as the Mac's
/// menu bar tells them.
#[cfg(target_os = "ios")]
fn open_session() -> eyre::Result<()> {
    crate::audio_session::activate(crate::audio_session::Use::Record).map_err(|error| eyre::eyre!(error))?;
    crate::meeting_reminders::recording_changed(true);
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_session() -> eyre::Result<()> {
    Ok(())
}

#[cfg(target_os = "ios")]
fn close_session() {
    crate::audio_session::deactivate(crate::audio_session::Use::Record);
    crate::meeting_reminders::recording_changed(false);
}

#[cfg(target_os = "macos")]
fn close_session() {}

/// iPhone and iPad: a call or Siri took the audio (`began`), or gave it back; only a pause the call made is undone.
#[cfg(target_os = "ios")]
pub fn interrupted(app: &AppHandle, began: bool) {
    use tauri::Emitter;
    let app = app.clone();
    // Off the notification thread: a Stop holds the recorder lock through its mixdown.
    tauri::async_runtime::spawn_blocking(move || {
        {
            let mut active = recorder();
            let Some(active) = active.as_mut() else { return };
            if began && !active.recorder.progress().paused {
                active.recorder.pause();
                active.paused_by_call = true;
            } else if !began && active.paused_by_call {
                active.paused_by_call = false;
                match open_session() {
                    Ok(()) => active.recorder.resume(),
                    Err(error) => tracing::warn!(%error, "could not take the audio session back after a call; staying paused"),
                }
            }
        }
        if let Err(error) = app.emit(CHANGED_EVENT, ()) {
            tracing::warn!(%error, "recorder change event failed");
        }
    });
}

#[tauri::command]
pub async fn pause_audio_capture() {
    if let Some(active) = recorder().as_mut() {
        active.paused_by_call = false;
        active.recorder.pause();
    }
}

#[tauri::command]
/// Resumes a paused recording; on iPhone it first takes the audio session back (a call may have ended without it).
pub async fn resume_audio_capture() -> Result<(), CaptureError> {
    if let Some(active) = recorder().as_mut() {
        open_session()?;
        active.paused_by_call = false;
        active.recorder.resume();
    }
    Ok(())
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
        Ok(tauri_plugin_store::interrupted_meetings(&app)?)
    })
    .await
    .map_err(|error| eyre::eyre!("recording recovery task failed: {error}"))?
}

fn recover_meeting(recordings: &Path, id: &str) -> eyre::Result<f64> {
    recovery::recover(&recordings.join(id), &recordings.join(format!("{id}.wav")))
}
