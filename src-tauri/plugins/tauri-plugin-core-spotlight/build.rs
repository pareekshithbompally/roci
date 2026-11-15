const COMMANDS: &[&str] = &[];

fn main() {
    // Compile the Swift bridge for macOS (same route as tauri-plugin-notifications).
    #[cfg(target_os = "macos")]
    {
        use std::env;
        use std::path::PathBuf;
        use std::process::Command;

        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let swift_src = PathBuf::from(&manifest_dir).join("swift");
        let out_dir = env::var("OUT_DIR").unwrap();
        let lib_path = PathBuf::from(&out_dir).join("libcore_spotlight_bridge.a");

        // `xcrun` so the selected developer dir wins over any stray toolchain on PATH.
        let status = Command::new("xcrun")
            .arg("swiftc")
            .args([
                "-emit-library",
                "-static",
                "-module-name",
                "CoreSpotlightBridge",
                "-o",
                lib_path.to_str().unwrap(),
                swift_src
                    .join("CoreSpotlightBridge.swift")
                    .to_str()
                    .unwrap(),
                "-framework",
                "CoreSpotlight",
                "-framework",
                "AppKit",
                "-framework",
                "Foundation",
                "-framework",
                "UniformTypeIdentifiers",
            ])
            .status()
            .expect("Failed to compile Swift CoreSpotlightBridge. Is Xcode installed?");

        assert!(status.success(), "Swift compilation failed");

        println!("cargo:rustc-link-search=native={}", out_dir);
        println!("cargo:rustc-link-lib=static=core_spotlight_bridge");
        println!("cargo:rustc-link-lib=framework=CoreSpotlight");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=UniformTypeIdentifiers");
        println!("cargo:rerun-if-changed=swift/CoreSpotlightBridge.swift");
    }

    tauri_plugin::Builder::new(COMMANDS).build();
}
