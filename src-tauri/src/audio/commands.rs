use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::audio::align::PROCESS_RATE_HZ;
use crate::audio::capture::{
    AudioCaptureOptions, AudioCaptureSource, MicCaptureThread, UnifiedCaptureData,
    UnifiedCaptureHandler, build_unified_stream, check_macos_version, request_primary_display,
    spawn_microphone_capture,
};
use crate::audio::ring::channel;
use crate::audio::sink::DualSink;
use crate::audio::worker::Worker;

/// Both output paths returned by `stop_audio_capture` (Phase 5 contract change).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingPaths {
    pub playback_path: String,
    pub ai_path: String,
}

/// Maps `…/recording_<ts>.wav` → `…/recording_<ts>.ai.wav`
fn ai_sibling_path(hq_path: &str) -> String {
    let path = std::path::Path::new(hq_path);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("recording");
    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    parent
        .join(format!("{stem}.ai.wav"))
        .to_string_lossy()
        .into_owned()
}

struct CaptureHandle {
    system_stream: Option<screencapturekit::prelude::SCStream>,
    mic_thread: Option<MicCaptureThread>,
    /// Mic-only DualSink — flushed after the mic thread exits.
    mic_sink: Option<Arc<Mutex<DualSink>>>,
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    hq_path: String,
    ai_path: String,
    worker_handle: Option<std::thread::JoinHandle<()>>,
}

static CAPTURE_STATE: Mutex<Option<CaptureHandle>> = Mutex::new(None);

fn create_output_path(
    app: &AppHandle,
    file_name: Option<String>,
    recordings_dir: Option<String>,
) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    let dir_name = recordings_dir.unwrap_or_else(|| "recordings".to_string());
    let recordings_path = data_dir.join(dir_name);
    if let Err(e) = std::fs::create_dir_all(&recordings_path) {
        return Err(format!("Failed to create recordings directory: {e}"));
    }
    let filename = file_name.unwrap_or_else(|| {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default();
        format!("recording_{}.wav", ts)
    });
    Ok(recordings_path.join(filename).to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_audio_capture(
    app: AppHandle,
    options: AudioCaptureOptions,
) -> Result<(), String> {
    stop_audio_capture().await.ok();

    let hq_path = create_output_path(&app, options.file_name, options.recordings_dir)?;
    let ai_path = ai_sibling_path(&hq_path);
    log::info!("Audio capture starting, hq={}, ai={}", hq_path, ai_path);

    let running = Arc::new(AtomicBool::new(true));
    let paused = Arc::new(AtomicBool::new(false));

    match options.source {
        AudioCaptureSource::System | AudioCaptureSource::SystemAndMicrophone => {
            check_macos_version()?;

            let capture_mic = options.source == AudioCaptureSource::SystemAndMicrophone;
            let display = request_primary_display()?;

            let (sys_tx, sys_rx) = channel();
            let (mic_tx, mic_rx) = channel();

            let handler_data = Arc::new(UnifiedCaptureData {
                running: Arc::clone(&running),
            });

            let handler = UnifiedCaptureHandler {
                inner: Arc::clone(&handler_data),
                handler_id: 0,
                sys_tx: Arc::new(Mutex::new(sys_tx)),
                mic_tx: Arc::new(Mutex::new(mic_tx)),
            };

            let system_stream = build_unified_stream(&display, handler, capture_mic)?;
            let sink = DualSink::create(&hq_path, &ai_path, PROCESS_RATE_HZ)?;

            let worker = Worker::new(
                sys_rx,
                mic_rx,
                sink,
                options.source,
                app.clone(),
                Arc::clone(&running),
                Arc::clone(&paused),
            );
            let worker_handle = std::thread::spawn(move || worker.run());

            let mut guard = CAPTURE_STATE.lock().unwrap();
            *guard = Some(CaptureHandle {
                system_stream: Some(system_stream),
                mic_thread: None,
                mic_sink: None,
                running,
                paused,
                hq_path,
                ai_path,
                worker_handle: Some(worker_handle),
            });
        }

        AudioCaptureSource::Microphone => {
            // Mic-only: cpal path writes to a DualSink directly, producing both
            // the HQ file (at PROCESS_RATE_HZ) and the AI file (at AI_RATE_HZ).
            let sink = Arc::new(Mutex::new(
                DualSink::create(&hq_path, &ai_path, PROCESS_RATE_HZ)?
            ));

            let mic_thread = spawn_microphone_capture(
                app.clone(),
                Arc::clone(&sink),
                Arc::clone(&running),
                Arc::clone(&paused),
            )?;

            let mut guard = CAPTURE_STATE.lock().unwrap();
            *guard = Some(CaptureHandle {
                system_stream: None,
                mic_thread: Some(mic_thread),
                mic_sink: Some(sink),
                running,
                paused,
                hq_path,
                ai_path,
                worker_handle: None,
            });
        }
    }

    log::info!("Audio capture started.");
    Ok(())
}

#[tauri::command]
pub async fn stop_audio_capture() -> Result<RecordingPaths, String> {
    // Take the state out and release the lock immediately. The blocking work
    // below (stopping the stream, joining threads) must NOT run while holding
    // CAPTURE_STATE, or a concurrent pause/resume/start would block on the mutex.
    let state = {
        let mut guard = CAPTURE_STATE.lock().unwrap();
        guard.take()
    };

    let Some(state) = state else {
        return Ok(RecordingPaths {
            playback_path: "No active audio capture".to_string(),
            ai_path: String::new(),
        });
    };

    // The teardown below blocks: SCK stop, thread joins (worker drain can take
    // a few hundred ms), and WAV finalize. Run it on a blocking thread so it
    // never stalls the Tauri async runtime — blocking the executor here freezes
    // every other IPC call, which is what made Stop need two clicks and the
    // widget show "stalled".
    tauri::async_runtime::spawn_blocking(move || {
        state.running.store(false, Ordering::Relaxed);

        if let Some(stream) = state.system_stream {
            // Log on failure but DO NOT early-return: we must still join the
            // worker so it drains and finalizes the WAV header (else: corrupt file).
            if let Err(e) = stream.stop_capture() {
                log::error!("SCK stop_capture failed: {e}");
            }
        }

        if let Some(mic) = state.mic_thread {
            let _ = mic.stop_tx.send(());
            let _ = mic.join_handle.join();
        }

        // Flush mic-only DualSink after the cpal thread has exited.
        if let Some(sink) = state.mic_sink {
            if let Ok(mut s) = sink.lock() {
                s.finalize();
            }
        }

        // Join worker — drains rings, finalizes DualSink (HQ + AI), then exits.
        if let Some(handle) = state.worker_handle {
            let _ = handle.join();
        }

        log::info!("Audio capture stopped, hq={}", state.hq_path);
        RecordingPaths {
            playback_path: state.hq_path,
            ai_path: state.ai_path,
        }
    })
    .await
    .map_err(|e| format!("Audio stop task panicked: {e}"))
}

#[tauri::command]
pub async fn pause_audio_capture() -> Result<(), String> {
    let guard = CAPTURE_STATE.lock().unwrap();
    if let Some(state) = guard.as_ref() {
        state.paused.store(true, Ordering::Relaxed);
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
