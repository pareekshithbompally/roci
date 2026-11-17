//! On-device text-to-image: a warm stable-diffusion.cpp `sd-server` on Metal; the webview calls its OpenAI image API.

pub mod commands;
mod server;

use std::sync::atomic::{AtomicU64, Ordering};

use crate::model_server::ModelServer;

/// The image server for the chosen downloaded model.
pub struct ImageState {
    pub server: ModelServer,
    /// Bumped by every use, so an idle timer only stops the server if nothing used it since.
    generation: AtomicU64,
}

impl Default for ImageState {
    fn default() -> Self {
        Self { server: ModelServer::new(server::SD_SERVER, "image"), generation: AtomicU64::new(0) }
    }
}

impl ImageState {
    /// Marks use; the returned generation is what an idle timer checks.
    fn touch(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn stop_if_idle(&self, generation: u64) {
        if self.generation.load(Ordering::SeqCst) == generation {
            self.server.stop();
        }
    }
}
