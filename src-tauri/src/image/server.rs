//! How `sd-server` (stable-diffusion.cpp's OpenAI image API, Metal) is started for an image model.

use std::ffi::OsString;
use std::net::TcpListener;
use std::path::Path;

use crate::model_server::{Launch, LOCALHOST};
use crate::models::catalog::LocalModel;
use crate::models::LocalError;

pub const SD_SERVER: &str = "sd-server";

/// A model's default sampling settings (stable-diffusion.cpp's presets for it), passed at startup.
struct Recipe {
    id: &'static str,
    steps: u32,
    cfg_scale: f32,
}

const RECIPES: &[Recipe] = &[
    Recipe { id: "z-image-turbo", steps: 9, cfg_scale: 1.0 },
    Recipe { id: "flux-2-klein-4b", steps: 4, cfg_scale: 1.0 },
];

/// A free local port: bound by the OS, then released for the server to take (sd-server can't bind port 0).
fn free_port() -> Result<u16, LocalError> {
    Ok(TcpListener::bind((LOCALHOST, 0))?.local_addr()?.port())
}

/// The arguments that serve `model` (files in `dir`): diffusion model, text encoder, VAE and its recipe.
pub fn launch(model: &LocalModel, dir: &Path) -> Result<Launch, LocalError> {
    let recipe = RECIPES.iter().find(|r| r.id == model.id).ok_or_else(|| LocalError::UnknownModel(model.id.to_string()))?;
    let [diffusion, text_encoder, vae] = model.files else {
        return Err(LocalError::Engine(format!("{} must have a diffusion model, a text encoder and a VAE", model.id)));
    };
    let mut args: Vec<OsString> = Vec::new();
    let mut arg = |flag: &str, value: OsString| args.extend([flag.into(), value]);
    arg("--listen-ip", LOCALHOST.into());
    arg("--listen-port", free_port()?.to_string().into());
    arg("--model-dir", dir.into());
    arg("--diffusion-model", dir.join(diffusion.name).into());
    arg("--llm", dir.join(text_encoder.name).into());
    arg("--vae", dir.join(vae.name).into());
    arg("--steps", recipe.steps.to_string().into());
    arg("--cfg-scale", recipe.cfg_scale.to_string().into());
    args.extend(["--diffusion-fa".into(), "--vae-tiling".into()]);
    Ok(Launch { args, envs: Vec::new() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::catalog::{Kind, MODELS};

    #[test]
    fn every_image_model_has_a_recipe_and_three_files() {
        for model in MODELS.iter().filter(|m| m.kind == Kind::Image) {
            assert!(RECIPES.iter().any(|r| r.id == model.id), "{} has no recipe", model.id);
            assert_eq!(model.files.len(), 3, "{} needs diffusion model, text encoder, VAE", model.id);
        }
    }

    #[test]
    fn a_free_port_is_found() {
        assert!(free_port().unwrap() > 0);
    }
}
