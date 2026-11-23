use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

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

/// Handle window close: hide to the menu bar instead, and ask first while recording.
pub fn setup_window_handlers(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        let app_handle = app.clone();
        window.on_window_event(move |event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    // Save window state before preventing close
                    let _ = app_handle.save_window_state(StateFlags::all());

                    if crate::audio::commands::capture_active() {
                        api.prevent_close();
                        let _ = app_handle.emit(CLOSE_REQUESTED_EVENT, ());
                        return;
                    }

                    // Close hides to the menu bar; Quit comes from the menu bar or ⌘Q.
                    api.prevent_close();
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
