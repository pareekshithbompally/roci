use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler, WindowFunction};

use super::SAMPLE_RATE;

const CHUNK_SIZE: usize = 1024;

/// Incremental resampling to 16 kHz for long recordings that must not be
/// held in memory. Output excludes the resampler delay.
pub struct StreamingResampler {
    resampler: Option<Fft<f32>>,
    input: Vec<f32>,
    delay_remaining: usize,
}

impl StreamingResampler {
    pub fn new(source_rate: u32) -> Result<Self, String> {
        let resampler = (source_rate != SAMPLE_RATE)
            .then(|| {
                Fft::new_custom(
                    source_rate as usize,
                    SAMPLE_RATE as usize,
                    CHUNK_SIZE,
                    1,
                    1,
                    WindowFunction::BlackmanHarris2,
                    FixedSync::Input,
                )
                .map_err(|error| error.to_string())
            })
            .transpose()?;
        let delay_remaining = resampler.as_ref().map_or(0, Fft::output_delay);
        Ok(Self {
            resampler,
            input: Vec::with_capacity(CHUNK_SIZE),
            delay_remaining,
        })
    }

    pub fn push(&mut self, mut samples: &[f32]) -> Vec<f32> {
        let Some(resampler) = &mut self.resampler else {
            return samples.to_vec();
        };
        let mut output = Vec::new();
        while !samples.is_empty() {
            let take = samples.len().min(CHUNK_SIZE - self.input.len());
            self.input.extend_from_slice(&samples[..take]);
            samples = &samples[take..];
            if self.input.len() == CHUNK_SIZE {
                output.extend(resample_chunk(resampler, &self.input));
                self.input.clear();
            }
        }
        self.trim_delay(output)
    }

    fn trim_delay(&mut self, mut output: Vec<f32>) -> Vec<f32> {
        let trimmed = self.delay_remaining.min(output.len());
        output.drain(..trimmed);
        self.delay_remaining -= trimmed;
        output
    }
}

/// Resamples one full mono chunk.
fn resample_chunk(resampler: &mut Fft<f32>, samples: &[f32]) -> Vec<f32> {
    let input =
        InterleavedSlice::new(samples, 1, samples.len()).expect("mono chunk fits its slice");
    resampler
        .process(&input, None)
        .expect("fixed-rate resampling must succeed")
        .take_data()
}
