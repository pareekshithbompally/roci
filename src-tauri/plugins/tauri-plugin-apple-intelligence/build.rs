const COMMANDS: &[&str] = &[
    "availability",
    "generate",
    "speech_status",
    "speech_request_access",
    "speech_prepare",
    "speech_transcribe",
];

fn main() {
    #[cfg(target_os = "macos")]
    compile_swift();
    tauri_plugin::Builder::new(COMMANDS).build();
}

/// Builds the Swift bridges for macOS 15, weak-linking FoundationModels (macOS 26+ only).
#[cfg(target_os = "macos")]
fn compile_swift() {
    use std::{env, path::PathBuf, process::Command};

    let swift = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("swift");
    let out_dir = env::var("OUT_DIR").unwrap();
    let library = PathBuf::from(&out_dir).join("libapple_intelligence_bridge.a");
    let target = match env::var("TARGET").as_deref() {
        Ok("aarch64-apple-darwin") => "arm64-apple-macosx15.0",
        Ok("x86_64-apple-darwin") => "x86_64-apple-macosx15.0",
        Ok(other) => panic!("unsupported macOS target for the Apple Intelligence bridge: {other}"),
        Err(_) => panic!("TARGET is not set"),
    };
    let sources = ["LanguageModelBridge.swift", "SpeechBridge.swift"];

    // Through `xcrun` so the selected Xcode toolchain always wins.
    let status = Command::new("xcrun")
        .args(["swiftc", "-emit-library", "-static", "-module-name", "AppleIntelligenceBridge", "-target", target])
        .arg("-o")
        .arg(&library)
        .args(sources.iter().map(|file| swift.join(file)))
        .status()
        .expect("xcrun swiftc is required to compile the Apple Intelligence bridge");
    assert!(status.success(), "Swift compilation failed (Apple Intelligence bridge)");

    println!("cargo:rustc-link-search=native={out_dir}");
    println!("cargo:rustc-link-lib=static=apple_intelligence_bridge");
    println!("cargo:rustc-link-lib=framework=Speech");
    println!("cargo:rustc-link-lib=framework=AVFAudio");
    println!("cargo:rustc-link-arg=-Wl,-weak_framework,FoundationModels");
    for file in sources {
        println!("cargo:rerun-if-changed=swift/{file}");
    }
}
