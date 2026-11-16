const COMMANDS: &[&str] = &[];

fn main() {
    apple_build::SwiftLibrary {
        name: "core_spotlight_bridge",
        module: "CoreSpotlightBridge",
        sources: &["swift/CoreSpotlightBridge.swift"],
        frameworks: &["CoreSpotlight", "AppKit", "Foundation", "UniformTypeIdentifiers"],
    }
    .build();
    tauri_plugin::Builder::new(COMMANDS).build();
}
