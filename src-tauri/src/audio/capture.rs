//! Self-healing audio sources: each runs on its own supervisor and reopens with backoff after a failure.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{SyncSender, TrySendError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use eyre::{Result, eyre};

use super::SAMPLE_RATE;
use super::microphone::{self, AudioInputEvent, Opened};
use super::resample::StreamingResampler;
use super::tracks::{AudioPacket, MeetingSource};

const RETRY_INITIAL: Duration = Duration::from_millis(500);
const RETRY_MAX: Duration = Duration::from_secs(5);
pub(super) const POLL_INTERVAL: Duration = Duration::from_millis(100);
/// Core Audio delivers silence continuously; this long without a buffer means the device or tap stopped.
pub(super) const STALL_TIMEOUT: Duration = Duration::from_secs(3);

/// Delivers one source's 16 kHz audio to the track writer, stamped on the shared capture clock.
#[derive(Clone)]
pub(super) struct PacketSink {
    pub(super) source: MeetingSource,
    pub(super) sender: SyncSender<AudioPacket>,
    pub(super) drops: Arc<AtomicU64>,
    pub(super) clock: Instant,
}

impl PacketSink {
    pub(super) fn send(&self, sample_rate: u32, samples: Vec<f32>, pts_us: Option<i64>) {
        if samples.is_empty() {
            return;
        }
        let packet = AudioPacket {
            source: self.source,
            pts_us,
            arrival_us: self.clock.elapsed().as_micros() as u64,
            sample_rate,
            samples,
        };
        if matches!(self.sender.try_send(packet), Err(TrySendError::Full(_))) {
            self.drops.fetch_add(1, Ordering::Relaxed);
        }
    }
}

/// An open source that the supervisor polls until it fails.
pub(super) trait LiveSource {
    /// Waits briefly for audio and forwards it; an error ends this instance.
    fn poll(&mut self, sink: &PacketSink) -> std::result::Result<(), String>;
    fn describe(&self) -> &'static str;
}

/// Owns one source's supervisor thread. Dropping it stops the source.
pub(super) struct SourceSupervisor {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl SourceSupervisor {
    /// Records the system default microphone, following it as it changes.
    pub(super) fn microphone(sink: PacketSink) -> Self {
        Self::spawn(sink, move || {
            MicrophoneSource::open().map(|source| Box::new(source) as Box<dyn LiveSource>)
        })
    }

    #[cfg(target_os = "macos")]
    pub(super) fn system(sink: PacketSink) -> Self {
        let source_sink = sink.clone();
        Self::spawn(sink, move || {
            super::system_audio::open_system_audio(&source_sink)
        })
    }

    fn spawn(
        sink: PacketSink,
        mut open: impl FnMut() -> Result<Box<dyn LiveSource>> + Send + 'static,
    ) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let thread = thread::Builder::new()
            .name(format!("meeting-{:?}", sink.source).to_ascii_lowercase())
            .spawn(move || supervise(&sink, &thread_stop, &mut open))
            .expect("could not spawn meeting capture thread");
        Self {
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for SourceSupervisor {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take()
            && thread.join().is_err()
        {
            tracing::error!("meeting capture thread panicked");
        }
    }
}

fn supervise(
    sink: &PacketSink,
    stop: &AtomicBool,
    open: &mut dyn FnMut() -> Result<Box<dyn LiveSource>>,
) {
    let source = sink.source;
    let mut delay = RETRY_INITIAL;
    let mut interrupted = false;
    let mut last_open_error = None::<String>;
    while !stop.load(Ordering::Relaxed) {
        if interrupted {
            tracing::info!(?source, "reopening meeting capture source");
        }
        match open() {
            Ok(mut live) => {
                tracing::info!(
                    ?source,
                    backend = live.describe(),
                    resumed = interrupted,
                    "meeting capture source started"
                );
                delay = RETRY_INITIAL;
                last_open_error = None;
                let failure = loop {
                    if stop.load(Ordering::Relaxed) {
                        break None;
                    }
                    if let Err(error) = live.poll(sink) {
                        break Some(error);
                    }
                };
                drop(live);
                let Some(error) = failure else {
                    return;
                };
                interrupted = true;
                tracing::warn!(
                    ?source,
                    %error,
                    "meeting capture source stopped; keeping the other source and retrying"
                );
            }
            Err(error) => {
                let error = format!("{error:#}");
                if last_open_error.as_deref() != Some(error.as_str()) {
                    tracing::warn!(?source, %error, "could not open meeting capture source; retrying");
                    last_open_error = Some(error);
                }
            }
        }
        let resume_at = Instant::now() + delay;
        while Instant::now() < resume_at {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            thread::sleep(POLL_INTERVAL);
        }
        delay = delay.saturating_mul(2).min(RETRY_MAX);
    }
}

/// Converts any device rate to 16 kHz so a reopened device never changes a track's format.
pub(super) struct To16k {
    pub(super) rate: u32,
    resampler: StreamingResampler,
}

impl To16k {
    pub(super) fn new(rate: u32) -> Result<Self> {
        Ok(Self {
            rate,
            resampler: StreamingResampler::new(rate).map_err(|error| eyre!(error))?,
        })
    }

    pub(super) fn push(&mut self, samples: &[f32]) -> Vec<f32> {
        self.resampler.push(samples)
    }
}

struct MicrophoneSource {
    input: microphone::AudioInput,
    resample: To16k,
    last_audio: Instant,
    /// The [`microphone::input_route_generation`] the input was resolved at.
    route_generation: u64,
}

impl MicrophoneSource {
    fn open() -> Result<Self> {
        let route_generation = microphone::input_route_generation();
        let Opened::Input(input) = microphone::open_meeting_input(None)? else {
            unreachable!("nothing to keep");
        };
        let input = *input;
        let resample = To16k::new(input.sample_rate)?;
        tracing::info!(
            device = input.device_name,
            rate = resample.rate,
            "meeting microphone opened"
        );
        Ok(Self {
            input,
            resample,
            last_audio: Instant::now(),
            route_generation,
        })
    }

    /// Follows a default-input or lid change by opening the new input first; a failed open keeps the current one.
    fn follow_route(&mut self) {
        let generation = microphone::input_route_generation();
        if generation == self.route_generation {
            return;
        }
        self.route_generation = generation;
        let opened = microphone::open_meeting_input(Some(&self.input.device_name));
        let input = match opened {
            Ok(Opened::Input(input)) => *input,
            Ok(Opened::Unchanged) => return,
            Err(error) => {
                tracing::warn!(%error, "could not switch the meeting microphone; keeping it");
                return;
            }
        };
        if input.sample_rate != self.resample.rate {
            match To16k::new(input.sample_rate) {
                Ok(resample) => self.resample = resample,
                Err(error) => {
                    tracing::warn!(%error, "could not switch the meeting microphone; keeping it");
                    return;
                }
            }
        }
        tracing::info!(
            from = %self.input.device_name,
            to = %input.device_name,
            "meeting microphone switched"
        );
        self.input = input;
        self.last_audio = Instant::now();
    }
}

impl LiveSource for MicrophoneSource {
    fn poll(&mut self, sink: &PacketSink) -> std::result::Result<(), String> {
        self.follow_route();
        match self.input.recv_timeout(POLL_INTERVAL) {
            AudioInputEvent::Chunk { samples } => {
                self.last_audio = Instant::now();
                sink.send(SAMPLE_RATE, self.resample.push(&samples), None);
                Ok(())
            }
            AudioInputEvent::Timeout if self.last_audio.elapsed() > STALL_TIMEOUT => {
                Err("microphone stopped delivering audio".into())
            }
            AudioInputEvent::Timeout => Ok(()),
            AudioInputEvent::StreamFailed(error) => Err(error),
        }
    }

    fn describe(&self) -> &'static str {
        "cpal"
    }
}
