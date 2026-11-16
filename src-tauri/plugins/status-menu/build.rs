//! Compiles the Swift status menu into a static library (macOS only), as the calendar plugin does.

fn main() {
    #[cfg(target_os = "macos")]
    {
        use std::{env, path::PathBuf, process::Command};

        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
        let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
        let source = manifest_dir.join("swift/StatusMenu.swift");
        let library = out_dir.join("libstatus_menu.a");

        // `xcrun` so the xcode-select toolchain wins over any Swift.org toolchain on PATH.
        let mut swiftc = Command::new("xcrun");
        swiftc.args(["swiftc", "-emit-library", "-static", "-module-name", "StatusMenu", "-o"]).arg(&library).arg(&source);
        // The same oldest macOS rustc builds for (`tauri build` sets it from `bundle.macOS.minimumSystemVersion`),
        // so system symbols newer than it are weak and the app still launches there.
        if let Ok(version) = env::var("MACOSX_DEPLOYMENT_TARGET") {
            let arch = match env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
                "aarch64" => "arm64".to_string(),
                other => other.to_string(),
            };
            swiftc.args(["-target", &format!("{arch}-apple-macos{version}")]);
        }
        let status = swiftc
            .status()
            .expect("xcrun swiftc is required to compile the status menu");
        assert!(status.success(), "Swift compilation of the status menu failed");

        println!("cargo:rustc-link-search=native={}", out_dir.display());
        println!("cargo:rustc-link-lib=static=status_menu");
        for framework in ["AppKit", "Foundation"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rerun-if-changed=swift/StatusMenu.swift");
        println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");
    }
}
