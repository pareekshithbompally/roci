use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::microphone::{ActiveMicrophoneApplication, canonical_application_name};

/// A known call service must keep the microphone for about 2 s.
const STABLE_FOR: Duration = Duration::from_secs(2);
/// How long a browser off known call sites must hold the mic: dictation takes seconds, calls take minutes.
const BROWSER_STABLE_FOR: Duration = Duration::from_secs(20);
/// An offered call stays snoozed until its app has been off the mic this long, so one call is offered once.
const ABSENT_FOR_RESET: Duration = Duration::from_secs(60);
/// About three seconds without the call app on the microphone.
const CALL_ENDED_AFTER: Duration = Duration::from_secs(3);
/// A call that drops off the mic for a moment and comes right back keeps its time toward the offer.
const DROPOUT_GRACE: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct MeetingCandidate {
    pub key: String,
    pub title: String,
    pub source: MeetingSource,
    /// Canonical bundle identifier of the application using the microphone.
    #[serde(default)]
    pub application: Option<String>,
    /// Display name of the application using the microphone.
    #[serde(default)]
    pub application_name: Option<String>,
}

impl MeetingCandidate {
    /// The offer capsule's headline.
    pub fn offer_title(&self) -> String {
        match self.source {
            MeetingSource::BrowserCall => match &self.application_name {
                Some(application) => format!("Call in {application}"),
                None => "Call detected".into(),
            },
            MeetingSource::SlackHuddle => "Slack huddle detected".into(),
            source => format!("{} call detected", source.label()),
        }
    }

    fn required_stability(&self) -> Duration {
        match self.source {
            // WhatsApp also takes the mic for voice notes, and Gather holds it while you sit in a space.
            MeetingSource::BrowserCall | MeetingSource::WhatsApp | MeetingSource::Gather => {
                BROWSER_STABLE_FOR
            }
            _ => STABLE_FOR,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MeetingSource {
    Zoom,
    Teams,
    SlackHuddle,
    FaceTime,
    WhatsApp,
    Gather,
    Discord,
    BrowserCall,
}

impl MeetingSource {
    pub fn label(self) -> &'static str {
        match self {
            Self::Zoom => "Zoom",
            Self::Teams => "Microsoft Teams",
            Self::SlackHuddle => "Slack Huddle",
            Self::FaceTime => "FaceTime",
            Self::WhatsApp => "WhatsApp",
            Self::Gather => "Gather",
            Self::Discord => "Discord",
            Self::BrowserCall => "Browser call",
        }
    }
}

#[derive(Default)]
pub struct MeetingDetector {
    pending: Option<Pending>,
    offered: Option<String>,
    offered_application: Option<String>,
    /// Recording stopped by hand: the snooze ends after [`CALL_ENDED_AFTER`] off the mic, not a minute.
    stopped: bool,
    /// Since when no candidate has been on the mic (or, while recording, the offered call); `None` while one is.
    absent_since: Option<Instant>,
    calendar: Option<CalendarSnooze>,
}

/// A candidate that has been on the microphone but is not yet stable.
struct Pending {
    key: String,
    since: Instant,
    stable_after: Duration,
    /// When it left the microphone; back within [`DROPOUT_GRACE`] it keeps its time.
    left_at: Option<Instant>,
}

impl Pending {
    fn new(candidate: &MeetingCandidate, now: Instant) -> Self {
        Self {
            key: candidate.key.clone(),
            since: now,
            stable_after: candidate.required_stability(),
            left_at: None,
        }
    }

    /// Whether `candidate` continues this run: the same call, back before the grace ran out.
    fn continues(&self, candidate: &MeetingCandidate, now: Instant) -> bool {
        self.key == candidate.key
            && self
                .left_at
                .is_none_or(|left| now.saturating_duration_since(left) < DROPOUT_GRACE)
    }
}

/// A call whose calendar reminder the user already answered, by recording or dismissing it.
#[derive(Clone, Debug, Eq, PartialEq)]
struct CalendarSnooze {
    /// Bundle IDs of the meeting's call service; empty (no call link) covers the next call alone.
    keys: Vec<String>,
    /// When the snooze lapses (wall-clock ms): the meeting's end, or just after its start without a call link.
    until_ms: i64,
}

impl CalendarSnooze {
    fn covers(&self, candidate: &MeetingCandidate) -> bool {
        self.keys.is_empty()
            || candidate.application.as_deref().is_some_and(|key| {
                self.keys
                    .iter()
                    .any(|known| tauri_plugin_calendar::key_matches(key, known))
            })
    }
}

impl MeetingDetector {
    /// A calendar reminder was answered: its call, detected before `until_ms`, counts as already offered.
    pub fn snooze_calendar_call(&mut self, keys: Vec<String>, until_ms: i64) {
        self.calendar = Some(CalendarSnooze { keys, until_ms });
    }

    /// While recording: whether the offered call's app is on the mic, so its snooze counts from when it left.
    pub(super) fn offered_on_microphone(&mut self, on: bool, now: Instant) {
        if on {
            self.absent_since = None;
        } else {
            self.absent_since.get_or_insert(now);
        }
    }

    /// The snoozed call's recording was stopped by hand.
    pub fn recording_stopped(&mut self) {
        if self.offered.is_some() {
            self.stopped = true;
        }
    }

    /// Whether the app is snoozed whatever page it shows.
    pub fn is_application_snoozed(&self, canonical_bundle_id: &str) -> bool {
        self.offered_application.as_deref() == Some(canonical_bundle_id)
    }

    /// When [`Self::detect_at`] next has something to decide with nothing changing: an offer or a snooze ending.
    pub(super) fn next_deadline(&self) -> Option<Instant> {
        let stable = self
            .pending
            .as_ref()
            .filter(|pending| pending.left_at.is_none())
            .map(|pending| pending.since + pending.stable_after);
        let reset = self
            .offered
            .as_ref()
            .and(self.absent_since)
            .map(|since| since + self.reset_after());
        stable.into_iter().chain(reset).min()
    }

    fn reset_after(&self) -> Duration {
        if self.stopped {
            CALL_ENDED_AFTER
        } else {
            ABSENT_FOR_RESET
        }
    }

    /// Whether `candidate` is the offered call: the same key, or the same app.
    fn snoozes(&self, candidate: &MeetingCandidate) -> bool {
        if self.offered.as_deref() == Some(&candidate.key) {
            return true;
        }
        candidate.application.is_some() && self.offered_application == candidate.application
    }

    /// No candidate is on the microphone: the pending run starts its grace, and the snooze ends once long enough.
    fn absent_at(&mut self, now: Instant) {
        if let Some(pending) = &mut self.pending {
            pending.left_at.get_or_insert(now);
        }
        let since = *self.absent_since.get_or_insert(now);
        if now.saturating_duration_since(since) >= self.reset_after() {
            self.offered = None;
            self.offered_application = None;
            self.stopped = false;
        }
    }

    /// Since when `candidate` has held the microphone in this run.
    fn hold(&mut self, candidate: &MeetingCandidate, now: Instant) -> Instant {
        if let Some(pending) = self
            .pending
            .as_mut()
            .filter(|pending| pending.continues(candidate, now))
        {
            pending.left_at = None;
            return pending.since;
        }
        self.pending = Some(Pending::new(candidate, now));
        now
    }

    /// What is on the microphone now (called on each change and at [`Self::next_deadline`]); returns the call to offer.
    pub(super) fn detect_at(
        &mut self,
        candidate: Option<MeetingCandidate>,
        now: Instant,
        now_ms: i64,
    ) -> Option<MeetingCandidate> {
        let Some(candidate) = candidate else {
            self.absent_at(now);
            return None;
        };
        self.absent_since = None;
        if self.snoozes(&candidate) {
            self.pending = None;
            return None;
        }
        let since = self.hold(&candidate, now);
        if now.saturating_duration_since(since) < candidate.required_stability() {
            return None;
        }
        self.offer(candidate, now_ms)
    }

    /// The candidate is stable: snooze it, unless its calendar reminder was already answered.
    fn offer(&mut self, candidate: MeetingCandidate, now_ms: i64) -> Option<MeetingCandidate> {
        self.pending = None;
        self.offered = Some(candidate.key.clone());
        self.offered_application = candidate.application.clone();
        self.stopped = false;
        if self
            .calendar
            .as_ref()
            .is_some_and(|snooze| now_ms >= snooze.until_ms)
        {
            self.calendar = None;
        }
        if let Some(snooze) = &self.calendar
            && snooze.covers(&candidate)
        {
            log::info!(
                "[call-detection] detected call already answered from its calendar reminder: {}",
                candidate.source.label()
            );
            if snooze.keys.is_empty() {
                self.calendar = None;
            }
            return None;
        }
        Some(candidate)
    }
}

pub fn candidate_from_microphone(
    application: &ActiveMicrophoneApplication,
) -> Option<MeetingCandidate> {
    let canonical_bundle = application.canonical_bundle_id()?;
    let application_name = canonical_application_name(canonical_bundle)
        .map(str::to_string)
        .unwrap_or_else(|| application.name.clone());
    if application.is_browser() {
        let mut candidate = candidate(MeetingSource::BrowserCall, canonical_bundle, "");
        candidate.application = Some(canonical_bundle.into());
        candidate.application_name = Some(application_name);
        return Some(candidate);
    }
    let (source, title) = match canonical_bundle {
        "us.zoom.xos" => (MeetingSource::Zoom, "Zoom meeting"),
        "com.microsoft.teams2" => (MeetingSource::Teams, "Microsoft Teams meeting"),
        "com.tinyspeck.slackmacgap" => (MeetingSource::SlackHuddle, "Slack huddle"),
        "com.apple.FaceTime" => (MeetingSource::FaceTime, "FaceTime call"),
        "net.whatsapp.WhatsApp" => (MeetingSource::WhatsApp, "WhatsApp call"),
        "com.gather.GatherV2" => (MeetingSource::Gather, "Gather call"),
        "com.hnc.Discord" => (MeetingSource::Discord, "Discord call"),
        _ => return None,
    };
    let mut candidate = candidate(source, canonical_bundle, title);
    candidate.application = Some(canonical_bundle.into());
    candidate.application_name = Some(application_name);
    Some(candidate)
}

/// The call to offer among the applications on the microphone: a call app before a browser.
pub fn best_candidate(applications: &[ActiveMicrophoneApplication]) -> Option<MeetingCandidate> {
    applications
        .iter()
        .filter(|application| application.is_supported_meeting_app())
        .min_by_key(|application| application.detection_priority())
        .and_then(candidate_from_microphone)
}

fn candidate(source: MeetingSource, identity: &str, title: &str) -> MeetingCandidate {
    MeetingCandidate {
        key: opaque_key(source, identity),
        title: if title.is_empty() {
            source.label().into()
        } else {
            title.into()
        },
        source,
        application: None,
        application_name: None,
    }
}

fn opaque_key(source: MeetingSource, identity: &str) -> String {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    identity.hash(&mut hasher);
    format!("meeting-{:016x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A detector driven like the watcher: one call per microphone change, then one per deadline it arms.
    struct Watch {
        detector: MeetingDetector,
        base: Instant,
        elapsed_ms: u64,
        wall_ms: i64,
    }

    impl Watch {
        fn new() -> Self {
            Self {
                detector: MeetingDetector::default(),
                base: Instant::now(),
                elapsed_ms: 0,
                wall_ms: 0,
            }
        }

        fn observe(&mut self, candidate: Option<&MeetingCandidate>) -> Option<(u64, MeetingCandidate)> {
            let now = self.base + Duration::from_millis(self.elapsed_ms);
            self.detector
                .detect_at(candidate.cloned(), now, self.wall_ms)
                .map(|offer| (self.elapsed_ms, offer))
        }

        /// `candidate` (or nothing) holds the microphone for `ms`: the change, then every deadline before the end.
        fn hold(&mut self, candidate: Option<&MeetingCandidate>, ms: u64) -> Vec<(u64, MeetingCandidate)> {
            let end = self.elapsed_ms + ms;
            let mut found: Vec<_> = self.observe(candidate).into_iter().collect();
            while let Some(at) = self.detector.next_deadline() {
                let at_ms = at.saturating_duration_since(self.base).as_millis() as u64;
                if at_ms >= end {
                    break;
                }
                self.elapsed_ms = at_ms.max(self.elapsed_ms);
                found.extend(self.observe(candidate));
            }
            self.elapsed_ms = end;
            found
        }

        /// Time passes with no microphone change.
        fn skip(&mut self, ms: u64) {
            self.elapsed_ms += ms;
        }

        fn now(&self) -> Instant {
            self.base + Duration::from_millis(self.elapsed_ms)
        }

        /// Holds the microphone past the stability threshold; returns the offer, if any.
        fn stable(&mut self, candidate: &MeetingCandidate) -> Option<MeetingCandidate> {
            let required = candidate.required_stability().as_millis() as u64;
            self.hold(Some(candidate), required + 1)
                .pop()
                .map(|(_, offer)| offer)
        }

        /// Off the microphone for longer than the snooze.
        fn leave(&mut self) {
            let ms = ABSENT_FOR_RESET.as_millis() as u64 + 1;
            assert!(self.hold(None, ms).is_empty());
        }
    }

    fn times(found: &[(u64, MeetingCandidate)]) -> Vec<u64> {
        found.iter().map(|(at, _)| *at).collect()
    }

    fn app(bundle_id: &str, name: &str) -> ActiveMicrophoneApplication {
        ActiveMicrophoneApplication {
            pid: 1,
            bundle_id: bundle_id.into(),
            name: name.into(),
        }
    }

    fn zoom() -> MeetingCandidate {
        candidate_from_microphone(&app("us.zoom.xos", "zoom.us")).unwrap()
    }

    fn slack_huddle() -> MeetingCandidate {
        candidate_from_microphone(&app("com.tinyspeck.slackmacgap.helper", "Slack Helper")).unwrap()
    }

    fn brave() -> ActiveMicrophoneApplication {
        ActiveMicrophoneApplication {
            pid: 49686,
            bundle_id: "com.brave.Browser".into(),
            name: "Brave Browser".into(),
        }
    }

    #[test]
    fn call_app_offered_two_seconds_after_taking_the_microphone() {
        let zoom = zoom();
        let mut watch = Watch::new();
        assert_eq!(times(&watch.hold(Some(&zoom), 2_500)), [2_000]);
    }

    #[test]
    fn browser_offered_twenty_seconds_after_taking_the_microphone() {
        let candidate = candidate_from_microphone(&brave()).unwrap();
        assert_eq!(candidate.source, MeetingSource::BrowserCall);
        let mut watch = Watch::new();
        assert_eq!(times(&watch.hold(Some(&candidate), 21_000)), [20_000]);
    }

    #[test]
    fn no_deadline_while_nothing_is_pending_or_offered() {
        let mut watch = Watch::new();
        assert!(watch.hold(None, 1_000).is_empty());
        assert_eq!(watch.detector.next_deadline(), None);
    }

    #[test]
    fn a_browser_voice_note_is_not_offered_but_a_sustained_browser_call_is() {
        let candidate = candidate_from_microphone(&brave()).unwrap();
        let mut watch = Watch::new();
        // A six-second voice note, then the mic closes for a few seconds.
        assert!(watch.hold(Some(&candidate), 6_000).is_empty());
        assert!(watch.hold(None, 5_000).is_empty());
        assert_eq!(times(&watch.hold(Some(&candidate), 20_500)), [31_000]);
    }

    #[test]
    fn offered_call_not_offered_again_until_absent_a_minute() {
        let zoom = zoom();
        let mut watch = Watch::new();
        assert_eq!(times(&watch.hold(Some(&zoom), 2_500)), [2_000]);
        assert!(watch.hold(Some(&zoom), 30_000).is_empty());
        // A minute off the microphone ends the call.
        assert!(watch.hold(None, 59_000).is_empty());
        assert!(watch.hold(Some(&zoom), 2_500).is_empty());
        assert!(watch.hold(None, 61_000).is_empty());
        assert_eq!(watch.hold(Some(&zoom), 2_500).len(), 1);
    }

    #[test]
    fn a_brief_microphone_release_does_not_re_offer_the_same_call() {
        let zoom = zoom();
        let mut watch = Watch::new();
        assert_eq!(watch.hold(Some(&zoom), 2_500).len(), 1);
        // Dismissed or ignored: twenty seconds off the microphone keeps it snoozed.
        assert!(watch.hold(None, 20_000).is_empty());
        assert!(watch.hold(Some(&zoom), 5_000).is_empty());
    }

    #[test]
    fn stopped_recording_reoffers_after_three_seconds() {
        let slack = slack_huddle();
        let mut watch = Watch::new();
        assert!(watch.stable(&slack).is_some());
        watch.detector.recording_stopped();
        // A moment off the microphone: still the same call.
        assert!(watch.hold(None, 2_000).is_empty());
        assert!(watch.hold(Some(&slack), 5_000).is_empty());
        // Off for 3 s: the next call is offered.
        assert!(watch.hold(None, 3_500).is_empty());
        assert_eq!(watch.stable(&slack), Some(slack.clone()));

        // Not stopped by hand: the minute still applies.
        assert!(watch.hold(None, 20_000).is_empty());
        assert!(watch.hold(Some(&slack), 5_000).is_empty());
    }

    #[test]
    fn a_brief_dropout_does_not_restart_the_wait_for_an_offer() {
        let call = candidate_from_microphone(&app("net.whatsapp.WhatsApp", "WhatsApp")).unwrap();
        // Off the microphone for half a second 10 s in: still offered at 20 s.
        let mut watch = Watch::new();
        assert!(watch.hold(Some(&call), 10_000).is_empty());
        assert!(watch.hold(None, 500).is_empty());
        assert_eq!(times(&watch.hold(Some(&call), 10_000)), [20_000]);

        // A longer release is the call (or voice note) ending: start over.
        let mut watch = Watch::new();
        assert!(watch.hold(Some(&call), 10_000).is_empty());
        assert!(watch.hold(None, 3_000).is_empty());
        assert_eq!(times(&watch.hold(Some(&call), 20_500)), [33_000]);
    }

    #[test]
    fn a_recorded_call_that_left_the_microphone_is_not_snoozed_for_another_minute() {
        let slack = slack_huddle();
        let mut watch = Watch::new();
        assert_eq!(watch.hold(Some(&slack), 2_500).len(), 1);
        // Recorded an hour, app off the mic after 5 minutes: the first change after Stop ends the snooze.
        watch.skip(300_000);
        watch.detector.offered_on_microphone(false, watch.now());
        watch.skip(3_300_000);
        watch.detector.recording_stopped();
        assert!(watch.hold(None, 500).is_empty());
        assert_eq!(watch.hold(Some(&slack), 2_500).len(), 1);

        // Not stopped by hand: the snooze counts a minute from when the app left the mic.
        let mut watch = Watch::new();
        assert_eq!(watch.hold(Some(&slack), 2_500).len(), 1);
        watch.skip(97_500);
        watch.detector.offered_on_microphone(false, watch.now());
        assert!(watch.hold(None, 59_500).is_empty());
        assert!(watch.hold(Some(&slack), 5_000).is_empty());
        assert!(watch.hold(None, 61_000).is_empty());
        assert_eq!(watch.hold(Some(&slack), 2_500).len(), 1);
    }

    #[test]
    fn calendar_snooze_covers_its_app_until_end() {
        let zoom = zoom();
        let zoom_keys = tauri_plugin_calendar::CallProvider::Zoom
            .detection_keys()
            .iter()
            .map(|key| key.to_string())
            .collect::<Vec<_>>();
        let mut watch = Watch::new();
        watch.detector.snooze_calendar_call(zoom_keys, 1_000);
        watch.wall_ms = 10;
        assert_eq!(watch.stable(&zoom), None);
        // Rejoining the same meeting later is still covered.
        watch.wall_ms = 20;
        watch.leave();
        watch.wall_ms = 30;
        assert_eq!(watch.stable(&zoom), None);
        // Another service's call is offered as usual.
        let slack = slack_huddle();
        watch.wall_ms = 60;
        watch.leave();
        watch.wall_ms = 70;
        assert_eq!(watch.stable(&slack), Some(slack.clone()));
        // Once the meeting ends, its service's calls are offered again.
        watch.wall_ms = 2_000;
        watch.leave();
        assert_eq!(watch.stable(&zoom), Some(zoom.clone()));
    }

    #[test]
    fn a_reminder_without_a_call_link_covers_only_the_next_call() {
        let slack = slack_huddle();
        let mut watch = Watch::new();
        watch.detector.snooze_calendar_call(Vec::new(), 1_000);
        watch.wall_ms = 10;
        assert_eq!(watch.stable(&slack), None);
        watch.wall_ms = 20;
        watch.leave();
        watch.wall_ms = 30;
        assert_eq!(watch.stable(&slack), Some(slack));
    }

    #[test]
    fn vivaldi_on_the_microphone_is_a_browser_call() {
        // A Teams web app in Vivaldi runs in Vivaldi's own process.
        let vivaldi = app("com.vivaldi.Vivaldi", "Vivaldi");
        let call = candidate_from_microphone(&vivaldi).unwrap();
        assert_eq!(call.source, MeetingSource::BrowserCall);
        assert_eq!(call.application.as_deref(), Some("com.vivaldi.Vivaldi"));
        assert_eq!(call.application_name.as_deref(), Some("Vivaldi"));
        assert_eq!(call.offer_title(), "Call in Vivaldi");
        assert_eq!(call.required_stability(), BROWSER_STABLE_FOR);
    }

    #[test]
    fn offer_titles_name_the_service_or_browser_without_repeating_call() {
        let unknown = candidate_from_microphone(&brave()).unwrap();
        assert_eq!(unknown.offer_title(), "Call in Brave Browser");
        assert_eq!(zoom().offer_title(), "Zoom call detected");
        assert_eq!(slack_huddle().offer_title(), "Slack huddle detected");
    }

    #[test]
    fn best_candidate_prefers_a_call_app_over_a_browser() {
        let apps = [brave(), app("us.zoom.xos", "zoom.us")];
        assert_eq!(best_candidate(&apps), Some(zoom()));
        assert_eq!(
            best_candidate(&[app("com.spotify.client", "Spotify")]),
            None
        );
        assert_eq!(best_candidate(&[]), None);
    }
}
