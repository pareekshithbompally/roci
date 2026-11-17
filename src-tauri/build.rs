fn main() {
    // Build scripts run on the host: the target OS comes from Cargo, not from `cfg`.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        link_macos_swift_runtime();
        compile_permission_guide();
    }
    emit_identity();
    println!("cargo:rerun-if-changed=icons");

    tauri_build::build()
}

/// `productName` and `identifier` from tauri.conf.json as `env!("APP_NAME")` / `env!("APP_IDENTIFIER")`.
fn emit_identity() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    let text = std::fs::read_to_string("tauri.conf.json").expect("read tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(&text).expect("parse tauri.conf.json");
    for (key, var) in [("productName", "APP_NAME"), ("identifier", "APP_IDENTIFIER")] {
        let value = conf[key].as_str().unwrap_or_else(|| panic!("tauri.conf.json has no {key}"));
        println!("cargo:rustc-env={var}={value}");
    }
}

/// The system Swift runtime (in the OS since macOS 12; the minimum is 26) for the macOS app.
fn link_macos_swift_runtime() {
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}

/// Compiles the native permission guide (native/permission_guide.m) with ARC.
fn compile_permission_guide() {
    println!("cargo:rerun-if-changed=native/permission_guide.m");
    println!("cargo:rustc-link-lib=framework=AppKit");
    println!("cargo:rustc-link-lib=framework=ApplicationServices");
    println!("cargo:rustc-link-lib=framework=AVFoundation");
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
    println!("cargo:rustc-link-lib=framework=CoreImage");
    println!("cargo:rustc-link-lib=framework=IOKit");
    println!("cargo:rustc-link-lib=framework=QuartzCore");

    cc::Build::new()
        .file("native/permission_guide.m")
        .flag("-fobjc-arc")
        .compile("roci_permission_guide");
}
