//! iPhone and iPad: microphone consent through AVAudioApplication; iOS has no system-audio recording.

use std::sync::OnceLock;

use block2::RcBlock;
use objc2::runtime::Bool;
use objc2_avf_audio::{AVAudioApplication, AVAudioApplicationRecordPermission};

use super::state::{PermissionKind, PermissionState};

static ON_ANSWERED: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

/// Runs `handler` each time the user answers a consent prompt.
pub(crate) fn on_answered(handler: impl Fn() + Send + Sync + 'static) {
    let _ = ON_ANSWERED.set(Box::new(handler));
}

fn answered() {
    if let Some(handler) = ON_ANSWERED.get() {
        handler();
    }
}

/// How `kind` stands now; never prompts.
pub fn state(kind: PermissionKind) -> PermissionState {
    match kind {
        PermissionKind::Microphone => microphone_state(),
        PermissionKind::SystemAudio => PermissionState::NeedsSettings,
    }
}

fn microphone_state() -> PermissionState {
    // SAFETY: the shared application object; reading the permission is documented as thread-safe.
    let permission = unsafe { AVAudioApplication::sharedInstance().recordPermission() };
    match permission {
        AVAudioApplicationRecordPermission::Granted => PermissionState::Ready,
        AVAudioApplicationRecordPermission::Undetermined => PermissionState::NeedsRequest,
        _ => PermissionState::NeedsSettings,
    }
}

/// Asks iOS for `kind` (its prompt shows only while undecided); `done` runs with the answer.
pub fn ask(kind: PermissionKind, done: impl Fn(bool) + Send + Sync + 'static) {
    if kind != PermissionKind::Microphone {
        return done(false);
    }
    let block = RcBlock::new(move |granted: Bool| {
        answered();
        done(granted.as_bool());
    });
    // SAFETY: Apple's request; the completion runs once on an arbitrary queue.
    unsafe { AVAudioApplication::requestRecordPermissionWithCompletionHandler(&block) };
}

/// Asks for `kind`; the answer reaches the webview through the answered event.
pub fn request(kind: PermissionKind) {
    ask(kind, |_| {});
}

/// Waits for the microphone answer when iOS has not asked yet, so the first Record shows the system prompt at the point of use.
pub async fn ask_microphone_if_undecided() {
    if microphone_state() != PermissionState::NeedsRequest {
        return;
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = std::sync::Mutex::new(Some(sender));
    ask(PermissionKind::Microphone, move |granted| {
        if let Some(sender) = sender.lock().unwrap_or_else(|error| error.into_inner()).take() {
            let _ = sender.send(granted);
        }
    });
    let _ = receiver.await;
}
