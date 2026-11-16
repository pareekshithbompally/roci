//! Turns a meeting's track folder into its recording: at Stop, and at launch for one a quit or crash cut off.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use eyre::{Result, bail};
use hound::WavReader;

use super::SAMPLE_RATE;
use super::mixdown::mixdown;
use super::tracks::{CaptureStats, STATS_FILE, TrackManifest, has_recorded_audio, remove_tracks};

/// Mixes the tracks into `output` and removes them; returns the recording's length in seconds.
pub(super) fn mix(directory: &Path, stats: &CaptureStats, output: &Path) -> Result<f64> {
    if !has_recorded_audio(stats) {
        remove_tracks(directory);
        bail!("no meeting audio was captured");
    }
    mixdown(directory, &[&stats.system, &stats.microphone], output)?;
    remove_tracks(directory);
    let samples = stats.system.samples.max(stats.microphone.samples);
    Ok(samples as f64 / f64::from(SAMPLE_RATE))
}

/// Finishes a recording whose capture never stopped cleanly; a mix already written is kept as is.
pub fn recover(directory: &Path, output: &Path) -> Result<f64> {
    if !directory.exists() {
        let reader = WavReader::open(output).map_err(|_| eyre::eyre!("no meeting audio was saved"))?;
        return Ok(f64::from(reader.duration()) / f64::from(reader.spec().sample_rate));
    }
    let stats = read_stats(directory)?;
    let duration = mix(directory, &stats, output)?;
    tracing::info!(output = %output.display(), "recovered a meeting recording");
    Ok(duration)
}

/// The stats written when capture ended, else (after a crash) the tracks' lengths, aligned at their start.
fn read_stats(directory: &Path) -> Result<CaptureStats> {
    match fs::read(directory.join(STATS_FILE)) {
        Ok(data) => Ok(serde_json::from_slice(&data)?),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(CaptureStats {
            system: track_from_file(directory, "system.wav"),
            microphone: track_from_file(directory, "microphone.wav"),
        }),
        Err(error) => Err(error.into()),
    }
}

fn track_from_file(directory: &Path, file: &str) -> TrackManifest {
    let samples = WavReader::open(directory.join(file))
        .map(|reader| u64::from(reader.len()))
        .unwrap_or(0);
    TrackManifest {
        file: file.into(),
        samples,
        ..TrackManifest::default()
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::mpsc;

    use super::*;
    use crate::audio::recorder::Pause;
    use crate::audio::tracks::{AudioPacket, MeetingSource, write_tracks};

    /// A recordings folder with one meeting's track folder; returns (folder, tracks, output).
    fn scratch(name: &str) -> (PathBuf, PathBuf, PathBuf) {
        let recordings = std::env::temp_dir().join(format!("roci-recovery-{name}-{}", std::process::id()));
        let tracks = recordings.join("rec_1_a");
        fs::create_dir_all(&tracks).unwrap();
        let output = recordings.join("rec_1_a.wav");
        (recordings, tracks, output)
    }

    fn write_second(directory: &Path, source: MeetingSource) -> CaptureStats {
        let (sender, receiver) = mpsc::sync_channel(1);
        sender
            .send(AudioPacket {
                source,
                pts_us: None,
                arrival_us: 1_000_000,
                sample_rate: SAMPLE_RATE,
                samples: vec![0.25; SAMPLE_RATE as usize],
            })
            .unwrap();
        drop(sender);
        write_tracks(directory, receiver, &Pause::default(), |_| {}).unwrap()
    }

    #[test]
    fn tracks_without_stats_are_mixed_from_their_files() {
        let (recordings, tracks, output) = scratch("crash");
        write_second(&tracks, MeetingSource::Microphone);
        assert_eq!(recover(&tracks, &output).unwrap(), 1.0);
        assert!(!tracks.exists());
        assert_eq!(WavReader::open(&output).unwrap().len(), SAMPLE_RATE);
        fs::remove_dir_all(recordings).unwrap();
    }

    #[test]
    fn tracks_left_by_a_quit_use_their_stats() {
        let (recordings, tracks, output) = scratch("quit");
        let stats = write_second(&tracks, MeetingSource::System);
        fs::write(tracks.join(STATS_FILE), serde_json::to_vec(&stats).unwrap()).unwrap();
        assert_eq!(recover(&tracks, &output).unwrap(), 1.0);
        assert!(output.exists());
        fs::remove_dir_all(recordings).unwrap();
    }

    #[test]
    fn a_mix_already_written_is_kept() {
        let (recordings, tracks, output) = scratch("mixed");
        write_second(&tracks, MeetingSource::Microphone);
        recover(&tracks, &output).unwrap();
        assert_eq!(recover(&tracks, &output).unwrap(), 1.0);
        fs::remove_dir_all(recordings).unwrap();
    }

    #[test]
    fn empty_tracks_fail_without_a_recording() {
        let (recordings, tracks, output) = scratch("empty");
        assert!(recover(&tracks, &output).is_err());
        assert!(!tracks.exists());
        assert!(!output.exists());
        assert!(recover(&tracks, &output).is_err(), "nothing left to recover");
        fs::remove_dir_all(recordings).unwrap();
    }
}
