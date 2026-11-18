//! The in-call transcript's audio: each source of the recording (microphone, system audio) at 16 kHz, cut at pauses into short
//! chunks the webview transcribes with the chosen speech model. Fed from the track writer, so it hears exactly what is recorded.

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::SAMPLE_RATE;
use super::resample::StreamingResampler;
use super::tracks::{AudioPacket, MeetingSource};

/// Rust → webview: one chunk of a source, or the end of the recording's chunks.
const CHUNK_EVENT: &str = "meeting-live://chunk";
const DONE_EVENT: &str = "meeting-live://done";

const RATE: usize = SAMPLE_RATE as usize;
/// A 20 ms frame, the unit pauses and silence are judged in.
const FRAME: usize = RATE / 50;
/// A chunk ends at the first pause after this much audio, so the transcript stays a few seconds behind the call.
const CHUNK_TARGET: usize = RATE * 6;
/// Without a pause, a chunk is cut here.
const CHUNK_MAX: usize = RATE * 10;
/// The last chunk at Stop is sent only if it is at least this long.
const MIN_TAIL: usize = RATE * 3 / 10;
/// A frame quieter than this is a pause.
const PAUSE_DB: f32 = -40.0;
/// A chunk with no frame this loud is silence and is not sent.
const SILENT_DB: f32 = -60.0;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveChunk {
    source: MeetingSource,
    start_ms: u64,
    end_ms: u64,
    /// 16 kHz mono 16-bit little-endian PCM, base64.
    pcm: String,
}

fn frame_db(frame: &[f32]) -> f32 {
    let mean = frame.iter().map(|s| s * s).sum::<f32>() / frame.len().max(1) as f32;
    10.0 * mean.max(1e-12).log10()
}

fn is_silent(samples: &[f32]) -> bool {
    samples.chunks(FRAME).all(|frame| frame_db(frame) < SILENT_DB)
}

/// One source's audio since its last chunk, on the recording's timeline.
struct SourceChunks {
    resampler: StreamingResampler,
    /// When this source's first packet arrived, in ms of the capture clock (pauses removed).
    origin_ms: u64,
    /// 16 kHz samples already sent or skipped.
    sent: usize,
    buffer: Vec<f32>,
}

impl SourceChunks {
    /// Whether the buffer should be cut now: at the first pause after the target length, or at the most.
    fn ready(&self) -> Option<usize> {
        if self.buffer.len() >= CHUNK_MAX {
            return Some(CHUNK_MAX);
        }
        let tail = self.buffer.len().checked_sub(FRAME)?;
        (self.buffer.len() >= CHUNK_TARGET && frame_db(&self.buffer[tail..]) < PAUSE_DB).then_some(self.buffer.len())
    }

    /// Takes the first `len` samples as a chunk; None when they are silence.
    fn take(&mut self, source: MeetingSource, len: usize) -> Option<LiveChunk> {
        let samples: Vec<f32> = self.buffer.drain(..len).collect();
        let start = self.sent;
        self.sent += len;
        if is_silent(&samples) {
            return None;
        }
        let ms = |samples: usize| self.origin_ms + (samples * 1_000 / RATE) as u64;
        let bytes: Vec<u8> = samples.iter().flat_map(|s| ((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16).to_le_bytes()).collect();
        Some(LiveChunk { source, start_ms: ms(start), end_ms: ms(self.sent), pcm: base64::engine::general_purpose::STANDARD.encode(bytes) })
    }
}

/// Cuts every written packet into chunks; sends what is left and the end when the recording stops (on drop).
pub(super) struct LiveChunker {
    app: AppHandle,
    microphone: Option<SourceChunks>,
    system: Option<SourceChunks>,
}

impl LiveChunker {
    pub(super) fn new(app: AppHandle) -> Self {
        Self { app, microphone: None, system: None }
    }

    fn emit(&self, chunk: LiveChunk) {
        if let Err(error) = self.app.emit(CHUNK_EVENT, chunk) {
            log::warn!("[meeting-live] chunk event failed: {error}");
        }
    }

    pub(super) fn offer(&mut self, packet: &AudioPacket) {
        let slot = match packet.source {
            MeetingSource::Microphone => &mut self.microphone,
            MeetingSource::System => &mut self.system,
        };
        if slot.is_none() {
            match StreamingResampler::new(packet.sample_rate) {
                Ok(resampler) => *slot = Some(SourceChunks { resampler, origin_ms: packet.arrival_us / 1_000, sent: 0, buffer: Vec::new() }),
                Err(error) => {
                    log::warn!("[meeting-live] no resampler for {} Hz: {error}", packet.sample_rate);
                    return;
                }
            }
        }
        let Some(chunks) = slot.as_mut() else { return };
        let resampled = chunks.resampler.push(&packet.samples);
        chunks.buffer.extend(resampled);
        let mut ready = Vec::new();
        while let Some(len) = chunks.ready() {
            ready.extend(chunks.take(packet.source, len));
        }
        ready.into_iter().for_each(|chunk| self.emit(chunk));
    }
}

impl Drop for LiveChunker {
    fn drop(&mut self) {
        let tails = [(MeetingSource::Microphone, self.microphone.take()), (MeetingSource::System, self.system.take())];
        for (source, chunks) in tails {
            if let Some(mut chunks) = chunks
                && chunks.buffer.len() >= MIN_TAIL
            {
                let len = chunks.buffer.len();
                if let Some(chunk) = chunks.take(source, len) {
                    self.emit(chunk);
                }
            }
        }
        if let Err(error) = self.app.emit(DONE_EVENT, ()) {
            log::warn!("[meeting-live] done event failed: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(len: usize) -> Vec<f32> {
        (0..len).map(|i| (i as f32 * 0.05).sin() * 0.5).collect()
    }

    fn chunks_of(buffer: Vec<f32>) -> SourceChunks {
        SourceChunks { resampler: StreamingResampler::new(SAMPLE_RATE).unwrap(), origin_ms: 1_000, sent: 0, buffer }
    }

    #[test]
    fn cuts_at_the_first_pause_after_the_target() {
        let mut buffer = tone(CHUNK_TARGET);
        assert_eq!(chunks_of(buffer.clone()).ready(), None, "no pause yet");
        buffer.extend(vec![0.0; FRAME]);
        assert_eq!(chunks_of(buffer.clone()).ready(), Some(buffer.len()));
    }

    #[test]
    fn cuts_at_the_most_without_a_pause() {
        assert_eq!(chunks_of(tone(CHUNK_MAX + 10)).ready(), Some(CHUNK_MAX));
    }

    #[test]
    fn skips_silence_but_keeps_the_timeline() {
        let mut chunks = chunks_of([vec![0.0; RATE], tone(RATE)].concat());
        assert!(chunks.take(MeetingSource::Microphone, RATE).is_none());
        let speech = chunks.take(MeetingSource::Microphone, RATE).unwrap();
        assert_eq!((speech.start_ms, speech.end_ms), (2_000, 3_000));
    }
}
