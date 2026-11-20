mod asset_adoption;
mod assets;
mod changes;
mod commands;
#[cfg(test)]
mod consistency;
mod error;
pub mod index;
mod meeting_steps;
mod pipeline;
mod retention;
mod schema;
mod search;
mod session_search;
mod usage;

pub use changes::{meeting_detail, meeting_ids, on_chat_saved, on_meeting_change, MeetingChange};
pub use commands::ChatSearchHit;
pub use search::SearchHit;
pub use commands::{MeetingCreateInput, MeetingDetail, MeetingStatus, NoteRow, SummaryRow, TodoRow, TranscriptRow};
pub use meeting_steps::interrupted_meetings;
pub use pipeline::{create_meeting, delete_meeting, meetings_with_status, set_meeting_status};
pub use error::StoreError;

use commands::StoreState;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

/// Rust → webview: a meeting was saved or deleted. The one event the meeting screens follow; the payload names the meeting,
/// the screens read it again.
pub const MEETING_CHANGED_EVENT: &str = "meeting://changed";

#[derive(Clone, serde::Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
struct MeetingChanged {
    id: String,
    deleted: bool,
}

fn announce_meeting_changes<R: Runtime>(app: tauri::AppHandle<R>) {
    on_meeting_change(move |change| {
        let payload = match change {
            MeetingChange::Saved(id) => MeetingChanged { id: id.clone(), deleted: false },
            MeetingChange::Deleted(id) => MeetingChanged { id: id.clone(), deleted: true },
        };
        if let Err(error) = tauri::Emitter::emit(&app, MEETING_CHANGED_EVENT, payload) {
            log::warn!("[store] meeting change not announced: {}", error);
        }
    });
}

/// Initialize the store Tauri plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("store")
        .invoke_handler(tauri::generate_handler![
            // Init / maintenance
            commands::initialize,
            commands::index_stats,
            // Meeting domain (Phase 1)
            commands::meetings_get,
            commands::meetings_existing,
            commands::meetings_upsert,
            commands::meetings_delete,
            commands::meetings_create,
            meeting_steps::meetings_begin_step,
            meeting_steps::meetings_end_step,
            meeting_steps::meetings_rename,
            commands::transcripts_save,
            commands::summaries_save,
            // Assets
            assets::assets_create,
            assets::assets_page,
            assets::assets_count,
            assets::assets_exists,
            assets::notices_owed,
            assets::notices_cleared,
            retention::storage_purge,
            usage::storage_usage,
            // Categories (Phase 1)
            commands::categories_list,
            commands::categories_rename,
            commands::categories_create,
            commands::categories_delete,
            // Chat domain (Phase 2)
            commands::items_page,
            commands::items_by_id,
            commands::items_count,
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
            // Chat indexing
            // Spotlight
            commands::search_sessions,
            // Usage
            commands::insert_usage,
            commands::get_usage_summary,
            commands::get_meeting_usage,
            commands::price_unpriced_usage,
        ])
        .setup(|app, _api| {
            app.manage(StoreState::default());
            announce_meeting_changes(app.clone());
            Ok(())
        })
        .build()
}
