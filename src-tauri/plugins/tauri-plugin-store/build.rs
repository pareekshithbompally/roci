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
    "meetings_upsert",
    "meetings_delete",
    "meetings_create",
    "meetings_set_status",
    "transcripts_save",
    "summaries_save",
    // Recordings
    "recordings_upsert",
    "recordings_list_for_meeting",
    "recordings_list_orphan",
    "recordings_delete",
    // Categories
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
    // Notes, Todos, Reminders
    "notes_list",
    "notes_upsert",
    "notes_delete",
    "todos_list_for_meeting",
    "todos_list_global",
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
    "meetings_search",
    "get_stale_meetings",
    "get_meetings_needing_embeddings",
    "mark_meeting_embedded",
    "mark_meeting_content_indexed",
    // RAG indexing (chat)
    "mark_chat_content_indexed",
    "mark_chat_indexed",
    "upsert_chat_chunks",
    "delete_chat_session",
    "chat_is_stale",
    "chats_get_stale",
    "get_chats_needing_embeddings",
    "mark_chat_embedded",
    "chats_search",
    // Spotlight
    "spotlight_search",
    // Usage
    "insert_usage",
    "get_usage_summary",
    "get_meeting_usage",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
