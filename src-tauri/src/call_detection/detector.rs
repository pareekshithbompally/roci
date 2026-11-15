use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::microphone::{ActiveMicrophoneApplication, canonical_application_name};

/// A known call service must keep the microphone for about 2 s.
const STABLE_FOR: Duration = Duration::from_secs(2);
/// A browser using the microphone on a page that is not a known call site
/// must keep it for about 20 s: voice notes and dictation fields open the
/// microphone for a few seconds, calls hold it for minutes.
const BROWSER_STABLE_FOR: Duration = Duration::from_secs(20);
/// An offered call stays snoozed until its app has been off the microphone
/// for about a minute, so one call is offered once.
const ABSENT_FOR_RESET: Duration = Duration::from_secs(60);
/// About three seconds without the call app on the microphone.
const CALL_ENDED_AFTER: Duration = Duration::from_secs(3);
/// Observations further apart than this (a sleeping Mac, a stalled loop) do
/// not make one run: the clock restarts rather than counting the gap.
const MAX_OBSERVATION_GAP: Duration = Duration::from_secs(10);
/// A call that drops off one microphone check (or two, on a slow loop) and
/// is back right after keeps its time toward the offer (#835).
const DROPOUT_GRACE: Duration = Duration::from_secs(2);

/// How long a condition has held across observations, by the monotonic
/// clock, so a slow loop iteration cannot stretch a threshold.
#[derive(Clone, Copy, Debug)]
struct Run {
    since: Instant,
    last: Instant,
}

impl Run {
    fn start(now: Instant) -> Self {
        Self {
            since: now,
            last: now,
        }
    }

    /// Records an observation and returns how long the run has lasted.
    fn extend(&mut self, now: Instant) -> Duration {
        if now.saturating_duration_since(self.last) > MAX_OBSERVATION_GAP {
            self.since = now;
        }
        self.last = now;
        now.saturating_duration_since(self.since)
    }
}

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
            // WhatsApp also takes the microphone for voice notes (#835), and
            // Gather can hold it while you sit in a space (#855).
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
    /// The offered call's recording was stopped by hand: the snooze ends
    /// once its app has been off the microphone for [`CALL_ENDED_AFTER`],
    /// not a minute, so the next call is offered (#1113).
    stopped: bool,
    /// When a candidate was last on the microphone (or known to be, while
    /// recording); absence is counted from here, gaps included.
    last_present: Option<Instant>,
    calendar: Option<CalendarSnooze>,
}

/// A candidate that has been on the microphone but is not yet stable.
struct Pending {
    key: String,
    run: Run,
}

/// A call the user already answered a calendar reminder for: recorded it,
/// or dismissed it.
#[derive(Clone, Debug, Eq, PartialEq)]
struct CalendarSnooze {
    /// App bundle IDs of the meeting's call service; empty when the
    /// invitation had no call link, which covers the next call alone.
    keys: Vec<String>,
    /// When the snooze lapses, in wall-clock milliseconds: the meeting's
    /// end, or shortly after its start when it has no call link.
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
    /// A calendar reminder was answered: its call, when detected before
    /// `until_ms`, is treated as already offered. `keys` names the call
    /// service; empty covers the next call detected.
    pub fn snooze_calendar_call(&mut self, keys: Vec<String>, until_ms: i64) {
        self.calendar = Some(CalendarSnooze { keys, until_ms });
    }

    /// The call that was offered is still on the microphone, as a running
    /// recording's call app is: its snooze must last from now, not from the
    /// last detection pass.
    pub(super) fn keep_snooze_alive_at(&mut self, now: Instant) {
        self.last_present = Some(now);
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

    /// Whether `candidate` is the offered call: the same key, or the same app.
    fn snoozes(&self, candidate: &MeetingCandidate) -> bool {
        if self.offered.as_deref() == Some(&candidate.key) {
            return true;
        }
        candidate.application.is_some() && self.offered_application == candidate.application
    }

    /// No candidate is on the microphone: the snooze ends once that has
    /// lasted long enough.
    fn absent_at(&mut self, now: Instant) {
        let since = *self.last_present.get_or_insert(now);
        let reset_after = if self.stopped {
            CALL_ENDED_AFTER
        } else {
            ABSENT_FOR_RESET
        };
        if now.saturating_duration_since(since) >= reset_after {
            self.offered = None;
            self.offered_application = None;
            self.stopped = false;
        }
    }

    /// One observation. Returns the call to offer, once it has been stable
    /// long enough and is not snoozed.
    pub(super) fn detect_at(
        &mut self,
        candidate: Option<MeetingCandidate>,
        now: Instant,
        now_ms: i64,
    ) -> Option<MeetingCandidate> {
        let Some(candidate) = candidate else {
            if self.pending.as_ref().is_some_and(|pending| {
                now.saturating_duration_since(pending.run.last) > DROPOUT_GRACE
            }) {
                self.pending = None;
            }
            self.absent_at(now);
            return None;
        };
        self.last_present = Some(now);
        if self.snoozes(&candidate) {
            self.pending = None;
            return None;
        }
        let held = match &mut self.pending {
            Some(pending) if pending.key == candidate.key => pending.run.extend(now),
            _ => {
                self.pending = Some(Pending {
                    key: candidate.key.clone(),
                    run: Run::start(now),
                });
                Duration::ZERO
            }
        };
        if held < candidate.required_stability() {
            return None;
        }
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

/// The call to offer among the applications on the microphone: a call app
/// before a browser.
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

    const STEP_MS: u64 = 500;

    /// A detector fed on a fake monotonic clock, like the watcher loop does.
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

        /// Observes `candidate` every `step_ms` for `ms`, the first at the
        /// current time, and returns each offer with the time it came.
        fn run_every(
            &mut self,
            candidate: Option<&MeetingCandidate>,
            ms: u64,
            step_ms: u64,
        ) -> Vec<(u64, MeetingCandidate)> {
            let mut found = Vec::new();
            let end = self.elapsed_ms + ms;
            while self.elapsed_ms < end {
                let now = self.base + Duration::from_millis(self.elapsed_ms);
                if let Some(offer) = self
                    .detector
                    .detect_at(candidate.cloned(), now, self.wall_ms)
                {
                    found.push((self.elapsed_ms, offer));
                }
                self.elapsed_ms += step_ms;
            }
            found
        }

        fn run(
            &mut self,
            candidate: Option<&MeetingCandidate>,
            ms: u64,
        ) -> Vec<(u64, MeetingCandidate)> {
            self.run_every(candidate, ms, STEP_MS)
        }

        /// Time passes with no observation, as when the Mac sleeps.
        fn skip(&mut self, ms: u64) {
            self.elapsed_ms += ms;
        }

        /// Observes until the candidate has been stable for just under its
        /// threshold, then once more; returns what that last observation
        /// offered.
        fn stable(&mut self, candidate: &MeetingCandidate) -> Option<MeetingCandidate> {
            let required = candidate.required_stability().as_millis() as u64;
            assert!(self.run(Some(candidate), required).is_empty());
            self.run(Some(candidate), STEP_MS)
                .pop()
                .map(|(_, offer)| offer)
        }

        /// Off the microphone for longer than the snooze.
        fn leave(&mut self) {
            let ms = ABSENT_FOR_RESET.as_millis() as u64 + STEP_MS;
            assert!(self.run(None, ms).is_empty());
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
    fn call_app_offered_after_two_seconds() {
        let zoom = zoom();
        let mut watch = Watch::new();
        assert!(watch.run(Some(&zoom), 2_000).is_empty());
        assert_eq!(times(&watch.run(Some(&zoom), 500)), [2_000]);
    }

    #[test]
    fn browser_offered_after_twenty_seconds() {
        let candidate = candidate_from_microphone(&brave()).unwrap();
        assert_eq!(candidate.source, MeetingSource::BrowserCall);
        // The loop sleeps 500 ms but its browser inspection takes 400 ms more.
        let mut watch = Watch::new();
        assert!(watch.run_every(Some(&candidate), 20_700, 900).is_empty());
        assert_eq!(
            times(&watch.run_every(Some(&candidate), 900, 900)),
            [20_700]
        );

        // The same call seen at the nominal pace offers at the same time.
        let mut watch = Watch::new();
        assert!(watch.run(Some(&candidate), 20_000).is_empty());
        assert_eq!(times(&watch.run(Some(&candidate), 500)), [20_000]);
    }

    #[test]
    fn a_browser_voice_note_is_not_offered_but_a_sustained_browser_call_is() {
        let candidate = candidate_from_microphone(&brave()).unwrap();
        let mut watch = Watch::new();
        // A six-second voice note, then the mic closes for a few seconds.
        assert!(watch.run(Some(&candidate), 6_000).is_empty());
        assert!(watch.run(None, 5_000).is_empty());
        assert!(watch.run(Some(&candidate), 20_000).is_empty());
        assert_eq!(watch.run(Some(&candidate), 500).len(), 1);
    }

    #[test]
    fn offered_call_not_offered_again_until_absent_a_minute() {
        let zoom = zoom();
        let mut watch = Watch::new();
        assert!(watch.run(Some(&zoom), 2_000).is_empty());
        assert_eq!(times(&watch.run(Some(&zoom), 500)), [2_000]);
        assert!(watch.run(Some(&zoom), 30_000).is_empty());
        // A minute off the microphone ends the call.
        assert!(watch.run(None, 59_000).is_empty());
        assert!(watch.run(Some(&zoom), 2_500).is_empty());
        watch.run(None, 61_000);
        assert!(watch.run(Some(&zoom), 2_000).is_empty());
        assert_eq!(watch.run(Some(&zoom), 500).len(), 1);
    }

    #[test]
    fn a_brief_microphone_release_does_not_re_offer_the_same_call() {
        let zoom = zoom();
        let mut watch = Watch::new();
        assert!(watch.run(Some(&zoom), 2_000).is_empty());
        assert_eq!(watch.run(Some(&zoom), 500).len(), 1);
        // Dismissed or ignored: twenty seconds off the microphone keeps it snoozed.
        assert!(watch.run(None, 20_000).is_empty());
        assert!(watch.run(Some(&zoom), 5_000).is_empty());
    }

    #[test]
    fn stopped_recording_reoffers_after_three_seconds() {
        let slack = slack_huddle();
        let mut watch = Watch::new();
        assert!(watch.stable(&slack).is_some());
        watch.detector.recording_stopped();
        // A moment off the microphone: still the same call.
        assert!(watch.run(None, 2_000).is_empty());
        assert!(watch.run(Some(&slack), 5_000).is_empty());
        // Off for 3 s: the next call is offered.
        assert!(watch.run(None, 3_500).is_empty());
        assert_eq!(watch.stable(&slack), Some(slack.clone()));

        // Not stopped by hand: the minute still applies.
        assert!(watch.run(None, 20_000).is_empty());
        assert!(watch.run(Some(&slack), 5_000).is_empty());
    }

    #[test]
    fn a_missed_microphone_check_does_not_restart_the_wait_for_an_offer() {
        let call = candidate_from_microphone(&app("net.whatsapp.WhatsApp", "WhatsApp")).unwrap();
        // One check misses the call 10 s in: still offered at 20 s.
        let mut watch = Watch::new();
        assert!(watch.run(Some(&call), 10_000).is_empty());
        assert!(watch.run(None, 500).is_empty());
        assert!(watch.run(Some(&call), 9_500).is_empty());
        assert_eq!(times(&watch.run(Some(&call), 500)), [20_000]);

        // On a slow loop, two missed checks in a row are still a dropout.
        let mut watch = Watch::new();
        assert!(watch.run_every(Some(&call), 9_900, 900).is_empty());
        assert!(watch.run_every(None, 1_800, 900).is_empty());
        assert!(watch.run_every(Some(&call), 9_000, 900).is_empty());
        assert_eq!(times(&watch.run_every(Some(&call), 900, 900)), [20_700]);

        // A longer release is the call (or voice note) ending: start over.
        let mut watch = Watch::new();
        assert!(watch.run(Some(&call), 10_000).is_empty());
        assert!(watch.run(None, 3_000).is_empty());
        assert!(watch.run(Some(&call), 20_000).is_empty());
        assert_eq!(times(&watch.run(Some(&call), 500)), [33_000]);
    }

    #[test]
    fn a_slow_loop_still_ends_a_snooze_after_a_minute() {
        let slack = slack_huddle();
        let mut watch = Watch::new();
        assert!(watch.run_every(Some(&slack), 2_700, 900).is_empty());
        assert_eq!(watch.run_every(Some(&slack), 900, 900).len(), 1);
        assert!(watch.run_every(None, 54_000, 900).is_empty());
        assert!(watch.run_every(Some(&slack), 2_700, 900).is_empty());
        watch.run_every(None, 63_000, 900);
        assert!(watch.run_every(Some(&slack), 2_700, 900).is_empty());
        assert_eq!(watch.run_every(Some(&slack), 900, 900).len(), 1);
    }

    #[test]
    fn gap_restarts_the_clock() {
        let candidate = candidate_from_microphone(&brave()).unwrap();
        let mut watch = Watch::new();
        assert!(watch.run(Some(&candidate), 1_000).is_empty());
        // The Mac slept; the call is on the microphone again afterwards.
        watch.skip(60_000);
        assert!(watch.run(Some(&candidate), 20_000).is_empty());
        assert_eq!(watch.run(Some(&candidate), 500).len(), 1);
    }

    #[test]
    fn a_gap_with_the_app_absent_counts_as_absence() {
        let slack = slack_huddle();
        let mut watch = Watch::new();
        assert!(watch.run(Some(&slack), 2_000).is_empty());
        assert_eq!(watch.run(Some(&slack), 500).len(), 1);
        // The Mac slept for a while; the call is over.
        watch.skip(120_000);
        assert!(watch.run(None, 500).is_empty());
        assert!(watch.run(Some(&slack), 2_000).is_empty());
        assert_eq!(watch.run(Some(&slack), 500).len(), 1);

        // Still on the microphone after the gap: still the same call.
        watch.skip(120_000);
        assert!(watch.run(Some(&slack), 10_000).is_empty());
    }

    #[test]
    fn a_recorded_call_that_left_the_microphone_is_not_snoozed_for_another_minute() {
        let slack = slack_huddle();
        let mut watch = Watch::new();
        assert!(watch.run(Some(&slack), 2_000).is_empty());
        assert_eq!(watch.run(Some(&slack), 500).len(), 1);
        // Recorded for an hour; the app left the microphone after 5 minutes,
        // so the first pass after Stop already ends the snooze.
        watch.skip(3_600_000);
        assert!(watch.run(None, 500).is_empty());
        assert!(watch.run(Some(&slack), 2_000).is_empty());
        assert_eq!(watch.run(Some(&slack), 500).len(), 1);

        // While the recording sees the app on the microphone, the snooze
        // counts from the last such moment.
        let mut watch = Watch::new();
        watch.run(Some(&slack), 2_500);
        watch.skip(97_500);
        watch
            .detector
            .keep_snooze_alive_at(watch.base + Duration::from_millis(watch.elapsed_ms));
        assert!(watch.run(None, 59_500).is_empty());
        assert!(watch.run(Some(&slack), 5_000).is_empty());
        assert!(watch.run(None, 61_000).is_empty());
        assert!(watch.run(Some(&slack), 2_000).is_empty());
        assert_eq!(watch.run(Some(&slack), 500).len(), 1);
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
        // A Teams web app in Vivaldi runs in Vivaldi's own process (#1105).
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
