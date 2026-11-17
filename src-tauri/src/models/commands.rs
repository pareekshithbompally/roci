//! Tauri commands for the curated models: their state, download, cancel, delete.

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::catalog::{self, Kind, MODELS};
use super::{blocking, store, LocalError, ModelsState};
#[cfg(desktop)]
use crate::{image::ImageState, stt::SttState, tts::TtsState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelStatus {
    id: &'static str,
    name: &'static str,
    kind: Kind,
    streams: bool,
    bytes: u64,
    installed: bool,
    downloading: bool,
}

/// Every curated model this device runs: downloaded, downloading, or neither.
#[tauri::command]
pub fn local_models(app: AppHandle, state: State<'_, ModelsState>) -> Result<Vec<LocalModelStatus>, LocalError> {
    MODELS
        .iter()
        .filter(|m| m.kind.runs_here())
        .map(|m| {
            Ok(LocalModelStatus {
                id: m.id,
                name: m.name,
                kind: m.kind,
                streams: m.streams,
                bytes: m.bytes(),
                installed: store::is_installed(&store::model_dir(&app, m)?, m),
                downloading: state.downloads.is_active(m.id),
            })
        })
        .collect()
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
            #[cfg(desktop)]
            Kind::Speech => app.state::<SttState>().engine.forget(model.id),
            #[cfg(desktop)]
            Kind::Voice => app.state::<TtsState>().forget(),
            #[cfg(desktop)]
            Kind::Image => app.state::<ImageState>().server.forget(model.id),
            Kind::Embedding | Kind::Chat => crate::mlx::unload(model.kind),
            #[cfg(mobile)]
            _ => {}
        }
        store::remove(&app, model)
    })
    .await
}
