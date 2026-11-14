const COMMANDS: &[&str] = &["access", "upsert"];

fn main() {
    #[cfg(target_os = "macos")]
    compile_swift();
    tauri_plugin::Builder::new(COMMANDS).build();
}

/// Swift bridge → static library, targeting the app's minimum macOS (15).
#[cfg(target_os = "macos")]
fn compile_swift() {
    use std::{env, path::PathBuf, process::Command};

    let swift = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("swift/NotesBridge.swift");
    let out_dir = env::var("OUT_DIR").unwrap();
    let library = PathBuf::from(&out_dir).join("libapple_notes_bridge.a");
    let target = match env::var("TARGET").as_deref() {
        Ok("aarch64-apple-darwin") => "arm64-apple-macosx15.0",
        Ok("x86_64-apple-darwin") => "x86_64-apple-macosx15.0",
        Ok(other) => panic!("unsupported macOS target for the Apple Notes bridge: {other}"),
        Err(_) => panic!("TARGET is not set"),
    };

    // Through `xcrun` so the selected Xcode toolchain always wins.
    let status = Command::new("xcrun")
        .args(["swiftc", "-emit-library", "-static", "-module-name", "AppleNotesBridge", "-target", target])
        .arg("-o")
        .arg(&library)
        .arg(&swift)
        .status()
        .expect("xcrun swiftc is required to compile the Apple Notes bridge");
    assert!(status.success(), "Swift compilation failed (Apple Notes bridge)");

    println!("cargo:rustc-link-search=native={out_dir}");
    println!("cargo:rustc-link-lib=static=apple_notes_bridge");
    println!("cargo:rustc-link-lib=framework=AppKit");
    println!("cargo:rustc-link-lib=framework=CoreServices");
    println!("cargo:rerun-if-changed=swift/NotesBridge.swift");
}
