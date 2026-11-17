
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
    /// System Audio Recording for the process tap; Screen Recording also counts, for the fallback.
    SystemAudio,
}

impl PermissionKind {
    /// What a recording needs, in the order the checklist shows them.
    #[cfg(target_os = "macos")]
    pub const ALL: [Self; 2] = [Self::Microphone, Self::SystemAudio];
    /// iPhone and iPad record the microphone only.
    #[cfg(target_os = "ios")]
    pub const ALL: [Self; 1] = [Self::Microphone];
}

/// One checklist row: a permission and how it stands now.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct PermissionRow {
    pub kind: PermissionKind,
    pub state: PermissionState,
}
