//! Recordings a quit, crash, or failed mix left as track folders: mixed
//! down at the next launch so no meeting is lost.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use eyre::Result;
use hound::WavReader;

use super::SAMPLE_RATE;
use super::mixdown::mixdown;
use super::tracks::{CaptureStats, STATS_FILE, TrackManifest, has_recorded_audio, remove_tracks};

const TRACK_DIRECTORY_PREFIX: &str = "recording_";

/// A recording recovered from its tracks.
pub struct Recovered {
    pub path: PathBuf,
    /// When the recording started, from its track folder.
    pub recorded_at_ms: u64,
    pub size: u64,
    pub has_system: bool,
    pub has_microphone: bool,
    pub duration_secs: u64,
}

/// Mixes down every track folder in `recordings`, oldest first. A folder
/// that cannot be recovered is kept and logged.
pub fn recover(recordings: &Path) -> Result<Vec<Recovered>> {
    let mut directories: Vec<PathBuf> = fs::read_dir(recordings)?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir() && is_track_directory(path))
        .collect();
    directories.sort();
    let mut recovered = Vec::new();
    for directory in directories {
        match recover_one(&directory) {
            Ok(Some(recording)) => recovered.push(recording),
            Ok(None) => {}
            Err(error) => {
                tracing::error!(%error, directory = %directory.display(), "could not recover meeting tracks");
            }
        }
    }
    Ok(recovered)
}

fn is_track_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with(TRACK_DIRECTORY_PREFIX))
}

fn recover_one(directory: &Path) -> Result<Option<Recovered>> {
    let stats = read_stats(directory)?;
    if !has_recorded_audio(&stats) {
        remove_tracks(directory);
        return Ok(None);
    }
    let recorded_at_ms = fs::metadata(directory)?
        .created()?
        .duration_since(UNIX_EPOCH)?
        .as_millis() as u64;
    let output = directory.with_extension("wav");
    mixdown(directory, &[&stats.system, &stats.microphone], &output)?;
    remove_tracks(directory);
    let size = fs::metadata(&output)?.len();
    tracing::info!(output = %output.display(), "recovered a meeting recording");
    let samples = stats.system.samples.max(stats.microphone.samples);
    Ok(Some(Recovered {
        path: output,
        recorded_at_ms,
        size,
        has_system: stats.system.samples > 0,
        has_microphone: stats.microphone.samples > 0,
        duration_secs: samples / u64::from(SAMPLE_RATE),
    }))
}

/// The stats written when capture ended, else (after a crash) the tracks'
/// lengths up to their last header refresh, aligned at their start.
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
    use std::sync::mpsc;

    use super::*;
    use crate::audio::recorder::Pause;
    use crate::audio::tracks::{AudioPacket, MeetingSource, write_tracks};

    fn scratch(name: &str) -> PathBuf {
        let recordings = std::env::temp_dir().join(format!("kasset-recovery-{name}-{}", std::process::id()));
        fs::create_dir_all(recordings.join("recording_1")).unwrap();
        recordings
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
        let recordings = scratch("crash");
        write_second(&recordings.join("recording_1"), MeetingSource::Microphone);
        let recovered = recover(&recordings).unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].path, recordings.join("recording_1.wav"));
        assert!(recovered[0].has_microphone && !recovered[0].has_system);
        assert_eq!(recovered[0].duration_secs, 1);
        assert!(!recordings.join("recording_1").exists());
        assert_eq!(WavReader::open(&recovered[0].path).unwrap().len(), SAMPLE_RATE);
        fs::remove_dir_all(recordings).unwrap();
    }

    #[test]
    fn tracks_left_by_a_quit_use_their_stats() {
        let recordings = scratch("quit");
        let directory = recordings.join("recording_1");
        let stats = write_second(&directory, MeetingSource::System);
        fs::write(directory.join(STATS_FILE), serde_json::to_vec(&stats).unwrap()).unwrap();
        let recovered = recover(&recordings).unwrap();
        assert_eq!(recovered.len(), 1);
        assert!(recovered[0].has_system && !recovered[0].has_microphone);
        fs::remove_dir_all(recordings).unwrap();
    }

    #[test]
    fn empty_tracks_are_removed_without_a_recording() {
        let recordings = scratch("empty");
        assert!(recover(&recordings).unwrap().is_empty());
        assert!(!recordings.join("recording_1").exists());
        assert!(!recordings.join("recording_1.wav").exists());
        fs::remove_dir_all(recordings).unwrap();
    }
}
