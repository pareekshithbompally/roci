const COMMANDS: &[&str] = &[
    "initialize",
    "upsert_meeting",
    "upsert_chunks",
    "delete_meeting",
    "search",
    "get_stale_meetings",
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
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
