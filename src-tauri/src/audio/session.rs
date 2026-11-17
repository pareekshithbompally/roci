//! iPhone and iPad: audio-session events reach the recorder (an interruption pauses and resumes it) and the microphone
//! (a route change or media-services reset reopens it), the way Core Audio listeners drive them on the Mac.

use tauri::AppHandle;

use crate::audio_session::{self, SessionEvent};

use super::commands;
use super::microphone;

/// Routes every session event; call once at setup.
pub fn watch(app: AppHandle) {
    audio_session::observe(move |event| match event {
        SessionEvent::InterruptionBegan => commands::interrupted(&app, true),
        SessionEvent::InterruptionEnded { should_resume } => {
            if should_resume {
                commands::interrupted(&app, false);
            }
        }
        SessionEvent::RouteChanged => microphone::notify_input_route_changed(),
        SessionEvent::MediaServicesReset => microphone::notify_audio_service_restarted(),
    });
}
