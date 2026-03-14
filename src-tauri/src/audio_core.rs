use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};
use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};
use screencapturekit::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufWriter;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const SAMPLE_RATE_HZ: i32 = 16000;
const SCK_SAMPLE_RATE: u32 = 48000;
const CHANNEL_COUNT: i32 = 1;
const LEVEL_BARS: usize = 48;
const LEVEL_THROTTLE: Duration = Duration::from_millis(80);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioLevelEvent {
    levels: Vec<u8>,
    level: f32,
    peak: f32,
}

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
    source: AudioCaptureSource,
    file_name: Option<String>,
    recordings_dir: Option<String>,
}

struct CaptureHandle {
    system_stream: Option<SCStream>,
    mic_thread: Option<MicCaptureThread>,
    handler_data: Option<Arc<UnifiedCaptureData>>,
    writer: Arc<Mutex<WavWriter<BufWriter<File>>>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    output_path: String,
}

struct MicCaptureThread {
    stop_tx: mpsc::Sender<()>,
    join_handle: std::thread::JoinHandle<()>,
}

static CAPTURE_STATE: Mutex<Option<CaptureHandle>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Unified SCK handler (System-only and System+Microphone modes)
// ---------------------------------------------------------------------------

struct UnifiedCaptureData {
    app: AppHandle,
    writer: Arc<Mutex<WavWriter<BufWriter<File>>>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_emit: Mutex<Instant>,
    system_buffer: Mutex<Vec<i16>>,
    mic_buffer: Mutex<Vec<i16>>,
    mode: AudioCaptureSource,
}

struct UnifiedCaptureHandler {
    inner: Arc<UnifiedCaptureData>,
    /// 0 = processes Audio buffers only, 1 = processes Microphone buffers only
    handler_id: u8,
}

impl SCStreamOutputTrait for UnifiedCaptureHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
        if !self.inner.running.load(Ordering::Relaxed) {
            return;
        }

        // Each handler is registered for one type but the crate dispatches all
        // buffer types to all handlers. Only process our designated type.
        match (of_type, self.handler_id) {
            (SCStreamOutputType::Audio, 0) | (SCStreamOutputType::Microphone, 1) => {}
            _ => return,
        }

        let source_rate = sample
            .format_description()
            .and_then(|fmt| fmt.audio_sample_rate())
            .map(|r| r as u32)
            .unwrap_or(SCK_SAMPLE_RATE);

        let Some((samples, channel_count)) = extract_samples(&sample) else {
            return;
        };
        let mono = if channel_count == 1 {
            samples
        } else {
            downmix_to_mono(&samples, channel_count)
        };
        if mono.is_empty() {
            return;
        }

        // Resample from actual SCK rate to target WAV rate
        let resampled = if source_rate != SAMPLE_RATE_HZ as u32 {
            let f32_samples: Vec<f32> = mono.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
            let resampled_f32 = resample_to_target(&f32_samples, source_rate, SAMPLE_RATE_HZ as u32);
            convert_to_i16(&resampled_f32)
        } else {
            mono
        };

        if resampled.is_empty() {
            return;
        }

        let is_mic = matches!(of_type, SCStreamOutputType::Microphone);
        {
            let mut buf = if is_mic {
                self.inner.mic_buffer.lock().unwrap()
            } else {
                self.inner.system_buffer.lock().unwrap()
            };
            buf.extend_from_slice(&resampled);
        }
        self.drain_and_write();
    }
}

impl UnifiedCaptureHandler {
    fn drain_and_write(&self) {
        let mut sys = self.inner.system_buffer.lock().unwrap();
        let mut mic = self.inner.mic_buffer.lock().unwrap();

        let drain_count = if self.inner.mode == AudioCaptureSource::SystemAndMicrophone {
            sys.len().min(mic.len())
        } else {
            sys.len()
        };

        if drain_count == 0 {
            return;
        }

        let samples: Vec<i16> = if self.inner.mode == AudioCaptureSource::SystemAndMicrophone {
            (0..drain_count)
                .map(|i| {
                    let s = sys[i] as f32 * 0.7;
                    let m = mic[i] as f32 * 0.7;
                    (s + m).clamp(i16::MIN as f32, i16::MAX as f32) as i16
                })
                .collect()
        } else {
            sys[..drain_count].to_vec()
        };

        sys.drain(..drain_count);
        if self.inner.mode == AudioCaptureSource::SystemAndMicrophone {
            mic.drain(..drain_count);
        }

        // Write to WAV (skip if paused)
        if !self.inner.paused.load(Ordering::Relaxed) {
            if let Ok(mut writer) = self.inner.writer.lock() {
                for sample in &samples {
                    let _ = writer.write_sample(*sample);
                }
            }
        }

        // Emit levels (always, even when paused — keeps UI alive)
        let should_emit = {
            let mut last_emit = self.inner.last_emit.lock().unwrap();
            if last_emit.elapsed() >= LEVEL_THROTTLE {
                *last_emit = Instant::now();
                true
            } else {
                false
            }
        };

        if should_emit {
            let (levels, rms, peak) = compute_levels(&samples, LEVEL_BARS);
            let _ = self.inner.app.emit(
                "coreaudio-level",
                AudioLevelEvent {
                    levels,
                    level: rms,
                    peak,
                },
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Microphone-only handler (cpal — standalone, no SCK, no mixing)
// ---------------------------------------------------------------------------

struct MicCaptureHandler {
    app: AppHandle,
    writer: Arc<Mutex<WavWriter<BufWriter<File>>>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_emit: Mutex<Instant>,
    source_sample_rate: u32,
    source_channels: usize,
}

impl MicCaptureHandler {
    fn process_f32(&self, data: &[f32]) {
        self.process_samples(data.to_vec());
    }

    fn process_i16(&self, data: &[i16]) {
        let samples: Vec<f32> = data
            .iter()
            .map(|sample| *sample as f32 / i16::MAX as f32)
            .collect();
        self.process_samples(samples);
    }

    fn process_u16(&self, data: &[u16]) {
        let samples: Vec<f32> = data
            .iter()
            .map(|sample| (*sample as f32 / u16::MAX as f32) * 2.0 - 1.0)
            .collect();
        self.process_samples(samples);
    }

    fn process_samples(&self, samples: Vec<f32>) {
        if !self.running.load(Ordering::Relaxed) {
            return;
        }

        if samples.is_empty() {
            return;
        }

        let is_paused = self.paused.load(Ordering::Relaxed);

        let mono_samples = downmix_to_mono_f32(&samples, self.source_channels);
        let resampled = resample_to_target(
            &mono_samples,
            self.source_sample_rate,
            SAMPLE_RATE_HZ as u32,
        );
        let converted = convert_to_i16(&resampled);

        if converted.is_empty() {
            return;
        }

        if !is_paused {
            if let Ok(mut writer) = self.writer.lock() {
                for sample in &converted {
                    let _ = writer.write_sample(*sample);
                }
            }
        }

        let should_emit = {
            let mut last_emit = self.last_emit.lock().unwrap();
            if last_emit.elapsed() >= LEVEL_THROTTLE {
                *last_emit = Instant::now();
                true
            } else {
                false
            }
        };

        if should_emit {
            let (levels, rms, peak) = compute_levels(&converted, LEVEL_BARS);
            let _ = self.app.emit(
                "coreaudio-level",
                AudioLevelEvent {
                    levels,
                    level: rms,
                    peak,
                },
            );
        }
    }
}

// ---------------------------------------------------------------------------
// SCK stream setup
// ---------------------------------------------------------------------------

fn check_macos_version() -> Result<(), String> {
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

fn request_primary_display() -> Result<SCDisplay, String> {
    let content = SCShareableContent::get().map_err(|error| {
        format!(
            "System audio permission is required to capture audio. Enable it in System Settings > Privacy & Security > Screen & System Audio Recording, then restart the app. ({error})"
        )
    })?;

    content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| "No displays available for capture.".to_string())
}

fn build_unified_stream(
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

    // The SCK crate dispatches ALL buffer types to every registered handler.
    // We give each handler an ID so it only processes its designated type:
    // handler_id=0 processes Audio, handler_id=1 processes Microphone.
    let audio_handler = UnifiedCaptureHandler {
        inner: Arc::clone(&handler.inner),
        handler_id: 0,
    };
    let mic_handler = UnifiedCaptureHandler {
        inner: Arc::clone(&handler.inner),
        handler_id: 1,
    };

    if stream
        .add_output_handler(audio_handler, SCStreamOutputType::Audio)
        .is_none()
    {
        return Err("Failed to attach audio output handler.".to_string());
    }

    if capture_microphone {
        if stream
            .add_output_handler(mic_handler, SCStreamOutputType::Microphone)
            .is_none()
        {
            return Err("Failed to attach microphone output handler.".to_string());
        }
    }

    stream
        .start_capture()
        .map_err(|error| format!("Failed to start audio capture: {error}"))?;

    Ok(stream)
}

// ---------------------------------------------------------------------------
// Microphone-only stream setup (cpal)
// ---------------------------------------------------------------------------

fn select_microphone_config(device: &cpal::Device) -> Result<cpal::SupportedStreamConfig, String> {
    let target_rate = SAMPLE_RATE_HZ as u32;
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
        .map_err(|error| format!("Failed to get default microphone config: {error}"))
}

fn build_microphone_stream(
    app: &AppHandle,
    writer: Arc<Mutex<WavWriter<BufWriter<File>>>>,
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
    let source_sample_rate = stream_config.sample_rate.0;
    let source_channels = stream_config.channels as usize;

    let handler = Arc::new(MicCaptureHandler {
        app: app.clone(),
        writer,
        running,
        paused,
        last_emit: Mutex::new(Instant::now() - LEVEL_THROTTLE),
        source_sample_rate,
        source_channels,
    });

    let error_handler = |error| {
        log::error!("Microphone stream error: {error}");
    };

    let stream = match sample_format {
        SampleFormat::F32 => {
            let handler = Arc::clone(&handler);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| handler.process_f32(data),
                    error_handler,
                    None,
                )
                .map_err(|error| format!("Failed to build microphone stream: {error}"))?
        }
        SampleFormat::I16 => {
            let handler = Arc::clone(&handler);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| handler.process_i16(data),
                    error_handler,
                    None,
                )
                .map_err(|error| format!("Failed to build microphone stream: {error}"))?
        }
        SampleFormat::U16 => {
            let handler = Arc::clone(&handler);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| handler.process_u16(data),
                    error_handler,
                    None,
                )
                .map_err(|error| format!("Failed to build microphone stream: {error}"))?
        }
        _ => {
            return Err("Unsupported microphone sample format".to_string());
        }
    };

    stream
        .play()
        .map_err(|error| format!("Failed to start microphone capture: {error}"))?;

    Ok(stream)
}

fn spawn_microphone_capture(
    app: AppHandle,
    writer: Arc<Mutex<WavWriter<BufWriter<File>>>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
) -> Result<MicCaptureThread, String> {
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    let join_handle = std::thread::spawn(move || {
        match build_microphone_stream(&app, writer, running, paused) {
            Ok(stream) => {
                let _ = ready_tx.send(Ok(()));
                let _ = stop_rx.recv();
                drop(stream);
            }
            Err(error) => {
                let _ = ready_tx.send(Err(error));
            }
        }
    });

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(MicCaptureThread { stop_tx, join_handle }),
        Ok(Err(error)) => {
            let _ = join_handle.join();
            Err(error)
        }
        Err(_) => {
            let _ = join_handle.join();
            Err("Microphone capture failed to start".to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

fn create_wav_writer(output_path: &str) -> Result<WavWriter<BufWriter<File>>, String> {
    let file = File::create(output_path)
        .map_err(|error| format!("Failed to create output file: {error}"))?;
    let writer = BufWriter::new(file);
    let wav_spec = WavSpec {
        channels: CHANNEL_COUNT.max(1) as u16,
        sample_rate: SAMPLE_RATE_HZ.max(1) as u32,
        bits_per_sample: 16,
        sample_format: WavSampleFormat::Int,
    };
    WavWriter::new(writer, wav_spec)
        .map_err(|error| format!("Failed to initialize wav writer: {error}"))
}

fn extract_samples(sample: &CMSampleBuffer) -> Option<(Vec<i16>, usize)> {
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
) -> Option<i16> {
    match (bits_per_channel, is_float) {
        (16, false) => {
            let bytes: [u8; 2] = raw.get(0..2)?.try_into().ok()?;
            let value = if is_big_endian {
                i16::from_be_bytes(bytes)
            } else {
                i16::from_le_bytes(bytes)
            };
            Some(value)
        }
        (32, true) => {
            let bytes: [u8; 4] = raw.get(0..4)?.try_into().ok()?;
            let value = if is_big_endian {
                f32::from_be_bytes(bytes)
            } else {
                f32::from_le_bytes(bytes)
            };
            let clamped = value.clamp(-1.0, 1.0);
            Some((clamped * i16::MAX as f32) as i16)
        }
        (32, false) => {
            let bytes: [u8; 4] = raw.get(0..4)?.try_into().ok()?;
            let value = if is_big_endian {
                i32::from_be_bytes(bytes)
            } else {
                i32::from_le_bytes(bytes)
            };
            let normalized = (value as f64 / i32::MAX as f64).clamp(-1.0, 1.0);
            Some((normalized * i16::MAX as f64) as i16)
        }
        _ => None,
    }
}

fn downmix_to_mono(samples: &[i16], channel_count: usize) -> Vec<i16> {
    if channel_count <= 1 {
        return samples.to_vec();
    }

    let frames = samples.len() / channel_count;
    let mut mono = Vec::with_capacity(frames);
    for frame in 0..frames {
        let mut sum = 0i32;
        for channel in 0..channel_count {
            sum += samples[frame * channel_count + channel] as i32;
        }
        mono.push((sum / channel_count as i32) as i16);
    }
    mono
}

fn downmix_to_mono_f32(samples: &[f32], channel_count: usize) -> Vec<f32> {
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

fn resample_to_target(samples: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate {
        return samples.to_vec();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let output_len = ((samples.len() as f64) / ratio).round().max(1.0) as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let position = i as f64 * ratio;
        let index = position.floor() as usize;
        let frac = position - index as f64;

        let current = samples.get(index).copied().unwrap_or(0.0);
        let next = samples.get(index + 1).copied().unwrap_or(current);
        output.push((current as f64 + (next as f64 - current as f64) * frac) as f32);
    }

    output
}

fn convert_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|value| (value.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}

fn compute_levels(samples: &[i16], bars: usize) -> (Vec<u8>, f32, f32) {
    if samples.is_empty() {
        return (vec![0; bars], 0.0, 0.0);
    }

    let mut sum_squares = 0f64;
    let mut peak = 0f32;
    for sample in samples {
        let value = *sample as f32 / i16::MAX as f32;
        let abs = value.abs();
        peak = peak.max(abs);
        sum_squares += (value as f64).powi(2);
    }
    let rms = (sum_squares / samples.len() as f64).sqrt() as f32;

    let bucket_size = (samples.len() / bars).max(1);
    let mut levels = Vec::with_capacity(bars);
    for i in 0..bars {
        let start = i * bucket_size;
        if start >= samples.len() {
            levels.push(0);
            continue;
        }
        let end = ((i + 1) * bucket_size).min(samples.len());
        let mut sum = 0f32;
        for sample in &samples[start..end] {
            sum += (*sample as f32).abs();
        }
        let avg = sum / (end - start) as f32;
        let normalized = (avg / i16::MAX as f32).min(1.0);
        let shaped = normalized.powf(0.6);
        levels.push((shaped * 255.0) as u8);
    }

    (levels, rms, peak)
}

fn create_output_path(
    app: &AppHandle,
    file_name: Option<String>,
    recordings_dir: Option<String>,
) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))?;
    let recordings_dir_name = recordings_dir.unwrap_or_else(|| "recordings".to_string());
    let recordings_path = data_dir.join(recordings_dir_name);
    if let Err(error) = std::fs::create_dir_all(&recordings_path) {
        return Err(format!(
            "Failed to create recordings directory: {error}"
        ));
    }
    let filename = file_name.unwrap_or_else(|| {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        format!("recording_{}.wav", timestamp)
    });
    Ok(recordings_path.join(filename).to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_audio_capture(app: AppHandle, options: AudioCaptureOptions) -> Result<(), String> {
    stop_audio_capture().await.ok();

    let output_path = create_output_path(&app, options.file_name, options.recordings_dir)?;
    let writer = create_wav_writer(&output_path)?;
    let writer = Arc::new(Mutex::new(writer));
    let running = Arc::new(AtomicBool::new(true));
    let paused = Arc::new(AtomicBool::new(false));

    match options.source {
        AudioCaptureSource::System | AudioCaptureSource::SystemAndMicrophone => {
            check_macos_version()?;

            let capture_mic = options.source == AudioCaptureSource::SystemAndMicrophone;
            let display = request_primary_display()?;

            let handler_data = Arc::new(UnifiedCaptureData {
                app: app.clone(),
                writer: Arc::clone(&writer),
                running: Arc::clone(&running),
                paused: Arc::clone(&paused),
                last_emit: Mutex::new(Instant::now() - LEVEL_THROTTLE),
                system_buffer: Mutex::new(Vec::new()),
                mic_buffer: Mutex::new(Vec::new()),
                mode: options.source,
            });

            let handler = UnifiedCaptureHandler {
                inner: Arc::clone(&handler_data),
                handler_id: 0, // overridden in build_unified_stream
            };

            let system_stream = build_unified_stream(&display, handler, capture_mic)?;

            let mut guard = CAPTURE_STATE.lock().unwrap();
            *guard = Some(CaptureHandle {
                system_stream: Some(system_stream),
                mic_thread: None,
                handler_data: Some(handler_data),
                writer,
                running,
                paused,
                output_path,
            });
        }
        AudioCaptureSource::Microphone => {
            let mic_thread = spawn_microphone_capture(
                app.clone(),
                Arc::clone(&writer),
                Arc::clone(&running),
                Arc::clone(&paused),
            )?;

            let mut guard = CAPTURE_STATE.lock().unwrap();
            *guard = Some(CaptureHandle {
                system_stream: None,
                mic_thread: Some(mic_thread),
                handler_data: None,
                writer,
                running,
                paused,
                output_path,
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_audio_capture() -> Result<String, String> {
    let mut guard = CAPTURE_STATE.lock().unwrap();

    if let Some(state) = guard.take() {
        state.running.store(false, Ordering::Relaxed);

        if let Some(stream) = state.system_stream {
            stream
                .stop_capture()
                .map_err(|error| format!("Failed to stop audio capture: {error}"))?;
        }

        // Flush remaining buffered samples before closing the writer
        if let Some(data) = &state.handler_data {
            let sys = data.system_buffer.lock().unwrap();
            let mic = data.mic_buffer.lock().unwrap();

            let remaining: Vec<i16> = if data.mode == AudioCaptureSource::SystemAndMicrophone {
                let count = sys.len().min(mic.len());
                (0..count)
                    .map(|i| {
                        let s = sys[i] as f32 * 0.7;
                        let m = mic[i] as f32 * 0.7;
                        (s + m).clamp(i16::MIN as f32, i16::MAX as f32) as i16
                    })
                    .collect()
            } else {
                sys.to_vec()
            };

            if !remaining.is_empty() {
                if let Ok(mut writer) = state.writer.lock() {
                    for sample in &remaining {
                        let _ = writer.write_sample(*sample);
                    }
                }
            }
        }

        if let Some(mic_thread) = state.mic_thread {
            let _ = mic_thread.stop_tx.send(());
            let _ = mic_thread.join_handle.join();
        }

        if let Ok(mut writer) = state.writer.lock() {
            let _ = writer.flush();
        }

        Ok(state.output_path)
    } else {
        Ok("No active audio capture".to_string())
    }
}

#[tauri::command]
pub async fn pause_audio_capture() -> Result<(), String> {
    let guard = CAPTURE_STATE.lock().unwrap();

    if let Some(state) = guard.as_ref() {
        state.paused.store(true, Ordering::Relaxed);

        // Clear buffers to prevent stale audio on resume
        if let Some(data) = &state.handler_data {
            data.system_buffer.lock().unwrap().clear();
            data.mic_buffer.lock().unwrap().clear();
        }

        Ok(())
    } else {
        Err("No active audio capture to pause".to_string())
    }
}

#[tauri::command]
pub async fn resume_audio_capture() -> Result<(), String> {
    let guard = CAPTURE_STATE.lock().unwrap();

    if let Some(state) = guard.as_ref() {
        state.paused.store(false, Ordering::Relaxed);
        Ok(())
    } else {
        Err("No active audio capture to resume".to_string())
    }
}
