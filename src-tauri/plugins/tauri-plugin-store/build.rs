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
    // Assets & storage
    "assets_create",
    "assets_page",
    "assets_count",
    "assets_exists",
    "notices_owed",
    "notices_cleared",
    "storage_purge",
    "storage_usage",
    // Memory & knowledge graph
    "memory_graph",
    "memories_upsert",
    "memories_delete",
    "memories_delete_all",
    "knowledge_find",
    "knowledge_entity",
    "knowledge_graph",
    // Categories
    "categories_list",
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
    "providers_delete",
    // RAG indexing (meeting)
    // RAG indexing (chat)
    // Spotlight
    "search_sessions",
    // Usage
    "insert_usage",
    "get_usage_summary",
    "get_session_usage",
    "unpriced_usage",
    "set_usage_costs",
];

/// GraphQLite (vendor/graphqlite, see its VERSION): compiled from source with `SQLITE_CORE` against the bundled SQLite's own
/// header (libsqlite3-sys exports it), so its calls bind straight to the SQLite it links with and it registers like
/// sqlite-vec — no loadable library, which macOS and iOS apps can't load.
fn compile_graphqlite() {
    fn c_files(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
        for entry in std::fs::read_dir(dir).expect("read vendor/graphqlite") {
            let path = entry.expect("vendor entry").path();
            if path.is_dir() {
                c_files(&path, out);
            } else if path.extension().is_some_and(|ext| ext == "c") {
                out.push(path);
            }
        }
    }
    let root = std::path::Path::new("vendor/graphqlite");
    let mut files = Vec::new();
    c_files(&root.join("src"), &mut files);
    c_files(&root.join("parser"), &mut files);
    cc::Build::new()
        .files(&files)
        .include(root.join("src/include"))
        .include(root.join("parser"))
        .include(std::env::var("DEP_SQLITE3_INCLUDE").expect("libsqlite3-sys exports its header"))
        .define("SQLITE_CORE", None)
        .opt_level(2)
        .warnings(false)
        .compile("graphqlite");
    println!("cargo:rerun-if-changed=vendor/graphqlite");
}

fn main() {
    compile_graphqlite();
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
