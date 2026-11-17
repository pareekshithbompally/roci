//! llama.cpp's `llama-server` for on-device models, one process per role (meeting-search embeddings, chat) so a search
//! never unloads the chat model. Each frees its model when idle (`--sleep-idle-seconds`) and reloads it on the next request.

use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::model_server::{Launch, ModelServer, LOCALHOST};
use crate::models::catalog::{self, Kind, LocalModel};
use crate::models::{blocking, store, LocalError};

const LLAMA_SERVER: &str = "llama-server";
/// EmbeddingGemma's context. Every input is embedded whole in one batch, so batch sizes match it.
const EMBEDDING_CONTEXT: &str = "2048";
/// The search model reloads in ≈0.3 s, so it's freed after a minute; the server itself stays (≈130 MB).
const EMBEDDING_IDLE_SECONDS: &str = "60";
/// Tokens a chat can hold (prompt + reply); both chat models support at least this.
const CHAT_CONTEXT: &str = "32768";
/// A chat model takes seconds to reload, so it stays through a pause in the conversation.
const CHAT_IDLE_SECONDS: &str = "300";
/// Tokens a chat model's multi-token-prediction draft proposes per step.
const DRAFT_TOKENS: &str = "3";

pub struct LlamaState {
    pub embedding: ModelServer,
    pub chat: ModelServer,
}

impl Default for LlamaState {
    fn default() -> Self {
        Self { embedding: ModelServer::new(LLAMA_SERVER, "embedding"), chat: ModelServer::new(LLAMA_SERVER, "chat") }
    }
}

impl LlamaState {
    /// The server that runs models of `kind`.
    pub fn server(&self, kind: Kind) -> &ModelServer {
        if kind == Kind::Chat { &self.chat } else { &self.embedding }
    }
}

/// Where the webview sends a model's requests (OpenAI API), and the key it must send.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalServer {
    url: String,
    api_key: &'static str,
}

/// The embedding server for a downloaded `model` (started when needed; resolves once the model is loaded).
#[tauri::command]
pub async fn embedding_server(app: AppHandle, model: String) -> Result<LocalServer, LocalError> {
    serve(app, &model, Kind::Embedding).await
}

/// The chat server for a downloaded `model` (started or switched when needed; resolves once the model is loaded).
#[tauri::command]
pub async fn chat_server(app: AppHandle, model: String) -> Result<LocalServer, LocalError> {
    serve(app, &model, Kind::Chat).await
}

async fn serve(app: AppHandle, model: &str, kind: Kind) -> Result<LocalServer, LocalError> {
    let model = catalog::find_kind(model, kind)?;
    let dir = store::installed_dir(&app, model)?;
    let api_key = api_key()?;
    let url = blocking(move || app.state::<LlamaState>().server(kind).ensure(model.id, || Ok(launch(model, &dir, api_key)))).await?;
    Ok(LocalServer { url, api_key })
}

fn launch(model: &LocalModel, dir: &Path, api_key: &str) -> Launch {
    let mut args: Vec<OsString> = vec!["--model".into(), dir.join(model.main_file().name).into()];
    let mut set = |flag: &str, value: &str| args.extend([flag.into(), value.into()]);
    set("--host", LOCALHOST);
    set("--port", "0"); // the OS picks a free port; the ready line names it
    set("--parallel", "1");
    if model.kind == Kind::Chat {
        set("--ctx-size", CHAT_CONTEXT);
        set("--sleep-idle-seconds", CHAT_IDLE_SECONDS);
        if let Some(draft) = model.files.get(1) {
            set("--spec-type", "draft-mtp");
            set("--spec-draft-n-max", DRAFT_TOKENS);
            args.extend(["--model-draft".into(), dir.join(draft.name).into()]);
        }
    } else {
        for flag in ["--ctx-size", "--batch-size", "--ubatch-size"] {
            set(flag, EMBEDDING_CONTEXT);
        }
        set("--sleep-idle-seconds", EMBEDDING_IDLE_SECONDS);
        args.push("--embeddings".into());
    }
    Launch { args, envs: vec![("LLAMA_API_KEY", api_key.to_string())] }
}

/// One random key per app run: other local processes can reach the port, not the server.
fn api_key() -> Result<&'static str, LocalError> {
    static KEY: OnceLock<String> = OnceLock::new();
    if let Some(key) = KEY.get() {
        return Ok(key);
    }
    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(KEY.get_or_init(|| bytes.iter().map(|b| format!("{b:02x}")).collect()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args_of(id: &str) -> Vec<String> {
        let launch = launch(catalog::find(id).unwrap(), Path::new("/m"), "k");
        assert!(!launch.args.iter().any(|a| a == "k"), "the key must not be an argument");
        launch.args.iter().map(|a| a.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn the_key_is_random_and_stable_for_the_run() {
        let key = api_key().unwrap();
        assert_eq!(key.len(), 32);
        assert_eq!(api_key().unwrap(), key);
    }

    #[test]
    fn the_embedding_model_runs_in_embeddings_mode() {
        let args = args_of("embeddinggemma-300m");
        assert_eq!(args[..2], ["--model", "/m/embeddinggemma-300M-Q8_0.gguf"]);
        assert!(args.contains(&"--embeddings".to_string()));
    }

    #[test]
    fn a_chat_model_with_a_draft_gets_speculative_decoding() {
        let gemma = args_of("gemma-4-e2b");
        assert!(gemma.windows(2).any(|w| w == ["--model-draft", "/m/mtp-gemma-4-E2B-it-Q4_0.gguf"]));
        assert!(!gemma.contains(&"--embeddings".to_string()));
        assert!(!args_of("lfm3-omni-2b").contains(&"--model-draft".to_string()));
    }
}
