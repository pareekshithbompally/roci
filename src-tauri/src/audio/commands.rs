use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::recorder::{Recorder, Sources};
use crate::permissions::{self, PermissionKind};

/// Capture source, kept in sync with the frontend `AudioCaptureSource` union.
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

fn create_output_path(
    app: &AppHandle,
    file_name: Option<String>,
    recordings_dir: Option<String>,
) -> eyre::Result<PathBuf> {
    let data_dir = app.path().app_data_dir()?;
    let recordings_path = data_dir.join(recordings_dir.unwrap_or_else(|| "recordings".into()));
    std::fs::create_dir_all(&recordings_path)?;
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
    stop_audio_capture().await.ok();
    let output = create_output_path(&app, options.file_name, options.recordings_dir)?;
    tracing::info!(output = %output.display(), "audio capture starting");
    let started = Recorder::start(options.source.sources(), output, app)?;
    *recorder() = Some(started);
    Ok(())
}

/// Stops the recording and returns the mixed file's path; `None` when no
/// recording was running.
#[tauri::command]
pub async fn stop_audio_capture() -> Result<Option<String>, CaptureError> {
    let Some(active) = recorder().take() else {
        return Ok(None);
    };
    // Stopping joins the capture threads and writes the mix: blocking work,
    // kept off the async runtime so other IPC never stalls.
    let output = tauri::async_runtime::spawn_blocking(move || active.stop())
        .await
        .map_err(|error| eyre::eyre!("audio stop task failed: {error}"))??;
    tracing::info!(output = %output.display(), "audio capture stopped");
    Ok(Some(output.to_string_lossy().into_owned()))
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
