const COMMANDS: &[&str] = &["access", "upsert"];

fn main() {
    apple_build::SwiftLibrary {
        name: "apple_notes_bridge",
        module: "AppleNotesBridge",
        sources: &["swift/NotesBridge.swift"],
        frameworks: &["AppKit", "CoreServices"],
        weak_frameworks: &[],
    }
    .build();
    tauri_plugin::Builder::new(COMMANDS).build();
}
