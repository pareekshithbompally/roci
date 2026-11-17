//! Tauri command for on-device image generation: the local image server's address for a downloaded model.

use std::time::Duration;

use tauri::{AppHandle, Manager};

use super::ImageState;
use crate::models::catalog::{self, Kind};
use crate::models::{blocking, store, LocalError};

/// The server (and its model, several GB) is stopped after this long without an image.
const IDLE_STOP: Duration = Duration::from_secs(10 * 60);

/// The base URL of the image server running `model` (started or switched as needed; resolves once the model is loaded).
/// Call before each image: it also re-arms the idle stop.
#[tauri::command]
pub async fn image_server_url(app: AppHandle, model: String) -> Result<String, LocalError> {
    let model = catalog::find_kind(&model, Kind::Image)?;
    let dir = store::installed_dir(&app, model)?;
    let worker = app.clone();
    let url = blocking(move || {
        let state = worker.state::<ImageState>();
        state.server.touch(); // a pending idle stop must not fire mid-start
        state.server.ensure(model, &dir)
    })
    .await?;
    schedule_idle_stop(app);
    Ok(url)
}

/// Stops the server once nothing has used it for `IDLE_STOP`.
fn schedule_idle_stop(app: AppHandle) {
    let generation = app.state::<ImageState>().server.touch();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(IDLE_STOP).await;
        app.state::<ImageState>().server.stop_if_idle(generation);
    });
}

/// Stops the server when the app quits, so its model doesn't outlive Roci.
pub fn stop(app: &AppHandle) {
    app.state::<ImageState>().server.stop();
}
