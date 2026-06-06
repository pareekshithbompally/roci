use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};
use std::fs::File;
use std::io::BufWriter;

/// Create a 16-bit mono WAV writer at the given sample rate.
/// Parameterized so both the HQ writer (48 kHz) and future AI writer (16 kHz) can use it.
pub fn create_wav_writer(
    output_path: &str,
    sample_rate: u32,
) -> Result<WavWriter<BufWriter<File>>, String> {
    let file = File::create(output_path)
        .map_err(|e| format!("Failed to create output file: {e}"))?;
    let writer = BufWriter::new(file);
    let wav_spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: WavSampleFormat::Int,
    };
    WavWriter::new(writer, wav_spec)
        .map_err(|e| format!("Failed to initialize wav writer: {e}"))
}

/// Convert f32 samples (−1.0 … +1.0) to i16 PCM.
pub fn convert_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|v| (v.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}
