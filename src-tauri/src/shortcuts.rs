use tauri::{AppHandle, Manager};
use tauri::Emitter;
use std::sync::Mutex;

/// Shortcut registration state
pub struct ShortcutState {
    pub registered: Mutex<Vec<String>>,
}

/// Register a global keyboard shortcut
#[tauri::command]
pub async fn register_shortcut(
    app: AppHandle,
    shortcut: String,
    action: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    
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
        .on_shortcut(parsed_shortcut, move |_app, _shortcut, _event| {
            // Emit an event to the frontend with the action
            if let Err(e) = app_clone.emit("shortcut-triggered", action_clone.clone()) {
                eprintln!("Failed to emit shortcut event: {}", e);
            }
        })
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;
    
    // Track registered shortcuts (mirror stays duplicate-free)
    if let Some(state) = app.try_state::<ShortcutState>()
        && let Ok(mut registered) = state.registered.lock()
        && !registered.contains(&shortcut)
    {
        registered.push(shortcut);
    }
    
    Ok(())
}

/// Unregister a global keyboard shortcut
#[tauri::command]
pub async fn unregister_shortcut(
    app: AppHandle,
    shortcut: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    
    // Parse the shortcut string
    let parsed_shortcut = shortcut.parse::<Shortcut>()
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;
    
    // Unregister the shortcut
    app.global_shortcut()
        .unregister(parsed_shortcut)
        .map_err(|e| format!("Failed to unregister shortcut: {}", e))?;
    
    // Remove from tracked shortcuts
    if let Some(state) = app.try_state::<ShortcutState>() {
        if let Ok(mut registered) = state.registered.lock() {
            registered.retain(|s| s != &shortcut);
        }
    }
    
    Ok(())
}

/// Unregister all shortcuts
#[tauri::command]
pub async fn unregister_all_shortcuts(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister all shortcuts: {}", e))?;
    
    // Clear tracked shortcuts
    if let Some(state) = app.try_state::<ShortcutState>() {
        if let Ok(mut registered) = state.registered.lock() {
            registered.clear();
        }
    }
    
    Ok(())
}

/// Check if a shortcut is registered
#[tauri::command]
pub async fn is_shortcut_registered(
    app: AppHandle,
    shortcut: String,
) -> Result<bool, String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    
    // Parse the shortcut string
    let parsed_shortcut = shortcut.parse::<Shortcut>()
        .map_err(|e| format!("Invalid shortcut format: {}", e))?;
    
    Ok(app.global_shortcut().is_registered(parsed_shortcut))
}
