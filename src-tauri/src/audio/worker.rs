use rtrb::Consumer;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::audio::aec::Aec;
use crate::audio::align::{MixFrame, Stream, Timeline};
use crate::audio::capture::AudioCaptureSource;
use crate::audio::levels::{compute_levels, AudioLevelEvent, LEVEL_BARS, LEVEL_THROTTLE};
use crate::audio::mixer::mix;
use crate::audio::ring::AudioFrame;
use crate::audio::sink::DualSink;
use crate::audio::wav::convert_to_i16;

/// How often to flush the WAV header to disk during recording. Keeps the file
/// valid/playable even on an unclean exit (force-quit, crash, app closed while
/// recording) — worst case loses only the audio written since the last flush.
const FLUSH_INTERVAL: Duration = Duration::from_secs(1);

pub struct Worker {
    sys_rx: Consumer<AudioFrame>,
    mic_rx: Consumer<AudioFrame>,
    timeline: Timeline,
    /// AEC — only present in SystemAndMicrophone mode.
    aec: Option<Aec>,
    sink: DualSink,
    last_emit: Instant,
    mode: AudioCaptureSource,
    app: AppHandle,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
}

impl Worker {
    pub fn new(
        sys_rx: Consumer<AudioFrame>,
        mic_rx: Consumer<AudioFrame>,
        sink: DualSink,
        mode: AudioCaptureSource,
        app: AppHandle,
        running: Arc<AtomicBool>,
        paused: Arc<AtomicBool>,
    ) -> Self {
        let mixed = mode == AudioCaptureSource::SystemAndMicrophone;
        Self {
            sys_rx,
            mic_rx,
            timeline: Timeline::new(mixed),
            aec: if mixed { Some(Aec::new()) } else { None },
            sink,
            last_emit: Instant::now() - LEVEL_THROTTLE,
            mode,
            app,
            running,
            paused,
        }
    }

    pub fn run(mut self) {
        let mixed = self.mode == AudioCaptureSource::SystemAndMicrophone;
        let mut was_paused = self.paused.load(Ordering::Relaxed);
        let mut last_flush = Instant::now();

        loop {
            let still_running = self.running.load(Ordering::Relaxed);
            let is_paused = self.paused.load(Ordering::Relaxed);
            let mut popped_anything = false;

            // On resume: reset the timeline so the next PTS becomes a fresh anchor.
            if was_paused && !is_paused {
                self.timeline = Timeline::new(mixed);
                while self.sys_rx.pop().is_ok() {}
                while self.mic_rx.pop().is_ok() {}
            }
            was_paused = is_paused;

            if !is_paused {
                while let Ok(frame) = self.sys_rx.pop() {
                    self.timeline.push(Stream::System, frame.pts_secs, &frame.samples);
                    popped_anything = true;
                }
                while let Ok(frame) = self.mic_rx.pop() {
                    self.timeline.push(Stream::Mic, frame.pts_secs, &frame.samples);
                    popped_anything = true;
                }

                for frame in self.timeline.take_ready() {
                    self.write_frame(frame);
                }
            } else if self.last_emit.elapsed() >= LEVEL_THROTTLE {
                self.last_emit = Instant::now();
                let _ = self.app.emit(
                    "coreaudio-level",
                    AudioLevelEvent { levels: vec![0; LEVEL_BARS], level: 0.0, peak: 0.0 },
                );
            }

            // Periodically persist the WAV header so the file on disk stays valid
            // even if the app is force-quit/crashes before a clean stop.
            if last_flush.elapsed() >= FLUSH_INTERVAL {
                self.sink.flush();
                last_flush = Instant::now();
            }

            if !still_running && self.sys_rx.is_empty() && self.mic_rx.is_empty() {
                while let Some(frame) = self.timeline.take_remaining() {
                    self.write_frame(frame);
                }
                break;
            }

            if !popped_anything {
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
        }

        self.sink.finalize();
    }

    fn write_frame(&mut self, frame: MixFrame) {
        let mixed_f32 = match self.mode {
            AudioCaptureSource::SystemAndMicrophone => {
                let clean_mic = self
                    .aec
                    .as_mut()
                    .map(|aec| aec.process(&frame.mic, &frame.sys))
                    .unwrap_or_else(|| frame.mic.clone());
                mix(&frame.sys, &clean_mic)
            }
            _ => frame.sys,
        };

        self.sink.write(&mixed_f32);

        let i16_samples = convert_to_i16(&mixed_f32);
        if self.last_emit.elapsed() >= LEVEL_THROTTLE {
            self.last_emit = Instant::now();
            let (levels, rms, peak) = compute_levels(&i16_samples, LEVEL_BARS);
            let _ = self.app.emit(
                "coreaudio-level",
                AudioLevelEvent { levels, level: rms, peak },
            );
        }
    }
}
