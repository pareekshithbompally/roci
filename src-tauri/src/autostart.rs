use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Enable auto-launch on system startup
#[tauri::command]
pub async fn enable_autostart(app: AppHandle) -> Result<(), String> {
    let autostart_manager = app.autolaunch();
    
    autostart_manager
        .enable()
        .map_err(|e| format!("Failed to enable autostart: {}", e))?;
    
    log::info!("Autostart enabled");
    Ok(())
}

/// Disable auto-launch on system startup
#[tauri::command]
pub async fn disable_autostart(app: AppHandle) -> Result<(), String> {
    let autostart_manager = app.autolaunch();
    
    autostart_manager
        .disable()
        .map_err(|e| format!("Failed to disable autostart: {}", e))?;
    
    log::info!("Autostart disabled");
    Ok(())
}

/// Check if auto-launch is enabled
#[tauri::command]
pub async fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    let autostart_manager = app.autolaunch();
    
    autostart_manager
        .is_enabled()
        .map_err(|e| format!("Failed to check autostart status: {}", e))
}
