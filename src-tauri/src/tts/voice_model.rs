//! A downloaded voice model on MLX: each sentence chunk is synthesized while the previous one plays.

use std::path::Path;
use std::sync::{mpsc, Arc};
use std::thread;

use super::{playback, Halt};
use crate::models::LocalError;

/// Speaks `chunks` in `voice` (None = the model's default), calling `on_chunk` as each begins; ends on `halt`.
pub fn speak(
    dir: &Path,
    loads_as: Option<&str>,
    chunks: Vec<String>,
    voice: Option<&str>,
    halt: Arc<Halt>,
    mut on_chunk: impl FnMut(&str) + Send + 'static,
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
        let (pcm, rate) = crate::mlx::speak(dir, loads_as, &chunk, voice)?;
        if tx.send((chunk, pcm, rate)).is_err() {
            break; // the player stopped
        }
    }
    drop(tx);
    player.join().map_err(|_| LocalError::Engine("playback panicked".into()))?.map_err(LocalError::Engine)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stt::engine::Engine;

    /// Real models: `ROCI_MLX_VOICE_DIRS` (voice model folders, comma-separated) each speak a sentence that the Parakeet
    /// model in `ROCI_STT_DIR` must transcribe back.
    #[test]
    #[ignore = "needs downloaded voice models and Parakeet"]
    fn each_voice_model_speaks_intelligibly() {
        let dirs = std::env::var("ROCI_MLX_VOICE_DIRS").unwrap();
        let parakeet = Path::new(&std::env::var("ROCI_STT_DIR").unwrap()).join("parakeet-unified-en-0.6b-Q8_0.gguf");
        let stt = Engine::default();
        for dir in dirs.split(',') {
            let folder = Path::new(dir);
            let id = folder.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            let loads_as = crate::models::catalog::find(id).ok().and_then(|m| m.loads_as);
            let (pcm, rate) = crate::mlx::speak(folder, loads_as, "The quarterly review is on Friday morning.", None).unwrap();
            assert!(pcm.len() > rate as usize, "{dir}: under a second of audio");
            let pcm = playback::resample(&pcm, rate, 16_000).unwrap();
            let heard: String = stt.transcribe("parakeet-unified-en", &parakeet, &pcm, "en").unwrap().segments.into_iter().map(|t| t.text).collect();
            println!("{dir}: {heard}");
            let heard = heard.to_lowercase();
            assert!(heard.contains("quarterly") && heard.contains("friday"), "{dir} was heard as {heard:?}");
        }
    }
}
