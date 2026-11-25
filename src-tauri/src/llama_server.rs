//! The Mac's on-device engine: llama.cpp's own llama-server, bundled with Roci and run as a router. Roci writes its
//! model presets (one section per downloaded catalog model) and starts it on first use; llama.cpp loads each model in a
//! process of its own, unloads the least recently used one when memory runs short and sleeps idle ones. Roci only
//! starts, restarts and stops it. Chat goes to it from the webview (OpenAI-compatible); search and read aloud from here.
//! Three layers set it up: the engine's flags (Settings › Providers › On this device), each chat model's preset (its
//! maker's values under the user's, from Personalization › Model Tuning, sent by the webview), and what a request asks.

use std::collections::HashMap;
use std::fmt::Write as _;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::models::catalog::{self, Kind, LocalModel};
use crate::models::gpu::Priority;
use crate::models::{blocking, store, LocalError};
use crate::sync::lock;

/// The longest a start may take before it is given up (the router reads its presets; no model loads yet).
const START_TIMEOUT: Duration = Duration::from_secs(30);
/// What the server prints once it takes requests.
const READY_LINE: &str = "listening on http://";

/// The running server: its process, address, and the flags and presets it started with.
struct Running {
    child: Child,
    url: String,
    config: String,
}

static SERVER: LazyLock<Mutex<Option<Running>>> = LazyLock::new(Mutex::default);

/// The engine-wide flags (Settings › Providers › On this device), as the webview sends them; the default holds until
/// it does.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EngineSettings {
    /// Minutes an unused model stays loaded before llama.cpp sleeps it; 0 keeps it until Roci quits.
    idle_minutes: u64,
    /// MiB of memory kept free: the router unloads the least recently used model until a new one fits, and --fit sizes
    /// what is unset to leave it.
    memory_margin_mib: u32,
    /// MiB each model's process keeps of earlier prompts, so going back to a chat needn't read it again; 0 keeps none.
    cache_ram_mib: u32,
    /// The most models loaded at once; 0: as many as memory holds.
    models_max: u32,
}

impl Default for EngineSettings {
    /// Settings' defaults (`LOCAL_MODELS_CONFIG.engine`).
    fn default() -> Self {
        Self { idle_minutes: 5, memory_margin_mib: 1024, cache_ram_mib: 1024, models_max: 0 }
    }
}

/// A chat model's preset options in llama-server's names (`temp`, `ctx-size` …), as Model Tuning resolves them.
pub type ModelOptions = HashMap<String, Value>;

/// What the next start writes: the engine's flags and each chat model's options, by catalog id.
#[derive(Default)]
struct Config {
    engine: EngineSettings,
    models: HashMap<String, ModelOptions>,
}

static CONFIG: LazyLock<Mutex<Config>> = LazyLock::new(Mutex::default);

/// The preset keys a chat model's options may set; the model and its drafting are Roci's to write (its tuning's
/// `spec-type = none` only leaves drafting out).
const TUNABLE: &[&str] = &[
    "temp", "top-p", "top-k", "min-p", "repeat-penalty", "presence-penalty", "frequency-penalty", "repeat-last-n",
    "dry-multiplier", "n-predict", "reasoning-budget", "ctx-size", "cache-type-k", "cache-type-v",
];

/// The server's address (`http://127.0.0.1:<port>`), starting it first when it isn't running.
pub fn address(app: &AppHandle) -> Result<String, LocalError> {
    let mut server = lock(&SERVER);
    if let Some(running) = server.as_mut() {
        if matches!(running.child.try_wait(), Ok(None)) {
            return Ok(running.url.clone());
        }
    }
    let running = start(app)?;
    let url = running.url.clone();
    *server = Some(running);
    Ok(url)
}

/// Stops the server (and with it every model process); the next use starts it again with the current presets.
pub fn stop() {
    if let Some(mut running) = lock(&SERVER).take() {
        end(&mut running.child);
        log::info!("[llama-server] stopped");
    }
}

/// Kills a server process and waits for it to exit.
fn end(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// The downloaded models or their folder changed: the server stops, and its next use starts it with the new presets (the
/// router reads them only at its start, except after downloads of its own).
pub fn models_changed() {
    stop();
}

/// A model of `kind` was downloaded or removed: the server restarts only when it serves that kind, as a restart ends a
/// reply or embedding in flight.
pub fn model_changed(kind: Kind) {
    if serves(kind) {
        stop();
    }
}

/// Takes the engine's flags and every chat model's options; true when the running server started with others (a
/// restart applies them). Off the main thread: it waits for a start in progress and reads the model files.
#[tauri::command]
pub async fn local_server_configure(app: AppHandle, engine: EngineSettings, models: HashMap<String, ModelOptions>) -> Result<bool, LocalError> {
    blocking(move || {
        *lock(&CONFIG) = Config { engine, models };
        Ok(restart_pending(&app))
    })
    .await
}

/// Whether the running server's flags or presets differ from the current ones; false while it isn't running.
#[tauri::command]
pub async fn local_server_restart_pending(app: AppHandle) -> Result<bool, LocalError> {
    blocking(move || Ok(restart_pending(&app))).await
}

fn restart_pending(app: &AppHandle) -> bool {
    let Some(running) = lock(&SERVER).as_ref().map(|running| running.config.clone()) else { return false };
    let args = engine_args(&lock(&CONFIG).engine);
    running != config_of(&args, &presets_of(app))
}

/// The flags and presets a start uses, as one text to compare.
fn config_of(args: &[String], presets: &str) -> String {
    format!("{}\n{presets}", args.join(" "))
}

/// The server's address for the webview, started on first use.
#[tauri::command]
pub async fn local_server_address(app: AppHandle) -> Result<String, LocalError> {
    blocking(move || address(&app)).await
}

/// Applies changed presets or engine settings: stops the server and starts it again.
#[tauri::command]
pub async fn local_server_restart(app: AppHandle) -> Result<String, LocalError> {
    blocking(move || {
        stop();
        address(&app)
    })
    .await
}

/// Unit-length vectors for `texts` from search's embedding model, in order (blocking: never on the main thread).
pub fn embed(app: &AppHandle, texts: &[String], _priority: Priority) -> Result<Vec<Vec<f32>>, LocalError> {
    let model = catalog::search_embedder()?;
    let reply: Value = post(app, "/v1/embeddings", json!({ "model": model.id, "input": texts }))?.json_blocking()?;
    let mut rows: Vec<(usize, Vec<f32>)> = serde_json::from_value::<Vec<Value>>(reply["data"].clone())
        .map_err(engine)?
        .into_iter()
        .map(|row| (row["index"].as_u64().unwrap_or(0) as usize, serde_json::from_value(row["embedding"].clone()).unwrap_or_default()))
        .collect();
    rows.sort_by_key(|(index, _)| *index);
    Ok(rows.into_iter().map(|(_, vector)| unit(vector)).collect())
}

/// One sentence spoken by the voice model `id`: mono samples and their rate (blocking).
pub fn speak(app: &AppHandle, id: &str, text: &str, voice: Option<&str>) -> Result<(Vec<f32>, u32), LocalError> {
    let mut body = json!({ "model": id, "input": text, "response_format": "wav" });
    if let Some(voice) = voice {
        body["voice"] = json!(voice);
    }
    let wav = post(app, "/v1/audio/speech", body)?.bytes_blocking()?;
    crate::tts::voice_model::samples_of(&wav)
}

/// Sends `body` to the server's `path`, starting the server first when needed.
fn post(app: &AppHandle, path: &str, body: Value) -> Result<Reply, LocalError> {
    let url = format!("{}{path}", address(app)?);
    let response = tauri::async_runtime::block_on(reqwest::Client::new().post(url).json(&body).send()).map_err(engine)?;
    Ok(Reply(response))
}

/// A server response, read on the calling thread.
struct Reply(reqwest::Response);

impl Reply {
    fn checked(self) -> Result<reqwest::Response, LocalError> {
        let status = self.0.status();
        if status.is_success() {
            return Ok(self.0);
        }
        let text = tauri::async_runtime::block_on(self.0.text()).unwrap_or_default();
        Err(LocalError::Engine(format!("llama-server {status}: {text}")))
    }

    fn json_blocking(self) -> Result<Value, LocalError> {
        tauri::async_runtime::block_on(self.checked()?.json()).map_err(engine)
    }

    fn bytes_blocking(self) -> Result<Vec<u8>, LocalError> {
        Ok(tauri::async_runtime::block_on(self.checked()?.bytes()).map_err(engine)?.to_vec())
    }
}

/// Writes the presets, starts the router on a free local port, and waits for its ready line; a start that fails leaves
/// no process behind.
fn start(app: &AppHandle) -> Result<Running, LocalError> {
    let home = app.path().app_data_dir().map_err(io)?.join("llama-server");
    let cache = home.join("cache");
    std::fs::create_dir_all(&cache).map_err(io)?;
    end_leftover(&home);
    let presets = home.join("models.ini");
    let written = presets_of(app);
    std::fs::write(&presets, &written).map_err(io)?;
    let args = engine_args(&lock(&CONFIG).engine);
    let port = std::net::TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map_err(io)?.port();
    let mut child = Command::new(helper()?)
        .args(["--host", "127.0.0.1", "--port", &port.to_string(), "--models-preset"])
        .arg(&presets)
        .args(&args)
        // The router lists the models in its download cache too: an empty one of Roci's leaves only the presets.
        .env("LLAMA_CACHE", &cache)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(io)?;
    if let Err(error) = until_ready(&home, &mut child) {
        end(&mut child);
        return Err(error);
    }
    log::info!("[llama-server] started on port {port} (pid {})", child.id());
    Ok(Running { child, url: format!("http://127.0.0.1:{port}"), config: config_of(&args, &written) })
}

/// Records the router's pid (for [`end_leftover`]), follows its log, and waits for its ready line; the error carries the
/// last line it logged.
fn until_ready(home: &Path, child: &mut Child) -> Result<(), LocalError> {
    std::fs::write(home.join("server.pid"), child.id().to_string()).map_err(io)?;
    let last = Arc::new(Mutex::new(String::new()));
    // The router logs on stderr; it forwards its model processes' logs on stdout (llama.cpp's `LOG`).
    let ready = follow_log(child.stderr.take(), Arc::clone(&last));
    let _ = follow_log(child.stdout.take(), Arc::clone(&last));
    match ready.recv_timeout(START_TIMEOUT) {
        Ok(()) => Ok(()),
        Err(_) => Err(LocalError::Engine(format!("The on-device engine didn't start: {}", lock(&last)))),
    }
}

/// The router's flags from the engine settings, on Llama.app's baseline: llama.cpp keeps `memory_margin_mib` free (it
/// unloads the least recently used model, and --fit sizes what is unset, to leave it), sleeps a model idle that long, and
/// caps each model's prompt cache. Drafting is each model's own (its preset): the router lays these flags over every
/// preset, so one here would reach every model.
fn engine_args(engine: &EngineSettings) -> Vec<String> {
    let idle = if engine.idle_minutes == 0 { -1 } else { (engine.idle_minutes * 60) as i64 };
    let margin = engine.memory_margin_mib.to_string();
    [
        ("--models-max", engine.models_max.to_string()),
        ("--models-memory-margin", margin.clone()),
        ("--fit-target", margin),
        ("--sleep-idle-seconds", idle.to_string()),
        ("--cache-ram", engine.cache_ram_mib.to_string()),
    ]
    .into_iter()
    .flat_map(|(flag, value)| [flag.to_string(), value])
    .collect()
}

/// Forwards one of the server's output streams into Roci's log, keeping its last line in `last`, and signals once it
/// reports itself ready.
fn follow_log(stream: Option<impl Read + Send + 'static>, last: Arc<Mutex<String>>) -> mpsc::Receiver<()> {
    let (ready, signal) = mpsc::channel();
    if let Some(stream) = stream {
        std::thread::spawn(move || {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                if line.contains(READY_LINE) {
                    let _ = ready.send(());
                }
                log::log!(level_of(&line), "[llama-server] {line}");
                *lock(&last) = line;
            }
        });
    }
    signal
}

/// A log line's level by llama.cpp's own marker (`common/log.cpp`: an optional `[port]` of a model process, an optional
/// timestamp, then `W` or `E`): its warnings and errors at warn, the rest at debug.
fn level_of(line: &str) -> log::Level {
    let line = line.trim_start();
    let line = line.strip_prefix('[').and_then(|rest| rest.split_once("] ")).map_or(line, |(_, rest)| rest);
    let mut words = line.split(' ');
    let first = words.next().unwrap_or_default();
    let stamped = !first.is_empty() && first.chars().all(|c| c.is_ascii_digit() || c == '.');
    let marker = if stamped { words.next().unwrap_or_default() } else { first };
    if matches!(marker, "W" | "E") { log::Level::Warn } else { log::Level::Debug }
}

/// Ends a router left running by a Roci that didn't quit cleanly (its model processes exit with it).
fn end_leftover(home: &Path) {
    let Ok(pid) = std::fs::read_to_string(home.join("server.pid")) else { return };
    let pid = pid.trim();
    let name = Command::new("ps").args(["-o", "comm=", "-p", pid]).output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    if name.is_ok_and(|n| n.ends_with("llama-server")) {
        let _ = Command::new("kill").arg(pid).status();
        log::info!("[llama-server] ended a leftover server (pid {pid})");
    }
}

/// The bundled llama-server, beside Roci's executable (Tauri places it there in development and in the app).
fn helper() -> Result<PathBuf, LocalError> {
    Ok(std::env::current_exe().map_err(io)?.with_file_name("llama-server"))
}

/// One preset section per downloaded chat, search and voice model, named by its catalog id; keys are llama-server's
/// options without their dashes.
fn presets_of(app: &AppHandle) -> String {
    let mut ini = String::from("; Written by Roci at each start; changes here are replaced.\n");
    let config = lock(&CONFIG);
    for model in catalog::MODELS.iter().filter(|m| serves(m.kind) && store::is_installed(app, m)) {
        let Ok(path) = store::installed_path(app, model, model.main_file()) else { continue };
        let tuned = config.models.get(model.id).filter(|_| model.kind == Kind::Chat);
        ini.push_str(&section(model.id, &path, options_of(app, model, tuned), tuned));
    }
    ini
}

/// A model's preset section: its weights and Roci's options for it, then its tuned options (allowed keys only).
fn section(id: &str, path: &Path, options: Vec<(&'static str, String)>, tuned: Option<&ModelOptions>) -> String {
    let mut text = format!("\n[{id}]\nmodel = {}\n", path.display());
    let tuned = tuned.into_iter().flatten().filter(|(key, _)| TUNABLE.contains(&key.as_str()));
    let mut tuned: Vec<(&str, String)> = tuned.filter_map(|(key, value)| Some((key.as_str(), ini_value(value)?))).collect();
    tuned.sort();
    for (key, value) in options.iter().map(|(k, v)| (*k, v.clone())).chain(tuned) {
        let _ = writeln!(text, "{key} = {value}");
    }
    text
}

/// An option's value as the preset writes it: a number, or a word of llama's (`q8_0`, `none`); anything else is dropped.
fn ini_value(value: &Value) -> Option<String> {
    match value {
        Value::Number(number) => Some(number.to_string()),
        Value::String(word) if !word.is_empty() && word.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') => Some(word.clone()),
        _ => None,
    }
}

/// The models the server runs on the Mac; speech-to-text stays on transcribe.cpp.
fn serves(kind: Kind) -> bool {
    matches!(kind, Kind::Chat | Kind::Embedding | Kind::Voice)
}

/// A model's options beyond its weights, by its kind: a chat model's drafting (no image projector: on-device chat on the
/// Mac takes no images), a voice's projector (its audio decoder), the search model's embedding settings.
fn options_of(app: &AppHandle, model: &LocalModel, tuned: Option<&ModelOptions>) -> Vec<(&'static str, String)> {
    let file = |name: &dyn Fn(&str) -> bool| {
        model.files.iter().find(|f| name(f.name)).and_then(|f| store::installed_path(app, model, f).ok()).map(|p| p.display().to_string())
    };
    match model.kind {
        Kind::Chat => drafting(&file, tuned),
        Kind::Voice => {
            let projector = file(&|n| n.contains("mmproj")).map(|path| ("mmproj", path));
            projector.into_iter().chain([("ctx-size", "4096".to_string())]).collect()
        }
        Kind::Embedding => vec![("embeddings", "true".to_string()), ("ctx-size", "4096".into()), ("batch-size", "4096".into()), ("ubatch-size", "4096".into())],
        Kind::Speech => Vec::new(),
    }
}

/// The path of a model's file whose name passes the test, once downloaded.
type FileOf<'a> = dyn Fn(&dyn Fn(&str) -> bool) -> Option<String> + 'a;

/// A chat model's drafting: none when its tuning turns it off (llama.cpp's default is no drafting), else its own draft,
/// else llama.cpp's default n-gram drafting (`spec-default`, a flag a preset sets with `true`).
fn drafting(file: &FileOf, tuned: Option<&ModelOptions>) -> Vec<(&'static str, String)> {
    if tuned.and_then(|t| t.get("spec-type")).is_some_and(|t| t == "none") {
        return Vec::new();
    }
    let own = draft_options(file);
    if own.is_empty() { vec![("spec-default", "true".to_string())] } else { own }
}

/// A model's own speculative-decoding draft (an MTP head or a DFlash model) as preset options, at Llama.app's lengths.
fn draft_options(file: &FileOf) -> Vec<(&'static str, String)> {
    if let Some(draft) = file(&|n| n.starts_with("mtp-")) {
        return vec![("spec-type", "draft-mtp".to_string()), ("spec-draft-model", draft), ("spec-draft-n-max", "3".into())];
    }
    file(&|n| n.contains("DFlash"))
        .map(|draft| vec![("spec-type", "draft-dflash".to_string()), ("spec-draft-model", draft), ("spec-draft-n-max", "7".into())])
        .unwrap_or_default()
}

fn unit(vector: Vec<f32>) -> Vec<f32> {
    let norm = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm == 0.0 {
        vector
    } else {
        vector.into_iter().map(|x| x / norm).collect()
    }
}

fn engine(error: impl ToString) -> LocalError {
    LocalError::Engine(error.to_string())
}

fn io(error: impl ToString) -> LocalError {
    LocalError::Io(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIR: &str = "/models/gemma-4-e2b";

    /// Gemma 4 E2B's files, as `options_of` finds them once downloaded.
    fn gemma_file(name: &dyn Fn(&str) -> bool) -> Option<String> {
        ["gemma-4-E2B-it-Q4_0.gguf", "mmproj-gemma-4-E2B-it-Q8_0.gguf", "mtp-gemma-4-E2B-it-Q4_0.gguf"]
            .iter()
            .find(|f| name(f))
            .map(|f| format!("{DIR}/{f}"))
    }

    fn tuned(value: Value) -> ModelOptions {
        serde_json::from_value(value).unwrap()
    }

    /// Gemma 4 E2B's section as a fresh start writes it: its weights, its draft, then its tuned options (Model Tuning's
    /// merge of the maker's values, Roci's and the user's), with anything outside the allow-list dropped.
    #[test]
    fn a_chat_model_section_carries_its_tuning() {
        let tuned = tuned(json!({
            "temp": 1.0, "top-p": 0.95, "top-k": 64, "min-p": 0.0, "presence-penalty": 0.0, "repeat-penalty": 1.0,
            "n-predict": 8192, "reasoning-budget": 1024, "ctx-size": 16384, "cache-type-k": "q8_0", "cache-type-v": "q8_0",
            "model": "/elsewhere.gguf", "temperature": 2, "top-k-bad": "a\nmodel = x", "spec-type": "draft-simple",
        }));
        let options = drafting(&gemma_file, Some(&tuned));
        let text = section("gemma-4-e2b", Path::new(&format!("{DIR}/gemma-4-E2B-it-Q4_0.gguf")), options, Some(&tuned));
        println!("{text}");
        assert!(text.contains("spec-type = draft-mtp\n") && text.contains("ctx-size = 16384\n") && text.contains("cache-type-k = q8_0\n"));
        assert!(!text.contains("elsewhere") && !text.contains("temperature") && !text.contains("bad") && !text.contains("draft-simple"));
    }

    /// A chat model drafts with its own draft, else with llama.cpp's default n-gram drafting; never when tuned off.
    #[test]
    fn drafting_is_the_models_own_and_can_be_turned_off() {
        let own = drafting(&gemma_file, None);
        assert_eq!(own[0], ("spec-type", "draft-mtp".to_string()));
        assert!(!own.iter().any(|(key, _)| *key == "spec-default"));
        assert_eq!(drafting(&|_: &dyn Fn(&str) -> bool| None, None), vec![("spec-default", "true".to_string())]);
        let off = tuned(json!({ "spec-type": "none" }));
        assert!(drafting(&gemma_file, Some(&off)).is_empty());
        assert!(drafting(&|_: &dyn Fn(&str) -> bool| None, Some(&off)).is_empty());
        assert_eq!(section("m", Path::new("/m.gguf"), Vec::new(), Some(&off)), "\n[m]\nmodel = /m.gguf\n");
    }

    #[test]
    fn engine_flags_follow_llama_apps_baseline() {
        let args = engine_args(&EngineSettings::default()).join(" ");
        println!("{args}");
        assert_eq!(args, "--models-max 0 --models-memory-margin 1024 --fit-target 1024 --sleep-idle-seconds 300 --cache-ram 1024");
    }

    /// Lines as llama.cpp's log writes them: the router's own, and a model process's forwarded with its port.
    #[test]
    fn warnings_and_errors_go_to_roci_s_log_by_llama_s_marker() {
        assert_eq!(level_of("0.00.012.345 W srv  load_models: ignoring option"), log::Level::Warn);
        assert_eq!(level_of("[ 8081] 0.01.002.003 E failed to load model"), log::Level::Warn);
        assert_eq!(level_of("E no timestamp"), log::Level::Warn);
        assert_eq!(level_of("0.00.012.345 I srv  listening on http://127.0.0.1:1234"), log::Level::Debug);
        assert_eq!(level_of("[ 8081] Error words without a marker"), log::Level::Debug);
        assert_eq!(level_of(""), log::Level::Debug);
    }
}
