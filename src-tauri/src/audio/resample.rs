use audioadapter_buffers::direct::SequentialSliceOfVecs;
use rubato::{Fft, FixedSync, Resampler};
use std::collections::VecDeque;

pub(crate) const RESAMPLER_CHUNK_SIZE: usize = 1024;

pub struct ResamplerState {
    pub resampler: Fft<f32>,
    pub input_buf: VecDeque<f32>,
    pub chunk_size: usize,
    from_rate: u32,
    to_rate: u32,
}

impl ResamplerState {
    pub fn new(from_rate: u32, to_rate: u32) -> Self {
        let resampler = Fft::<f32>::new(
            from_rate as usize,
            to_rate as usize,
            RESAMPLER_CHUNK_SIZE,
            2, // sub_chunks — reduces latency with minimal quality cost
            1, // channels (mono)
            FixedSync::Input,
        )
        .expect("rubato: invalid resampler config");
        let chunk_size = resampler.input_frames_next();
        Self {
            resampler,
            input_buf: VecDeque::new(),
            chunk_size,
            from_rate,
            to_rate,
        }
    }

    /// Clears buffered input and rebuilds the resampler. Used on pause/resume
    /// to prevent stale-overlap smear at the seam (wired up in Phase 4).
    pub fn reset(&mut self) {
        self.input_buf.clear();
        self.resampler = Fft::<f32>::new(
            self.from_rate as usize,
            self.to_rate as usize,
            RESAMPLER_CHUNK_SIZE,
            2,
            1,
            FixedSync::Input,
        )
        .expect("rubato: invalid resampler config");
        self.chunk_size = self.resampler.input_frames_next();
    }

    /// Accepts an arbitrary number of mono f32 samples, buffers them, and
    /// returns all resampled output available for complete chunks.
    pub fn process(&mut self, samples: &[f32]) -> Vec<f32> {
        self.input_buf.extend(samples.iter().copied());
        let mut result = Vec::new();
        while self.input_buf.len() >= self.chunk_size {
            let chunk: Vec<f32> = self.input_buf.drain(..self.chunk_size).collect();
            let input_vecs: [Vec<f32>; 1] = [chunk];
            let adapter =
                SequentialSliceOfVecs::new(&input_vecs[..], 1, self.chunk_size)
                    .expect("rubato input adapter");
            if let Ok(out) = self.resampler.process(&adapter, 0, None) {
                result.extend_from_slice(&out.take_data());
            }
        }
        result
    }
}
