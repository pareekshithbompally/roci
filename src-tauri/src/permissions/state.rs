
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionState {
    Ready,
    /// macOS has not asked yet; asking shows its own prompt.
    NeedsRequest,
    /// Refused before: only System Settings can turn it on.
    NeedsSettings,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PermissionKind {
    Microphone,
    /// System Audio Recording, which the process tap needs. Screen Recording
    /// also counts: the ScreenCaptureKit fallback hears the system with it.
    SystemAudio,
}

impl PermissionKind {
    /// What a recording needs, in the order the checklist shows them.
    pub const ALL: [Self; 2] = [Self::Microphone, Self::SystemAudio];
}

/// One checklist row: a permission and how it stands now.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct PermissionRow {
    pub kind: PermissionKind,
    pub state: PermissionState,
}
