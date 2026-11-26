//! Read aloud: markdown becomes sentence chunks spoken by macOS voices or a downloaded voice model, one reply at a time.

pub mod commands;
mod system;
mod playback;
mod text;
pub mod voice_model;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use crate::sync::lock;

/// A voice an engine can speak in: `id` is passed back to speak with it.
#[derive(Serialize)]
pub struct VoiceOption {
    pub id: String,
    pub name: String,
    /// A quality note (Premium, Enhanced) where the system reports one.
    pub detail: Option<&'static str>,
}

/// Stops one reply's speech: a flag read between chunks, and a wake-up for whatever is waiting on that reply.
#[derive(Default)]
pub struct Halt {
    stopped: AtomicBool,
    wakers: Mutex<Vec<Box<dyn Fn() + Send>>>,
}

impl Halt {
    pub fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::Acquire)
    }

    fn stop(&self) {
        let wakers = {
            let mut wakers = lock(&self.wakers);
            self.stopped.store(true, Ordering::Release);
            std::mem::take(&mut *wakers)
        };
        wakers.iter().for_each(|wake| wake());
    }

    /// Runs `wake` once the reply is stopped (at once if it already is), so waiting code blocks instead of polling.
    pub fn on_stop(&self, wake: impl Fn() + Send + 'static) {
        let mut wakers = lock(&self.wakers);
        if self.is_stopped() {
            drop(wakers);
            wake();
        } else {
            wakers.push(Box::new(wake));
        }
    }
}

/// Rendered chunks (each mono samples at its rate) as one 16-bit mono WAV file, at the first chunk's rate.
fn wav_of(parts: Vec<(Vec<f32>, u32)>) -> Result<Vec<u8>, String> {
    let rate = parts.first().map(|(_, rate)| *rate).ok_or("No sound was made")?;
    let spec = hound::WavSpec { channels: 1, sample_rate: rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
    let mut bytes = std::io::Cursor::new(Vec::new());
    let mut writer = hound::WavWriter::new(&mut bytes, spec).map_err(|e| e.to_string())?;
    for (samples, from) in parts {
        for sample in playback::resample(&samples, from, rate)? {
            writer.write_sample((sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16).map_err(|e| e.to_string())?;
        }
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(bytes.into_inner())
}

#[derive(Default)]
pub struct TtsState {
    /// The reply speaking now.
    current: Mutex<Option<Arc<Halt>>>,
}

impl TtsState {
    /// Stops whatever is speaking and returns the new reply's halt.
    fn begin(&self) -> Arc<Halt> {
        let halt = Arc::new(Halt::default());
        if let Some(previous) = lock(&self.current).replace(Arc::clone(&halt)) {
            previous.stop();
        }
        halt
    }

    fn stop(&self) {
        if let Some(current) = lock(&self.current).take() {
            current.stop();
        }
    }

    /// Stops speaking and frees the voice model about to be deleted.
    pub fn forget(&self) {
        self.stop();
        #[cfg(mobile)]
        crate::llama::unload(crate::models::catalog::Kind::Voice);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn rendered_chunks_become_one_wav_at_the_first_chunks_rate() {
        let second = |rate: u32| (vec![0.5; rate as usize], rate);
        let wav = wav_of(vec![second(16_000), second(24_000)]).unwrap();
        let reader = hound::WavReader::new(std::io::Cursor::new(wav)).unwrap();
        assert_eq!(reader.spec().sample_rate, 16_000);
        assert!((reader.duration() as i64 - 32_000).abs() < 1_000, "two seconds: {}", reader.duration());
        assert!(wav_of(Vec::new()).is_err());
    }

    /// The system voice renders a sentence to sound without playing it. AVFAudio hands the buffers over on the main queue,
    /// which only the app's run loop serves (the test harness has none), so this runs in the app, not here.
    #[test]
    #[ignore = "needs the app's main run loop"]
    fn the_system_voice_renders_without_playing() {
        let parts = system::render(&["The quarterly review is on Friday.".to_string()], None).unwrap();
        let (samples, rate) = &parts[0];
        assert!(*rate > 0 && samples.len() > *rate as usize / 2, "{} samples at {rate}", samples.len());
    }

    #[test]
    fn a_halt_wakes_waiters_registered_before_and_after_the_stop() {
        let halt = Halt::default();
        let (woken, wakes) = mpsc::channel();
        let early = woken.clone();
        halt.on_stop(move || early.send("before").unwrap());
        assert!(wakes.try_recv().is_err(), "nothing runs before the stop");
        halt.stop();
        halt.on_stop(move || woken.send("after").unwrap());
        assert!(halt.is_stopped());
        assert_eq!(wakes.try_iter().collect::<Vec<_>>(), ["before", "after"]);
    }
}
