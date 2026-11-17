//! Compiles the Swift status menu (AppKit, macOS only) into a static library.

fn main() {
    apple_build::SwiftLibrary {
        name: "status_menu",
        module: "StatusMenu",
        sources: &["swift/StatusMenu.swift"],
        frameworks: &["AppKit", "Foundation"],
    }
    .build();
}
