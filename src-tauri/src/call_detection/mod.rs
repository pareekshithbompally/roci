//! Call detection: polls mic-holding apps every 500 ms and offers a Record / Not now notification per call.

pub mod detector;
pub mod microphone;

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use tauri::AppHandle;
use tauri_plugin_notifications::{self as notifications, Action, Category, Notice, Response};

use crate::audio::commands::is_recording;
use crate::meeting_reminders::{self, TICK, wall_clock_ms};
use crate::menubar::{self, item};
use detector::{MeetingCandidate, MeetingDetector, best_candidate};
use microphone::{ActiveMicrophoneApplication, active_microphone_applications};

/// Settings › Notifications switch; muted, the detector idles.
const KIND: &str = "detectedCalls";
const ID_PREFIX: &str = "call:";
const CATEGORY: &str = "detected_call";
const BODY: &str = "Record it with Roci?";
const ACTION_RECORD: &str = "record";
const ACTION_NOT_NOW: &str = "not_now";
/// `user_info` key carrying the call app's canonical bundle id.
const APPLICATION_KEY: &str = "application";
/// After a failed microphone read, wait this long before the next.
const READ_RETRY: Duration = Duration::from_secs(2);

#[derive(Debug, PartialEq)]
enum Effect {
    Offer(MeetingCandidate),
    /// Remove the offer with this candidate key.
    Withdraw(String),
}

#[derive(Debug, PartialEq)]
enum Answer {
    Record,
    AlreadyRecording,
}

/// The detector and the offer on screen; pure, as the thread passes in what it read from the OS and clock.
#[derive(Default)]
struct Watch {
    detector: MeetingDetector,
    offer: Option<MeetingCandidate>,
    was_recording: bool,
}

impl Watch {
    /// One tick. `apps` is `None` when the microphone could not be read.
    fn step(
        &mut self,
        apps: Option<&[ActiveMicrophoneApplication]>,
        recording: bool,
        muted: bool,
        now: Instant,
        now_ms: i64,
    ) -> Vec<Effect> {
        if muted {
            let offer = std::mem::take(self).offer;
            return offer
                .map(|offer| Effect::Withdraw(offer.key))
                .into_iter()
                .collect();
        }
        let Some(apps) = apps else {
            return Vec::new();
        };
        if recording {
            self.while_recording(apps, now);
            return Vec::new();
        }
        if std::mem::take(&mut self.was_recording) {
            self.detector.recording_stopped();
        }
        let found = self.detector.detect_at(best_candidate(apps), now, now_ms);
        let mut effects = self.withdraw_if_unsnoozed();
        if let Some(candidate) = found {
            self.offer = Some(candidate.clone());
            effects.push(Effect::Offer(candidate));
        }
        effects
    }

    /// The offered call's app still on the microphone keeps its snooze alive.
    fn while_recording(&mut self, apps: &[ActiveMicrophoneApplication], now: Instant) {
        self.was_recording = true;
        let Some(offered) = self
            .offer
            .as_ref()
            .and_then(|offer| offer.application.as_deref())
        else {
            return;
        };
        if apps
            .iter()
            .any(|app| app.canonical_bundle_id() == Some(offered))
        {
            self.detector.keep_snooze_alive_at(now);
        }
    }

    fn withdraw_if_unsnoozed(&mut self) -> Vec<Effect> {
        let detector = &self.detector;
        self.offer
            .take_if(|offer| {
                !detector.is_application_snoozed(offer.application.as_deref().unwrap_or_default())
            })
            .map(|offer| Effect::Withdraw(offer.key))
            .into_iter()
            .collect()
    }
}

/// What a button on the offer does.
fn answer(action: &str, recording: bool) -> Option<Answer> {
    match action {
        ACTION_RECORD if recording => Some(Answer::AlreadyRecording),
        ACTION_RECORD => Some(Answer::Record),
        _ => None,
    }
}

static WATCH: OnceLock<Mutex<Watch>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();

fn watch() -> MutexGuard<'static, Watch> {
    WATCH
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

// ── Lifecycle ──

/// Start the detection thread. Idle while Detected calls is muted.
pub fn start(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    notifications::add_categories(&[category()]);
    notifications::on_response_received(handle_response);
    let spawned = thread::Builder::new()
        .name("call-detection".into())
        .spawn(|| {
            loop {
                let wait = tick();
                thread::sleep(wait);
            }
        });
    if let Err(error) = spawned {
        log::error!("[call-detection] thread failed to start: {error}");
    }
}

/// A calendar reminder was answered: its call is not offered again.
pub(crate) fn snooze_calendar_call((keys, until_ms): (Vec<String>, i64)) {
    watch().detector.snooze_calendar_call(keys, until_ms);
}

/// One pass; returns how long to wait before the next.
fn tick() -> Duration {
    // Until the webview has sent its settings every kind would read unmuted.
    if !notifications::muted_known() {
        return TICK;
    }
    let muted = notifications::is_muted(KIND);
    let apps = if muted { None } else { read_microphone() };
    let effects = watch().step(
        apps.as_deref(),
        is_recording(),
        muted,
        Instant::now(),
        wall_clock_ms(),
    );
    effects.into_iter().for_each(apply);
    if !muted && apps.is_none() {
        READ_RETRY
    } else {
        TICK
    }
}

fn read_microphone() -> Option<Vec<ActiveMicrophoneApplication>> {
    active_microphone_applications()
        .inspect_err(|error| {
            log::warn!("[call-detection] could not inspect microphone activity: {error}")
        })
        .ok()
}

// ── Notification ──

fn category() -> Category {
    let action = |id: &str, title: &str| Action {
        id: id.into(),
        title: title.into(),
    };
    Category {
        id: CATEGORY.into(),
        actions: vec![
            action(ACTION_RECORD, "Record"),
            action(ACTION_NOT_NOW, "Not now"),
        ],
    }
}

fn apply(effect: Effect) {
    match effect {
        Effect::Offer(candidate) => offer(&candidate),
        Effect::Withdraw(key) => notifications::remove(&[format!("{ID_PREFIX}{key}")]),
    }
}

fn offer(candidate: &MeetingCandidate) {
    log::info!(
        "[call-detection] offering to record: {}",
        candidate.source.label()
    );
    let user_info = candidate
        .application
        .iter()
        .map(|application| (APPLICATION_KEY.to_string(), application.clone()))
        .collect::<HashMap<_, _>>();
    notifications::post(&Notice {
        id: format!("{ID_PREFIX}{}", candidate.key),
        title: candidate.offer_title(),
        body: BODY.into(),
        category: Some(CATEGORY.into()),
        user_info,
        kind: Some(KIND.into()),
    });
}

// ── Answer ──

fn handle_response(response: &Response) {
    if !response.id.starts_with(ID_PREFIX) {
        return;
    }
    match answer(&response.action, is_recording()) {
        Some(Answer::Record) => record(response.user_info.get(APPLICATION_KEY)),
        Some(Answer::AlreadyRecording) => {
            log::info!("[call-detection] already recording; Record ignored")
        }
        None => {}
    }
}

/// Record the calendar meeting in progress for this call, else a plain recording.
fn record(application: Option<&String>) {
    match application.and_then(|application| meeting_reminders::event_for_call(application)) {
        Some(event) => meeting_reminders::record(&event, false),
        None => {
            if let Some(app) = APP.get() {
                menubar::dispatch(app, item::START_RECORDING);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    const STEP_MS: u64 = 500;

    struct Clock {
        base: Instant,
        elapsed_ms: u64,
    }

    impl Clock {
        fn new() -> Self {
            Self {
                base: Instant::now(),
                elapsed_ms: 0,
            }
        }
    }

    fn zoom() -> ActiveMicrophoneApplication {
        ActiveMicrophoneApplication {
            pid: 1,
            bundle_id: "us.zoom.xos".into(),
            name: "zoom.us".into(),
        }
    }

    /// Steps every 500 ms for `ms` and returns every effect.
    fn run(
        watch: &mut Watch,
        clock: &mut Clock,
        apps: Option<&[ActiveMicrophoneApplication]>,
        recording: bool,
        muted: bool,
        ms: u64,
    ) -> Vec<Effect> {
        let mut effects = Vec::new();
        let end = clock.elapsed_ms + ms;
        while clock.elapsed_ms < end {
            let now = clock.base + Duration::from_millis(clock.elapsed_ms);
            effects.extend(watch.step(apps, recording, muted, now, 0));
            clock.elapsed_ms += STEP_MS;
        }
        effects
    }

    /// Zoom on the microphone until it is offered.
    fn offered(watch: &mut Watch, clock: &mut Clock) -> String {
        let on_mic = [zoom()];
        let effects = run(watch, clock, Some(&on_mic), false, false, 2_500);
        let [Effect::Offer(candidate)] = effects.as_slice() else {
            panic!("expected one offer, got {effects:?}");
        };
        assert_eq!(watch.offer.as_ref(), Some(candidate));
        candidate.key.clone()
    }

    #[test]
    fn muted_resets_and_idles() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        let key = offered(&mut watch, &mut clock);
        let on_mic = [zoom()];
        assert_eq!(
            run(&mut watch, &mut clock, Some(&on_mic), false, true, 5_000),
            [Effect::Withdraw(key)]
        );
        assert!(watch.offer.is_none());
        // Back on: the same call is a fresh one, offered again.
        offered(&mut watch, &mut clock);
    }

    #[test]
    fn no_offer_while_recording() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        let on_mic = [zoom()];
        assert!(run(&mut watch, &mut clock, Some(&on_mic), true, false, 10_000).is_empty());
    }

    #[test]
    fn recording_end_marks_stopped() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        let key = offered(&mut watch, &mut clock);
        let on_mic = [zoom()];
        assert!(run(&mut watch, &mut clock, Some(&on_mic), true, false, 120_000).is_empty());
        // Stopped: three seconds off the microphone end the call, not a minute.
        assert_eq!(
            run(&mut watch, &mut clock, Some(&[]), false, false, 3_500),
            [Effect::Withdraw(key)]
        );
        offered(&mut watch, &mut clock);
    }

    #[test]
    fn withdraws_offer_when_snooze_ends() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        let key = offered(&mut watch, &mut clock);
        assert!(run(&mut watch, &mut clock, Some(&[]), false, false, 59_000).is_empty());
        assert_eq!(
            run(&mut watch, &mut clock, Some(&[]), false, false, 2_000),
            [Effect::Withdraw(key)]
        );
        assert!(watch.offer.is_none());
    }

    #[test]
    fn failed_mic_read_changes_nothing() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        let key = offered(&mut watch, &mut clock);
        assert!(run(&mut watch, &mut clock, None, false, false, 120_000).is_empty());
        assert_eq!(watch.offer.as_ref().map(|offer| &offer.key), Some(&key));
        let on_mic = [zoom()];
        assert!(run(&mut watch, &mut clock, Some(&on_mic), false, false, 5_000).is_empty());
    }

    #[test]
    fn record_ignored_while_recording() {
        assert_eq!(answer("record", true), Some(Answer::AlreadyRecording));
        assert_eq!(answer("record", false), Some(Answer::Record));
        assert_eq!(answer("not_now", false), None);
        assert_eq!(answer("open", false), None);
    }
}
