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
                languages: m.languages,
                detects_language: m.detects_language,
                bytes: m.bytes(),
                installed,
                downloading: state.downloads.is_active(m.id),
                partial: !installed && store::is_started(&dir, m),
                context_tokens: (installed && m.kind == Kind::Chat).then(|| context_tokens(&dir)).flatten(),
                tools: (installed && m.kind == Kind::Chat).then(|| takes_tools(&dir)),
                vision: (installed && m.kind == Kind::Chat).then(|| model_config(&dir).is_some_and(|c| c.get("vision_config").is_some())),
            })
        })
        .collect()
}

/// The context window a model's config.json states: `max_position_embeddings`, at the top (text models) or in
/// `text_config` (multimodal ones).
fn context_tokens(dir: &std::path::Path) -> Option<u64> {
    let config = model_config(dir)?;
    let key = "max_position_embeddings";
    config.get(key).or_else(|| config.get("text_config")?.get(key))?.as_u64()
}

/// The model's config.json, as the model ships it.
fn model_config(dir: &std::path::Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(dir.join("config.json")).ok()?).ok()
}

/// Whether the model's chat template takes tool definitions: a Jinja tag (`{% … %}`, `{{ … }}`) uses `tools` — prose
/// that merely mentions the word doesn't count. Read from `chat_template.jinja`, `chat_template.json` or
/// `tokenizer_config.json`, wherever the model ships it.
fn takes_tools(dir: &std::path::Path) -> bool {
    chat_templates(dir).iter().any(|template| jinja_uses(template, "tools"))
}

fn chat_templates(dir: &std::path::Path) -> Vec<String> {
    let read = |name: &str| std::fs::read_to_string(dir.join(name)).ok();
    let embedded = |name: &str| {
        let config: serde_json::Value = serde_json::from_str(&read(name)?).ok()?;
        match config.get("chat_template")? {
            serde_json::Value::String(template) => Some(template.clone()),
            other => Some(other.to_string()), // named templates: [{ "name", "template" }]
        }
    };
    [read("chat_template.jinja"), embedded("chat_template.json"), embedded("tokenizer_config.json")].into_iter().flatten().collect()
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
    let Some(cancel) = state.downloads.begin(model.id) else {
        return Ok(()); // already downloading
    };
    tauri::async_runtime::spawn(async move {
        store::download(&app, model, &cancel).await;
        app.state::<ModelsState>().downloads.end(model.id);
    });
    Ok(())
}

/// Bytes free for downloads on the volume that keeps the models.
#[tauri::command]
pub fn local_model_free_space(app: AppHandle) -> Result<u64, LocalError> {
    store::free_space(&app)
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
