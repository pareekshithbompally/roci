//! Phonon 31M through `ptts`: loaded once from its downloaded folder with its
//! curated voices, then each sentence chunk is synthesized in the chosen voice
//! while the previous one plays.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

use ptts::checkpoint::{Checkpoint, ResolveOptions};
use ptts::preprocess::Lang;
use ptts::synth::{Quant, SpeechOptions, Synth};

use super::playback;
use crate::models::catalog::LocalModel;
use crate::models::LocalError;
use crate::sync::lock;

#[derive(Default)]
pub struct Phonon {
    synth: Mutex<Option<Synth>>,
}

impl Phonon {
    pub fn unload(&self) {
        lock(&self.synth).take();
    }

    /// Speaks `chunks` in order in `voice` (None = the model's default),
    /// calling `on_chunk` as each one's audio begins. Returns when done or
    /// once `stop` is set.
    pub fn speak(
        &self,
        model: &LocalModel,
        dir: &Path,
        chunks: Vec<String>,
        voice: Option<&str>,
        stop: Arc<AtomicBool>,
        mut on_chunk: impl FnMut(&str) + Send + 'static,
    ) -> Result<(), LocalError> {
        let mut guard = lock(&self.synth);
        if guard.is_none() {
            *guard = Some(load(model, dir)?);
        }
        let synth = guard.as_ref().ok_or(LocalError::NotDownloaded)?;
        let rate = synth.sample_rate();
        let options = voice.map_or_else(SpeechOptions::default, |v| SpeechOptions::default().voice(v));

        // One chunk buffered: the next is synthesized while the player plays this one.
        let (tx, rx) = mpsc::sync_channel::<(String, Vec<f32>)>(1);
        let player_stop = Arc::clone(&stop);
        let player = thread::spawn(move || -> Result<(), String> {
            for (chunk, pcm) in rx {
                on_chunk(&chunk);
                playback::play(&pcm, rate, &player_stop)?;
            }
            Ok(())
        });
        for chunk in chunks {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            let pcm = synth.say_with(&chunk, &options).map_err(engine_error)?;
            if tx.send((chunk, pcm)).is_err() {
                break; // the player stopped
            }
        }
        drop(tx);
        player.join().map_err(|_| LocalError::Engine("playback panicked".into()))?.map_err(LocalError::Engine)
    }
}

/// The model with every catalog voice registered by name; the first is the default.
fn load(model: &LocalModel, dir: &Path) -> Result<Synth, LocalError> {
    let checkpoint = Checkpoint::resolve(dir, ResolveOptions { quant: Quant::Q80, weights: None }).map_err(engine_error)?;
    let builder = model
        .voices
        .iter()
        .fold(checkpoint.builder(Lang::En), |builder, v| builder.add_voice(v.name, dir.join(v.file)));
    let builder = match model.voices.first() {
        Some(default) => builder.voice(default.name),
        None => builder,
    };
    builder.build().map_err(engine_error)
}

fn engine_error(error: ptts::Error) -> LocalError {
    LocalError::Engine(error.to_string())
}

