//! On-device text-to-image: a warm stable-diffusion.cpp `sd-server` on Metal; the webview calls its OpenAI image API.

pub mod commands;
mod server;

/// The image server for the chosen downloaded model.
#[derive(Default)]
pub struct ImageState {
    pub server: server::ImageServer,
}
