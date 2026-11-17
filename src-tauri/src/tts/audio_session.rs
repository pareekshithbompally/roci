//! iPhone and iPad: read aloud plays in the `.playback` audio session (heard with the silent switch on); the Mac has none.
//! Interim: the recorder lane's shared audio-session module replaces this once it lands (recording takes precedence).

use crate::models::LocalError;

#[cfg(target_os = "ios")]
pub fn for_playback() -> Result<(), LocalError> {
    use objc2_avf_audio::{AVAudioSession, AVAudioSessionCategoryPlayback};
    let failed = |e: objc2::rc::Retained<objc2_foundation::NSError>| LocalError::Engine(e.localizedDescription().to_string());
    // SAFETY: the shared session and Apple's category constant; both calls are documented as thread-safe.
    unsafe {
        let session = AVAudioSession::sharedInstance();
        let playback = AVAudioSessionCategoryPlayback.ok_or_else(|| LocalError::Engine("no playback audio category".into()))?;
        session.setCategory_error(playback).map_err(failed)?;
        session.setActive_error(true).map_err(failed)
    }
}

#[cfg(not(target_os = "ios"))]
pub fn for_playback() -> Result<(), LocalError> {
    Ok(())
}
