//! Speech output through cpal: one clip at a time; `play` blocks until the clip has played out, it's stopped, or the
//! device fails — woken by the audio callback or the stop, never by a timer.

use std::collections::VecDeque;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rubato::audioadapter_buffers::direct::InterleavedSlice;
use rubato::{Fft, FixedSync, Resampler, WindowFunction};
use super::Halt;
use crate::sync::lock;

const RESAMPLE_CHUNK: usize = 1024;

/// Play `samples` (mono, `rate` Hz). Returns when played out or stopped.
pub fn play(samples: &[f32], rate: u32, halt: &Halt) -> Result<(), String> {
    let device = cpal::default_host().default_output_device().ok_or("No audio output device")?;
    let config = device.default_output_config().map_err(|e| e.to_string())?;
    let channels = usize::from(config.channels());
    let queue = Arc::new(Mutex::new(VecDeque::from(resample(samples, rate, config.sample_rate())?)));

    // One wake-up ends the wait: played out, stopped, or the device failed.
    let (done, finished) = mpsc::channel::<Result<(), String>>();
    let (drained, failed, stopped) = (done.clone(), done.clone(), done);
    let feed = Arc::clone(&queue);
    let mut played_out = false;
    let stream = device
        .build_output_stream(
            config.config(),
            move |out: &mut [f32], _| {
                let mut queue = lock(&feed);
                for frame in out.chunks_mut(channels) {
                    frame.fill(queue.pop_front().unwrap_or(0.0));
                }
                if queue.is_empty() && !played_out {
                    played_out = true;
                    let _ = drained.send(Ok(()));
                }
            },
            move |error| {
                log::warn!("[engine] playback error: {error}");
                let _ = failed.send(Err(error.to_string()));
            },
            None,
        )
        .map_err(|e| e.to_string())?;
    halt.on_stop(move || {
        let _ = stopped.send(Ok(()));
    });
    stream.play().map_err(|e| e.to_string())?;
    finished.recv().unwrap_or(Ok(()))
}

/// Whole-clip resampling (rubato FFT, the audio module's settings).
pub(super) fn resample(samples: &[f32], from: u32, to: u32) -> Result<Vec<f32>, String> {
    if from == to || samples.is_empty() {
        return Ok(samples.to_vec());
    }
    let mut resampler = Fft::<f32>::new_custom(
        from as usize,
        to as usize,
        RESAMPLE_CHUNK,
        1,
        1,
        WindowFunction::BlackmanHarris2,
        FixedSync::Input,
    )
    .map_err(|e| e.to_string())?;
    let delay = resampler.output_delay();
    let mut padded = samples.to_vec();
    padded.resize(samples.len().div_ceil(RESAMPLE_CHUNK) * RESAMPLE_CHUNK + RESAMPLE_CHUNK, 0.0);

    let mut out = Vec::with_capacity(padded.len() * to as usize / from as usize);
    for chunk in padded.chunks(RESAMPLE_CHUNK) {
        let input = InterleavedSlice::new(chunk, 1, chunk.len()).map_err(|e| e.to_string())?;
        out.extend(resampler.process(&input, None).map_err(|e| e.to_string())?.take_data());
    }
    let wanted = samples.len() * to as usize / from as usize;
    Ok(out.into_iter().skip(delay).take(wanted).collect())
}

#[cfg(test)]
mod tests {
    use super::resample;

    #[test]
    fn resampling_keeps_duration() {
        let one_second = vec![0.0f32; 24_000];
        assert_eq!(resample(&one_second, 24_000, 48_000).unwrap().len(), 48_000);
        assert_eq!(resample(&one_second, 24_000, 24_000).unwrap().len(), 24_000);
    }
}
