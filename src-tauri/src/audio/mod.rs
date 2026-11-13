//! Meeting audio capture: the microphone and the system audio each record to
//! their own 16 kHz track on a shared clock, and stop mixes them into one
//! recording.
//!
//! - [`commands`] — the four `#[tauri::command]`s the frontend invokes.

mod capture;
pub mod commands;
mod level;
mod lid;
mod microphone;
mod mixdown;
mod recorder;
mod resample;
mod system_audio;
mod tracks;
mod transport;

/// The rate of every track and of the mixed recording.
const SAMPLE_RATE: u32 = 16_000;
