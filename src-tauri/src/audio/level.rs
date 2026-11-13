//! The `coreaudio-level` event: a level-meter frame the frontend also uses
//! as its capture heartbeat.

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::tracks::AudioPacket;

const LEVEL_EVENT: &str = "coreaudio-level";
const LEVEL_BARS: usize = 48;
const EMIT_INTERVAL: Duration = Duration::from_millis(80);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioLevelEvent {
    levels: Vec<u8>,
    level: f32,
    peak: f32,
}

/// Collects written packets and emits one level frame per interval.
pub(super) struct LevelMeter {
    app: AppHandle,
    samples: Vec<f32>,
    last_emit: Instant,
}

impl LevelMeter {
    pub(super) fn new(app: AppHandle) -> Self {
        Self {
            app,
            samples: Vec::new(),
            last_emit: Instant::now(),
        }
    }

    pub(super) fn offer(&mut self, packet: &AudioPacket) {
        self.samples.extend_from_slice(&packet.samples);
        if self.last_emit.elapsed() < EMIT_INTERVAL {
            return;
        }
        self.last_emit = Instant::now();
        let event = level_event(&self.samples);
        self.samples.clear();
        if let Err(error) = self.app.emit(LEVEL_EVENT, event) {
            tracing::warn!(%error, "could not emit the audio level");
        }
    }
}

fn level_event(samples: &[f32]) -> AudioLevelEvent {
    let peak = samples.iter().fold(0.0_f32, |peak, sample| peak.max(sample.abs()));
    let sum_squares: f32 = samples.iter().map(|sample| sample * sample).sum();
    let level = (sum_squares / samples.len().max(1) as f32).sqrt();
    let bucket = (samples.len() / LEVEL_BARS).max(1);
    let mut levels: Vec<u8> = samples
        .chunks(bucket)
        .take(LEVEL_BARS)
        .map(|chunk| {
            let average = chunk.iter().map(|sample| sample.abs()).sum::<f32>() / chunk.len() as f32;
            (average.powf(0.6).min(1.0) * 255.0) as u8
        })
        .collect();
    levels.resize(LEVEL_BARS, 0);
    AudioLevelEvent {
        levels,
        level,
        peak,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_frame_always_has_every_bar() {
        assert_eq!(level_event(&[]).levels.len(), LEVEL_BARS);
        assert_eq!(level_event(&[0.5; 10]).levels.len(), LEVEL_BARS);
        assert_eq!(level_event(&[0.5; 1_000]).levels.len(), LEVEL_BARS);
    }

    #[test]
    fn level_and_peak_follow_the_samples() {
        let event = level_event(&[0.5, -1.0, 0.5, -1.0]);
        assert_eq!(event.peak, 1.0);
        assert!((event.level - (0.625_f32).sqrt()).abs() < 1e-6);
    }
}
