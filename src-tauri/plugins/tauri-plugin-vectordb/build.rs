const COMMANDS: &[&str] = &[
    "initialize",
    "upsert_meeting",
    "upsert_chunks",
    "delete_meeting",
    "search",
    "get_stale_meetings",
    "get_meetings_needing_embeddings",
    "get_meetings_needing_extraction",
    "mark_meeting_embedded",
    "mark_meeting_extracted",
    "get_indexed_ids",
    "get_stats",
    "get_meta",
    "rebuild",
    "graph_upsert",
    "graph_traverse",
    "graph_neighbors",
    "graph_search",
    "graph_delete_meeting",
    "graph_stats",
    "graph_extracted_meeting_ids",
    "get_stale_chat_sessions",
    "get_chats_needing_embeddings",
    "mark_chat_embedded",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
