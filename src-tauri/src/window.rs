use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    pub fullscreen: bool,
}

/// Save window state (called from frontend)
#[tauri::command]
pub async fn save_window_state(
    _app: AppHandle,
    state: WindowState,
) -> Result<(), String> {
    // State will be saved by the frontend using the storage service
    // This command exists for potential future backend-driven state saving
    log::info!("Window state update: {:?}", state);
    Ok(())
}

/// Get current window state
#[tauri::command]
pub async fn get_window_state(app: AppHandle) -> Result<WindowState, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    
    let position = window.outer_position()
        .map_err(|e| format!("Failed to get window position: {}", e))?;
    
    let size = window.outer_size()
        .map_err(|e| format!("Failed to get window size: {}", e))?;
    
    let maximized = window.is_maximized()
        .map_err(|e| format!("Failed to check if window is maximized: {}", e))?;
    
    let fullscreen = window.is_fullscreen()
        .map_err(|e| format!("Failed to check if window is fullscreen: {}", e))?;
    
    Ok(WindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized,
        fullscreen,
    })
}

/// Show and focus the main window
#[tauri::command]
pub async fn show_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()
            .map_err(|e| format!("Failed to show window: {}", e))?;
        window.set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
        
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

/// Hide the main window
#[tauri::command]
pub async fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide()
            .map_err(|e| format!("Failed to hide window: {}", e))?;
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

/// Toggle window visibility
#[tauri::command]
pub async fn toggle_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible()
            .map_err(|e| format!("Failed to check window visibility: {}", e))?;
        
        if is_visible {
            hide_window(app).await
        } else {
            show_window(app).await
        }
    } else {
        Err("Main window not found".to_string())
    }
}

/// Set window to always on top
#[tauri::command]
pub async fn set_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(always_on_top)
            .map_err(|e| format!("Failed to set always on top: {}", e))?;
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

/// Emitted when the user quits (Cmd+Q) while a recording is capturing.
pub const QUIT_REQUESTED_EVENT: &str = "quit-requested";
/// Emitted when the user closes the window while a recording is capturing.
pub const CLOSE_REQUESTED_EVENT: &str = "close-requested";

/// Shows and focuses the main window.
pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Handle window close event (minimize to tray instead; while recording, ask
/// the user first)
pub fn setup_window_handlers(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        let app_handle = app.clone();
        window.on_window_event(move |event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    // Save window state before preventing close
                    let _ = app_handle.save_window_state(StateFlags::all());

                    // Prevent default close behavior
                    api.prevent_close();

                    if crate::audio::commands::capture_active() {
                        let _ = app_handle.emit(CLOSE_REQUESTED_EVENT, ());
                        return;
                    }

                    // Hide window instead of closing
                    let _ = window_clone.hide();
                }
                WindowEvent::Focused(true) => {
                    let _ = app_handle.emit("window-focused", ());
                }
                _ => {}
            }
        });
    }
}
