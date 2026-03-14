const COMMANDS: &[&str] = &[
    "spawn_llama_server",
    "kill_llama_server",
    "kill_all_llama_servers",
    "get_random_port",
    "read_gguf_metadata",
    "check_server_health",
    "download_file",
    "cancel_download",
    "extract_archive",
    "remove_quarantine",
    "fix_lib_symlinks",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .build();
}
