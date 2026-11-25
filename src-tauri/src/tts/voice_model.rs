//! A downloaded voice model on llama.cpp: each sentence chunk is synthesized while the previous one plays.

use std::sync::{mpsc, Arc};
use std::thread;

use super::{playback, Halt};
use crate::models::LocalError;

/// Speaks `chunks`, each made into sound by `synthesize` (mono samples and their rate), calling `on_chunk` as each
/// begins; ends on `halt`.
pub fn speak(
    chunks: Vec<String>,
    halt: Arc<Halt>,
    mut on_chunk: impl FnMut(&str) + Send + 'static,
    mut synthesize: impl FnMut(&str) -> Result<(Vec<f32>, u32), LocalError>,
) -> Result<(), LocalError> {
    // One chunk buffered: the next is synthesized while the player plays this one.
    let (tx, rx) = mpsc::sync_channel::<(String, Vec<f32>, u32)>(1);
    let player_halt = Arc::clone(&halt);
    let player = thread::spawn(move || -> Result<(), String> {
        for (chunk, pcm, rate) in rx {
            on_chunk(&chunk);
            if player_halt.is_stopped() {
                break;
            }
            playback::play(&pcm, rate, &player_halt)?;
        }
        Ok(())
    });
    for chunk in chunks {
        if halt.is_stopped() {
            break;
        }
        let (pcm, rate) = synthesize(&chunk)?;
        if tx.send((chunk, pcm, rate)).is_err() {
            break; // the player stopped
        }
    }
    drop(tx);
    player.join().map_err(|_| LocalError::Engine("playback panicked".into()))?.map_err(LocalError::Engine)
}

/// A WAV's samples as mono floats in [-1, 1], with its rate.
pub fn samples_of(wav: &[u8]) -> Result<(Vec<f32>, u32), LocalError> {
    let reader = hound::WavReader::new(std::io::Cursor::new(wav)).map_err(|e| LocalError::Engine(e.to_string()))?;
    let spec = reader.spec();
    let samples: Result<Vec<f32>, _> = match spec.sample_format {
        hound::SampleFormat::Float => reader.into_samples::<f32>().collect(),
        hound::SampleFormat::Int => {
            let scale = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader.into_samples::<i32>().map(|s| s.map(|v| v as f32 / scale)).collect()
        }
    };
    Ok((samples.map_err(|e| LocalError::Engine(e.to_string()))?, spec.sample_rate))
}

/// The in-app engine speaks on iPhone and iPad; the Mac's voices run in llama-server.
#[cfg(all(test, mobile))]
mod tests {
    use super::*;
    use crate::stt::engine::Engine;
    use std::path::Path;

    /// Real models: `ROCI_VOICE_DIRS` (voice model folders with their projector, comma-separated) each speak a sentence
    /// that the Parakeet model in `ROCI_STT_DIR` must transcribe back.
    #[test]
    #[ignore = "needs downloaded voice models and Parakeet"]
    fn each_voice_model_speaks_intelligibly() {
        let dirs = std::env::var("ROCI_VOICE_DIRS").unwrap();
        let parakeet = Path::new(&std::env::var("ROCI_STT_DIR").unwrap()).join("parakeet-unified-en-0.6b-Q8_0.gguf");
        let stt = Engine::default();
        for dir in dirs.split(',') {
            let ggufs: Vec<_> = std::fs::read_dir(dir).unwrap().flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e == "gguf")).collect();
            let projector = ggufs.iter().find(|p| p.to_string_lossy().contains("mmproj")).unwrap();
            let model = ggufs.iter().find(|p| !p.to_string_lossy().contains("mmproj")).unwrap();
            let (pcm, rate) = crate::llama::speak(dir, model, projector, "The quarterly review is on Friday morning.", None).unwrap();
            assert!(pcm.len() > rate as usize, "{dir}: under a second of audio");
            let pcm = playback::resample(&pcm, rate, 16_000).unwrap();
            let heard: String = stt.transcribe("parakeet-unified-en", &parakeet, &pcm, "en").unwrap().segments.into_iter().map(|t| t.text).collect();
            println!("{dir}: {heard}");
            let heard = heard.to_lowercase();
            assert!(heard.contains("quarterly") && heard.contains("friday"), "{dir} was heard as {heard:?}");
        }
    }
}
