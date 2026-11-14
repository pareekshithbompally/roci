const COMMANDS: &[&str] = &[
    "status",
    "request",
    "post",
    "schedule",
    "remove",
    "add_categories",
    "set_muted",
];

fn main() {
    // Compile the Swift bridge for macOS (same route as tauri-plugin-calendar).
    #[cfg(target_os = "macos")]
    {
        use std::env;
        use std::path::PathBuf;
        use std::process::Command;

        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let swift_src = PathBuf::from(&manifest_dir).join("swift");
        let out_dir = env::var("OUT_DIR").unwrap();
        let lib_path = PathBuf::from(&out_dir).join("libnotifications_bridge.a");

        // `xcrun` so the selected developer dir wins over any stray toolchain on PATH.
        let status = Command::new("xcrun")
            .arg("swiftc")
            .args([
                "-emit-library",
                "-static",
                "-module-name",
                "NotificationsBridge",
                "-o",
                lib_path.to_str().unwrap(),
                swift_src.join("NotificationsBridge.swift").to_str().unwrap(),
                "-framework",
                "UserNotifications",
                "-framework",
                "Foundation",
            ])
            .status()
            .expect("Failed to compile Swift NotificationsBridge. Is Xcode installed?");

        assert!(status.success(), "Swift compilation failed");

        println!("cargo:rustc-link-search=native={}", out_dir);
        println!("cargo:rustc-link-lib=static=notifications_bridge");
        println!("cargo:rustc-link-lib=framework=UserNotifications");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rerun-if-changed=swift/NotificationsBridge.swift");
    }

    tauri_plugin::Builder::new(COMMANDS).build();
}
