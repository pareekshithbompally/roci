//! Speech detection (Silero VAD, bundled): only speech reaches a transcription model, which would invent text for silence.

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use transcribe_cpp::{Backend, Model, ModelOptions, VadOptions, VadSession};

use super::engine::{engine_error, init_logging};
use crate::models::LocalError;
use crate::sync::lock;

/// The bundled model, as the app's resources hold it.
pub const MODEL_RESOURCE: &str = "silero-vad-v6.2-F32.gguf";

/// A frame this likely to be speech is speech: 0.4 still hears a whisper at -43 dBFS and rejects a meeting's silence.
const THRESHOLD: f64 = 0.4;
/// Shorter speech is dropped: 160 ms keeps a short "Ok" and rejects clicks and keys.
const MIN_SPEECH_MS: i32 = 160;
/// Pauses shorter than this stay inside one span.
const MIN_SILENCE_MS: i32 = 800;
/// Audio kept on both sides of speech, so word edges aren't clipped.
const SPEECH_PAD_MS: i32 = 120;

/// One span of speech in samples of the input: `[start, end)`.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSpan {
    pub start_sample: i64,
    pub end_sample: i64,
}

/// The detector, loaded on first use and kept (1 MB, on the CPU); calls are blocking and serialized.
#[derive(Default)]
pub struct SpeechDetector {
    session: Mutex<Option<VadSession>>,
}

impl SpeechDetector {
    /// The speech spans in 16 kHz mono `pcm`, by the model at `path`.
    pub fn spans(&self, path: &Path, pcm: &[f32]) -> Result<Vec<SpeechSpan>, LocalError> {
        let mut slot = lock(&self.session);
        let mut session = match slot.take() {
            Some(session) => session,
            None => load(path)?,
        };
        let spans = detect(&mut session, pcm);
        *slot = Some(session);
        spans
    }
}

/// The CPU loads it in milliseconds and gives the reference results; a first Metal start can take seconds.
fn load(path: &Path) -> Result<VadSession, LocalError> {
    init_logging();
    let model = Model::load_with(path, &ModelOptions { backend: Backend::Cpu, ..ModelOptions::default() }).map_err(engine_error)?;
    model.vad_session().map_err(engine_error)
}

fn detect(session: &mut VadSession, pcm: &[f32]) -> Result<Vec<SpeechSpan>, LocalError> {
    let options = VadOptions {
        threshold: THRESHOLD,
        min_speech_ms: MIN_SPEECH_MS,
        min_silence_ms: MIN_SILENCE_MS,
        speech_pad_ms: SPEECH_PAD_MS,
        ..VadOptions::default()
    };
    let result = session.run(pcm, &options).map_err(engine_error)?;
    Ok(result.segments.iter().map(|s| SpeechSpan { start_sample: s.start_sample, end_sample: s.end_sample }).collect())
}
