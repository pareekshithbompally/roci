const COMMANDS: &[&str] = &[
    // Init / maintenance
    "initialize",
    "index_stats",
    // Meeting domain
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
    "items_page",
    "items_by_id",
    "items_count",
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
    // RAG indexing (chat)
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
