//! Mixes the per-source tracks into the one recording that playback and transcription use.

use std::iter;
use std::path::Path;

use eyre::Result;
use hound::{SampleFormat, WavReader, WavSpec, WavWriter};

use super::SAMPLE_RATE;
use super::tracks::TrackManifest;

/// One track's samples on the mix's timeline: silence until it starts, the track, then silence.
type Lane = Box<dyn Iterator<Item = hound::Result<f32>>>;

/// Averages `tracks` into 16 kHz mono PCM, each offset by its first packet's arrival so sources align.
pub(super) fn mixdown(directory: &Path, tracks: &[&TrackManifest], output: &Path) -> Result<()> {
    let recorded: Vec<&TrackManifest> = tracks
        .iter()
        .copied()
        .filter(|track| track.samples > 0)
        .collect();
    let starts = start_offsets(&recorded);
    let length = starts
        .iter()
        .zip(&recorded)
        .map(|(start, track)| start + track.samples)
        .max()
        .unwrap_or(0);
    let mut lanes = recorded
        .iter()
        .zip(&starts)
        .map(|(track, &start)| open_lane(&directory.join(&track.file), start))
        .collect::<Result<Vec<_>>>()?;
    let mut writer = WavWriter::create(
        output,
        WavSpec {
            channels: 1,
            sample_rate: SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        },
    )?;
    let gain = 1.0 / lanes.len().max(1) as f32;
    for _ in 0..length {
        let mut sum = 0.0;
        for lane in &mut lanes {
            sum += lane.next().unwrap_or(Ok(0.0))?;
        }
        writer.write_sample(to_pcm16(sum * gain))?;
    }
    writer.finalize()?;
    Ok(())
}

/// Each track's first sample, in samples after the earliest track's.
fn start_offsets(tracks: &[&TrackManifest]) -> Vec<u64> {
    let arrivals: Vec<u64> = tracks
        .iter()
        .map(|track| track.first_arrival_us.unwrap_or(0))
        .collect();
    let earliest = arrivals.iter().copied().min().unwrap_or(0);
    arrivals
        .into_iter()
        .map(|arrival| (arrival - earliest) * u64::from(SAMPLE_RATE) / 1_000_000)
        .collect()
}

fn open_lane(path: &Path, start: u64) -> Result<Lane> {
    let reader = WavReader::open(path)?;
    let samples = iter::repeat_n(0.0, start as usize)
        .map(Ok)
        .chain(reader.into_samples::<f32>())
        .chain(iter::repeat_with(|| Ok(0.0)));
    Ok(Box::new(samples))
}

fn to_pcm16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;

    fn write_track(directory: &Path, file: &str, samples: &[f32], first_arrival_us: u64) -> TrackManifest {
        let mut writer = WavWriter::create(
            directory.join(file),
            WavSpec {
                channels: 1,
                sample_rate: SAMPLE_RATE,
                bits_per_sample: 32,
                sample_format: SampleFormat::Float,
            },
        )
        .unwrap();
        for &sample in samples {
            writer.write_sample(sample).unwrap();
        }
        writer.finalize().unwrap();
        TrackManifest {
            file: file.into(),
            first_arrival_us: Some(first_arrival_us),
            samples: samples.len() as u64,
            ..TrackManifest::default()
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!("kasset-mixdown-{name}-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn read(path: &Path) -> Vec<i16> {
        WavReader::open(path)
            .unwrap()
            .into_samples::<i16>()
            .map(Result::unwrap)
            .collect()
    }

    #[test]
    fn a_later_track_starts_at_its_arrival_offset() {
        let directory = scratch("offset");
        // The microphone's first packet arrives 1 ms (16 samples) after system audio's.
        let system = write_track(&directory, "system.wav", &[0.5; 32], 1_000);
        let microphone = write_track(&directory, "microphone.wav", &[0.5; 32], 2_000);
        let output = directory.join("mix.wav");
        mixdown(&directory, &[&system, &microphone], &output).unwrap();
        let mixed = read(&output);
        assert_eq!(mixed.len(), 48);
        assert_eq!(mixed[0], to_pcm16(0.25));
        assert_eq!(mixed[16], to_pcm16(0.5));
        assert_eq!(mixed[40], to_pcm16(0.25));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn the_mix_averages_the_recorded_tracks() {
        let directory = scratch("average");
        let system = write_track(&directory, "system.wav", &[0.8; 8], 0);
        let microphone = write_track(&directory, "microphone.wav", &[-0.2; 8], 0);
        let output = directory.join("mix.wav");
        mixdown(&directory, &[&system, &microphone], &output).unwrap();
        assert_eq!(read(&output), vec![to_pcm16(0.3); 8]);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn an_empty_track_does_not_lower_the_other() {
        let directory = scratch("single");
        let system = write_track(&directory, "system.wav", &[], 0);
        let microphone = write_track(&directory, "microphone.wav", &[0.5; 4], 0);
        let output = directory.join("mix.wav");
        mixdown(&directory, &[&system, &microphone], &output).unwrap();
        assert_eq!(read(&output), vec![to_pcm16(0.5); 4]);
        fs::remove_dir_all(directory).unwrap();
    }
}
