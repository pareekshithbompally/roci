//! On-device chat and meeting-search embeddings on MLX (RociMLX.framework, Swift over C). A role's model loads on first
//! use and is freed after it idles (one deadline per role, re-armed by every use), on delete and on quit.

use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager};

use crate::models::catalog::{self, Kind};
use crate::models::{blocking, store, LocalError};

type EventFn = extern "C" fn(*mut c_void, *const c_char);

// macOS links the framework here; the iOS app links the RociMLX package in Xcode.
#[cfg_attr(target_os = "macos", link(name = "RociMLX", kind = "framework"))]
unsafe extern "C" {
    fn roci_mlx_chat(request: *const c_char, on_event: EventFn, context: *mut c_void) -> *mut c_char;
    fn roci_mlx_cancel(stream_id: u64);
    fn roci_mlx_embed(request: *const c_char) -> *mut c_char;
    fn roci_mlx_speak(request: *const c_char) -> *mut c_char;
    fn roci_mlx_unload(role: *const c_char);
    fn roci_mlx_free_string(value: *mut c_char);
    fn roci_mlx_set_load_listener(listener: extern "C" fn(*const c_char));
}

/// Rust → webview: a model started or ended loading (`{ role, model, name, state }`, state loading | loaded | failed).
const MODEL_EVENT: &str = "mlx://model";

/// Where load reports go: set once at startup.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Starts forwarding RociMLX's model-load reports to the webview; call once at setup.
pub fn report_loads(app: &AppHandle) {
    if APP.set(app.clone()).is_ok() {
        // SAFETY: `on_load` is a plain `extern "C"` function that lives for the whole program.
        unsafe { roci_mlx_set_load_listener(on_load) }
    }
}

/// One load report from Swift: the model folder's name is its catalog id.
extern "C" fn on_load(report: *const c_char) {
    // SAFETY: Swift passes a valid C string for the duration of this call.
    let report: Value = match serde_json::from_slice(unsafe { CStr::from_ptr(report) }.to_bytes()) {
        Ok(report) => report,
        Err(_) => return,
    };
    let id = std::path::Path::new(report["modelDir"].as_str().unwrap_or_default()).file_name().and_then(|n| n.to_str());
    let (Some(app), Some(model)) = (APP.get(), id.and_then(|id| catalog::find(id).ok())) else { return };
    let event = json!({ "role": report["role"], "model": model.id, "name": model.name, "state": report["state"] });
    if let Err(error) = app.emit(MODEL_EVENT, event) {
        log::warn!("[mlx] load report not delivered: {error}");
    }
}

/// A model kind's slot: its name on the Swift side and how long it may idle.
#[derive(Clone, Copy)]
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

    fn name(self) -> &'static CStr {
        match self {
            Role::Chat => c"chat",
            Role::Embedding => c"embedding",
            Role::Voice => c"voice",
        }
    }
}

/// Bumped by every use of a role, so an idle deadline only unloads if nothing used it since.
#[derive(Default)]
pub struct MlxState {
    chat: AtomicU64,
    embedding: AtomicU64,
    voice: AtomicU64,
}

impl MlxState {
    fn uses(&self, role: Role) -> &AtomicU64 {
        match role {
            Role::Chat => &self.chat,
            Role::Embedding => &self.embedding,
            Role::Voice => &self.voice,
        }
    }
}

/// Streams a chat reply from a downloaded chat `model`: each event (text, tool call) arrives on `on_event`; resolves with
/// token usage once the reply ends or `mlx_cancel` stops it.
#[tauri::command]
pub async fn mlx_chat(app: AppHandle, model: String, mut request: Value, on_event: Channel<Value>) -> Result<Value, LocalError> {
    let dir = model_dir(&app, &model, Kind::Chat)?;
    request["modelDir"] = json!(dir);
    let result = blocking(move || {
        let request = to_c(&request)?;
        let context = &on_event as *const Channel<Value> as *mut c_void;
        // SAFETY: `roci_mlx_chat` blocks until the reply ends and only calls `forward` with `context` meanwhile, while
        // `on_event` is alive on this frame; the returned string is ours to free.
        take(unsafe { roci_mlx_chat(request.as_ptr(), forward, context) })
    })
    .await;
    rearm_idle(&app, Role::Chat);
    result
}

/// Stops a chat stream started by `mlx_chat`.
#[tauri::command]
pub fn mlx_cancel(stream_id: u64) {
    // SAFETY: a plain value; unknown ids are ignored on the Swift side.
    unsafe { roci_mlx_cancel(stream_id) }
}

/// Unit-length vectors for `texts` from a downloaded embedding `model`, in order.
#[tauri::command]
pub async fn mlx_embed(app: AppHandle, model: String, texts: Vec<String>) -> Result<Vec<Vec<f32>>, LocalError> {
    let dir = model_dir(&app, &model, Kind::Embedding)?;
    let result = blocking(move || {
        let request = to_c(&json!({ "modelDir": dir, "texts": texts }))?;
        // SAFETY: `request` outlives the call; the returned string is ours to free.
        take(unsafe { roci_mlx_embed(request.as_ptr()) })
    })
    .await;
    rearm_idle(&app, Role::Embedding);
    let vectors = result?.get_mut("vectors").map(Value::take).unwrap_or_default();
    serde_json::from_value(vectors).map_err(|e| LocalError::Engine(e.to_string()))
}

/// One sentence spoken by the voice model in `dir`: mono samples and their rate (runs on the caller's thread).
pub fn speak(dir: &std::path::Path, text: &str, voice: Option<&str>) -> Result<(Vec<f32>, u32), LocalError> {
    use base64::Engine as _;
    let request = to_c(&json!({ "modelDir": dir, "text": text, "voice": voice }))?;
    // SAFETY: `request` outlives the call; the returned string is ours to free.
    let reply = take(unsafe { roci_mlx_speak(request.as_ptr()) })?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(reply["samples"].as_str().unwrap_or_default())
        .map_err(|e| LocalError::Engine(e.to_string()))?;
    let samples = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
    let rate = reply["sampleRate"].as_u64().and_then(|r| u32::try_from(r).ok()).ok_or_else(|| LocalError::Engine("no sample rate".into()))?;
    Ok((samples, rate))
}

/// Frees the model of `kind` now (its files are about to be deleted, or the app quits).
pub fn unload(kind: Kind) {
    if let Some(role) = Role::of(kind) {
        // SAFETY: a static C string.
        unsafe { roci_mlx_unload(role.name().as_ptr()) }
    }
}

/// Frees every MLX model (app quit).
#[cfg(desktop)]
pub fn unload_all() {
    unload(Kind::Chat);
    unload(Kind::Embedding);
    unload(Kind::Voice);
}

fn model_dir(app: &AppHandle, id: &str, kind: Kind) -> Result<String, LocalError> {
    let model = catalog::find_kind(id, kind)?;
    Ok(store::installed_dir(app, model)?.to_string_lossy().into_owned())
}

/// Marks `kind`'s model as just used, so it stays loaded until it idles.
pub fn touch(app: &AppHandle, kind: Kind) {
    if let Some(role) = Role::of(kind) {
        rearm_idle(app, role);
    }
}

/// Arms the role's idle deadline (Settings' idle time): unloads then unless used again first; none when kept until quit.
fn rearm_idle(app: &AppHandle, role: Role) {
    let generation = app.state::<MlxState>().uses(role).fetch_add(1, Ordering::SeqCst) + 1;
    let Some(idle) = crate::models::idle_after() else { return };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(idle).await;
        if app.state::<MlxState>().uses(role).load(Ordering::SeqCst) == generation {
            let _ = blocking(move || {
                // SAFETY: a static C string.
                unsafe { roci_mlx_unload(role.name().as_ptr()) };
                Ok(())
            })
            .await;
        }
    });
}

/// Sends one Swift event to the webview channel passed as `context`.
extern "C" fn forward(context: *mut c_void, event: *const c_char) {
    // SAFETY: `context` is the `Channel` `mlx_chat` passed, alive for the whole call; `event` is a valid C string for
    // the duration of this callback.
    let (channel, event) = unsafe { (&*(context as *const Channel<Value>), CStr::from_ptr(event)) };
    if let Ok(value) = serde_json::from_slice::<Value>(event.to_bytes()) {
        let _ = channel.send(value);
    }
}

fn to_c(value: &Value) -> Result<CString, LocalError> {
    CString::new(value.to_string()).map_err(|e| LocalError::BadInput(e.to_string()))
}

/// The Swift reply (`{"ok":…}`), freed after reading: the result on success, its error otherwise.
fn take(reply: *mut c_char) -> Result<Value, LocalError> {
    // SAFETY: Swift returns a valid, owned C string; it is freed exactly once, below.
    let text = unsafe { CStr::from_ptr(reply) }.to_string_lossy().into_owned();
    // SAFETY: the same pointer, freed once by the side that allocated it.
    unsafe { roci_mlx_free_string(reply) };
    let mut value: Value = serde_json::from_str(&text).map_err(|e| LocalError::Engine(e.to_string()))?;
    if value["ok"].as_bool() == Some(true) {
        Ok(value)
    } else {
        Err(LocalError::Engine(value["error"].take().as_str().unwrap_or("MLX failed").to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    extern "C" fn collect(context: *mut c_void, event: *const c_char) {
        // SAFETY: `context` is the test's `Mutex<Vec<Value>>`, alive for the call; `event` is valid for this callback.
        let (events, event) = unsafe { (&*(context as *const Mutex<Vec<Value>>), CStr::from_ptr(event)) };
        events.lock().unwrap().push(serde_json::from_slice(event.to_bytes()).unwrap());
    }

    /// Real models through the C bridge: `ROCI_MLX_CHAT_DIR` and `ROCI_MLX_EMBED_DIR` name downloaded model folders.
    #[test]
    #[ignore = "needs downloaded MLX models"]
    fn chat_tool_call_and_embeddings_round_trip() {
        let chat_dir = std::env::var("ROCI_MLX_CHAT_DIR").unwrap();
        let embed_dir = std::env::var("ROCI_MLX_EMBED_DIR").unwrap();
        let weather = json!({"type": "function", "function": {"name": "get_weather", "description": "Current weather for a city",
            "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}});
        let request = to_c(&json!({"streamId": 1, "modelDir": chat_dir, "temperature": 0.0, "maxTokens": 80, "tools": [weather],
            "messages": [{"role": "user", "content": "What's the weather in Paris right now? Use the tool."}]})).unwrap();
        let events = Mutex::new(Vec::<Value>::new());
        let usage = take(unsafe { roci_mlx_chat(request.as_ptr(), collect, &events as *const _ as *mut c_void) }).unwrap();
        let events = events.into_inner().unwrap();
        let call = events.iter().find(|e| e["type"] == "tool-call").expect("a tool call");
        assert_eq!(call["name"], "get_weather");
        assert!(call["arguments"].as_str().unwrap().contains("Paris"));
        assert!(usage["completionTokens"].as_u64().unwrap() > 0);

        let query = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:";
        let texts = [format!("{query}What is the capital of China?"), format!("{query}Explain gravity"),
            "The capital of China is Beijing.".into(),
            "Gravity is a force that attracts two bodies towards each other. It gives weight to physical objects and is responsible for the movement of planets around the sun.".into()];
        let request = to_c(&json!({"modelDir": embed_dir, "texts": texts})).unwrap();
        let reply = take(unsafe { roci_mlx_embed(request.as_ptr()) }).unwrap();
        let v: Vec<Vec<f32>> = serde_json::from_value(reply["vectors"].clone()).unwrap();
        let dot = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        // Qwen's published scores: 0.7646 0.1414 / 0.1355 0.6000 (8-bit weights land within 0.01).
        for (got, want) in [(dot(&v[0], &v[2]), 0.7646), (dot(&v[0], &v[3]), 0.1414), (dot(&v[1], &v[2]), 0.1355), (dot(&v[1], &v[3]), 0.6000)] {
            assert!((got - want).abs() < 0.01, "similarity {got} vs {want}");
        }
        unsafe { roci_mlx_unload(c"chat".as_ptr()) };
        unsafe { roci_mlx_unload(c"embedding".as_ptr()) };
    }

    /// A vision chat model (Gemma 4) on the engine's vision path sees an attached image, with tools offered alongside.
    #[test]
    #[ignore = "needs a downloaded MLX vision model"]
    fn chat_sees_an_image_with_tools_offered() {
        let chat_dir = std::env::var("ROCI_MLX_CHAT_DIR").unwrap();
        // A 32×32 solid crimson PNG.
        let red = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42mO4I2JDU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULADahsD3KIXWxAAAAAElFTkSuQmCC";
        let weather = json!({"type": "function", "function": {"name": "get_weather", "description": "Current weather for a city",
            "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}});
        let request = to_c(&json!({"streamId": 2, "modelDir": chat_dir, "temperature": 0.0, "maxTokens": 20, "tools": [weather],
            "messages": [{"role": "user", "content": "What colour is this image? Answer with one word.", "images": [red]}]})).unwrap();
        let events = Mutex::new(Vec::<Value>::new());
        take(unsafe { roci_mlx_chat(request.as_ptr(), collect, &events as *const _ as *mut c_void) }).unwrap();
        let text: String = events.into_inner().unwrap().iter().filter_map(|e| e["text"].as_str()).collect();
        assert!(text.to_lowercase().contains("red") || text.to_lowercase().contains("crimson"), "saw: {text}");
        unsafe { roci_mlx_unload(c"chat".as_ptr()) };
    }
}
