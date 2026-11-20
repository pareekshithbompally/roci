const COMMANDS: &[&str] = &[
    // Init / maintenance
    "initialize",
    "get_meta",
    "get_stats",
    "rebuild",
    "rebuild_fts",
    "get_indexed_ids",
    // Meeting domain
    "meetings_list",
    "meetings_get",
    "meetings_existing",
    "meetings_upsert",
    "meetings_delete",
    "meetings_create",
    "meetings_begin_step",
    "meetings_end_step",
    "meetings_rename",
    "transcripts_save",
    "summaries_save",
    // Recordings
    // Categories
    "assets_create",
    "assets_list",
    "assets_exists",
    "notices_owed",
    "notices_cleared",
    "storage_purge",
    "storage_usage",
    "categories_list",
    "categories_rename",
    "categories_create",
    "categories_delete",
    // Chat domain
    "chats_list",
    "chats_get",
    "chats_upsert",
    "chats_rename",
    "chats_delete",
    // Dictations
    "dictations_list",
    "dictations_create",
    "dictations_delete",
    // Notes, Todos, Reminders
    "notes_list",
    "notes_upsert",
    "notes_delete",
    "todos_list_for_meeting",
    "todos_list_global",
    "todos_get",
    "todos_upsert",
    "todos_set_completed",
    "todos_delete",
    "reminders_upsert",
    "reminders_set_status",
    "reminders_due",
    "reminders_prune",
    // Settings, Providers
    "settings_get_all",
    "settings_set",
    "providers_list",
    "providers_upsert",
    "providers_set_active",
    "providers_delete",
    // RAG indexing (meeting)
    "upsert_meeting_index",
    "upsert_chunks",
    "append_chunks",
    "meetings_search",
    "get_stale_meetings",
    "get_meetings_needing_embeddings",
    "mark_meeting_embedded",
    "mark_meeting_content_indexed",
    // RAG indexing (chat)
    "mark_chat_content_indexed",
    "mark_chat_indexed",
    "upsert_chat_chunks",
    "chat_embedded_turns",
    "chat_is_stale",
    "chats_get_stale",
    "get_chats_needing_embeddings",
    "mark_chat_embedded",
    "chats_search",
    // Spotlight
    "search_sessions",
    // Usage
    "insert_usage",
    "get_usage_summary",
    "get_meeting_usage",
    "price_unpriced_usage",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
