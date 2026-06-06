use rtrb::{Consumer, Producer, RingBuffer};

/// One stream's raw mono chunk plus the PTS of its first sample.
pub struct AudioFrame {
    /// Mono f32 samples at the source rate (SCK native: 48 kHz).
    /// Normalized to PROCESS_RATE_HZ in the worker if needed.
    pub samples: Vec<f32>,
    pub pts_secs: f64,
}

/// Bounded SPSC ring. If the worker falls behind, push fails and the frame is
/// silently dropped (graceful degradation — never block the realtime thread).
/// Capacity ≈ 256 frames.
pub const RING_CAPACITY: usize = 256;

pub fn channel() -> (Producer<AudioFrame>, Consumer<AudioFrame>) {
    RingBuffer::new(RING_CAPACITY)
}
