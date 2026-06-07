use serde::{Deserialize, Serialize};

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
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureOptions {
    pub source: AudioCaptureSource,
    pub file_name: Option<String>,
    pub recordings_dir: Option<String>,
}
