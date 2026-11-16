//! Call detection: Core Audio tells us when an app takes or releases the microphone; a stable call app gets a Record / Not now notification.

pub mod detector;
mod listener;
pub mod microphone;

use std::collections::HashMap;
use std::sync::OnceLock;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::Instant;

use tauri::AppHandle;
use tauri_plugin_notifications::{self as notifications, Action, Category, Notice, Response};

use crate::audio::commands::is_recording;
use crate::meeting_reminders::{self, wall_clock_ms};
use crate::menubar::{self, item};
use detector::{MeetingCandidate, MeetingDetector, best_candidate};
use listener::{Change, Subscriptions};
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

/// Everything that can change what detection decides; the worker sleeps until one arrives or a deadline passes.
#[derive(Debug)]
enum Event {
    CoreAudio(Change),
    Recording(bool),
    MutedChanged,
    CalendarSnooze(Vec<String>, i64),
}

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
    /// One decision on what is on the microphone now, after a change or at a deadline.
    fn step(
        &mut self,
        apps: &[ActiveMicrophoneApplication],
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

    /// When to step again with nothing changing; none while recording, as nothing is offered then.
    fn next_deadline(&self, recording: bool) -> Option<Instant> {
        (!recording).then(|| self.detector.next_deadline()).flatten()
    }

    /// The offered call's app on the microphone keeps its snooze alive; leaving starts the absence.
    fn while_recording(&mut self, apps: &[ActiveMicrophoneApplication], now: Instant) {
        self.was_recording = true;
        let Some(offered) = self
            .offer
            .as_ref()
            .and_then(|offer| offer.application.as_deref())
        else {
            return;
        };
        let on = apps
            .iter()
            .any(|app| app.canonical_bundle_id() == Some(offered));
        self.detector.offered_on_microphone(on, now);
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

static EVENTS: OnceLock<Sender<Event>> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Hands an event to the worker; called from Core Audio, notification and command threads.
fn send(event: Event) {
    let Some(events) = EVENTS.get() else { return };
    if let Err(error) = events.send(event) {
        log::warn!("[call-detection] worker gone; dropped {:?}", error.0);
    }
}

// ── Lifecycle ──

/// Starts the worker and subscribes it to Core Audio, the Notifications switch and calendar answers.
pub fn start(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    let (sender, receiver) = mpsc::channel();
    if EVENTS.set(sender).is_err() {
        return;
    }
    notifications::add_categories(&[category()]);
    notifications::on_response_received(handle_response);
    notifications::on_muted_changed(|| send(Event::MutedChanged));
    let spawned = thread::Builder::new()
        .name("call-detection".into())
        .spawn(move || Worker::default().run(&receiver));
    if let Err(error) = spawned {
        log::error!("[call-detection] thread failed to start: {error}");
        return;
    }
    if let Err(error) = listener::listen(|change| send(Event::CoreAudio(change))) {
        log::error!("[call-detection] Core Audio listeners not started: {error}");
    }
}

/// A calendar reminder was answered: its call is not offered again.
pub(crate) fn snooze_calendar_call((keys, until_ms): (Vec<String>, i64)) {
    send(Event::CalendarSnooze(keys, until_ms));
}

/// A recording started or stopped (reported with the menu bar's state).
pub(crate) fn recording_changed(active: bool) {
    send(Event::Recording(active));
}

/// Owns detection on one thread: applies each event, then decides; sleeps until the next event or deadline.
struct Worker {
    watch: Watch,
    subscriptions: Subscriptions,
    /// The last microphone read; a failed read keeps it.
    apps: Vec<ActiveMicrophoneApplication>,
    recording: bool,
    /// The microphone changed since the last read.
    stale: bool,
}

impl Default for Worker {
    fn default() -> Self {
        Self {
            watch: Watch::default(),
            subscriptions: Subscriptions::default(),
            apps: Vec::new(),
            recording: false,
            stale: true,
        }
    }
}

impl Worker {
    fn run(mut self, events: &Receiver<Event>) {
        self.subscriptions.sync();
        // A call already on the microphone at launch is seen without waiting for a change.
        self.decide();
        loop {
            let event = match self.deadline() {
                Some(at) => match events.recv_timeout(at.saturating_duration_since(Instant::now())) {
                    Ok(event) => Some(event),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                },
                None => match events.recv() {
                    Ok(event) => Some(event),
                    Err(_) => return,
                },
            };
            if let Some(event) = event {
                self.handle(event);
            }
            self.decide();
        }
    }

    fn handle(&mut self, event: Event) {
        // Microphone use may differ after any Core Audio change or an unmute.
        self.stale |= matches!(event, Event::CoreAudio(_) | Event::MutedChanged);
        match event {
            Event::CoreAudio(Change::Processes) => self.subscriptions.sync(),
            Event::CoreAudio(Change::ServiceRestarted) => self.subscriptions.reset(),
            Event::CoreAudio(Change::Microphone) | Event::MutedChanged => {}
            Event::Recording(active) => self.recording = active,
            Event::CalendarSnooze(keys, until_ms) => {
                self.watch.detector.snooze_calendar_call(keys, until_ms);
            }
        }
    }

    /// `None` until Settings has sent the switches (every kind reads unmuted before that).
    fn muted() -> Option<bool> {
        notifications::muted_known().then(|| notifications::is_muted(KIND))
    }

    fn deadline(&self) -> Option<Instant> {
        match Self::muted() {
            Some(false) => self.watch.next_deadline(self.recording),
            _ => None,
        }
    }

    fn decide(&mut self) {
        let Some(muted) = Self::muted() else { return };
        if !muted && std::mem::take(&mut self.stale) {
            self.read_microphone();
        }
        let effects = self.watch.step(
            &self.apps,
            self.recording,
            muted,
            Instant::now(),
            wall_clock_ms(),
        );
        effects.into_iter().for_each(apply);
    }

    fn read_microphone(&mut self) {
        match active_microphone_applications() {
            Ok(apps) => self.apps = apps,
            Err(error) => {
                log::warn!("[call-detection] could not inspect microphone activity: {error}")
            }
        }
    }
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

        fn now(&self) -> Instant {
            self.base + Duration::from_millis(self.elapsed_ms)
        }
    }

    fn zoom() -> ActiveMicrophoneApplication {
        ActiveMicrophoneApplication {
            pid: 1,
            bundle_id: "us.zoom.xos".into(),
            name: "zoom.us".into(),
        }
    }

    /// `apps` hold the microphone for `ms`: one step for the change, then one per deadline, as the worker does.
    fn run(
        watch: &mut Watch,
        clock: &mut Clock,
        apps: &[ActiveMicrophoneApplication],
        recording: bool,
        muted: bool,
        ms: u64,
    ) -> Vec<Effect> {
        let end = clock.elapsed_ms + ms;
        let mut effects = watch.step(apps, recording, muted, clock.now(), 0);
        while let Some(at) = watch.next_deadline(recording).filter(|_| !muted) {
            let at_ms = at.saturating_duration_since(clock.base).as_millis() as u64;
            if at_ms >= end {
                break;
            }
            clock.elapsed_ms = at_ms.max(clock.elapsed_ms);
            effects.extend(watch.step(apps, recording, muted, clock.now(), 0));
        }
        clock.elapsed_ms = end;
        effects
    }

    /// Zoom on the microphone until it is offered.
    fn offered(watch: &mut Watch, clock: &mut Clock) -> String {
        let effects = run(watch, clock, &[zoom()], false, false, 2_500);
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
        assert_eq!(
            run(&mut watch, &mut clock, &[zoom()], false, true, 5_000),
            [Effect::Withdraw(key)]
        );
        assert!(watch.offer.is_none());
        // Back on: the same call is a fresh one, offered again.
        offered(&mut watch, &mut clock);
    }

    #[test]
    fn no_offer_and_no_deadline_while_recording() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        assert!(run(&mut watch, &mut clock, &[zoom()], true, false, 10_000).is_empty());
        assert_eq!(watch.next_deadline(true), None);
    }

    #[test]
    fn recording_end_marks_stopped() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        let key = offered(&mut watch, &mut clock);
        assert!(run(&mut watch, &mut clock, &[zoom()], true, false, 120_000).is_empty());
        // Stopped: three seconds off the microphone end the call, not a minute.
        assert_eq!(
            run(&mut watch, &mut clock, &[], false, false, 3_500),
            [Effect::Withdraw(key)]
        );
        offered(&mut watch, &mut clock);
    }

    #[test]
    fn withdraws_offer_when_snooze_ends() {
        let (mut watch, mut clock) = (Watch::default(), Clock::new());
        let key = offered(&mut watch, &mut clock);
        assert!(run(&mut watch, &mut clock, &[], false, false, 59_000).is_empty());
        assert_eq!(
            run(&mut watch, &mut clock, &[], false, false, 2_000),
            [Effect::Withdraw(key)]
        );
        assert!(watch.offer.is_none());
    }

    #[test]
    fn record_ignored_while_recording() {
        assert_eq!(answer("record", true), Some(Answer::AlreadyRecording));
        assert_eq!(answer("record", false), Some(Answer::Record));
        assert_eq!(answer("not_now", false), None);
        assert_eq!(answer("open", false), None);
    }
}
