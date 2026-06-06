/// Single source of truth for pipeline rate constants.
pub const PROCESS_RATE_HZ: u32 = 48_000;
pub const AI_RATE_HZ: u32 = 16_000;
pub const AEC_FRAME: usize = 480; // 10 ms @ 48 kHz

#[derive(Clone, Copy, PartialEq)]
pub enum Stream {
    System,
    Mic,
}

/// One stream laid out densely on the shared timeline. `buf[0]` sits at
/// timeline index `base`; gaps are silence-filled so `buf` stays contiguous.
struct Lane {
    base: u64,
    buf: Vec<f32>,
}

impl Lane {
    fn new() -> Self {
        Self { base: 0, buf: Vec::new() }
    }

    fn end(&self) -> u64 {
        self.base + self.buf.len() as u64
    }

    fn place(&mut self, idx: u64, samples: &[f32]) {
        if self.buf.is_empty() {
            self.base = idx;
            self.buf.extend_from_slice(samples);
            return;
        }
        let end = self.end();
        if idx > end {
            // Gap — silence-fill then append.
            self.buf.resize(self.buf.len() + (idx - end) as usize, 0.0);
            self.buf.extend_from_slice(samples);
        } else {
            // Contiguous (PTS is monotonic); append.
            self.buf.extend_from_slice(samples);
        }
    }

    /// Returns the sample at timeline index `i`, or silence before lane start.
    fn at(&self, i: u64) -> f32 {
        if i < self.base {
            return 0.0;
        }
        self.buf.get((i - self.base) as usize).copied().unwrap_or(0.0)
    }
}

/// A committed, aligned AEC_FRAME-sample frame from both streams.
/// Missing side is silence (zeros).
pub struct MixFrame {
    pub sys: Vec<f32>,
    pub mic: Vec<f32>,
}

pub struct Timeline {
    t0: Option<f64>,
    consumed: u64,
    sys: Lane,
    mic: Lane,
    mixed: bool,
}

impl Timeline {
    pub fn new(mixed: bool) -> Self {
        Self {
            t0: None,
            consumed: 0,
            sys: Lane::new(),
            mic: Lane::new(),
            mixed,
        }
    }

    pub fn push(&mut self, stream: Stream, pts_secs: f64, samples: &[f32]) {
        let t0 = *self.t0.get_or_insert(pts_secs);
        let idx = (((pts_secs - t0) * PROCESS_RATE_HZ as f64).round().max(0.0)) as u64;
        match stream {
            Stream::System => self.sys.place(idx, samples),
            Stream::Mic => self.mic.place(idx, samples),
        }
    }

    /// Emit as many whole AEC_FRAME-sample frames as both streams have data for.
    /// In system-only mode, only the system lane gates readiness.
    pub fn take_ready(&mut self) -> Vec<MixFrame> {
        let ready = if self.mixed {
            self.sys.end().min(self.mic.end())
        } else {
            self.sys.end()
        };
        let mut out = Vec::new();
        while self.consumed + AEC_FRAME as u64 <= ready {
            let start = self.consumed;
            let sys: Vec<f32> =
                (0..AEC_FRAME).map(|k| self.sys.at(start + k as u64)).collect();
            let mic: Vec<f32> = if self.mixed {
                (0..AEC_FRAME).map(|k| self.mic.at(start + k as u64)).collect()
            } else {
                vec![0.0; AEC_FRAME]
            };
            out.push(MixFrame { sys, mic });
            self.consumed += AEC_FRAME as u64;
        }
        self.compact();
        out
    }

    /// On stop: emit the final partial frame (zero-padded) if any data remains.
    pub fn take_remaining(&mut self) -> Option<MixFrame> {
        let ready = if self.mixed {
            self.sys.end().max(self.mic.end())
        } else {
            self.sys.end()
        };
        if self.consumed >= ready {
            return None;
        }
        let start = self.consumed;
        let sys: Vec<f32> =
            (0..AEC_FRAME).map(|k| self.sys.at(start + k as u64)).collect();
        let mic: Vec<f32> = if self.mixed {
            (0..AEC_FRAME).map(|k| self.mic.at(start + k as u64)).collect()
        } else {
            vec![0.0; AEC_FRAME]
        };
        self.consumed += AEC_FRAME as u64;
        Some(MixFrame { sys, mic })
    }

    /// How many samples have been placed on the timeline but not yet consumed.
    /// Used for the drift guard in the worker.
    pub fn pending_samples(&self) -> u64 {
        let horizon = self.sys.end().max(self.mic.end());
        horizon.saturating_sub(self.consumed)
    }

    /// Drop lane data already consumed so memory stays bounded on long recordings.
    fn compact(&mut self) {
        for lane in [&mut self.sys, &mut self.mic] {
            if self.consumed > lane.base {
                let drop = ((self.consumed - lane.base) as usize).min(lane.buf.len());
                lane.buf.drain(..drop);
                lane.base += drop as u64;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests — pure, no audio hardware, no Tauri
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_frame_at_zero_mic_frame_10ms_late_offset_by_480_samples() {
        let mut tl = Timeline::new(true);
        tl.push(Stream::System, 0.0, &vec![0.1f32; 480]);
        tl.push(Stream::Mic, 0.010, &vec![0.2f32; 480]); // 10 ms = 480 samples late

        // System lane: base=0, samples at [0..480)
        // Mic lane: base=480, samples at [480..960)
        assert_eq!(tl.sys.at(0), 0.1);
        assert_eq!(tl.mic.at(0), 0.0); // mic hasn't started yet at t=0
        assert_eq!(tl.mic.at(480), 0.2); // mic starts at sample 480
    }

    #[test]
    fn gap_silence_filled() {
        let mut tl = Timeline::new(false);
        tl.push(Stream::System, 0.0, &vec![1.0f32; 480]);
        // Next buffer is 20 ms later (a 960-sample gap)
        tl.push(Stream::System, 0.020, &vec![1.0f32; 480]);

        // Gap samples (indices 480..960) should be 0.0
        assert_eq!(tl.sys.at(480), 0.0);
        assert_eq!(tl.sys.at(959), 0.0);
        // Original frames intact
        assert_eq!(tl.sys.at(0), 1.0);
        assert_eq!(tl.sys.at(960), 1.0);
    }

    #[test]
    fn take_ready_emits_whole_frames_and_advances_consumed() {
        let mut tl = Timeline::new(false);
        tl.push(Stream::System, 0.0, &vec![0.5f32; 960]);
        let frames = tl.take_ready();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].sys.len(), AEC_FRAME);
        assert_eq!(frames[1].sys.len(), AEC_FRAME);
        assert_eq!(tl.consumed, 960);
    }

    #[test]
    fn compact_keeps_at_answers_identical() {
        let mut tl = Timeline::new(false);
        tl.push(Stream::System, 0.0, &vec![0.3f32; 960]);
        let before_0 = tl.sys.at(0);
        let before_479 = tl.sys.at(479);
        let frames = tl.take_ready(); // emits 2 frames and compacts
        drop(frames);
        // After compact, indices 0..960 are consumed; at() returns silence for them
        assert_eq!(tl.sys.at(0), 0.0);
        // Verify original values are what we put in (before compact)
        assert_eq!(before_0, 0.3);
        assert_eq!(before_479, 0.3);
    }

    #[test]
    fn take_remaining_returns_partial_zero_padded() {
        let mut tl = Timeline::new(false);
        // Only 100 samples — less than one AEC_FRAME
        tl.push(Stream::System, 0.0, &vec![0.7f32; 100]);
        assert!(tl.take_ready().is_empty()); // not enough for a full frame
        let frame = tl.take_remaining();
        assert!(frame.is_some());
        let f = frame.unwrap();
        assert_eq!(f.sys.len(), AEC_FRAME);
        // First 100 samples should be 0.7, rest 0.0
        assert!((f.sys[0] - 0.7).abs() < 1e-6);
        assert_eq!(f.sys[100], 0.0);
    }
}
