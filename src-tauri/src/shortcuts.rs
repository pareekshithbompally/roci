use tauri::{AppHandle, Emitter};

/// Register a global keyboard shortcut
#[tauri::command]
pub async fn register_shortcut(
    app: AppHandle,
    shortcut: String,
    action: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
    
    // Parse the shortcut string
    let parsed_shortcut = shortcut.parse::<Shortcut>()
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;

    // The plugin is the source of truth, so an already-registered shortcut is a no-op, not a duplicate.
    if app.global_shortcut().is_registered(parsed_shortcut) {
        return Ok(());
    }

    // Clone variables for closure
    let action_clone = action.clone();
    let app_clone = app.clone();
    
    // Register the shortcut with a callback
    app.global_shortcut()
        .on_shortcut(parsed_shortcut, move |_app, _shortcut, event| {
            // macOS reports the key going up too; only the press is the shortcut, or holding it would toggle twice.
            if event.state != ShortcutState::Pressed {
                return;
            }
            if let Err(e) = app_clone.emit("shortcut-triggered", action_clone.clone()) {
                eprintln!("Failed to emit shortcut event: {}", e);
            }
        })
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    Ok(())
}
