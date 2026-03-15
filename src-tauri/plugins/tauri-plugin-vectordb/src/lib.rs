mod commands;
mod graph;
mod schema;
mod search;

use commands::VectorDbState;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

/// Initialize the vectordb Tauri plugin.
///
/// Registers commands for vector database operations: initialization,
/// meeting/chunk upsert, hybrid search (KNN + FTS5 + RRF), and maintenance.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vectordb")
        .invoke_handler(tauri::generate_handler![
            commands::initialize,
            commands::upsert_meeting,
            commands::upsert_chunks,
            commands::delete_meeting,
            commands::search,
            commands::get_stale_meetings,
            commands::get_indexed_ids,
            commands::get_stats,
            commands::get_meta,
            commands::rebuild,
            commands::graph_upsert,
            commands::graph_traverse,
            commands::graph_neighbors,
            commands::graph_search,
            commands::graph_delete_meeting,
            commands::graph_stats,
        ])
        .setup(|app, _api| {
            app.manage(VectorDbState::default());
            Ok(())
        })
        .build()
}
