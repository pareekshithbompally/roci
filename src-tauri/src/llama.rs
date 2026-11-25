//! On-device chat, meeting-search embeddings and read aloud on llama.cpp (engines/llama-sys, on transcribe.cpp's ggml).
//! One registry holds what is loaded (one model per role). A model loads only after a check that its counted memory fits,
//! evicting the least recently used other model first; it unloads when idle, on delete, on memory pressure, and on quit.
//! Every call runs in a GPU turn, and the shim checks in after each token, batch or frame so more urgent work can step in.
//! Locks are taken in one order: the role's job queue, then the GPU turn, then the registry only to pick or load a model;
//! a running model is shared, so freeing it from the registry closes it when its job ends, never under it.

use std::cell::Cell;
use std::collections::HashMap;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use std::time::Instant;

use roci_llama_sys as sys;
use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager};

use crate::models::catalog::{self, Kind};
use crate::models::gpu::{self, Priority};
use crate::models::{blocking, store, LocalError};
use crate::engine_readings::{log_memory, reading, take, to_c_path};
use crate::sync::lock;

/// Rust → webview: a model started or ended loading (`{ role, model, name, state }`, state loading | loaded | failed).
const MODEL_EVENT: &str = "local://model";
/// Tokens a chat keeps in mind unless the request asks for another size.
const CHAT_CONTEXT: c_int = 8192;
/// Tokens an embedding reads at most per text.
const EMBED_CONTEXT: c_int = 8192;
/// Memory left free beyond a model's own cost when deciding whether it fits.
const HEADROOM: u64 = 256 << 20;

/// Where load reports go: set once at startup.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// A model kind's slot in the registry.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
enum Role {
    Chat,
    Embedding,
    Voice,
}

impl Role {
    fn of(kind: Kind) -> Option<Self> {
        match kind {
            Kind::Chat => Some(Role::Chat),
            Kind::Embedding => Some(Role::Embedding),
            Kind::Voice => Some(Role::Voice),
            _ => None,
        }
    }

    /// One job at a time per role: a second (a search query behind indexing) waits here, outside the GPU queue.
    fn jobs(self) -> &'static Mutex<()> {
        static JOBS: [Mutex<()>; 3] = [Mutex::new(()), Mutex::new(()), Mutex::new(())];
        &JOBS[self as usize]
    }

    fn name(self) -> &'static str {
        match self {
            Role::Chat => "chat",
            Role::Embedding => "embedding",
            Role::Voice => "voice",
        }
    }

    /// What loading a model of this role adds to the footprint before it is measured (weights are mapped, so this is
    /// its context and buffers): Gemma 4 E4B with 8k tokens added ~380 MB, Soprano ~150 MB, Qwen3 Embedding less.
    fn first_guess(self) -> u64 {
        match self {
            Role::Chat => 512 << 20,
            Role::Embedding => 256 << 20,
            Role::Voice => 256 << 20,
        }
    }
}

/// A loaded model's handle in the shim.
#[derive(Clone, Copy)]
enum Handle {
    Chat(*mut sys::RociLlamaChat),
    Embedding(*mut sys::RociLlamaEmbedder),
    Voice(*mut sys::RociLlamaVoice),
}

/// One loaded model: which file, at what context size, when it was last used.
struct Slot {
    model: String,
    path: PathBuf,
    context: c_int,
    engine: Arc<Engine>,
    used: Instant,
}

/// A model open in the shim, closed when the registry and every running job have let go of it.
struct Engine(Handle);

// SAFETY: a handle is used by one job at a time (its role's queue, inside a GPU turn); the shim's calls aren't tied to a thread.
unsafe impl Send for Engine {}
unsafe impl Sync for Engine {}

impl Drop for Engine {
    fn drop(&mut self) {
        // SAFETY: each handle came from its open call and is closed once, here.
        unsafe {
            match self.0 {
                Handle::Chat(h) => sys::roci_llama_chat_close(h),
                Handle::Embedding(h) => sys::roci_llama_embed_close(h),
                Handle::Voice(h) => sys::roci_llama_voice_close(h),
            }
        }
    }
}

/// What is loaded, one slot per role.
static LOADED: LazyLock<Mutex<HashMap<Role, Slot>>> = LazyLock::new(Mutex::default);
/// Each model's measured cost (footprint added by loading it), learned on its first load.
static COSTS: LazyLock<Mutex<HashMap<String, u64>>> = LazyLock::new(Mutex::default);

/// Bumped by every use of a role, so an idle deadline only unloads if nothing used it since.
#[derive(Default)]
pub struct LlamaState {
    uses: [AtomicU64; 3],
}

impl LlamaState {
    fn uses(&self, role: Role) -> &AtomicU64 {
        &self.uses[role as usize]
    }
}

thread_local! {
    /// The priority of the GPU turn running on this thread, for the shim's checkpoints.
    static TURN: Cell<Priority> = const { Cell::new(Priority::Interactive) };
}

/// Connects the shim's hooks once at setup: checkpoints to the GPU queue, memory pressure to unloading.
pub fn connect(app: &AppHandle) {
    if APP.set(app.clone()).is_ok() {
        // SAFETY: plain `extern "C"` functions that live for the whole program.
        unsafe {
            sys::roci_llama_set_checkpoint(checkpoint);
            sys::roci_llama_watch_pressure(on_pressure);
        }
    }
}

/// The shim's checkpoint (after each token, batch or frame): more urgent waiting work runs now.
extern "C" fn checkpoint() {
    gpu::step_aside(TURN.with(Cell::get));
}

/// The system reports memory pressure: every loaded model is freed in a GPU turn of its own (so none mid-job).
extern "C" fn on_pressure(level: c_int) {
    std::thread::spawn(move || {
        let freed = gpu::run(Priority::Interactive, || std::mem::take(&mut *lock(&LOADED)).len());
        log_memory(&format!("memory pressure (level {level}): freed {freed} model(s)"));
    });
}

/// Runs `work` in a GPU turn at `priority`, the shim's checkpoints stepping aside at that priority.
fn in_turn<T>(priority: Priority, work: impl FnOnce() -> T) -> T {
    gpu::run(priority, || {
        TURN.with(|turn| turn.set(priority));
        work()
    })
}

/// Runs `work` on `role`'s model (picked or loaded by `open` under the registry's lock, which is let go before `work`): one job
/// per role, in a GPU turn at `priority`.
fn run_model<T>(
    role: Role,
    priority: Priority,
    open: impl FnOnce(&mut HashMap<Role, Slot>) -> Result<Arc<Engine>, LocalError>,
    work: impl FnOnce(Handle) -> Result<T, LocalError>,
) -> Result<T, LocalError> {
    let _queue = lock(role.jobs());
    in_turn(priority, || {
        let engine = open(&mut lock(&LOADED))?;
        work(engine.0)
    })
}

/// Streams a chat reply from the downloaded chat `model` (the webview's request shape); each event (text, tool call)
/// arrives on `on_event`; resolves with token usage once the reply ends or `local_cancel` stops it.
#[tauri::command]
pub async fn local_chat(app: AppHandle, model: String, request: Value, on_event: Channel<Value>) -> Result<Value, LocalError> {
    let path = model_file(&app, &model, Kind::Chat)?;
    let context = request["contextTokens"].as_i64().map_or(CHAT_CONTEXT, |n| n as c_int);
    let body = to_c(&chat_body(&request)?)?;
    let result = blocking(move || {
        let open_chat = |loaded: &mut HashMap<Role, Slot>| open(loaded, Role::Chat, &model, &path, context);
        run_model(Role::Chat, Priority::Interactive, open_chat, |handle| {
            let Handle::Chat(chat) = handle else { unreachable!() };
            let context = &on_event as *const Channel<Value> as *mut c_void;
            // SAFETY: the shim calls `forward` with `context` only during this call, while `on_event` is alive.
            take(unsafe { sys::roci_llama_chat_reply(chat, body.as_ptr(), forward, context) })
        })
    })
    .await;
    log_memory("chat reply");
    rearm_idle(&app, Role::Chat);
    result.map(|mut reply| {
        reply.as_object_mut().map(|o| o.remove("ok"));
        reply
    })
}

/// Stops a chat reply started by `local_chat`, running or still waiting for its turn.
#[tauri::command]
pub fn local_cancel(stream_id: u64) {
    // SAFETY: a plain value; an id that never runs is ignored.
    unsafe { sys::roci_llama_cancel(stream_id) }
}

/// Unit-length vectors for `texts` from search's embedding model, in order, in a GPU turn at `priority` (a query someone
/// waits for is Interactive, indexing Background); blocking, so never on the main thread. `NotDownloaded` until it is.
pub fn embed(app: &AppHandle, texts: &[String], priority: Priority) -> Result<Vec<Vec<f32>>, LocalError> {
    let model = catalog::search_embedder()?;
    let path = main_file(app, model)?;
    let count = texts.len();
    let texts = to_c(&json!(texts))?;
    let open_embedder = |loaded: &mut HashMap<Role, Slot>| open(loaded, Role::Embedding, model.id, &path, EMBED_CONTEXT);
    let reply = run_model(Role::Embedding, priority, open_embedder, |handle| {
        let Handle::Embedding(embedder) = handle else { unreachable!() };
        // SAFETY: `texts` outlives the call; the returned string is ours to free.
        take(unsafe { sys::roci_llama_embed(embedder, texts.as_ptr()) })
    });
    log_memory(&format!("embedded {count}"));
    rearm_idle(app, Role::Embedding);
    serde_json::from_value(reply?["vectors"].take()).map_err(|e| LocalError::Engine(e.to_string()))
}

/// One sentence spoken by the voice model `id` (its model file and audio projector): mono samples and their rate (runs on the
/// caller's thread).
pub fn speak(id: &str, path: &Path, projector: &Path, text: &str, voice: Option<&str>) -> Result<(Vec<f32>, u32), LocalError> {
    let text = CString::new(text).map_err(|e| LocalError::BadInput(e.to_string()))?;
    let voice = voice.map(CString::new).transpose().map_err(|e| LocalError::BadInput(e.to_string()))?;
    let open_speaker = |loaded: &mut HashMap<Role, Slot>| open_voice(loaded, id, path, projector);
    let wav = run_model(Role::Voice, Priority::Interactive, open_speaker, |handle| {
        let Handle::Voice(handle) = handle else { unreachable!() };
        speak_wav(handle, &text, voice.as_deref())
    })?;
    log_memory("spoke");
    crate::tts::voice_model::samples_of(&wav)
}

/// Frees the model of `kind` now (its files are about to be deleted).
pub fn unload(kind: Kind) {
    if let Some(role) = Role::of(kind) {
        free(role);
    }
}

/// Marks `kind`'s model as just used, so it stays loaded until it idles.
pub fn touch(app: &AppHandle, kind: Kind) {
    if let Some(role) = Role::of(kind) {
        rearm_idle(app, role);
    }
}

/// The slot of `role` holding `path` at `context` tokens, loading it (after making room) when it isn't already.
fn open(loaded: &mut HashMap<Role, Slot>, role: Role, model: &str, path: &Path, context: c_int) -> Result<Arc<Engine>, LocalError> {
    let fresh = loaded.get(&role).is_some_and(|s| s.path == path && s.context == context);
    if !fresh {
        loaded.remove(&role);
        make_room(loaded, role, model)?;
        let handle = load(role, model, || open_handle(role, path, context))?;
        loaded.insert(role, Slot { model: model.to_string(), path: path.to_path_buf(), context, engine: Arc::new(Engine(handle)), used: Instant::now() });
    }
    let slot = loaded.get_mut(&role).ok_or(LocalError::NotDownloaded)?;
    slot.used = Instant::now();
    Ok(Arc::clone(&slot.engine))
}

/// The voice slot for `path`, loading it with its projector when it isn't already.
fn open_voice(loaded: &mut HashMap<Role, Slot>, model: &str, path: &Path, projector: &Path) -> Result<Arc<Engine>, LocalError> {
    if loaded.get(&Role::Voice).is_none_or(|s| s.path != path) {
        loaded.remove(&Role::Voice);
        make_room(loaded, Role::Voice, model)?;
        let handle = load(Role::Voice, model, || open_voice_handle(path, projector))?;
        loaded.insert(Role::Voice, Slot { model: model.to_string(), path: path.to_path_buf(), context: 0, engine: Arc::new(Engine(handle)), used: Instant::now() });
    }
    let slot = loaded.get_mut(&Role::Voice).ok_or(LocalError::NotDownloaded)?;
    slot.used = Instant::now();
    Ok(Arc::clone(&slot.engine))
}

/// Frees the least recently used other models until `model` fits in the memory the app may still use; refuses when even
/// then it doesn't. Unknown available memory (0) lets the load go ahead.
fn make_room(loaded: &mut HashMap<Role, Slot>, role: Role, model: &str) -> Result<(), LocalError> {
    let need = lock(&COSTS).get(model).copied().unwrap_or_else(|| role.first_guess()) + HEADROOM;
    loop {
        let available = reading("available");
        if available == 0 || available >= need {
            return Ok(());
        }
        let Some(oldest) = loaded.iter().filter(|(r, _)| **r != role).min_by_key(|(_, s)| s.used).map(|(r, _)| *r) else {
            log_memory(&format!("refused {model}: needs {} MB", need >> 20));
            return Err(LocalError::Engine("There isn't enough free memory to load this model right now.".into()));
        };
        let evicted = loaded.remove(&oldest).map(|s| s.model.clone()).unwrap_or_default();
        log_memory(&format!("evicted {evicted} to make room for {model}"));
    }
}

/// Loads with `open`, reporting the start and its outcome, and learns the model's cost from the footprint it added.
fn load(role: Role, model: &str, open: impl FnOnce() -> Result<Handle, LocalError>) -> Result<Handle, LocalError> {
    report(role, model, "loading");
    let before = reading("footprint");
    let opened = open();
    report(role, model, if opened.is_ok() { "loaded" } else { "failed" });
    if opened.is_ok() {
        let cost = reading("footprint").saturating_sub(before);
        lock(&COSTS).insert(model.to_string(), cost.max(role.first_guess() / 4));
        log_memory(&format!("loaded {model} (+{} MB)", cost >> 20));
    }
    opened
}

fn open_handle(role: Role, path: &Path, context: c_int) -> Result<Handle, LocalError> {
    let path = to_c_path(path)?;
    let mut error = std::ptr::null_mut();
    // SAFETY: valid C strings; a null handle comes with an error string we free.
    let handle = unsafe {
        match role {
            Role::Embedding => Handle::Embedding(sys::roci_llama_embed_open(path.as_ptr(), context, &mut error)),
            _ => Handle::Chat(sys::roci_llama_chat_open(path.as_ptr(), context, &mut error)),
        }
    };
    let null = match handle {
        Handle::Chat(h) => h.is_null(),
        Handle::Embedding(h) => h.is_null(),
        Handle::Voice(h) => h.is_null(),
    };
    if null {
        return Err(LocalError::Engine(take_error(error)));
    }
    Ok(handle)
}

fn open_voice_handle(path: &Path, projector: &Path) -> Result<Handle, LocalError> {
    let (path, projector) = (to_c_path(path)?, to_c_path(projector)?);
    let mut error = std::ptr::null_mut();
    // SAFETY: valid C strings; a null handle comes with an error string we free.
    let voice = unsafe { sys::roci_llama_voice_open(path.as_ptr(), projector.as_ptr(), &mut error) };
    if voice.is_null() {
        return Err(LocalError::Engine(take_error(error)));
    }
    Ok(Handle::Voice(voice))
}

fn speak_wav(voice: *mut sys::RociLlamaVoice, text: &CStr, name: Option<&CStr>) -> Result<Vec<u8>, LocalError> {
    let (mut wav, mut len, mut error) = (std::ptr::null_mut(), 0usize, std::ptr::null_mut());
    let name = name.map_or(std::ptr::null(), CStr::as_ptr);
    // SAFETY: valid pointers for the call; the WAV bytes are copied, then freed by the shim.
    let status = unsafe { sys::roci_llama_speak(voice, text.as_ptr(), name, std::ptr::null(), &mut wav, &mut len, &mut error) };
    if status != 0 {
        return Err(LocalError::Engine(take_error(error)));
    }
    let bytes = unsafe { std::slice::from_raw_parts(wav, len) }.to_vec();
    unsafe { sys::roci_llama_free_bytes(wav) };
    Ok(bytes)
}


/// Frees `role`'s model in a GPU turn of its own, so never while a reply, embedding or voice is using it.
fn free(role: Role) {
    let freed = in_turn(Priority::Interactive, || lock(&LOADED).remove(&role).map(|s| s.model.clone()));
    if let Some(model) = freed {
        log_memory(&format!("unloaded {model}"));
    }
}

/// Arms the role's idle deadline (Settings' idle time): unloads then unless used again first; none when kept until quit.
fn rearm_idle(app: &AppHandle, role: Role) {
    let generation = app.state::<LlamaState>().uses(role).fetch_add(1, Ordering::SeqCst) + 1;
    let Some(idle) = crate::models::idle_after() else { return };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(idle).await;
        if app.state::<LlamaState>().uses(role).load(Ordering::SeqCst) == generation {
            let _ = blocking(move || {
                free(role);
                Ok(())
            })
            .await;
        }
    });
}

/// Reports a load's progress to the webview (the folder name is the catalog id).
fn report(role: Role, model: &str, state: &str) {
    let (Some(app), Ok(entry)) = (APP.get(), catalog::find(model)) else { return };
    let event = json!({ "role": role.name(), "model": entry.id, "name": entry.name, "state": state });
    if let Err(error) = app.emit(MODEL_EVENT, event) {
        log::warn!("[llama] load report not delivered: {error}");
    }
}

/// The webview's chat request as the shim takes it (OpenAI-style messages and tools, the schema as JSON, sampling).
fn chat_body(request: &Value) -> Result<Value, LocalError> {
    let messages = request["messages"].as_array().map(Vec::as_slice).unwrap_or_default();
    if messages.iter().any(|m| m["images"].as_array().is_some_and(|i| !i.is_empty())) {
        return Err(LocalError::BadInput("This on-device model can't see images yet.".into()));
    }
    let mut body = json!({
        "stream_id": request["streamId"],
        "messages": messages.iter().map(openai_message).collect::<Vec<_>>(),
    });
    let fields = [
        ("tools", "tools"), ("maxTokens", "max_tokens"), ("temperature", "temperature"), ("topP", "top_p"), ("topK", "top_k"),
        ("minP", "min_p"), ("repetitionPenalty", "repetition_penalty"), ("presencePenalty", "presence_penalty"),
        ("frequencyPenalty", "frequency_penalty"), ("penaltyContext", "penalty_last_n"),
    ];
    for (from, to) in fields {
        if !request[from].is_null() {
            body[to] = request[from].clone();
        }
    }
    if let Some(schema) = request["schema"].as_str() {
        body["json_schema"] = serde_json::from_str(schema).map_err(|e| LocalError::BadInput(e.to_string()))?;
    }
    Ok(body)
}

/// One flattened turn as an OpenAI-style message.
fn openai_message(m: &Value) -> Value {
    let mut message = json!({ "role": m["role"], "content": m["content"] });
    if let Some(calls) = m["toolCalls"].as_array().filter(|c| !c.is_empty()) {
        message["tool_calls"] = calls
            .iter()
            .map(|c| {
                let arguments = c["function"]["arguments"].as_str().map_or_else(|| c["function"]["arguments"].to_string(), str::to_string);
                json!({ "id": c["id"], "type": "function", "function": { "name": c["function"]["name"], "arguments": arguments } })
            })
            .collect();
    }
    if !m["toolCallId"].is_null() {
        message["tool_call_id"] = m["toolCallId"].clone();
        message["name"] = m["toolName"].clone();
    }
    message
}

/// The file a model's engine loads: the catalog's first file, once the model is downloaded.
fn main_file(app: &AppHandle, model: &catalog::LocalModel) -> Result<PathBuf, LocalError> {
    store::installed_path(app, model, model.main_file())
}

fn model_file(app: &AppHandle, id: &str, kind: Kind) -> Result<PathBuf, LocalError> {
    main_file(app, catalog::find_kind(id, kind)?)
}

/// Sends one shim event to the webview channel passed as `context`.
extern "C" fn forward(context: *mut c_void, event: *const c_char) {
    // SAFETY: `context` is the `Channel` `local_chat` passed, alive for the whole call; `event` is valid for this call.
    let (channel, event) = unsafe { (&*(context as *const Channel<Value>), CStr::from_ptr(event)) };
    if let Ok(value) = serde_json::from_slice::<Value>(event.to_bytes()) {
        let _ = channel.send(value);
    }
}

fn to_c(value: &Value) -> Result<CString, LocalError> {
    CString::new(value.to_string()).map_err(|e| LocalError::BadInput(e.to_string()))
}

/// An error string the shim allocated, read and freed.
fn take_error(error: *mut c_char) -> String {
    if error.is_null() {
        return "llama.cpp failed".into();
    }
    // SAFETY: the shim allocated it; freed once, here.
    let text = unsafe { CStr::from_ptr(error) }.to_string_lossy().into_owned();
    unsafe { sys::roci_llama_free_string(error) };
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;


    /// The live-notes request through the llama shim's chat loop, five times: valid JSON each time, and a GPU-queue
    /// checkpoint per token. `ROCI_LLAMA_GGUF` is a chat model file, `ROCI_LIVE_NOTES_REQUEST` the request (`system`,
    /// `user`, `schema` as text).
    #[test]
    #[ignore = "needs a downloaded model"]
    fn live_notes_request_through_llama() {
        use std::ffi::{c_char, c_void, CStr, CString};
        use std::sync::atomic::AtomicUsize;
        static CHECKPOINTS: AtomicUsize = AtomicUsize::new(0);
        extern "C" fn count() {
            CHECKPOINTS.fetch_add(1, Ordering::Relaxed);
        }
        extern "C" fn collect(user: *mut c_void, event: *const c_char) {
            // SAFETY: `user` is the test's Mutex<String>; `event` is valid for this call.
            let (text, event) = unsafe { (&*(user as *const Mutex<String>), CStr::from_ptr(event)) };
            let event: serde_json::Value = serde_json::from_slice(event.to_bytes()).unwrap();
            if let Some(piece) = event["text"].as_str() {
                text.lock().unwrap().push_str(piece);
            }
        }
        let path = CString::new(std::env::var("ROCI_LLAMA_GGUF").unwrap()).unwrap();
        let req: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(std::env::var("ROCI_LIVE_NOTES_REQUEST").unwrap()).unwrap()).unwrap();
        let schema: serde_json::Value = serde_json::from_str(req["schema"].as_str().unwrap()).unwrap();
        let mut error = std::ptr::null_mut();
        // SAFETY: valid C strings; the handle is closed below.
        let chat = unsafe { sys::roci_llama_chat_open(path.as_ptr(), 8192, &mut error) };
        assert!(!chat.is_null(), "open failed");
        unsafe { sys::roci_llama_set_checkpoint(count) };
        let mut valid = 0;
        for run in 1..=5u64 {
            let body = serde_json::json!({
                "stream_id": run, "max_tokens": 1500, "json_schema": schema,
                "messages": [{"role": "system", "content": req["system"]}, {"role": "user", "content": req["user"]}],
            });
            let body = CString::new(body.to_string()).unwrap();
            let text = Mutex::new(String::new());
            CHECKPOINTS.store(0, Ordering::Relaxed);
            let started = std::time::Instant::now();
            // SAFETY: `text` outlives the call; the result string is freed below.
            let result = unsafe { sys::roci_llama_chat_reply(chat, body.as_ptr(), collect, &text as *const _ as *mut c_void) };
            let summary = unsafe { CStr::from_ptr(result) }.to_string_lossy().into_owned();
            unsafe { sys::roci_llama_free_string(result) };
            let text = text.into_inner().unwrap();
            let parsed: Option<serde_json::Value> = serde_json::from_str(&text).ok();
            let shape = parsed.as_ref().map_or("NOT JSON".to_string(), |p| {
                format!("VALID points={} filled={}", p["points"].as_array().map_or(0, Vec::len), p["filled"].as_array().map_or(0, Vec::len))
            });
            valid += usize::from(parsed.is_some());
            println!("RUN {run}: {:.1}s | {summary} | checkpoints {} | {shape}", started.elapsed().as_secs_f32(), CHECKPOINTS.load(Ordering::Relaxed));
            if run == 1 {
                println!("SAMPLE: {}", text.chars().take(300).collect::<String>().replace('\n', " "));
            }
        }
        unsafe { sys::roci_llama_chat_close(chat) };
        assert_eq!(valid, 5);
    }


    /// Qwen3 Embedding through the llama shim against Qwen's published scores (as the MLX build was checked):
    /// `ROCI_EMBED_GGUF` is the model file.
    #[test]
    #[ignore = "needs a downloaded model"]
    fn embeddings_match_qwens_reference_scores() {
        use std::ffi::{CStr, CString};
        let path = CString::new(std::env::var("ROCI_EMBED_GGUF").unwrap()).unwrap();
        let mut error = std::ptr::null_mut();
        // SAFETY: valid C strings; the handle is closed below.
        let embedder = unsafe { sys::roci_llama_embed_open(path.as_ptr(), 8192, &mut error) };
        assert!(!embedder.is_null(), "open failed");
        let query = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:";
        let texts = serde_json::json!([format!("{query}What is the capital of China?"), format!("{query}Explain gravity"),
            "The capital of China is Beijing.",
            "Gravity is a force that attracts two bodies towards each other. It gives weight to physical objects and is responsible for the movement of planets around the sun."]);
        let texts = CString::new(texts.to_string()).unwrap();
        let started = std::time::Instant::now();
        // SAFETY: valid C string; the result is freed below.
        let reply = unsafe { sys::roci_llama_embed(embedder, texts.as_ptr()) };
        let value: serde_json::Value = serde_json::from_slice(unsafe { CStr::from_ptr(reply) }.to_bytes()).unwrap();
        unsafe { sys::roci_llama_free_string(reply) };
        unsafe { sys::roci_llama_embed_close(embedder) };
        let v: Vec<Vec<f32>> = serde_json::from_value(value["vectors"].clone()).expect("vectors");
        let dot = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        let scores = [dot(&v[0], &v[2]), dot(&v[0], &v[3]), dot(&v[1], &v[2]), dot(&v[1], &v[3])];
        println!("EMBED: dim {} · 4 texts in {:.2}s · scores {scores:?} vs Qwen 0.7646 0.1414 0.1355 0.6000", v[0].len(), started.elapsed().as_secs_f32());
        for (got, want) in scores.iter().zip([0.7646, 0.1414, 0.1355, 0.6000]) {
            assert!((got - want).abs() < 0.01, "similarity {got} vs {want}");
        }
    }


    /// One sentence through the llama shim's speech path: `ROCI_VOICE_GGUF` and `ROCI_VOICE_PROJECTOR` are a speech model
    /// and its projector, `ROCI_VOICE_WAV` where to save the audio.
    #[test]
    #[ignore = "needs a downloaded model"]
    fn a_sentence_is_spoken_through_llama() {
        use std::ffi::{CStr, CString};
        let path = CString::new(std::env::var("ROCI_VOICE_GGUF").unwrap()).unwrap();
        let projector = CString::new(std::env::var("ROCI_VOICE_PROJECTOR").unwrap()).unwrap();
        let mut error = std::ptr::null_mut();
        // SAFETY: valid C strings; the handle is closed below.
        let voice = unsafe { sys::roci_llama_voice_open(path.as_ptr(), projector.as_ptr(), &mut error) };
        assert!(!voice.is_null(), "open failed: {}", unsafe { CStr::from_ptr(error) }.to_string_lossy());
        let text = CString::new("The quarterly review is on Friday morning, and Priya will send the notes by Thursday.").unwrap();
        let (mut wav, mut len) = (std::ptr::null_mut(), 0usize);
        let started = std::time::Instant::now();
        // SAFETY: valid pointers; the bytes are freed below.
        let status = unsafe { sys::roci_llama_speak(voice, text.as_ptr(), std::ptr::null(), std::ptr::null(), &mut wav, &mut len, &mut error) };
        assert_eq!(status, 0, "speak failed: {}", unsafe { CStr::from_ptr(error) }.to_string_lossy());
        let bytes = unsafe { std::slice::from_raw_parts(wav, len) }.to_vec();
        unsafe { sys::roci_llama_free_bytes(wav) };
        unsafe { sys::roci_llama_voice_close(voice) };
        std::fs::write(std::env::var("ROCI_VOICE_WAV").unwrap(), &bytes).unwrap();
        let reader = hound::WavReader::new(Cursor::new(&bytes)).unwrap();
        let spec = reader.spec();
        let seconds = reader.duration() as f32 / spec.sample_rate as f32;
        println!("VOICE: {seconds:.1}s of audio at {} Hz in {:.2}s", spec.sample_rate, started.elapsed().as_secs_f32());
        assert!(seconds > 2.0);
    }
}
