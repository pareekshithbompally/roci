//! The warm engine: one model loaded at a time, dropped when idle; calls are blocking and serialized.

use std::io::Cursor;
use std::ops::Range;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, Once};

use serde::Serialize;
use transcribe_cpp::{DeviceType, Model, RunOptions, Session, SessionOptions};

use crate::models::gpu::{self, Priority};
use crate::models::LocalError;
use crate::sync::lock;

/// The engine's input: 16 kHz mono (the pipeline sends 16-bit PCM WAV at this rate).
const SAMPLE_RATE: usize = 16_000;
/// A cut between windows lands on the quietest 20 ms in the window's last 3 s.
const CUT_FRAME: usize = SAMPLE_RATE / 50;
const CUT_SEARCH: usize = 3 * SAMPLE_RATE;

/// One timed piece of text, in seconds from the start of the audio.
#[derive(Debug, Serialize)]
pub struct TimedText {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

/// What the engine heard: its timed segments, and each word's own time when the model gives them.
#[derive(Debug, Default, Serialize)]
pub struct Timed {
    pub segments: Vec<TimedText>,
    pub words: Vec<TimedText>,
}

pub struct Loaded {
    id: &'static str,
    pub session: Session,
    /// Longest audio per run in samples; 0 = no limit (the family chunks itself).
    max_samples: usize,
    /// The model can transcribe audio while it's still arriving.
    pub streams: bool,
    /// The language codes the model takes (`en`, or locales like `en-US`); empty = any.
    languages: Vec<String>,
}

impl Loaded {
    /// Run options in the model's own spelling of `language`.
    pub fn run_options(&self, language: &str) -> RunOptions {
        RunOptions { language: hint_for(&self.languages, language), ..RunOptions::default() }
    }
}

/// `language` as the model advertises it (itself, else its first locale); None lets the model detect.
fn hint_for(advertised: &[String], language: &str) -> Option<String> {
    if advertised.is_empty() || advertised.iter().any(|l| l == language) {
        return Some(language.to_string());
    }
    let prefix = format!("{language}-");
    advertised.iter().find(|l| l.starts_with(&prefix)).cloned()
}

#[derive(Default)]
pub struct Engine {
    loaded: Mutex<Option<Loaded>>,
    /// Bumped by every call, so an idle timer only unloads if nothing ran since.
    generation: AtomicU64,
}

impl Engine {
    /// Marks activity; the returned generation is what an idle timer checks.
    pub fn touch(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn unload_if_idle(&self, generation: u64) {
        if self.generation.load(Ordering::SeqCst) == generation {
            self.unload();
        }
    }

    fn unload(&self) {
        lock(&self.loaded).take();
    }

    /// Lets go of a model about to be deleted (no-op when another is warm).
    pub fn forget(&self, id: &str) {
        let mut loaded = lock(&self.loaded);
        if loaded.as_ref().is_some_and(|l| l.id == id) {
            loaded.take();
        }
    }

    /// Runs `work` on the model at `path` (loaded if needed), holding the engine for the whole call.
    pub fn with_loaded<R>(&self, id: &'static str, path: &Path, work: impl FnOnce(&mut Loaded) -> Result<R, LocalError>) -> Result<R, LocalError> {
        let mut guard = lock(&self.loaded);
        if guard.as_ref().map(|l| l.id) != Some(id) {
            guard.take();
            *guard = Some(load(id, path)?);
        }
        work(guard.as_mut().ok_or(LocalError::NotDownloaded)?)
    }

    /// Transcribes 16 kHz mono samples with the model at `path`, holding the engine and the GPU one window at a time, so a
    /// meeting's live chunks get in between the windows of a long file (always engine, then GPU: dictation holds both that way).
    pub fn transcribe(&self, id: &'static str, path: &Path, pcm: &[f32], language: &str) -> Result<Timed, LocalError> {
        let max_samples = self.with_loaded(id, path, |loaded| Ok(loaded.max_samples))?;
        let mut out = Timed::default();
        for window in windows(pcm, max_samples) {
            let span = (seconds(window.start), seconds(window.end));
            let transcript = self.with_loaded(id, path, |loaded| {
                let options = loaded.run_options(language);
                gpu::run(Priority::Realtime, || loaded.session.run(&pcm[window], &options)).map_err(engine_error)
            })?;
            let heard = timed(transcript, span);
            out.segments.extend(heard.segments);
            out.words.extend(heard.words);
        }
        Ok(out)
    }
}


/// 16-bit PCM WAV at the engine's rate, mono → samples in [-1, 1].
pub fn decode_wav(bytes: &[u8]) -> Result<Vec<f32>, LocalError> {
    let reader = hound::WavReader::new(Cursor::new(bytes)).map_err(|e| LocalError::BadInput(e.to_string()))?;
    let spec = reader.spec();
    if spec.channels != 1 || spec.sample_rate as usize != SAMPLE_RATE || spec.bits_per_sample != 16 {
        return Err(LocalError::BadInput(format!("expected 16 kHz mono 16-bit, got {spec:?}")));
    }
    reader
        .into_samples::<i16>()
        .map(|s| s.map(|v| f32::from(v) / f32::from(i16::MAX)))
        .collect::<Result<_, _>>()
        .map_err(|e| LocalError::BadInput(e.to_string()))
}

fn load(id: &'static str, path: &Path) -> Result<Loaded, LocalError> {
    static LOGGING: Once = Once::new();
    LOGGING.call_once(transcribe_cpp::init_logging);
    let model = Model::load(path).map_err(engine_error)?;
    let capabilities = model.capabilities().map_err(engine_error)?;
    let max_ms = capabilities.max_audio_ms.max(0) as usize;
    // On a GPU only the decoder runs on the CPU; extra ggml worker threads would spin and stall it.
    let on_gpu = model.device().is_ok_and(|d| matches!(d.device_type, DeviceType::Gpu | DeviceType::Igpu));
    let session_options = SessionOptions { n_threads: if on_gpu { 1 } else { 0 }, ..SessionOptions::default() };
    let session = model.session_with(&session_options).map_err(engine_error)?;
    log::info!("[stt] loaded {id} on {} (max {max_ms} ms per run)", model.backend());
    Ok(Loaded {
        id,
        session,
        max_samples: max_ms * SAMPLE_RATE / 1000,
        streams: capabilities.supports_streaming,
        languages: capabilities.languages,
    })
}

pub fn engine_error(error: transcribe_cpp::Error) -> LocalError {
    LocalError::Engine(error.to_string())
}

fn seconds(sample: usize) -> f64 {
    sample as f64 / SAMPLE_RATE as f64
}

/// Timed segments and words shifted onto the audio's clock; untimed text gives one segment spanning its window.
fn timed(transcript: transcribe_cpp::Transcript, (start, end): (f64, f64)) -> Timed {
    let at = |ms: i64| start + ms as f64 / 1000.0;
    let words = transcript
        .words
        .into_iter()
        .filter(|w| !w.text.trim().is_empty())
        .map(|w| TimedText { text: w.text.trim().to_string(), start: at(w.t0_ms.max(0)), end: at(w.t1_ms.max(w.t0_ms).max(0)) })
        .collect();
    let mut segments: Vec<TimedText> = transcript
        .segments
        .into_iter()
        .filter(|s| s.t1_ms > s.t0_ms && !s.text.trim().is_empty())
        .map(|s| TimedText { text: s.text.trim().to_string(), start: at(s.t0_ms), end: at(s.t1_ms) })
        .collect();
    let text = transcript.text.trim();
    if segments.is_empty() && !text.is_empty() {
        segments.push(TimedText { text: text.to_string(), start, end });
    }
    Timed { segments, words }
}

/// The audio as runs the model accepts: whole, or windows of at most `max` samples cut at quiet moments.
fn windows(pcm: &[f32], max: usize) -> Vec<Range<usize>> {
    if max == 0 || pcm.len() <= max {
        return vec![0..pcm.len()];
    }
    let mut out = Vec::new();
    let mut start = 0;
    while pcm.len() - start > max {
        let end = quietest_cut(pcm, start + max.saturating_sub(CUT_SEARCH).max(1), start + max);
        out.push(start..end);
        start = end;
    }
    out.push(start..pcm.len());
    out
}

/// The start of the lowest-energy frame in `from..to`.
fn quietest_cut(pcm: &[f32], from: usize, to: usize) -> usize {
    (from..to.saturating_sub(CUT_FRAME).max(from + 1))
        .step_by(CUT_FRAME)
        .min_by(|&a, &b| energy(&pcm[a..a + CUT_FRAME]).total_cmp(&energy(&pcm[b..b + CUT_FRAME])))
        .unwrap_or(to)
}

fn energy(frame: &[f32]) -> f32 {
    frame.iter().map(|s| s * s).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(rate: u32, channels: u16) -> Vec<u8> {
        let spec = hound::WavSpec { channels, sample_rate: rate, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut out = Cursor::new(Vec::new());
        let mut writer = hound::WavWriter::new(&mut out, spec).unwrap();
        for sample in [0i16, i16::MAX, -i16::MAX, 0] {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
        out.into_inner()
    }

    #[test]
    fn decodes_16k_mono_only() {
        assert_eq!(decode_wav(&wav(16_000, 1)).unwrap(), vec![0.0, 1.0, -1.0, 0.0]);
        assert!(decode_wav(&wav(48_000, 1)).is_err());
        assert!(decode_wav(&wav(16_000, 2)).is_err());
    }

    #[test]
    fn language_in_the_models_spelling() {
        let locales = vec!["de-DE".to_string(), "en-US".to_string()];
        assert_eq!(hint_for(&locales, "en"), Some("en-US".into()));
        assert_eq!(hint_for(&["en".to_string()], "en"), Some("en".into()));
        assert_eq!(hint_for(&[], "en"), Some("en".into()));
        assert_eq!(hint_for(&locales, "ja"), None);
    }

    #[test]
    fn short_audio_is_one_window() {
        assert_eq!(windows(&[0.0; 100], 0), vec![0..100]);
        assert_eq!(windows(&[0.0; 100], 200), vec![0..100]);
    }

    #[test]
    fn long_audio_is_cut_at_the_quiet_moment() {
        let max = 10 * SAMPLE_RATE;
        let mut pcm = vec![0.5f32; 25 * SAMPLE_RATE];
        let silence = 8 * SAMPLE_RATE;
        pcm[silence..silence + CUT_FRAME].fill(0.0);
        let windows = windows(&pcm, max);
        assert_eq!(windows[0], 0..silence);
        assert!(windows.iter().all(|w| w.len() <= max));
        assert_eq!(windows.last().unwrap().end, pcm.len());
    }
}

