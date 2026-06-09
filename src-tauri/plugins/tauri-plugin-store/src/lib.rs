mod commands;
mod graph;
mod schema;
mod search;
mod spotlight;

use commands::VectorDbState;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

/// Initialize the store Tauri plugin.
///
/// Registers commands for unified SQLite storage operations: initialization,
/// meeting/chunk upsert, hybrid search (KNN + FTS5 + RRF), and maintenance.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("store")
        .invoke_handler(tauri::generate_handler![
            commands::initialize,
            commands::upsert_meeting,
            commands::upsert_chunks,
            commands::delete_meeting,
            commands::search,
            commands::get_stale_meetings,
            commands::get_meetings_needing_embeddings,
            commands::get_meetings_needing_extraction,
            commands::mark_meeting_embedded,
            commands::mark_meeting_extracted,
            commands::mark_meeting_content_indexed,
            commands::mark_chat_content_indexed,
            commands::get_indexed_ids,
            commands::get_stats,
            commands::get_meta,
            commands::rebuild,
            commands::rebuild_fts,
            commands::graph_upsert,
            commands::graph_traverse,
            commands::graph_neighbors,
            commands::graph_search,
            commands::graph_delete_meeting,
            commands::graph_stats,
            commands::graph_extracted_meeting_ids,
            commands::insert_usage,
            commands::get_usage_summary,
            commands::upsert_chat_session,
            commands::upsert_chat_chunks,
            commands::delete_chat_session,
            commands::is_chat_session_stale,
            commands::get_stale_chat_sessions,
            commands::get_chats_needing_embeddings,
            commands::mark_chat_embedded,
            commands::search_chats,
            commands::spotlight_search,
        ])
        .setup(|app, _api| {
            app.manage(VectorDbState::default());
            Ok(())
        })
        .build()
}
