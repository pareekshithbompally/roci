const COMMANDS: &[&str] = &[
    "request_access",
    "check_access",
    "get_upcoming_events",
    "get_events_in_range",
    "reminders_request_access",
    "reminders_check_access",
    "reminders_lists",
    "reminders_ensure_list",
    "reminders_upsert",
    "reminders_states",
];

fn main() {
    // Compile Swift bridge for macOS
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        use std::env;
        use std::path::PathBuf;

        let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
        let swift_src = PathBuf::from(&manifest_dir).join("swift");
        let out_dir = env::var("OUT_DIR").unwrap();
        let lib_path = PathBuf::from(&out_dir).join("libcalendar_bridge.a");

        // `xcrun` so the xcode-select toolchain wins over any Swift.org toolchain on PATH.
        let status = Command::new("xcrun")
            .arg("swiftc")
            .args([
                "-emit-library",
                "-static",
                "-module-name", "CalendarBridge",
                "-o", lib_path.to_str().unwrap(),
                swift_src.join("CalendarBridge.swift").to_str().unwrap(),
                swift_src.join("RemindersBridge.swift").to_str().unwrap(),
                "-framework", "EventKit",
                "-framework", "Foundation",
            ])
            .status()
            .expect("Failed to compile Swift CalendarBridge. Is Xcode installed?");

        assert!(status.success(), "Swift compilation failed");

        println!("cargo:rustc-link-search=native={}", out_dir);
        println!("cargo:rustc-link-lib=static=calendar_bridge");
        println!("cargo:rustc-link-lib=framework=EventKit");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rerun-if-changed=swift/CalendarBridge.swift");
        println!("cargo:rerun-if-changed=swift/RemindersBridge.swift");
    }

    tauri_plugin::Builder::new(COMMANDS).build();
}
