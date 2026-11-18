//! Meeting audio: mic and system audio record 16 kHz tracks on a shared clock; stop mixes them into one file.

mod capture;
pub mod commands;
mod level;
mod live;
#[cfg(target_os = "macos")]
mod lid;
mod microphone;
mod mixdown;
mod recorder;
mod recovery;
mod resample;
#[cfg(target_os = "ios")]
pub mod session;
#[cfg(target_os = "macos")]
mod system_audio;
mod tracks;
#[cfg(target_os = "macos")]
mod transport;

/// The rate of every track and of the mixed recording.
const SAMPLE_RATE: u32 = 16_000;
