//! Tauri commands for the curated models: their state, download, cancel, delete.

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::catalog::{self, Kind, MODELS};
use super::{blocking, store, LocalError, ModelsState};
use crate::{stt::SttState, tts::TtsState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelStatus {
    id: &'static str,
    name: &'static str,
    maker: &'static str,
    kind: Kind,
    streams: bool,
    bytes: u64,
    installed: bool,
    downloading: bool,
    /// A downloaded chat model's context window, as its own config states (the chat's context ring); None otherwise.
    context_tokens: Option<u64>,
    /// A downloaded chat model's chat template takes tool definitions (tool calling); None otherwise.
    tools: Option<bool>,
}

/// Every curated model: downloaded, downloading, or neither.
#[tauri::command]
pub fn local_models(app: AppHandle, state: State<'_, ModelsState>) -> Result<Vec<LocalModelStatus>, LocalError> {
    MODELS
        .iter()
        .map(|m| {
            let dir = store::model_dir(&app, m)?;
            let installed = store::is_installed(&dir, m);
            Ok(LocalModelStatus {
                id: m.id,
                name: m.name,
                maker: m.maker,
                kind: m.kind,
                streams: m.streams,
                bytes: m.bytes(),
                installed,
                downloading: state.downloads.is_active(m.id),
                context_tokens: (installed && m.kind == Kind::Chat).then(|| context_tokens(&dir)).flatten(),
                tools: (installed && m.kind == Kind::Chat).then(|| takes_tools(&dir)),
            })
        })
        .collect()
}

/// The context window a model's config.json states: `max_position_embeddings`, at the top (text models) or in
/// `text_config` (multimodal ones such as Gemma 4).
fn context_tokens(dir: &std::path::Path) -> Option<u64> {
    let text = std::fs::read_to_string(dir.join("config.json")).ok()?;
    let config: serde_json::Value = serde_json::from_str(&text).ok()?;
    let key = "max_position_embeddings";
    config.get(key).or_else(|| config.get("text_config")?.get(key))?.as_u64()
}

/// Whether the model's chat template takes tool definitions: `chat_template.jinja`, or the template in
/// `tokenizer_config.json` (the way llama-server reads a GGUF's template).
fn takes_tools(dir: &std::path::Path) -> bool {
    let jinja = std::fs::read_to_string(dir.join("chat_template.jinja")).unwrap_or_default();
    let config = std::fs::read_to_string(dir.join("tokenizer_config.json")).unwrap_or_default();
    let inline = serde_json::from_str::<serde_json::Value>(&config)
        .ok()
        .and_then(|c| c.get("chat_template").map(|t| t.to_string()))
        .unwrap_or_default();
    jinja.contains("tools") || inline.contains("tools")
}

/// Starts a download; progress and the outcome arrive as `models://download` events.
#[tauri::command]
pub fn local_model_download(app: AppHandle, state: State<'_, ModelsState>, id: String) -> Result<(), LocalError> {
    let model = catalog::find(&id)?;
    let Some(cancel) = state.downloads.begin(model.id) else {
        return Ok(()); // already downloading
    };
    tauri::async_runtime::spawn(async move {
        store::download(&app, model, &cancel).await;
        app.state::<ModelsState>().downloads.end(model.id);
    });
    Ok(())
}

/// Stops a download; what arrived is kept and resumed next time.
#[tauri::command]
pub fn local_model_cancel(state: State<'_, ModelsState>, id: String) -> Result<(), LocalError> {
    state.downloads.cancel(catalog::find(&id)?.id);
    Ok(())
}

/// Deletes a model's files, after its engine lets go of it (off the main thread: a server may still be loading it).
#[tauri::command]
pub async fn local_model_remove(app: AppHandle, id: String) -> Result<(), LocalError> {
    let model = catalog::find(&id)?;
    app.state::<ModelsState>().downloads.cancel(model.id);
    blocking(move || {
        match model.kind {
            Kind::Speech => app.state::<SttState>().engine.forget(model.id),
            Kind::Voice => app.state::<TtsState>().forget(),
            Kind::Embedding | Kind::Chat => crate::mlx::unload(model.kind),
        }
        store::remove(&app, model)
    })
    .await
}
