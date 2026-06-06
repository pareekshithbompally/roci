use sonora::config::{EchoCanceller, MaxProcessingRate, Pipeline};
use sonora::{AudioProcessing, Config, StreamConfig};

use crate::audio::align::{AEC_FRAME, PROCESS_RATE_HZ};

/// Thin wrapper around sonora's AEC3 — the only place that knows sonora.
pub struct Aec {
    apm: AudioProcessing,
}

impl Aec {
    pub fn new() -> Self {
        let stream_cfg = StreamConfig::new(PROCESS_RATE_HZ, 1); // 48 kHz mono
        debug_assert_eq!(stream_cfg.num_frames(), AEC_FRAME, "frame size mismatch");

        let config = Config {
            echo_canceller: Some(EchoCanceller::default()),
            pipeline: Pipeline {
                // Process at 48 kHz so AEC3 sees the full frequency range.
                maximum_internal_processing_rate: MaxProcessingRate::Rate48kHz,
                ..Default::default()
            },
            ..Default::default()
        };

        let apm = AudioProcessing::builder()
            .config(config)
            .capture_config(stream_cfg) // near = mic, 48 kHz mono
            .render_config(stream_cfg)  // far  = system, 48 kHz mono
            .build();

        Self { apm }
    }

    /// Process one AEC_FRAME (480 samples, 10 ms @ 48 kHz).
    /// `far`  = clean system tap (what was played out).
    /// `near` = mic (voice + acoustic echo).
    /// Returns the echo-removed mic frame.
    /// Both slices must be exactly AEC_FRAME samples.
    pub fn process(&mut self, near: &[f32], far: &[f32]) -> Vec<f32> {
        debug_assert_eq!(near.len(), AEC_FRAME);
        debug_assert_eq!(far.len(), AEC_FRAME);

        // 1) Tell the canceller what was played (render / reverse stream).
        let mut far_out = vec![0.0f32; AEC_FRAME];
        let _ = self.apm.process_render_f32(&[far], &mut [&mut far_out]);

        // 2) Clean the mic (capture stream) using the learned echo path.
        let mut near_out = vec![0.0f32; AEC_FRAME];
        let _ = self.apm.process_capture_f32(&[near], &mut [&mut near_out]);

        near_out
    }
}

// ---------------------------------------------------------------------------
// Unit test — synthetic echo round-trip
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn correlation(a: &[f32], b: &[f32]) -> f32 {
        let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
        let norm_a = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm_a < 1e-10 || norm_b < 1e-10 { return 0.0; }
        dot / (norm_a * norm_b)
    }

    #[test]
    fn echo_measurably_reduced_after_convergence() {
        let mut aec = Aec::new();

        // far = sine wave (what the speaker plays)
        // near = voice sine (different frequency) + delayed attenuated echo of far
        let echo_delay = 24usize; // 0.5 ms at 48 kHz
        let echo_gain = 0.4f32;

        let mut last_near_corr = 1.0f32;
        let mut last_out_corr = 1.0f32;

        // Feed 200 consecutive frames so the canceller converges.
        for frame_idx in 0..200usize {
            let offset = frame_idx * AEC_FRAME;

            let far: Vec<f32> = (0..AEC_FRAME)
                .map(|i| ((offset + i) as f32 / 24.0).cos() * 0.5)
                .collect();

            let voice: Vec<f32> = (0..AEC_FRAME)
                .map(|i| ((offset + i) as f32 / 11.0).sin() * 0.3)
                .collect();

            // Echo = delayed, attenuated copy of far (previous frame's tail + this frame's head)
            let echo: Vec<f32> = (0..AEC_FRAME)
                .map(|i| {
                    let src_idx = (offset + i).saturating_sub(echo_delay);
                    let src_frame = src_idx / AEC_FRAME;
                    let src_in_frame = src_idx % AEC_FRAME;
                    let far_sample_offset = src_frame * AEC_FRAME + src_in_frame;
                    ((far_sample_offset as f32) / 24.0).cos() * 0.5 * echo_gain
                })
                .collect();

            let near: Vec<f32> = voice.iter().zip(&echo).map(|(v, e)| v + e).collect();

            let out = aec.process(&near, &far);

            if frame_idx >= 150 {
                last_near_corr = correlation(&near, &far);
                last_out_corr = correlation(&out, &far);
            }
        }

        // After convergence: output correlation with far should be substantially
        // lower than near's correlation with far (echo reduced, not eliminated).
        assert!(
            last_out_corr < last_near_corr * 0.8,
            "AEC did not reduce echo: near_corr={last_near_corr:.3}, out_corr={last_out_corr:.3}"
        );
    }
}
