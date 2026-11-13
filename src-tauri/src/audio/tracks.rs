use std::fs::{self, File, OpenOptions};
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::mpsc::Receiver;
use std::thread;
use std::time::{Duration, Instant};

use eyre::{Result, eyre};
use hound::{SampleFormat, WavSpec, WavWriter};
use serde::{Deserialize, Serialize};

use super::SAMPLE_RATE;
use super::recorder::Pause;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct TrackManifest {
    pub file: String,
    pub sample_rate: Option<u32>,
    pub first_pts_us: Option<i64>,
    pub last_pts_us: Option<i64>,
    pub first_arrival_us: Option<u64>,
    pub samples: u64,
    pub dropped_packets: u64,
    /// Stretches where this source captured nothing while the meeting kept
    /// recording, filled with silence so the track stays on the timeline.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub gaps: Vec<TrackGap>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct TrackGap {
    /// Where the silence starts, in milliseconds of this track.
    pub start_ms: u64,
    pub duration_ms: u64,
}

/// Written beside the tracks when capture ends, so a recording left behind
/// by a quit or a failed mix is recovered with its alignment.
pub(super) const STATS_FILE: &str = "tracks.json";

/// How often the writer rewrites each track's WAV header, so a crash or
/// force quit leaves tracks readable up to the last refresh.
const HEADER_REFRESH_INTERVAL: Duration = Duration::from_secs(1);

/// A source that resumes after at least this much silence is padded back
/// onto the timeline. Ordinary callback jitter and clock drift stay below it.
const GAP_PAD_THRESHOLD_MS: u64 = 1_000;

/// Samples missing before `packet`, judged from its arrival on the shared
/// capture clock against the samples this track already holds. Packets are
/// stamped as they finish, so the packet's own length is subtracted; the
/// estimate errs toward padding slightly too little rather than too much.
fn missing_samples(track: &TrackManifest, packet: &AudioPacket) -> u64 {
    let Some(first_arrival_us) = track.first_arrival_us else {
        return 0;
    };
    let elapsed_us = packet.arrival_us.saturating_sub(first_arrival_us);
    let expected_start = (u128::from(elapsed_us) * u128::from(packet.sample_rate) / 1_000_000)
        .saturating_sub(packet.samples.len() as u128) as u64;
    let missing = expected_start.saturating_sub(track.samples);
    if missing * 1_000 >= GAP_PAD_THRESHOLD_MS * u64::from(packet.sample_rate) {
        missing
    } else {
        0
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MeetingSource {
    System,
    Microphone,
}

pub(super) struct AudioPacket {
    pub(super) source: MeetingSource,
    pub(super) pts_us: Option<i64>,
    pub(super) arrival_us: u64,
    pub(super) sample_rate: u32,
    pub(super) samples: Vec<f32>,
}

#[derive(Default, Deserialize, Serialize)]
pub(super) struct CaptureStats {
    pub(super) system: TrackManifest,
    pub(super) microphone: TrackManifest,
}

/// Writes each source's packets to its own 16 kHz track. Packets that arrive
/// while `pause` holds are dropped, and later arrivals move back by the
/// paused span, so a pause leaves no gap. `on_packet` sees every written
/// packet.
pub(super) fn write_tracks(
    directory: &Path,
    receiver: Receiver<AudioPacket>,
    pause: &Pause,
    mut on_packet: impl FnMut(&AudioPacket),
) -> Result<CaptureStats> {
    let mut system = None;
    let mut microphone = None;
    let mut stats = CaptureStats::default();
    stats.system.file = "system.wav".into();
    stats.microphone.file = "microphone.wav".into();
    let mut header_refreshed = Instant::now();
    while let Ok(mut packet) = receiver.recv() {
        let Some(paused_us) = pause.shift_us() else {
            continue;
        };
        packet.arrival_us = packet.arrival_us.saturating_sub(paused_us);
        let (writer, track, file_name) = match packet.source {
            MeetingSource::System => (&mut system, &mut stats.system, "system.wav"),
            MeetingSource::Microphone => (&mut microphone, &mut stats.microphone, "microphone.wav"),
        };
        if let Some(rate) = track.sample_rate
            && rate != packet.sample_rate
        {
            return Err(eyre!(
                "{file_name} sample rate changed from {rate} to {}",
                packet.sample_rate
            ));
        }
        track.sample_rate = Some(packet.sample_rate);
        if writer.is_none() {
            let path = directory.join(file_name);
            let created = WavWriter::create(
                &path,
                WavSpec {
                    channels: 1,
                    sample_rate: packet.sample_rate,
                    bits_per_sample: 32,
                    sample_format: SampleFormat::Float,
                },
            )?;
            set_owner_only(&path, false)?;
            *writer = Some(created);
        }
        let writer = writer
            .as_mut()
            .ok_or_else(|| eyre!("could not initialize {file_name}"))?;
        if let Some(pts_us) = packet.pts_us {
            track.first_pts_us.get_or_insert(pts_us);
            track.last_pts_us = Some(pts_us);
        }
        let missing = missing_samples(track, &packet);
        if missing > 0 {
            let rate = u64::from(packet.sample_rate);
            track.gaps.push(TrackGap {
                start_ms: track.samples * 1_000 / rate,
                duration_ms: missing * 1_000 / rate,
            });
            tracing::warn!(
                source = ?packet.source,
                gap_ms = missing * 1_000 / rate,
                "meeting source resumed after a gap; padding silence"
            );
            for _ in 0..missing {
                writer.write_sample(0.0)?;
            }
            track.samples += missing;
        }
        track.first_arrival_us.get_or_insert(packet.arrival_us);
        track.samples += packet.samples.len() as u64;
        for &sample in &packet.samples {
            writer.write_sample(sample)?;
        }
        on_packet(&packet);
        if header_refreshed.elapsed() >= HEADER_REFRESH_INTERVAL {
            for writer in [&mut system, &mut microphone].into_iter().flatten() {
                writer.flush()?;
            }
            header_refreshed = Instant::now();
        }
    }
    finalize_track(directory.join("system.wav"), system)?;
    finalize_track(directory.join("microphone.wav"), microphone)?;
    Ok(stats)
}

fn finalize_track(path: PathBuf, writer: Option<WavWriter<BufWriter<File>>>) -> Result<()> {
    if let Some(writer) = writer {
        writer.finalize()?;
        Ok(sync_file(&path)?)
    } else {
        create_empty_track(path)
    }
}

fn create_empty_track(path: PathBuf) -> Result<()> {
    WavWriter::create(
        &path,
        WavSpec {
            channels: 1,
            sample_rate: SAMPLE_RATE,
            bits_per_sample: 32,
            sample_format: SampleFormat::Float,
        },
    )?
    .finalize()?;
    set_owner_only(&path, false)?;
    Ok(sync_file(&path)?)
}

pub(super) fn join_audio_writer(
    writer: thread::JoinHandle<Result<CaptureStats>>,
) -> Result<CaptureStats> {
    writer
        .join()
        .map_err(|_| eyre!("meeting audio writer panicked"))
        .and_then(|result| result)
}

pub(super) fn has_recorded_audio(stats: &CaptureStats) -> bool {
    stats.system.samples > 0 || stats.microphone.samples > 0
}

/// Removes a recording's tracks once they are no longer needed. A failure
/// leaves them for recovery rather than failing the recording.
pub(super) fn remove_tracks(directory: &Path) {
    if let Err(error) = fs::remove_dir_all(directory) {
        tracing::warn!(%error, directory = %directory.display(), "could not remove meeting tracks");
    }
}

pub(super) fn set_owner_only(path: &Path, directory: bool) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(
        path,
        fs::Permissions::from_mode(if directory { 0o700 } else { 0o600 }),
    )?;
    Ok(())
}

pub(super) fn sync_file(path: &Path) -> std::io::Result<()> {
    OpenOptions::new().write(true).open(path)?.sync_all()
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;

    use hound::WavReader;

    use super::*;

    fn packet_at(source: MeetingSource, arrival_ms: u64, samples: usize) -> AudioPacket {
        AudioPacket {
            source,
            pts_us: None,
            arrival_us: arrival_ms * 1_000,
            sample_rate: SAMPLE_RATE,
            samples: vec![0.25; samples],
        }
    }

    #[test]
    fn contiguous_audio_with_jitter_is_not_padded() {
        let track = TrackManifest {
            first_arrival_us: Some(100_000),
            samples: 16_000,
            ..TrackManifest::default()
        };
        // One second of audio held, the next 100 ms packet arrives 300 ms late.
        let late = packet_at(MeetingSource::Microphone, 1_500, 1_600);
        assert_eq!(missing_samples(&track, &late), 0);
    }

    #[test]
    fn a_source_that_resumes_after_an_outage_is_padded_back_onto_the_timeline() {
        let track = TrackManifest {
            first_arrival_us: Some(0),
            samples: 16_000,
            ..TrackManifest::default()
        };
        // The source went silent after one second and resumed at 11.1 s.
        let resumed = packet_at(MeetingSource::System, 11_100, 1_600);
        assert_eq!(missing_samples(&track, &resumed), 160_000);
    }

    #[test]
    fn writer_fills_a_capture_gap_with_silence_and_records_it() {
        let directory = std::env::temp_dir().join(format!(
            "kasset-meeting-gap-{}",
            std::process::id()
        ));
        fs::create_dir_all(&directory).unwrap();
        let (sender, receiver) = mpsc::sync_channel(16);
        for (arrival_ms, source) in [
            (100, MeetingSource::System),
            (100, MeetingSource::Microphone),
            (200, MeetingSource::System),
            (200, MeetingSource::Microphone),
            // System audio drops out for five seconds; the microphone continues.
            (300, MeetingSource::Microphone),
            (5_300, MeetingSource::System),
        ] {
            sender.send(packet_at(source, arrival_ms, 1_600)).unwrap();
        }
        drop(sender);
        let stats = write_tracks(&directory, receiver, &Pause::default(), |_| {}).unwrap();
        assert_eq!(stats.microphone.samples, 4_800);
        assert!(stats.microphone.gaps.is_empty());
        assert_eq!(stats.system.gaps.len(), 1);
        assert_eq!(stats.system.gaps[0].start_ms, 200);
        assert_eq!(stats.system.gaps[0].duration_ms, 4_900);
        assert_eq!(stats.system.samples, 3_200 + 78_400 + 1_600);
        let wav = WavReader::open(directory.join("system.wav")).unwrap();
        assert_eq!(u64::from(wav.len()), stats.system.samples);
        fs::remove_dir_all(directory).unwrap();
    }
}
