//! One recording: the source supervisors, the track writer, the wake lock, and the stop that mixes the tracks.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use eyre::Result;
use tauri::AppHandle;

use super::capture::{PacketSink, SourceSupervisor};
use super::level::LevelMeter;
use super::live::LiveChunker;
use super::recovery::mix;
use super::tracks::{
    AudioPacket, CaptureStats, MeetingSource, STATS_FILE, join_audio_writer, set_owner_only, write_tracks,
};
#[cfg(target_os = "macos")]
use crate::wake_lock::WakeLock;

const PACKET_QUEUE_CAPACITY: usize = 128;

/// Which sources a recording captures.
#[derive(Clone, Copy)]
pub struct Sources {
    pub microphone: bool,
    pub system: bool,
}

/// Pause state shared by the commands and the track writer.
#[derive(Default)]
pub(super) struct Pause(Mutex<PauseState>);

#[derive(Default)]
struct PauseState {
    since: Option<Instant>,
    shifted: Duration,
}

impl Pause {
    fn pause(&self) {
        self.state().since.get_or_insert_with(Instant::now);
    }

    fn resume(&self) {
        let mut state = self.state();
        if let Some(since) = state.since.take() {
            state.shifted += since.elapsed();
        }
    }

    /// Total time paused, the running pause included, and whether a pause is running.
    fn paused(&self) -> (Duration, bool) {
        let state = self.state();
        let running = state.since.map(|since| since.elapsed());
        (state.shifted + running.unwrap_or_default(), running.is_some())
    }

    /// `None` while paused; otherwise the total paused time (µs) to take off packet arrivals.
    pub(super) fn shift_us(&self) -> Option<u64> {
        let state = self.state();
        state
            .since
            .is_none()
            .then(|| state.shifted.as_micros() as u64)
    }

    fn state(&self) -> std::sync::MutexGuard<'_, PauseState> {
        self.0.lock().unwrap_or_else(|error| error.into_inner())
    }
}

/// How far a recording has got.
pub struct Progress {
    /// Time captured so far, pauses excluded.
    pub recorded: Duration,
    pub paused: bool,
}

pub struct Recorder {
    /// When capture started; the clock `progress` measures from.
    started: Instant,
    directory: PathBuf,
    output: PathBuf,
    sender: SyncSender<AudioPacket>,
    writer: thread::JoinHandle<Result<CaptureStats>>,
    microphone_capture: Option<SourceSupervisor>,
    system_capture: Option<SourceSupervisor>,
    microphone_drops: Arc<AtomicU64>,
    system_drops: Arc<AtomicU64>,
    pause: Arc<Pause>,
    /// Held for the capture's lifetime so idle sleep can't cut a meeting off (iOS keeps recording in the background instead).
    #[cfg(target_os = "macos")]
    _wake_lock: Option<WakeLock>,
}

impl Recorder {
    /// Starts capturing `sources` into tracks beside `output`, which `stop` writes.
    pub fn start(sources: Sources, output: PathBuf, app: AppHandle, live_streaming: bool) -> Result<Self> {
        let directory = output.with_extension("");
        fs::create_dir_all(&directory)?;
        set_owner_only(&directory, true)?;
        let (sender, receiver) = mpsc::sync_channel::<AudioPacket>(PACKET_QUEUE_CAPACITY);
        let pause = Arc::new(Pause::default());
        let writer_dir = directory.clone();
        let writer_pause = pause.clone();
        let mut meter = LevelMeter::new(app.clone());
        // The in-call transcript hears what is written: each packet also feeds its live chunks.
        let mut live = LiveChunker::new(app, live_streaming);
        let writer = thread::spawn(move || {
            write_tracks(&writer_dir, receiver, &writer_pause, |packet| {
                meter.offer(packet);
                live.offer(packet);
            })
        });
        let microphone_drops = Arc::new(AtomicU64::new(0));
        let system_drops = Arc::new(AtomicU64::new(0));
        let capture_clock = Instant::now();
        let sink = |source, drops: &Arc<AtomicU64>| PacketSink {
            source,
            sender: sender.clone(),
            drops: drops.clone(),
            clock: capture_clock,
        };
        // Each source recovers on its own, so losing system audio never stops the microphone.
        let microphone_capture = sources.microphone.then(|| {
            SourceSupervisor::microphone(sink(MeetingSource::Microphone, &microphone_drops))
        });
        #[cfg(target_os = "macos")]
        let system_capture = sources
            .system
            .then(|| SourceSupervisor::system(sink(MeetingSource::System, &system_drops)));
        // iPhone and iPad have no system-audio capture; the commands only ask for the microphone there.
        #[cfg(target_os = "ios")]
        let system_capture: Option<SourceSupervisor> = {
            debug_assert!(!sources.system, "system audio requested on iOS");
            None
        };
        Ok(Self {
            started: capture_clock,
            directory,
            output,
            sender,
            writer,
            microphone_capture,
            system_capture,
            microphone_drops,
            system_drops,
            pause,
            #[cfg(target_os = "macos")]
            _wake_lock: WakeLock::acquire("Recording a meeting"),
        })
    }

    pub fn pause(&self) {
        self.pause.pause();
    }

    pub fn resume(&self) {
        self.pause.resume();
    }

    pub fn progress(&self) -> Progress {
        let (paused_for, paused) = self.pause.paused();
        Progress {
            recorded: self.started.elapsed().saturating_sub(paused_for),
            paused,
        }
    }

    /// Stops and mixes the tracks into the file; returns its length in seconds.
    pub fn stop(self) -> Result<f64> {
        let (directory, output) = (self.directory.clone(), self.output.clone());
        let stats = self.finish()?;
        mix(&directory, &stats, &output)
    }

    /// Finishes the tracks and leaves them for the next launch to mix down, for a quit mid-recording (iOS has no quit
    /// to catch; a recording cut off there is mixed by `recover_meetings` at the next launch).
    #[cfg(target_os = "macos")]
    pub fn abandon(self) {
        let directory = self.directory.clone();
        match self.finish() {
            Ok(_) => tracing::info!(directory = %directory.display(), "meeting capture left for recovery"),
            Err(error) => tracing::error!(%error, "could not finish meeting capture before quitting"),
        }
    }

    /// Stops the sources and the writer, and records the tracks' stats.
    fn finish(self) -> Result<CaptureStats> {
        drop(self.system_capture);
        drop(self.microphone_capture);
        drop(self.sender);
        let mut stats = join_audio_writer(self.writer)?;
        stats.system.dropped_packets = self.system_drops.load(Ordering::Relaxed);
        stats.microphone.dropped_packets = self.microphone_drops.load(Ordering::Relaxed);
        tracing::info!(
            system = ?stats.system,
            microphone = ?stats.microphone,
            "meeting capture stopped"
        );
        fs::write(self.directory.join(STATS_FILE), serde_json::to_vec(&stats)?)?;
        Ok(stats)
    }
}
