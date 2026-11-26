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
    /// A speech model's languages, as it spells them; empty for other kinds.
    languages: &'static [&'static str],
    /// A speech model tells the language itself.
    detects_language: bool,
    bytes: u64,
    installed: bool,
    downloading: bool,
    /// An interrupted download: some of it is here and continues where it stopped.
    partial: bool,
    /// A downloaded chat model's context window, as its own config states (the chat's context ring); None otherwise.
    context_tokens: Option<u64>,
    /// A downloaded chat model's chat template takes tool definitions (tool calling); None otherwise.
    tools: Option<bool>,
    /// A downloaded chat model ships a vision encoder, so it reads images (`vision_config`); None otherwise.
    vision: Option<bool>,
    /// A chat model's quantization, as its weights file names it (`Q4_0`); None for other kinds.
    quant: Option<&'static str>,
    /// A chat model ships its own speculative-decoding draft (an MTP head or a DFlash model): replies come faster.
    drafts: bool,
}

/// Every curated model: downloaded, downloading, or neither (off the main thread: it reads the model files).
#[tauri::command]
pub async fn local_models(app: AppHandle) -> Result<Vec<LocalModelStatus>, LocalError> {
    blocking(move || statuses(&app)).await
}

fn statuses(app: &AppHandle) -> Result<Vec<LocalModelStatus>, LocalError> {
    let state = app.state::<ModelsState>();
    MODELS
        .iter()
        .map(|m| {
            let installed = store::is_installed(app, m);
            let (context, template) = if installed && m.kind == Kind::Chat {
                crate::engine_readings::model_info(&store::file_path(app, m, m.main_file())?)
            } else {
                (None, None)
            };
            Ok(LocalModelStatus {
                id: m.id,
                name: m.name,
                maker: m.maker,
                kind: m.kind,
                streams: m.streams,
                languages: m.languages,
                detects_language: m.detects_language,
                bytes: m.bytes(),
                installed,
                downloading: state.downloads.is_active(m.id),
                partial: !installed && store::is_started(app, m),
                context_tokens: context,
                tools: template.as_deref().map(|t| jinja_uses(t, "tools")),
                // Images reach a model once the shim passes them (mtmd vision); until then none takes them.
                vision: (installed && m.kind == Kind::Chat).then_some(false),
                quant: (m.kind == Kind::Chat).then(|| quant_of(m.main_file().name)),
                drafts: m.kind == Kind::Chat && m.files.iter().any(|f| f.name.starts_with("mtp-") || f.name.contains("DFlash")),
            })
        })
        .collect()
}

/// A weights file's quantization: the last dash-separated part of its name (`gemma-4-E2B-it-Q4_0.gguf` → `Q4_0`).
fn quant_of(file: &str) -> &str {
    file.trim_end_matches(".gguf").rsplit('-').next().unwrap_or_default()
}

/// One projection at a time: llama.cpp's measure swaps its global logger while it runs.
static PROJECTING: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// The memory llama.cpp projects for the downloaded chat model `id` at `context_tokens` with a KV cache of `kv_type`
/// (f16, q8_0, q4_0), bytes: Model Tuning's context and memory-saver choices show it.
#[tauri::command]
pub async fn local_model_memory(app: AppHandle, id: String, context_tokens: u32, kv_type: String) -> Result<u64, LocalError> {
    let model = catalog::find_kind(&id, Kind::Chat)?;
    let path = store::installed_path(&app, model, model.main_file())?;
    blocking(move || {
        let _turn = crate::sync::lock(&PROJECTING);
        crate::engine_readings::projected_memory(&path, context_tokens, &kv_type)
    })
    .await
}

/// Whether any Jinja tag in `template` names `variable` as a whole word.
fn jinja_uses(template: &str, variable: &str) -> bool {
    let word = |c: char| c.is_alphanumeric() || c == '_';
    template.split("{%").skip(1).chain(template.split("{{").skip(1)).any(|tail| {
        let tag = tail.split(['%', '}']).next().unwrap_or_default();
        tag.match_indices(variable).any(|(at, _)| {
            let before = tag[..at].chars().next_back().is_none_or(|c| !word(c));
            let after = tag[at + variable.len()..].chars().next().is_none_or(|c| !word(c));
            before && after
        })
    })
}

#[cfg(test)]
mod tests {
    use super::jinja_uses;

    #[test]
    fn tools_counts_only_inside_a_jinja_tag() {
        assert!(jinja_uses("{%- if tools %}{{ tools | tojson }}{% endif %}", "tools"));
        assert!(jinja_uses("{{- tools[0].name }}", "tools"));
        assert!(!jinja_uses("This model does not support tools.", "tools"));
        assert!(!jinja_uses("{% if toolset %}{{ my_tools_x }}{% endif %}", "tools"));
    }
}

/// Starts a download; progress and the outcome arrive as `models://download` events.
#[tauri::command]
pub fn local_model_download(app: AppHandle, state: State<'_, ModelsState>, id: String) -> Result<(), LocalError> {
    let model = catalog::find(&id)?;
    if !state.downloads.begin(model.id) {
        return Ok(()); // already downloading
    }
    tauri::async_runtime::spawn(async move {
        store::download(&app, model).await;
        app.state::<ModelsState>().downloads.end(model.id);
    });
    Ok(())
}

/// Bytes free for downloads on the volume that keeps the models (off the main thread: it asks the volume).
#[tauri::command]
pub async fn local_model_free_space(app: AppHandle) -> Result<u64, LocalError> {
    blocking(move || store::free_space(&app)).await
}

/// Stops a download; what arrived is kept and resumed next time (off the main thread: the system lists its transfers).
#[tauri::command]
pub async fn local_model_cancel(id: String) -> Result<(), LocalError> {
    let model = catalog::find(&id)?;
    blocking(move || {
        store::cancel(model);
        Ok(())
    })
    .await
}

/// Deletes a model's files, after its engine lets go of it (off the main thread: a server may still be loading it). The
/// Mac's engine, for a model it serves, stops before the files go and again after, so one started in between doesn't
/// keep listing it.
#[tauri::command]
pub async fn local_model_remove(app: AppHandle, id: String) -> Result<(), LocalError> {
    let model = catalog::find(&id)?;
    blocking(move || {
        store::cancel(model);
        match model.kind {
            Kind::Speech => app.state::<SttState>().engine.forget(model.id),
            Kind::Voice => app.state::<TtsState>().forget(),
            #[cfg(mobile)]
            Kind::Embedding | Kind::Chat => crate::llama::unload(model.kind),
            #[cfg(desktop)]
            Kind::Embedding | Kind::Chat => {}
        }
        #[cfg(desktop)]
        crate::llama_server::model_changed(model.kind);
        let removed = store::remove(&app, model);
        #[cfg(desktop)]
        crate::llama_server::model_changed(model.kind);
        removed
    })
    .await
}
