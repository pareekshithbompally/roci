use hound::WavWriter;
use std::fs::File;
use std::io::BufWriter;

use crate::audio::align::AI_RATE_HZ;
use crate::audio::resample::ResamplerState;
use crate::audio::wav::{convert_to_i16, create_wav_writer};

/// Writes one clean mono f32 stream to two files:
///   • HQ  — verbatim at `input_rate`           → UI playback
///   • AI  — downsampled to AI_RATE_HZ (16 kHz)  → transcription
///
/// One DSP pipeline, two sinks — playback and transcription are provably the
/// same audio, just at two different rates.
pub struct DualSink {
    hq: WavWriter<BufWriter<File>>,
    ai: WavWriter<BufWriter<File>>,
    ai_resampler: ResamplerState,
}

impl DualSink {
    pub fn create(hq_path: &str, ai_path: &str, input_rate: u32) -> Result<Self, String> {
        Ok(Self {
            hq: create_wav_writer(hq_path, input_rate)?,
            ai: create_wav_writer(ai_path, AI_RATE_HZ)?,
            ai_resampler: ResamplerState::new(input_rate, AI_RATE_HZ),
        })
    }

    /// Write one chunk of clean mono f32 at `input_rate`.
    pub fn write(&mut self, mix: &[f32]) {
        for s in convert_to_i16(mix) {
            let _ = self.hq.write_sample(s);
        }
        let down = self.ai_resampler.process(mix);
        if !down.is_empty() {
            for s in convert_to_i16(&down) {
                let _ = self.ai.write_sample(s);
            }
        }
    }

    pub fn finalize(&mut self) {
        let _ = self.hq.flush();
        let _ = self.ai.flush();
    }
}
