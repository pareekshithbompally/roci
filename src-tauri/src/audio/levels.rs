use serde::Serialize;
use std::time::Duration;

pub const LEVEL_BARS: usize = 48;
pub const LEVEL_THROTTLE: Duration = Duration::from_millis(80);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioLevelEvent {
    pub levels: Vec<u8>,
    pub level: f32,
    pub peak: f32,
}

/// Compute per-bar amplitude levels, RMS, and peak from i16 PCM samples.
pub fn compute_levels(samples: &[i16], bars: usize) -> (Vec<u8>, f32, f32) {
    if samples.is_empty() {
        return (vec![0; bars], 0.0, 0.0);
    }

    let mut sum_squares = 0f64;
    let mut peak = 0f32;
    for sample in samples {
        let value = *sample as f32 / i16::MAX as f32;
        let abs = value.abs();
        peak = peak.max(abs);
        sum_squares += (value as f64).powi(2);
    }
    let rms = (sum_squares / samples.len() as f64).sqrt() as f32;

    let bucket_size = (samples.len() / bars).max(1);
    let mut levels = Vec::with_capacity(bars);
    for i in 0..bars {
        let start = i * bucket_size;
        if start >= samples.len() {
            levels.push(0);
            continue;
        }
        let end = ((i + 1) * bucket_size).min(samples.len());
        let mut sum = 0f32;
        for sample in &samples[start..end] {
            sum += (*sample as f32).abs();
        }
        let avg = sum / (end - start) as f32;
        let normalized = (avg / i16::MAX as f32).min(1.0);
        let shaped = normalized.powf(0.6);
        levels.push((shaped * 255.0) as u8);
    }

    (levels, rms, peak)
}
