mod changes;
mod commands;
#[cfg(test)]
mod consistency;
mod error;
mod pipeline;
mod schema;
mod search;
mod spotlight;

pub use changes::{meeting_detail, meeting_ids, on_meeting_change, MeetingChange};
pub use commands::{MeetingCreateInput, MeetingDetail, MeetingStatus, NoteRow, SummaryRow, TodoRow, TranscriptRow};
pub use pipeline::{create_meeting, delete_meeting, meetings_with_status, set_meeting_status};
pub use error::StoreError;

use commands::StoreState;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

/// Initialize the store Tauri plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("store")
        .invoke_handler(tauri::generate_handler![
            // Init / maintenance
            commands::initialize,
            commands::get_meta,
            commands::get_stats,
            commands::rebuild,
            commands::rebuild_fts,
            commands::get_indexed_ids,
            // Meeting domain (Phase 1)
            commands::meetings_list,
            commands::meetings_get,
            commands::meetings_upsert,
            commands::meetings_delete,
            commands::meetings_create,
            commands::meetings_set_status,
            commands::transcripts_save,
            commands::summaries_save,
            // Recordings (Phase 5)
            commands::recordings_upsert,
            commands::recordings_list_for_meeting,
            commands::recordings_list_orphan,
            commands::recordings_delete,
            // Categories (Phase 1)
            commands::categories_list,
            commands::categories_rename,
            commands::categories_create,
            commands::categories_delete,
            // Chat domain (Phase 2)
            commands::chats_list,
            commands::chats_get,
            commands::chats_upsert,
            commands::chats_rename,
            commands::chats_delete,
            // Dictations
            commands::dictations_list,
            commands::dictations_create,
            commands::dictations_delete,
            // Notes, Todos, Reminders (Phase 3)
            commands::notes_list,
            commands::notes_upsert,
            commands::notes_delete,
            commands::todos_list_for_meeting,
            commands::todos_list_global,
            commands::todos_get,
            commands::todos_upsert,
            commands::todos_set_completed,
            commands::todos_delete,
            commands::reminders_upsert,
            commands::reminders_set_status,
            commands::reminders_due,
            commands::reminders_prune,
            // Settings, Providers (Phase 4)
            commands::settings_get_all,
            commands::settings_set,
            commands::providers_list,
            commands::providers_upsert,
            commands::providers_set_active,
            commands::providers_delete,
            // RAG indexing
            commands::upsert_meeting_index,
            commands::upsert_chunks,
            commands::meetings_search,
            commands::get_stale_meetings,
            commands::get_meetings_needing_embeddings,
            commands::mark_meeting_embedded,
            commands::mark_meeting_content_indexed,
            commands::mark_chat_content_indexed,
            // Chat indexing
            commands::mark_chat_indexed,
            commands::upsert_chat_chunks,
            commands::delete_chat_session,
            commands::chat_is_stale,
            commands::chats_get_stale,
            commands::get_chats_needing_embeddings,
            commands::mark_chat_embedded,
            commands::chats_search,
            // Spotlight
            commands::spotlight_search,
            // Usage
            commands::insert_usage,
            commands::get_usage_summary,
            commands::get_meeting_usage,
        ])
        .setup(|app, _api| {
            app.manage(StoreState::default());
            Ok(())
        })
        .build()
}
