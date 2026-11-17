//! The warm `sd-server`: stable-diffusion.cpp's HTTP server (OpenAI image API) for one image model, on Metal, in its
//! own process (its ggml differs from transcribe.cpp's). Started on first use; stopped when idle, on a model switch or
//! delete, and when the app quits.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::models::catalog::LocalModel;
use crate::models::LocalError;
use crate::sync::lock;

/// Bundled next to the app's executable by Tauri's `externalBin` (built by scripts/build-sd-server.sh).
const SD_SERVER: &str = "sd-server";
const LOCALHOST: &str = "127.0.0.1";
/// Logged (and flushed) once the startup model is loaded and the server accepts requests.
const READY_MARK: &str = "listening on:";
/// Last log lines kept to explain a failed start.
const ERROR_TAIL_LINES: usize = 3;

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

struct Running {
    model_id: &'static str,
    port: u16,
    child: Child,
}

impl Running {
    fn url(&self) -> String {
        format!("http://{LOCALHOST}:{}", self.port)
    }

    fn stop(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default)]
pub struct ImageServer {
    running: Mutex<Option<Running>>,
    /// Bumped by every use, so an idle timer only stops the server if nothing used it since.
    generation: AtomicU64,
}

impl ImageServer {
    /// Marks use; the returned generation is what an idle timer checks.
    pub fn touch(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn stop_if_idle(&self, generation: u64) {
        if self.generation.load(Ordering::SeqCst) == generation {
            self.stop();
        }
    }

    pub fn stop(&self) {
        if let Some(running) = lock(&self.running).take() {
            running.stop();
        }
    }

    /// Stops the server if it runs the model about to be deleted.
    pub fn forget(&self, id: &str) {
        let mut running = lock(&self.running);
        if running.as_ref().is_some_and(|r| r.model_id == id) {
            if let Some(stopped) = running.take() {
                stopped.stop();
            }
        }
    }

    /// The base URL of a server running `model` (files in `dir`), starting or switching it when needed.
    /// Blocks while the model loads.
    pub fn ensure(&self, model: &'static LocalModel, dir: &Path) -> Result<String, LocalError> {
        let mut running = lock(&self.running);
        if let Some(current) = running.as_mut() {
            if current.model_id == model.id && current.child.try_wait()?.is_none() {
                return Ok(current.url());
            }
        }
        if let Some(previous) = running.take() {
            previous.stop();
        }
        let started = start(model, dir)?;
        let url = started.url();
        *running = Some(started);
        Ok(url)
    }
}

fn sd_server() -> Result<PathBuf, LocalError> {
    let path = std::env::current_exe()?.with_file_name(SD_SERVER);
    if path.is_file() {
        Ok(path)
    } else {
        Err(LocalError::Engine(format!("{SD_SERVER} isn't bundled with this build (run scripts/build-sd-server.sh)")))
    }
}

/// A free local port: bound by the OS, then released for the server to take.
fn free_port() -> Result<u16, LocalError> {
    Ok(TcpListener::bind((LOCALHOST, 0))?.local_addr()?.port())
}

type Tail = Arc<Mutex<VecDeque<String>>>;

fn remember(tail: &Tail, line: String) {
    if line.trim().is_empty() {
        return;
    }
    let mut lines = lock(tail);
    if lines.len() == ERROR_TAIL_LINES {
        lines.pop_front();
    }
    lines.push_back(line);
}

/// Reads `stream` to its end on its own thread (a full pipe would stall the server), keeping its last lines.
fn drain(stream: impl Read + Send + 'static, tail: Tail) {
    std::thread::spawn(move || {
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            remember(&tail, line);
        }
    });
}

fn launch(model: &LocalModel, dir: &Path, port: u16) -> Result<Child, LocalError> {
    let recipe = RECIPES.iter().find(|r| r.id == model.id).ok_or_else(|| LocalError::UnknownModel(model.id.to_string()))?;
    let [diffusion, text_encoder, vae] = model.files else {
        return Err(LocalError::Engine(format!("{} must have a diffusion model, a text encoder and a VAE", model.id)));
    };
    Ok(Command::new(sd_server()?)
        .arg("--listen-ip").arg(LOCALHOST)
        .arg("--listen-port").arg(port.to_string())
        .arg("--model-dir").arg(dir)
        .arg("--diffusion-model").arg(dir.join(diffusion.name))
        .arg("--llm").arg(dir.join(text_encoder.name))
        .arg("--vae").arg(dir.join(vae.name))
        .args(["--diffusion-fa", "--vae-tiling"])
        .arg("--steps").arg(recipe.steps.to_string())
        .arg("--cfg-scale").arg(recipe.cfg_scale.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?)
}

/// Starts the server and waits for its ready line; on exit before it, the error is its last log lines.
fn start(model: &'static LocalModel, dir: &Path) -> Result<Running, LocalError> {
    let port = free_port()?;
    let mut child = launch(model, dir, port)?;
    let tail: Tail = Arc::default();
    if let Some(stderr) = child.stderr.take() {
        drain(stderr, tail.clone());
    }
    let mut stdout = BufReader::new(child.stdout.take().ok_or_else(|| LocalError::Engine("sd-server has no output".into()))?);
    let mut line = String::new();
    while stdout.read_line(&mut line)? > 0 {
        if line.contains(READY_MARK) {
            drain(stdout.into_inner(), tail);
            return Ok(Running { model_id: model.id, port, child });
        }
        remember(&tail, std::mem::take(&mut line));
    }
    let _ = child.wait();
    let detail = lock(&tail).iter().map(|l| l.trim_end()).collect::<Vec<_>>().join("\n");
    Err(LocalError::Engine(if detail.is_empty() { "sd-server stopped while loading the model".into() } else { detail }))
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
    fn tail_keeps_the_last_lines() {
        let tail: Tail = Arc::default();
        for line in ["a", "", "b", "c", "d"] {
            remember(&tail, line.to_string());
        }
        assert_eq!(lock(&tail).iter().cloned().collect::<Vec<_>>(), ["b", "c", "d"]);
    }

    #[test]
    fn a_free_port_is_found() {
        assert!(free_port().unwrap() > 0);
    }
}
