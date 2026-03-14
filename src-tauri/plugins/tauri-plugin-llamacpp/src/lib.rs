mod commands;
mod download;
mod process;

use commands::LlamaCppState;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, RunEvent, Runtime,
};

/// Initialize the llama.cpp Tauri plugin.
///
/// Registers commands for server process management, port allocation,
/// GGUF metadata reading, health checking, and file downloads/extraction.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("llamacpp")
        .invoke_handler(tauri::generate_handler![
            commands::spawn_llama_server,
            commands::kill_llama_server,
            commands::kill_all_llama_servers,
            commands::get_random_port,
            commands::read_gguf_metadata,
            commands::check_server_health,
            commands::remove_quarantine,
            commands::fix_lib_symlinks,
            download::download_file,
            download::cancel_download,
            download::extract_archive,
        ])
        .setup(|app, _api| {
            app.manage(LlamaCppState::default());
            Ok(())
        })
        .on_event(|app, event| {
            // Kill all servers on app exit
            if let RunEvent::Exit = event {
                let state = app.state::<LlamaCppState>();
                let mut sessions = state.sessions.lock().unwrap();
                for (pid, (_, mut child)) in sessions.drain() {
                    log::info!("[llamacpp] Cleaning up server pid={} on exit", pid);
                    let _ = process::terminate_process(&mut child, 2000);
                }
            }
        })
        .build()
}
