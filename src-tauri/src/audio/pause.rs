//! Pause detection over 16 kHz meeting audio, so the in-call transcript cuts chunks at natural pauses.
//!
//! Speech is any 20 ms frame at least 12 dB above an adaptive noise floor and never quieter than -55 dBFS. The floor starts at
//! the first frame, falls immediately and rises slowly, so speech between word gaps cannot drag it up to the speech level.
//! A piece ends in the middle of a pause, leaving both neighbours some silence as padding.

use std::time::Duration;

use super::SAMPLE_RATE;

const RATE: usize = SAMPLE_RATE as usize;
pub(super) const FRAME_SAMPLES: usize = RATE / 50;
const SPEECH_MARGIN_DB: f32 = 12.0;
const MINIMUM_SPEECH_DB: f32 = -55.0;
const LOWEST_FLOOR_DB: f32 = -90.0;
/// About 3 dB per second at 50 frames per second.
const FLOOR_RISE_DB_PER_FRAME: f32 = 0.06;
const MINIMUM_PIECE: Duration = Duration::from_secs(3);
const PAUSE: Duration = Duration::from_millis(600);
const LONG_PIECE: Duration = Duration::from_secs(8);
const LONG_PIECE_PAUSE: Duration = Duration::from_millis(300);

/// Classifies consecutive 20 ms frames as speech or not against the adaptive noise floor.
#[derive(Default)]
struct SpeechFrames {
    floor_db: Option<f32>,
}

impl SpeechFrames {
    /// Whether `frame` is speech: its DC-removed level clears the floor by the margin and the absolute minimum.
    fn is_speech(&mut self, frame: &[f32]) -> bool {
        let count = frame.len() as f32;
        let mean = frame.iter().sum::<f32>() / count;
        let energy = frame.iter().map(|s| (s - mean) * (s - mean)).sum::<f32>() / count;
        let level_db = if energy.is_finite() { 10.0 * energy.max(1e-18).log10() } else { 0.0 };
        let floor_db = match self.floor_db {
            Some(floor_db) if level_db >= floor_db => floor_db + FLOOR_RISE_DB_PER_FRAME,
            _ => level_db.max(LOWEST_FLOOR_DB),
        };
        self.floor_db = Some(floor_db);
        level_db > (floor_db + SPEECH_MARGIN_DB).max(MINIMUM_SPEECH_DB)
    }
}

/// Finds pauses worth cutting at: after speech, at least 3 s into a piece, a 600 ms pause (300 ms once a piece passes 8 s).
#[derive(Default)]
pub(super) struct PauseSegmenter {
    speech: SpeechFrames,
    frame: Vec<f32>,
    position: usize,
    piece_start: usize,
    silent_frames: usize,
    heard_speech: bool,
}

impl PauseSegmenter {
    /// Consumes contiguous samples; returns the last cut found in them, as a sample offset from the first sample ever pushed.
    pub(super) fn push(&mut self, mut samples: &[f32]) -> Option<usize> {
        let mut cut = None;
        while !samples.is_empty() {
            let take = samples.len().min(FRAME_SAMPLES - self.frame.len());
            self.frame.extend_from_slice(&samples[..take]);
            samples = &samples[take..];
            if self.frame.len() == FRAME_SAMPLES {
                cut = self.complete_frame().or(cut);
                self.frame.clear();
            }
        }
        cut
    }

    fn complete_frame(&mut self) -> Option<usize> {
        self.position += FRAME_SAMPLES;
        if self.speech.is_speech(&self.frame) {
            self.silent_frames = 0;
            self.heard_speech = true;
            return None;
        }
        self.silent_frames += 1;
        let piece = self.position - self.piece_start;
        let pause = if piece >= samples(LONG_PIECE) { LONG_PIECE_PAUSE } else { PAUSE };
        if !self.heard_speech || piece < samples(MINIMUM_PIECE) || self.silent_frames * FRAME_SAMPLES < samples(pause) {
            return None;
        }
        let cut = self.position - self.silent_frames * FRAME_SAMPLES / 2;
        self.piece_start = cut;
        self.silent_frames = 0;
        self.heard_speech = false;
        Some(cut)
    }
}

const fn samples(duration: Duration) -> usize {
    duration.as_millis() as usize * RATE / 1_000
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;

    /// Deterministic noise at a target RMS level in dBFS.
    pub(in crate::audio) fn noise(duration_ms: usize, level_db: f32, seed: &mut u32) -> Vec<f32> {
        let amplitude = 10f32.powf(level_db / 20.0) * 3f32.sqrt();
        (0..duration_ms * RATE / 1_000)
            .map(|_| {
                *seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                amplitude * ((*seed >> 8) as f32 / (1u32 << 24) as f32 * 2.0 - 1.0)
            })
            .collect()
    }

    #[test]
    fn cuts_in_the_middle_of_a_pause_after_speech() {
        let mut seed = 7;
        let mut segmenter = PauseSegmenter::default();
        let mut audio = noise(200, -70.0, &mut seed);
        audio.extend(noise(3_500, -20.0, &mut seed));
        audio.extend(noise(800, -70.0, &mut seed));
        let cut = segmenter.push(&audio).expect("a pause after 3.5 s of speech");
        let speech_end = samples(Duration::from_millis(3_700));
        assert!(cut > speech_end && cut < audio.len(), "cut {cut} sits inside the pause");
    }

    #[test]
    fn no_cut_before_three_seconds_or_without_speech() {
        let mut seed = 9;
        let mut segmenter = PauseSegmenter::default();
        let mut audio = noise(1_000, -20.0, &mut seed);
        audio.extend(noise(800, -70.0, &mut seed));
        assert_eq!(segmenter.push(&audio), None);
        assert_eq!(PauseSegmenter::default().push(&noise(5_000, -70.0, &mut seed)), None);
    }
}
