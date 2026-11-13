use serde::{Deserialize, Serialize};

use crate::permissions::PermissionKind;

/// Capture source, kept in sync with the Swift `Source` enum (0/1/2) and the
/// frontend `AudioCaptureSource` union.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AudioCaptureSource {
    System,
    Microphone,
    SystemAndMicrophone,
}

impl AudioCaptureSource {
    /// FFI tag passed to the Swift bridge.
    pub fn tag(self) -> i32 {
        match self {
            AudioCaptureSource::System => 0,
            AudioCaptureSource::Microphone => 1,
            AudioCaptureSource::SystemAndMicrophone => 2,
        }
    }

    /// The permissions this source records with.
    pub fn needs(self) -> &'static [PermissionKind] {
        match self {
            AudioCaptureSource::System => &[PermissionKind::SystemAudio],
            AudioCaptureSource::Microphone => &[PermissionKind::Microphone],
            AudioCaptureSource::SystemAndMicrophone => {
                &[PermissionKind::Microphone, PermissionKind::SystemAudio]
            }
        }
    }
}

/// Why `start_audio_capture` refused, for the frontend to branch on `code`.
#[derive(Debug, Serialize)]
#[serde(tag = "code", rename_all = "kebab-case")]
pub enum CaptureError {
    /// A permission is missing: no error tone, the checklist opens.
    Permission { kind: PermissionKind },
    Capture { message: String },
}

impl From<String> for CaptureError {
    fn from(message: String) -> Self {
        Self::Capture { message }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureOptions {
    pub source: AudioCaptureSource,
    pub file_name: Option<String>,
    pub recordings_dir: Option<String>,
}
