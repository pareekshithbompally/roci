//! iPhone and iPad: the app's one AVAudioSession. Recording and read aloud both go through it, and recording takes precedence.
//! Its events (interruptions, route changes, a media-services reset) arrive as native notifications, never polled.

use std::ptr::NonNull;
use std::sync::{Mutex, MutexGuard, OnceLock};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_avf_audio::{
    AVAudioSession, AVAudioSessionCategoryOptions, AVAudioSessionCategoryPlayAndRecord, AVAudioSessionCategoryPlayback,
    AVAudioSessionInterruptionNotification, AVAudioSessionInterruptionOptionKey, AVAudioSessionInterruptionOptions,
    AVAudioSessionInterruptionType, AVAudioSessionInterruptionTypeKey, AVAudioSessionMediaServicesWereResetNotification,
    AVAudioSessionModeDefault, AVAudioSessionRouteChangeNotification, AVAudioSessionSetActiveOptions,
};
use objc2_foundation::{NSError, NSNotification, NSNotificationCenter, NSNumber, NSString};

/// What the session is set up for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Use {
    /// A meeting recording: play-and-record, Bluetooth headset mics allowed, playback on the speaker.
    Record,
    /// Read aloud: playback, heard with the silent switch on.
    Playback,
}

/// What the session reported.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionEvent {
    /// A call, Siri or an alarm took the audio.
    InterruptionBegan,
    /// The interruption ended; `should_resume` is the system's word on picking up again.
    InterruptionEnded { should_resume: bool },
    /// An input or output came or went (headset, AirPods).
    RouteChanged,
    /// The media services restarted: every audio object must be rebuilt.
    MediaServicesReset,
}

/// Who holds the session now.
static HOLDER: Mutex<Option<Use>> = Mutex::new(None);

fn holder() -> MutexGuard<'static, Option<Use>> {
    HOLDER.lock().unwrap_or_else(|error| error.into_inner())
}

fn describe(error: Retained<NSError>) -> String {
    error.localizedDescription().to_string()
}

/// Sets the session up for `want` and activates it; playback is refused while a recording holds it.
pub fn activate(want: Use) -> Result<(), String> {
    let mut held = holder();
    if want == Use::Playback && *held == Some(Use::Record) {
        return Err("a recording is using the audio session".into());
    }
    // SAFETY: the shared session and Apple's category and mode constants; both calls are documented as thread-safe.
    unsafe {
        let (category, options) = match want {
            Use::Record => (
                AVAudioSessionCategoryPlayAndRecord,
                AVAudioSessionCategoryOptions::AllowBluetoothHFP | AVAudioSessionCategoryOptions::DefaultToSpeaker,
            ),
            Use::Playback => (AVAudioSessionCategoryPlayback, AVAudioSessionCategoryOptions::empty()),
        };
        let category = category.ok_or("this system has no such audio category")?;
        let mode = AVAudioSessionModeDefault.ok_or("this system has no default audio mode")?;
        let session = AVAudioSession::sharedInstance();
        session.setCategory_mode_options_error(category, mode, options).map_err(describe)?;
        session.setActive_error(true).map_err(describe)?;
    }
    *held = Some(want);
    Ok(())
}

/// Lets the session go after `done`, so other apps' audio resumes; a no-op when someone else holds it.
pub fn deactivate(done: Use) {
    let mut held = holder();
    if *held != Some(done) {
        return;
    }
    *held = None;
    // SAFETY: the shared session; deactivating is documented as thread-safe.
    let result = unsafe {
        AVAudioSession::sharedInstance()
            .setActive_withOptions_error(false, AVAudioSessionSetActiveOptions::NotifyOthersOnDeactivation)
    };
    if let Err(error) = result {
        tracing::warn!(error = %describe(error), "could not release the audio session");
    }
}

/// The number under `key` in a notification's `userInfo`.
fn user_info_number(notification: &NSNotification, key: Option<&NSString>) -> Option<usize> {
    let value = notification.userInfo()?.objectForKey(key?)?;
    Some(value.downcast::<NSNumber>().ok()?.unsignedIntegerValue())
}

fn interruption(notification: &NSNotification) -> Option<SessionEvent> {
    // SAFETY: Apple's userInfo key constants.
    let (type_key, option_key) = unsafe { (AVAudioSessionInterruptionTypeKey, AVAudioSessionInterruptionOptionKey) };
    let kind = AVAudioSessionInterruptionType(user_info_number(notification, type_key)?);
    if kind == AVAudioSessionInterruptionType::Began {
        return Some(SessionEvent::InterruptionBegan);
    }
    let options = AVAudioSessionInterruptionOptions(user_info_number(notification, option_key).unwrap_or(0));
    Some(SessionEvent::InterruptionEnded { should_resume: options.contains(AVAudioSessionInterruptionOptions::ShouldResume) })
}

static HANDLER: OnceLock<Box<dyn Fn(SessionEvent) + Send + Sync>> = OnceLock::new();

/// Calls `handler` for every session event; call once at setup (later calls are ignored).
pub fn observe(handler: impl Fn(SessionEvent) + Send + Sync + 'static) {
    if HANDLER.set(Box::new(handler)).is_err() {
        return;
    }
    let dispatch = |event: Option<SessionEvent>| {
        if let (Some(event), Some(handler)) = (event, HANDLER.get()) {
            handler(event);
        }
    };
    // SAFETY: Apple's notification name constants and the default centre; observers run on the posting thread.
    unsafe {
        let center = NSNotificationCenter::defaultCenter();
        let watched: [(_, fn(&NSNotification) -> Option<SessionEvent>); 3] = [
            (AVAudioSessionInterruptionNotification, interruption),
            (AVAudioSessionRouteChangeNotification, |_| Some(SessionEvent::RouteChanged)),
            (AVAudioSessionMediaServicesWereResetNotification, |_| Some(SessionEvent::MediaServicesReset)),
        ];
        for (name, read) in watched {
            let block = RcBlock::new(move |notification: NonNull<NSNotification>| dispatch(read(notification.as_ref())));
            let observer = center.addObserverForName_object_queue_usingBlock(name, None, None, &block);
            // Observed for the app's lifetime: the token is never removed.
            std::mem::forget(observer);
        }
    }
}
