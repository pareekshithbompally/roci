//! On-device chat on MLX (RociMLX.framework, Swift over C), until the webview moves to `llama.rs`. The model loads on
//! first use and is freed after it idles, and on quit.

use std::collections::HashSet;
use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager};

use crate::models::catalog::{self, Kind};
use crate::models::gpu::{self, Priority};
use crate::models::{blocking, store, LocalError};
use crate::sync::lock;

type EventFn = extern "C" fn(*mut c_void, *const c_char);

// macOS links the framework here; the iOS app links the RociMLX package in Xcode.
#[cfg_attr(target_os = "macos", link(name = "RociMLX", kind = "framework"))]
unsafe extern "C" {
    fn roci_mlx_chat(request: *const c_char, on_event: EventFn, context: *mut c_void) -> *mut c_char;
    fn roci_mlx_cancel(stream_id: u64);
    fn roci_mlx_unload(role: *const c_char);
    fn roci_mlx_memory() -> *mut c_char;
    fn roci_mlx_free_string(value: *mut c_char);
    fn roci_mlx_set_load_listener(listener: extern "C" fn(*const c_char));
    fn roci_mlx_set_checkpoint(hook: extern "C" fn());
}

/// Rust → webview: a model started or ended loading (`{ role, model, name, state }`, state loading | loaded | failed).
const MODEL_EVENT: &str = "mlx://model";

/// Where load reports go: set once at startup.
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Connects RociMLX's hooks once at setup: model-load reports to the webview, a chat's checkpoints to the GPU queue.
pub fn connect(app: &AppHandle) {
    if APP.set(app.clone()).is_ok() {
        // SAFETY: `on_load` and `checkpoint` are plain `extern "C"` functions that live for the whole program.
        unsafe {
            roci_mlx_set_load_listener(on_load);
            roci_mlx_set_checkpoint(checkpoint);
        }
    }
}

/// A chat's checkpoint (after each prompt chunk and each token, on MLX's generation thread): waiting speech-to-text runs now.
extern "C" fn checkpoint() {
    gpu::step_aside(Priority::Interactive);
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
    if report["state"] == "loaded" {
        log_memory(&format!("loaded {}", model.id));
    }
    let event = json!({ "role": report["role"], "model": model.id, "name": model.name, "state": report["state"] });
    if let Err(error) = app.emit(MODEL_EVENT, event) {
        log::warn!("[mlx] load report not delivered: {error}");
    }
}

/// The one slot left on MLX.
#[derive(Clone, Copy)]
enum Role {
    Chat,
}

impl Role {
    fn name(self) -> &'static CStr {
        match self {
            Role::Chat => c"chat",
        }
    }
}

/// Bumped by every use of a role, so an idle deadline only unloads if nothing used it since.
#[derive(Default)]
pub struct MlxState {
    chat: AtomicU64,
}

impl MlxState {
    fn uses(&self, role: Role) -> &AtomicU64 {
        match role {
            Role::Chat => &self.chat,
        }
    }
}

/// Streams a chat reply from a downloaded chat `model`: each event (text, tool call) arrives on `on_event`; resolves with
/// token usage once the reply ends or `mlx_cancel` stops it.
#[tauri::command]
pub async fn mlx_chat(app: AppHandle, model: String, mut request: Value, on_event: Channel<Value>) -> Result<Value, LocalError> {
    let dir = model_dir(&app, &model, Kind::Chat)?;
    request["modelDir"] = json!(dir);
    let stream_id = request["streamId"].as_u64();
    let result = blocking(move || {
        let request = to_c(&request)?;
        let context = &on_event as *const Channel<Value> as *mut c_void;
        let reply = gpu::run(Priority::Interactive, || {
            if stream_id.is_some_and(|id| lock(&CANCELLED).remove(&id)) {
                return Ok(json!({ "promptTokens": 0, "completionTokens": 0, "cancelled": true }));
            }
            // SAFETY: `roci_mlx_chat` blocks until the reply ends and only calls `forward` with `context` meanwhile, while
            // `on_event` is alive on this frame; the returned string is ours to free.
            take(unsafe { roci_mlx_chat(request.as_ptr(), forward, context) })
        });
        if let Some(id) = stream_id {
            lock(&CANCELLED).remove(&id);
        }
        reply
    })
    .await;
    log_memory("chat reply");
    rearm_idle(&app, Role::Chat);
    result
}

/// Streams stopped before Swift knew them (still waiting for their GPU turn): answered as cancelled without running.
static CANCELLED: LazyLock<Mutex<HashSet<u64>>> = LazyLock::new(Mutex::default);

/// Stops a chat stream started by `mlx_chat`, running or still waiting for its turn.
#[tauri::command]
pub fn mlx_cancel(stream_id: u64) {
    lock(&CANCELLED).insert(stream_id);
    // SAFETY: a plain value; unknown ids are ignored on the Swift side.
    unsafe { roci_mlx_cancel(stream_id) }
}

/// Frees `role`'s model in a GPU turn of its own, so never while a reply, embedding or voice is using it.
fn free(role: Role) {
    // SAFETY: a static C string.
    gpu::run(Priority::Interactive, || unsafe { roci_mlx_unload(role.name().as_ptr()) });
    log_memory(&format!("unloaded {}", role.name().to_string_lossy()));
}

/// Logs what the app holds in memory after `event`: its whole footprint (and highest since launch) and MLX's share (peak
/// since the last line).
pub fn log_memory(event: &str) {
    // SAFETY: no input; the returned string is ours to free.
    let Ok(reading) = take(unsafe { roci_mlx_memory() }) else { return };
    let mb = |key: &str| reading[key].as_u64().map_or_else(|| "-".to_string(), |bytes| (bytes >> 20).to_string());
    log::info!(
        "[memory] {event}: footprint {} MB (highest {}) · mlx active {} · cache {} · peak {} · free {} MB",
        mb("footprint"), mb("footprintPeak"), mb("active"), mb("cache"), mb("peak"), mb("available")
    );
}

fn model_dir(app: &AppHandle, id: &str, kind: Kind) -> Result<String, LocalError> {
    let model = catalog::find_kind(id, kind)?;
    let file = store::installed_path(app, model, model.main_file())?;
    Ok(file.parent().unwrap_or(&file).to_string_lossy().into_owned())
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
                free(role);
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

    /// A real chat model through the C bridge: `ROCI_MLX_CHAT_DIR` names a downloaded model folder.
    #[test]
    #[ignore = "needs a downloaded MLX model"]
    fn chat_tool_call_round_trip() {
        let chat_dir = std::env::var("ROCI_MLX_CHAT_DIR").unwrap();
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

        unsafe { roci_mlx_unload(c"chat".as_ptr()) };
    }

    /// A vision chat model on the engine's vision path sees an attached image, with tools offered alongside.
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
