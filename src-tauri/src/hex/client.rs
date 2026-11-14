//! Loopback HTTP calls to Hex: list models, transcribe one WAV.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::Duration;
use tauri_plugin_http::reqwest::{self, Client, Response, StatusCode};

use super::discovery::Endpoint;
use super::HexError;

/// Loopback connects either succeed at once or nothing is listening.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
/// Model listing is a metadata read; anything slower means Hex is stuck.
const STATUS_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Serialize, Deserialize)]
pub struct HexModel {
    pub id: String,
    pub name: String,
    pub installed: bool,
}

#[derive(Deserialize)]
struct Transcription {
    transcript: String,
}

#[derive(Deserialize)]
struct ErrorBody {
    code: String,
}

pub(super) fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .expect("reqwest client with only a connect timeout always builds")
    })
}

/// Maps a refused response to the error the webview shows. Codes verified against Hex 3.4.0 (API 2).
fn classify(status: StatusCode, code: Option<String>) -> HexError {
    match (status.as_u16(), code.as_deref()) {
        (401, _) => HexError::Unauthorized,
        (409, Some("model-not-ready")) => HexError::ModelNotReady,
        (413, _) => HexError::TooLarge,
        (503, _) => HexError::Busy,
        (_, Some(code)) => HexError::Rejected(code.to_string()),
        (status, None) => HexError::Rejected(format!("http-{status}")),
    }
}

fn transport(error: reqwest::Error) -> HexError {
    if error.is_connect() {
        HexError::NotRunning
    } else {
        HexError::Rejected(error.to_string())
    }
}

/// Decodes a success body as `T`, or classifies a refusal by its status and `{"code"}` body.
async fn read_json<T: DeserializeOwned>(response: Response) -> Result<T, HexError> {
    let status = response.status();
    let bytes = response.bytes().await.map_err(transport)?;
    if !status.is_success() {
        let code = serde_json::from_slice::<ErrorBody>(&bytes).ok().map(|body| body.code);
        return Err(classify(status, code));
    }
    serde_json::from_slice(&bytes).map_err(|error| HexError::Rejected(format!("invalid-response: {error}")))
}

pub async fn models(endpoint: &Endpoint) -> Result<Vec<HexModel>, HexError> {
    let response = client()
        .get(format!("{}/models", endpoint.base_url))
        .bearer_auth(&endpoint.token)
        .timeout(STATUS_TIMEOUT)
        .send()
        .await
        .map_err(transport)?;
    read_json(response).await
}

/// Sends one complete PCM WAV. `Vec<u8>` bodies carry `Content-Length` (Hex refuses chunked uploads).
/// No overall timeout: a 15-minute part on a large model can legitimately take minutes.
pub async fn transcribe(endpoint: &Endpoint, wav: Vec<u8>, model: &str, language: &str) -> Result<String, HexError> {
    let response = client()
        .post(format!("{}/transcriptions", endpoint.base_url))
        .query(&[("model", model), ("language", language)])
        .bearer_auth(&endpoint.token)
        .header(reqwest::header::CONTENT_TYPE, "audio/wav")
        .body(wav)
        .send()
        .await
        .map_err(transport)?;
    let body: Transcription = read_json(response).await?;
    Ok(body.transcript)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(s: &str) -> Option<String> {
        Some(s.to_string())
    }

    #[test]
    fn maps_hex_refusals() {
        assert!(matches!(classify(StatusCode::UNAUTHORIZED, None), HexError::Unauthorized));
        assert!(matches!(classify(StatusCode::CONFLICT, code("model-not-ready")), HexError::ModelNotReady));
        assert!(matches!(classify(StatusCode::PAYLOAD_TOO_LARGE, code("resource-exhausted")), HexError::TooLarge));
        assert!(matches!(classify(StatusCode::SERVICE_UNAVAILABLE, code("shutting-down")), HexError::Busy));
    }

    /// Live check against the running Hex (opt-in): `HEX_LIVE_WAV=<16 kHz WAV> cargo test --lib hex_live -- --ignored`.
    #[test]
    #[ignore]
    fn hex_live_models_and_transcribe() {
        let data_dir = std::path::PathBuf::from(std::env::var("HOME").unwrap()).join("Library/Application Support");
        let endpoint = super::super::discovery::read(&data_dir).expect("Hex running");
        tauri::async_runtime::block_on(async {
            let installed: Vec<String> =
                models(&endpoint).await.unwrap().into_iter().filter(|m| m.installed).map(|m| m.id).collect();
            println!("installed models: {installed:?}");
            let wav = std::fs::read(std::env::var("HEX_LIVE_WAV").unwrap()).unwrap();
            let text = transcribe(&endpoint, wav.clone(), &installed[0], "en").await.unwrap();
            println!("transcript: {text}");
            assert!(!text.is_empty());
            let missing = transcribe(&endpoint, wav, "parakeet_v3", "en").await;
            println!("uninstalled model -> {missing:?}");
            assert!(matches!(missing, Err(HexError::ModelNotReady)));
        });
    }

    #[test]
    fn keeps_unknown_codes() {
        match classify(StatusCode::CONFLICT, code("subscriber-busy")) {
            HexError::Rejected(c) => assert_eq!(c, "subscriber-busy"),
            other => panic!("unexpected {other:?}"),
        }
        match classify(StatusCode::INTERNAL_SERVER_ERROR, None) {
            HexError::Rejected(c) => assert_eq!(c, "http-500"),
            other => panic!("unexpected {other:?}"),
        }
    }
}
