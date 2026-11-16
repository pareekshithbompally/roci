//! Compiles the Swift status menu into a static library for Apple targets.

fn main() {
    apple_build::SwiftLibrary {
        name: "status_menu",
        module: "StatusMenu",
        sources: &["swift/StatusMenu.swift"],
        frameworks: &["AppKit", "Foundation"],
        weak_frameworks: &[],
    }
    .build();
}
