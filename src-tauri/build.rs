fn main() {
    // Add Swift runtime library paths for macOS
    #[cfg(target_os = "macos")]
    {
        // Add system Swift library path
        println!("cargo:rustc-link-search=native=/usr/lib/swift");
        // Add Xcode Command Line Tools Swift 5.5 runtime path
        println!("cargo:rustc-link-search=native=/Library/Developer/CommandLineTools/usr/lib/swift-5.5/macosx");
        // Add general Xcode Swift runtime path
        println!("cargo:rustc-link-search=native=/Library/Developer/CommandLineTools/usr/lib/swift/macosx");
        // Set rpath to include Swift runtime locations
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/Library/Developer/CommandLineTools/usr/lib/swift-5.5/macosx");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/Library/Developer/CommandLineTools/usr/lib/swift/macosx");

        // Compile the Swift audio bridge (all of swift/*.swift, as one module) →
        // static lib, mirroring tauri-plugin-calendar's CalendarBridge build.
        use std::path::PathBuf;
        use std::process::Command;

        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let swift_dir = PathBuf::from(&manifest_dir).join("swift");
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let lib_path = PathBuf::from(&out_dir).join("libaudio_bridge.a");

        // Gather every .swift source so adding a file needs no build.rs change.
        let mut swift_files: Vec<PathBuf> = std::fs::read_dir(&swift_dir)
            .expect("Failed to read swift/ directory")
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("swift"))
            .collect();
        swift_files.sort();

        let mut cmd = Command::new("swiftc");
        cmd.args([
            "-emit-library",
            "-static",
            "-O",
            "-module-name",
            "AudioBridge",
            "-o",
            lib_path.to_str().unwrap(),
        ]);
        for file in &swift_files {
            cmd.arg(file);
        }
        cmd.args([
            "-framework", "AVFoundation",
            "-framework", "ScreenCaptureKit",
            "-framework", "CoreMedia",
            "-framework", "Foundation",
        ]);
        let status = cmd
            .status()
            .expect("Failed to compile Swift audio bridge. Is Xcode / swiftc installed?");
        assert!(status.success(), "Swift audio bridge compilation failed");

        println!("cargo:rustc-link-search=native={}", out_dir);
        println!("cargo:rustc-link-lib=static=audio_bridge");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
        println!("cargo:rustc-link-lib=framework=CoreMedia");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rerun-if-changed=swift");
    }

    tauri_build::build()
}
