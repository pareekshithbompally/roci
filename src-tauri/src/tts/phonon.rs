//! Phonon 31M through `ptts`: loaded once from its downloaded folder, then
//! each sentence chunk is synthesized while the previous one plays.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

use ptts::checkpoint::{Checkpoint, ResolveOptions};
use ptts::preprocess::Lang;
use ptts::synth::{Quant, Synth};

use super::playback;
use crate::models::LocalError;

#[derive(Default)]
pub struct Phonon {
    synth: Mutex<Option<Synth>>,
}

impl Phonon {
    pub fn unload(&self) {
        self.synth.lock().unwrap_or_else(|e| e.into_inner()).take();
    }

    /// Speaks `chunks` in order; returns when done or once `stop` is set.
    pub fn speak(&self, dir: &Path, chunks: Vec<String>, stop: Arc<AtomicBool>) -> Result<(), LocalError> {
        let mut guard = self.synth.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            *guard = Some(load(dir)?);
        }
        let synth = guard.as_ref().ok_or(LocalError::NotDownloaded)?;
        let rate = synth.sample_rate();

        // One chunk buffered: the next is synthesized while the player plays this one.
        let (tx, rx) = mpsc::sync_channel::<Vec<f32>>(1);
        let player_stop = Arc::clone(&stop);
        let player = thread::spawn(move || -> Result<(), String> {
            for pcm in rx {
                playback::play(&pcm, rate, &player_stop)?;
            }
            Ok(())
        });
        for chunk in chunks {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            let pcm = synth.say(&chunk).map_err(engine_error)?;
            if tx.send(pcm).is_err() {
                break; // the player stopped
            }
        }
        drop(tx);
        player.join().map_err(|_| LocalError::Engine("playback panicked".into()))?.map_err(LocalError::Engine)
    }
}

fn load(dir: &Path) -> Result<Synth, LocalError> {
    let checkpoint = Checkpoint::resolve(dir, ResolveOptions { quant: Quant::Q80, weights: None }).map_err(engine_error)?;
    let builder = checkpoint
        .voices
        .iter()
        .fold(checkpoint.builder(Lang::En), |builder, (name, path)| builder.add_voice(name.clone(), path.clone()));
    builder.build().map_err(engine_error)
}

fn engine_error(error: ptts::Error) -> LocalError {
    LocalError::Engine(error.to_string())
}

