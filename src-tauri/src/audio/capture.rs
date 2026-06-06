use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};
use rtrb::Producer;
use screencapturekit::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use crate::audio::align::PROCESS_RATE_HZ;
use crate::audio::levels::{compute_levels, AudioLevelEvent, LEVEL_BARS, LEVEL_THROTTLE};
use crate::audio::resample::ResamplerState;
use crate::audio::ring::AudioFrame;
use crate::audio::sink::DualSink;
use crate::audio::wav::convert_to_i16;
use tauri::{AppHandle, Emitter};

// SCK native sample rate
const SCK_SAMPLE_RATE: u32 = 48_000;
const CHANNEL_COUNT: i32 = 1;

/// How often the mic-only path persists the WAV header to disk (crash-safety).
const FLUSH_INTERVAL: Duration = Duration::from_secs(1);

// ---------------------------------------------------------------------------
// Public types shared with commands.rs
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AudioCaptureSource {
    System,
    Microphone,
    SystemAndMicrophone,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureOptions {
    pub source: AudioCaptureSource,
    pub file_name: Option<String>,
    pub recordings_dir: Option<String>,
}

// ---------------------------------------------------------------------------
// Unified SCK capture data (shared between the two handler instances)
// ---------------------------------------------------------------------------

pub struct UnifiedCaptureData {
    pub running: Arc<AtomicBool>,
}

// ---------------------------------------------------------------------------
// Unified SCK handler — realtime callback.
//
// REALTIME SAFETY: only extract_samples → downmix → read PTS → ring push.
// NO locks (beyond the wait-free ring push), NO allocation beyond Vec from
// the sample buffer, NO println!, NO panic.
// ---------------------------------------------------------------------------

pub struct UnifiedCaptureHandler {
    pub inner: Arc<UnifiedCaptureData>,
    /// 0 = Audio (system), 1 = Microphone
    pub handler_id: u8,
    /// Producers wrapped in Mutex because SCK may call the handler from
    /// multiple threads. Lock duration = one ring push (negligible).
    pub sys_tx: Arc<Mutex<Producer<AudioFrame>>>,
    pub mic_tx: Arc<Mutex<Producer<AudioFrame>>>,
}

impl SCStreamOutputTrait for UnifiedCaptureHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
        if !self.inner.running.load(Ordering::Relaxed) {
            return;
        }

        // Each handler is registered for one type; dispatch guard.
        match (of_type, self.handler_id) {
            (SCStreamOutputType::Audio, 0) | (SCStreamOutputType::Microphone, 1) => {}
            _ => return,
        }

        let is_mic = matches!(of_type, SCStreamOutputType::Microphone);

        let Some((samples_f32, channel_count)) = extract_samples(&sample) else {
            return;
        };
        let mono_f32 = if channel_count == 1 {
            samples_f32
        } else {
            downmix_to_mono_f32(&samples_f32, channel_count)
        };
        if mono_f32.is_empty() {
            return;
        }

        let pts = sample.presentation_timestamp();
        let pts_secs: f64 = if pts.timescale > 0 {
            pts.value as f64 / pts.timescale as f64
        } else {
            0.0
        };

        let frame = AudioFrame { samples: mono_f32, pts_secs };

        if is_mic {
            if let Ok(mut tx) = self.mic_tx.lock() {
                // Silently drop on ring full — never block the realtime thread.
                let _ = tx.push(frame);
            }
        } else if let Ok(mut tx) = self.sys_tx.lock() {
            let _ = tx.push(frame);
        }
    }
}

// ---------------------------------------------------------------------------
// SCK stream setup
// ---------------------------------------------------------------------------

pub fn check_macos_version() -> Result<(), String> {
    let output = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .map_err(|e| format!("Failed to check macOS version: {e}"))?;

    let version_str = String::from_utf8_lossy(&output.stdout);
    let major: u32 = version_str
        .trim()
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    if major < 15 {
        return Err(
            "Audio recording requires macOS 15.0 or later. Chat, AI, and other features continue to work on your Mac.".to_string()
        );
    }
    Ok(())
}

pub fn request_primary_display() -> Result<SCDisplay, String> {
    let content = SCShareableContent::get().map_err(|e| {
        format!(
            "System audio permission is required to capture audio. Enable it in System Settings > Privacy & Security > Screen & System Audio Recording, then restart the app. ({e})"
        )
    })?;
    content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| "No displays available for capture.".to_string())
}

pub fn build_unified_stream(
    display: &SCDisplay,
    handler: UnifiedCaptureHandler,
    capture_microphone: bool,
) -> Result<SCStream, String> {
    let filter = SCContentFilter::create()
        .with_display(display)
        .with_excluding_windows(&[])
        .build();

    let config = SCStreamConfiguration::new()
        .with_captures_audio(true)
        .with_excludes_current_process_audio(true)
        .with_sample_rate(SCK_SAMPLE_RATE as i32)
        .with_channel_count(CHANNEL_COUNT);

    let config = if capture_microphone {
        config.with_captures_microphone(true)
    } else {
        config
    };

    let mut stream = SCStream::new(&filter, &config);

    // Clone producers for the second handler.
    let sys_tx2 = Arc::clone(&handler.sys_tx);
    let mic_tx2 = Arc::clone(&handler.mic_tx);

    let audio_handler = UnifiedCaptureHandler {
        inner: Arc::clone(&handler.inner),
        handler_id: 0,
        sys_tx: Arc::clone(&handler.sys_tx),
        mic_tx: Arc::clone(&handler.mic_tx),
    };
    let mic_handler = UnifiedCaptureHandler {
        inner: Arc::clone(&handler.inner),
        handler_id: 1,
        sys_tx: sys_tx2,
        mic_tx: mic_tx2,
    };

    if stream
        .add_output_handler(audio_handler, SCStreamOutputType::Audio)
        .is_none()
    {
        return Err("Failed to attach audio output handler.".to_string());
    }

    if capture_microphone
        && stream
            .add_output_handler(mic_handler, SCStreamOutputType::Microphone)
            .is_none()
    {
        return Err("Failed to attach microphone output handler.".to_string());
    }

    stream
        .start_capture()
        .map_err(|e| format!("Failed to start audio capture: {e}"))?;

    Ok(stream)
}

// ---------------------------------------------------------------------------
// Microphone-only path (cpal — no SCK, no mixing, proven clean)
// Functionally unchanged; only uses parameterized create_wav_writer.
// ---------------------------------------------------------------------------

pub struct MicCaptureThread {
    pub stop_tx: mpsc::Sender<()>,
    pub join_handle: std::thread::JoinHandle<()>,
}

struct MicCaptureHandler {
    app: AppHandle,
    sink: Arc<Mutex<DualSink>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_emit: Mutex<Instant>,
    last_flush: Mutex<Instant>,
    source_channels: usize,
    resampler: Mutex<Option<ResamplerState>>,
    needs_reset: AtomicBool,
}

impl MicCaptureHandler {
    fn process_f32(&self, data: &[f32]) {
        self.process_samples(data.to_vec());
    }

    fn process_i16(&self, data: &[i16]) {
        let samples: Vec<f32> = data
            .iter()
            .map(|s| *s as f32 / i16::MAX as f32)
            .collect();
        self.process_samples(samples);
    }

    fn process_u16(&self, data: &[u16]) {
        let samples: Vec<f32> = data
            .iter()
            .map(|s| (*s as f32 / u16::MAX as f32) * 2.0 - 1.0)
            .collect();
        self.process_samples(samples);
    }

    fn process_samples(&self, samples: Vec<f32>) {
        if !self.running.load(Ordering::Relaxed) || samples.is_empty() {
            return;
        }

        if self.paused.load(Ordering::Relaxed) {
            // Don't advance resampler state with paused audio; flag a reset so
            // the resume seam starts from clean overlap.
            self.needs_reset.store(true, Ordering::Relaxed);
            return;
        }

        let mono = downmix_to_mono_f32(&samples, self.source_channels);
        let resampled = {
            let mut guard = self.resampler.lock().unwrap();
            if let Some(ref mut rs) = *guard {
                if self.needs_reset.swap(false, Ordering::Relaxed) {
                    rs.reset();
                }
                rs.process(&mono)
            } else {
                mono
            }
        };
        if resampled.is_empty() {
            return;
        }

        if let Ok(mut sink) = self.sink.lock() {
            sink.write(&resampled);
            // Periodically persist the WAV header so the file stays valid on an
            // unclean exit (matches the SCK worker's crash-safety behavior).
            if let Ok(mut lf) = self.last_flush.lock() {
                if lf.elapsed() >= FLUSH_INTERVAL {
                    sink.flush();
                    *lf = Instant::now();
                }
            }
        }

        let should_emit = {
            let mut last = self.last_emit.lock().unwrap();
            if last.elapsed() >= LEVEL_THROTTLE {
                *last = Instant::now();
                true
            } else {
                false
            }
        };

        if should_emit {
            let i16_samples = convert_to_i16(&resampled);
            let (levels, rms, peak) = compute_levels(&i16_samples, LEVEL_BARS);
            let _ = self.app.emit(
                "coreaudio-level",
                AudioLevelEvent { levels, level: rms, peak },
            );
        }
    }
}

fn select_microphone_config(device: &cpal::Device) -> Result<cpal::SupportedStreamConfig, String> {
    let target_rate = PROCESS_RATE_HZ;
    if let Ok(configs) = device.supported_input_configs() {
        for config_range in configs {
            let min_rate = config_range.min_sample_rate().0;
            let max_rate = config_range.max_sample_rate().0;
            if min_rate <= target_rate && max_rate >= target_rate {
                return Ok(config_range.with_sample_rate(SampleRate(target_rate)));
            }
        }
    }
    device
        .default_input_config()
        .map_err(|e| format!("Failed to get default microphone config: {e}"))
}

fn build_microphone_stream(
    app: &AppHandle,
    sink: Arc<Mutex<DualSink>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
) -> Result<cpal::Stream, String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone input device available.".to_string())?;

    let supported_config = select_microphone_config(&device)?;
    let sample_format = supported_config.sample_format();
    let stream_config: StreamConfig = supported_config.into();
    let source_rate = stream_config.sample_rate.0;
    let source_channels = stream_config.channels as usize;

    let handler = Arc::new(MicCaptureHandler {
        app: app.clone(),
        sink,
        running,
        paused,
        last_emit: Mutex::new(Instant::now() - LEVEL_THROTTLE),
        last_flush: Mutex::new(Instant::now()),
        source_channels,
        resampler: Mutex::new(if source_rate != PROCESS_RATE_HZ {
            Some(ResamplerState::new(source_rate, PROCESS_RATE_HZ))
        } else {
            None
        }),
        needs_reset: AtomicBool::new(false),
    });

    let error_handler = |e| log::error!("Microphone stream error: {e}");

    let stream = match sample_format {
        SampleFormat::F32 => {
            let h = Arc::clone(&handler);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| h.process_f32(data),
                    error_handler,
                    None,
                )
                .map_err(|e| format!("Failed to build microphone stream: {e}"))?
        }
        SampleFormat::I16 => {
            let h = Arc::clone(&handler);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| h.process_i16(data),
                    error_handler,
                    None,
                )
                .map_err(|e| format!("Failed to build microphone stream: {e}"))?
        }
        SampleFormat::U16 => {
            let h = Arc::clone(&handler);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| h.process_u16(data),
                    error_handler,
                    None,
                )
                .map_err(|e| format!("Failed to build microphone stream: {e}"))?
        }
        _ => return Err("Unsupported microphone sample format".to_string()),
    };

    stream
        .play()
        .map_err(|e| format!("Failed to start microphone capture: {e}"))?;

    Ok(stream)
}

pub fn spawn_microphone_capture(
    app: AppHandle,
    sink: Arc<Mutex<DualSink>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
) -> Result<MicCaptureThread, String> {
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    let join_handle = std::thread::spawn(move || {
        match build_microphone_stream(&app, sink, running, paused) {
            Ok(stream) => {
                let _ = ready_tx.send(Ok(()));
                let _ = stop_rx.recv();
                drop(stream);
            }
            Err(e) => {
                let _ = ready_tx.send(Err(e));
            }
        }
    });

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(MicCaptureThread { stop_tx, join_handle }),
        Ok(Err(e)) => {
            let _ = join_handle.join();
            Err(e)
        }
        Err(_) => {
            let _ = join_handle.join();
            Err("Microphone capture failed to start".to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Sample extraction helpers (moved verbatim from audio_core.rs)
// ---------------------------------------------------------------------------

pub fn extract_samples(sample: &CMSampleBuffer) -> Option<(Vec<f32>, usize)> {
    let format = sample.format_description()?;
    if !format.is_audio() {
        return None;
    }

    let channel_count = format.audio_channel_count()? as usize;
    let bits_per_channel = format.audio_bits_per_channel()? as usize;
    if channel_count == 0 || bits_per_channel == 0 {
        return None;
    }

    let bytes_per_sample = bits_per_channel / 8;
    if bytes_per_sample == 0 {
        return None;
    }

    let frames = sample.num_samples();
    if frames == 0 {
        return None;
    }

    let is_float = format.audio_is_float();
    let is_big_endian = format.audio_is_big_endian();

    let buffer_list = sample.audio_buffer_list()?;
    if buffer_list.num_buffers() == 0 {
        return None;
    }

    if buffer_list.num_buffers() == 1 {
        let buffer = buffer_list.get(0)?;
        let data = buffer.data();
        let total_samples = frames.saturating_mul(channel_count);
        let expected_len = total_samples * bytes_per_sample;
        if data.len() < expected_len {
            return None;
        }

        let mut samples = Vec::with_capacity(total_samples);
        for idx in 0..total_samples {
            let offset = idx * bytes_per_sample;
            let raw = data.get(offset..offset + bytes_per_sample)?;
            let value = read_sample_from_bytes(raw, bits_per_channel, is_float, is_big_endian)?;
            samples.push(value);
        }

        return Some((samples, channel_count));
    }

    let buffer_count = buffer_list.num_buffers().min(channel_count);
    let mut samples = Vec::with_capacity(frames * buffer_count);
    for frame in 0..frames {
        for channel in 0..buffer_count {
            let buffer = buffer_list.get(channel)?;
            let data = buffer.data();
            let offset = frame * bytes_per_sample;
            let raw = data.get(offset..offset + bytes_per_sample)?;
            let value = read_sample_from_bytes(raw, bits_per_channel, is_float, is_big_endian)?;
            samples.push(value);
        }
    }

    Some((samples, buffer_count))
}

fn read_sample_from_bytes(
    raw: &[u8],
    bits_per_channel: usize,
    is_float: bool,
    is_big_endian: bool,
) -> Option<f32> {
    match (bits_per_channel, is_float) {
        (16, false) => {
            let bytes: [u8; 2] = raw.get(0..2)?.try_into().ok()?;
            let value = if is_big_endian {
                i16::from_be_bytes(bytes)
            } else {
                i16::from_le_bytes(bytes)
            };
            Some(value as f32 / i16::MAX as f32)
        }
        (32, true) => {
            let bytes: [u8; 4] = raw.get(0..4)?.try_into().ok()?;
            let value = if is_big_endian {
                f32::from_be_bytes(bytes)
            } else {
                f32::from_le_bytes(bytes)
            };
            Some(value.clamp(-1.0, 1.0))
        }
        (32, false) => {
            let bytes: [u8; 4] = raw.get(0..4)?.try_into().ok()?;
            let value = if is_big_endian {
                i32::from_be_bytes(bytes)
            } else {
                i32::from_le_bytes(bytes)
            };
            Some((value as f64 / i32::MAX as f64).clamp(-1.0, 1.0) as f32)
        }
        _ => None,
    }
}

pub fn downmix_to_mono_f32(samples: &[f32], channel_count: usize) -> Vec<f32> {
    if channel_count <= 1 {
        return samples.to_vec();
    }
    let frames = samples.len() / channel_count;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let mut sum = 0f32;
        for channel in 0..channel_count {
            sum += samples[frame * channel_count + channel];
        }
        mono.push(sum / channel_count as f32);
    }
    mono
}
