//! The in-call transcript's audio: each source of the recording (microphone, system audio) at 16 kHz, cut into short chunks
//! that end at pauses when possible — a hard cut overlaps the next chunk, whose start the webview splices at the seam — for the
//! webview to transcribe with the chosen speech model. Fed from the track writer, so it hears exactly what is recorded.

use std::collections::VecDeque;
use std::sync::Mutex;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::SAMPLE_RATE;
use super::echo::{EchoEnvelope, Signal};
use super::pause::{FRAME_SAMPLES, PauseSegmenter};
use super::resample::StreamingResampler;
use super::tracks::{AudioPacket, MeetingSource};

/// Rust → webview: one chunk of a source, or the end of the recording's chunks.
const CHUNK_EVENT: &str = "meeting-live://chunk";
const DONE_EVENT: &str = "meeting-live://done";

const RATE: usize = SAMPLE_RATE as usize;
/// Pause cuts closer than this to the chunk start are ignored.
const CHUNK_MIN: usize = RATE * 3;
/// The first pause after this length ends a chunk; short chunks keep the transcript a few seconds behind the call.
const CHUNK_TARGET: usize = RATE * 6;
/// Without a pause, a chunk is cut here and the next one overlaps it.
const CHUNK_MAX: usize = RATE * 10;
const CHUNK_OVERLAP: usize = RATE * 2;
const MIN_TAIL: usize = RATE * 3 / 10;
/// A chunk with no 20 ms frame this loud is silence and is not sent.
const SILENT_DB: f32 = -60.0;
/// A source arriving this much later than its audio so far accounts for is a dropout, counted as silence.
const GAP_TOLERANCE_MS: u64 = 500;

/// The current recording's sound of both sources on one timeline, for the webview's echo check; kept until the next recording.
static ENVELOPE: Mutex<Option<EchoEnvelope>> = Mutex::new(None);

/// What the sound says about each microphone span (`[start_ms, end_ms]`, capture clock): bleed of the system audio, local speech,
/// or undecided (null) when there is too little sound or remote audio to tell.
#[tauri::command]
pub fn meeting_echo_signals(spans: Vec<(u64, u64)>) -> Vec<Option<Signal>> {
    let envelope = ENVELOPE.lock().unwrap_or_else(|e| e.into_inner());
    spans.iter().map(|&(start, end)| envelope.as_ref().and_then(|e| e.assess(start, end))).collect()
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveChunk {
    source: MeetingSource,
    start_ms: u64,
    end_ms: u64,
    /// Leading audio the previous chunk already covered, which the webview splices at the seam.
    overlap_ms: u64,
    /// 16 kHz mono 16-bit little-endian PCM, base64.
    pcm: String,
    /// This source's chunks sent before this one (0, 1, 2…): a number the webview skips is a chunk it never got.
    seq: u64,
}

/// The end of a recording's chunks: how many each source sent, so a chunk lost at the very end is noticed too.
#[derive(Clone, Serialize)]
struct LiveDone {
    microphone: u64,
    system: u64,
}

#[derive(Debug)]
struct Chunk {
    /// 16 kHz offset of `samples[0]` within the source.
    start: usize,
    /// Leading samples shared with the previous chunk.
    overlap: usize,
    samples: Vec<f32>,
}

impl Chunk {
    fn is_silent(&self) -> bool {
        let threshold = 10_f32.powf(SILENT_DB / 10.0);
        self.samples
            .chunks(FRAME_SAMPLES)
            .all(|frame| frame.iter().map(|s| s * s).sum::<f32>() / (frame.len() as f32) < threshold)
    }
}

/// Splits a 16 kHz source into chunks that end at pauses when possible.
#[derive(Default)]
struct Chunker {
    buffer: Vec<f32>,
    buffer_start: usize,
    chunk_start: usize,
    overlap: usize,
    segmenter: PauseSegmenter,
    pauses: VecDeque<usize>,
}

impl Chunker {
    fn push(&mut self, samples: &[f32]) -> Vec<Chunk> {
        for frame in samples.chunks(FRAME_SAMPLES) {
            if let Some(cut) = self.segmenter.push(frame) {
                self.pauses.push_back(cut);
            }
        }
        self.buffer.extend_from_slice(samples);
        std::iter::from_fn(|| self.next_chunk()).collect()
    }

    /// The audio not yet in a chunk, as one last chunk when at least `MIN_TAIL` follows the previous one.
    fn finish(self) -> Option<Chunk> {
        let begin = self.chunk_start - self.overlap;
        (self.end() >= self.chunk_start + MIN_TAIL).then(|| Chunk {
            start: begin,
            overlap: self.overlap,
            samples: self.buffer[begin - self.buffer_start..].to_vec(),
        })
    }

    fn end(&self) -> usize {
        self.buffer_start + self.buffer.len()
    }

    fn next_chunk(&mut self) -> Option<Chunk> {
        let start = self.chunk_start;
        let end = self.end();
        self.pauses.retain(|&cut| cut >= start + CHUNK_MIN);
        let limit = start + CHUNK_MAX;
        let preferred = self.pauses.iter().copied().find(|&cut| cut >= start + CHUNK_TARGET && cut <= limit.min(end));
        let (cut, next_overlap) = match preferred {
            Some(cut) => (cut, 0),
            None if end >= limit => self.pauses.iter().copied().rfind(|&cut| cut <= limit).map_or((limit, CHUNK_OVERLAP), |cut| (cut, 0)),
            None => return None,
        };
        let begin = start - self.overlap;
        let chunk = Chunk { start: begin, overlap: self.overlap, samples: self.buffer[begin - self.buffer_start..cut - self.buffer_start].to_vec() };
        let keep_from = cut - next_overlap;
        self.buffer.drain(..keep_from - self.buffer_start);
        self.buffer_start = keep_from;
        self.chunk_start = cut;
        self.overlap = next_overlap;
        Some(chunk)
    }
}

/// One source on the recording's timeline: its resampler, its chunker, and where its audio began.
struct Source {
    resampler: StreamingResampler,
    chunker: Chunker,
    /// When this source's first packet arrived, in ms of the capture clock (pauses removed).
    origin_ms: u64,
    /// 16 kHz samples fed so far, dropouts counted as silence.
    fed: usize,
    /// Chunks sent so far.
    sent: u64,
}

impl Source {
    fn ms(&self, samples: usize) -> u64 {
        self.origin_ms + (samples * 1_000 / RATE) as u64
    }

    /// Silence for a dropout: the packet arrived later than the audio fed so far accounts for.
    fn gap_before(&self, arrival_ms: u64) -> usize {
        let due_ms = self.ms(self.fed);
        if arrival_ms <= due_ms + GAP_TOLERANCE_MS { 0 } else { ((arrival_ms - due_ms) as usize) * RATE / 1_000 }
    }

    fn feed(&mut self, samples: &[f32]) -> Vec<Chunk> {
        self.fed += samples.len();
        self.chunker.push(samples)
    }

    /// The chunks worth sending (silence never is), as events numbered in order.
    fn events(&mut self, source: MeetingSource, chunks: Vec<Chunk>) -> Vec<LiveChunk> {
        let chunks: Vec<Chunk> = chunks.into_iter().filter(|c| !c.is_silent()).collect();
        chunks.iter().map(|c| self.event(source, c)).collect()
    }

    fn event(&mut self, source: MeetingSource, chunk: &Chunk) -> LiveChunk {
        let seq = self.sent;
        self.sent += 1;
        let bytes: Vec<u8> = chunk.samples.iter().flat_map(|s| ((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16).to_le_bytes()).collect();
        LiveChunk {
            source,
            start_ms: self.ms(chunk.start),
            end_ms: self.ms(chunk.start + chunk.samples.len()),
            overlap_ms: (chunk.overlap * 1_000 / RATE) as u64,
            pcm: base64::engine::general_purpose::STANDARD.encode(bytes),
            seq,
        }
    }
}

/// Cuts every written packet into chunks; sends what is left and the end when the recording stops (on drop).
pub(super) struct LiveChunker {
    app: AppHandle,
    microphone: Option<Source>,
    system: Option<Source>,
}

impl LiveChunker {
    pub(super) fn new(app: AppHandle) -> Self {
        *ENVELOPE.lock().unwrap_or_else(|e| e.into_inner()) = Some(EchoEnvelope::default());
        Self { app, microphone: None, system: None }
    }

    fn send(&self, events: Vec<LiveChunk>) {
        for event in events {
            if let Err(error) = self.app.emit(CHUNK_EVENT, event) {
                log::warn!("[meeting-live] chunk event failed: {error}");
            }
        }
    }

    pub(super) fn offer(&mut self, packet: &AudioPacket) {
        let slot = match packet.source {
            MeetingSource::Microphone => &mut self.microphone,
            MeetingSource::System => &mut self.system,
        };
        if slot.is_none() {
            match StreamingResampler::new(packet.sample_rate) {
                Ok(resampler) => *slot = Some(Source { resampler, chunker: Chunker::default(), origin_ms: packet.arrival_us / 1_000, fed: 0, sent: 0 }),
                Err(error) => {
                    log::warn!("[meeting-live] no resampler for {} Hz: {error}", packet.sample_rate);
                    return;
                }
            }
        }
        let Some(source) = slot.as_mut() else { return };
        let gap = source.gap_before(packet.arrival_us / 1_000);
        let mut chunks = if gap > 0 { source.feed(&vec![0.0; gap]) } else { Vec::new() };
        let resampled = source.resampler.push(&packet.samples);
        if let Some(envelope) = ENVELOPE.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            envelope.push(packet.source, source.ms(source.fed), &resampled, SAMPLE_RATE);
        }
        chunks.extend(source.feed(&resampled));
        let events = source.events(packet.source, chunks);
        self.send(events);
    }
}

impl Drop for LiveChunker {
    fn drop(&mut self) {
        let mut done = LiveDone { microphone: 0, system: 0 };
        for (kind, source) in [(MeetingSource::Microphone, self.microphone.take()), (MeetingSource::System, self.system.take())] {
            let Some(mut source) = source else { continue };
            let tail = std::mem::take(&mut source.chunker).finish();
            let events = source.events(kind, tail.into_iter().collect());
            self.send(events);
            match kind {
                MeetingSource::Microphone => done.microphone = source.sent,
                MeetingSource::System => done.system = source.sent,
            }
        }
        if let Err(error) = self.app.emit(DONE_EVENT, done) {
            log::warn!("[meeting-live] done event failed: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::pause::tests::noise;
    use super::*;

    /// A quiet lead-in (the detector learns the room's floor from it), speech, then a pause.
    fn speech_then_pause(speech_ms: usize, pause_ms: usize, seed: &mut u32) -> Vec<f32> {
        [noise(200, -70.0, seed), noise(speech_ms, -20.0, seed), noise(pause_ms, -70.0, seed)].concat()
    }

    #[test]
    fn ends_a_chunk_at_the_first_pause_past_the_target() {
        let mut seed = 3;
        let mut chunker = Chunker::default();
        let mut chunks = chunker.push(&speech_then_pause(7_000, 800, &mut seed));
        assert_eq!(chunks.len(), 1);
        let chunk = chunks.remove(0);
        assert_eq!((chunk.start, chunk.overlap), (0, 0));
        assert!(chunk.samples.len() > CHUNK_TARGET && chunk.samples.len() < CHUNK_MAX);
    }

    #[test]
    fn a_hard_cut_without_a_pause_overlaps_the_next_chunk() {
        let mut seed = 5;
        let mut chunker = Chunker::default();
        let first = chunker.push(&noise(12_000, -20.0, &mut seed));
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].samples.len(), CHUNK_MAX);
        let next = chunker.finish().expect("the rest after the cut");
        assert_eq!(next.overlap, CHUNK_OVERLAP);
        assert_eq!(next.start, CHUNK_MAX - CHUNK_OVERLAP);
    }

    #[test]
    fn silence_is_never_sent() {
        let mut seed = 11;
        let silent = Chunk { start: 0, overlap: 0, samples: noise(1_000, -80.0, &mut seed) };
        assert!(silent.is_silent());
        assert!(!Chunk { start: 0, overlap: 0, samples: noise(1_000, -20.0, &mut seed) }.is_silent());
    }

    #[test]
    fn a_dropout_counts_as_silence_so_the_timeline_holds() {
        let source = Source { resampler: StreamingResampler::new(SAMPLE_RATE).unwrap(), chunker: Chunker::default(), origin_ms: 1_000, fed: RATE, sent: 0 };
        assert_eq!(source.gap_before(2_000), 0, "on time");
        assert_eq!(source.gap_before(2_400), 0, "within the tolerance");
        assert_eq!(source.gap_before(4_000), 2 * RATE, "two seconds missing");
    }
}
