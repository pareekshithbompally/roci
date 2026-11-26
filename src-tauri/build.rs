fn main() {
    // Build scripts run on the host: the target OS comes from Cargo, not from `cfg`.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        link_macos_swift_runtime();
        link_clang_runtime();
        compile_permission_guide();
        compile_choice_menu();
        compile_native_alert();
        compile_app_intents();
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        compile_ios_webview();
    }
    if matches!(std::env::var("CARGO_CFG_TARGET_OS").as_deref(), Ok("macos" | "ios")) {
        compile_downloads();
    }
    emit_identity();
    println!("cargo:rerun-if-changed=icons");

    tauri_build::build()
}

/// `productName` and `identifier` from tauri.conf.json as `env!("APP_NAME")` / `env!("APP_IDENTIFIER")`.
fn emit_identity() {
    for (key, var) in [("productName", "APP_NAME"), ("identifier", "APP_IDENTIFIER")] {
        println!("cargo:rustc-env={var}={}", conf_value(key));
    }
}

/// A top-level string in tauri.conf.json.
fn conf_value(key: &str) -> String {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    let text = std::fs::read_to_string("tauri.conf.json").expect("read tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(&text).expect("parse tauri.conf.json");
    conf[key].as_str().unwrap_or_else(|| panic!("tauri.conf.json has no {key}")).to_string()
}

/// Roci's actions for Spotlight, Siri and Shortcuts (native/RociIntents.swift), with the index macOS reads them from, which
/// the bundle carries as Contents/Resources/Metadata.appintents (tauri.macos.conf.json `bundle.macOS.files`).
fn compile_app_intents() {
    apple_build::SwiftLibrary {
        name: "roci_intents",
        module: "RociIntents",
        sources: &["native/RociIntents.swift"],
        frameworks: &["AppIntents"],
    }
    .build_with_app_intents(&conf_value("identifier"), std::path::Path::new("gen/appintents"));
}

/// The system Swift runtime (in the OS since macOS 12; the minimum is 26) for the macOS app.
fn link_macos_swift_runtime() {
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}

/// Clang's runtime, which the Objective-C and Swift objects expect (`__isPlatformVersionAtLeast`, behind `@available`) and
/// rustc's `-nodefaultlibs` link leaves out: linked as clang links it for any Xcode app.
fn link_clang_runtime() {
    let output = std::process::Command::new("xcrun")
        .args(["clang", "--print-file-name=libclang_rt.osx.a"])
        .output()
        .expect("xcrun clang is required to find its runtime");
    assert!(output.status.success(), "xcrun clang --print-file-name failed");
    let runtime = String::from_utf8(output.stdout).expect("clang prints a UTF-8 path");
    println!("cargo:rustc-link-arg={}", runtime.trim());
}

/// Model downloads on the system's background URLSession (native/RociDownloads.swift), Mac, iPhone and iPad alike.
fn compile_downloads() {
    apple_build::SwiftLibrary {
        name: "roci_downloads",
        module: "RociDownloads",
        sources: &["native/RociDownloads.swift"],
        frameworks: &["Foundation"],
    }
    .build();
}

/// The iOS web view's keyboard behaviour (native/RociWebView.swift): pinned page, resized above the keyboard, no form bar.
fn compile_ios_webview() {
    apple_build::SwiftLibrary {
        name: "roci_webview",
        module: "RociWebView",
        sources: &["native/RociWebView.swift"],
        frameworks: &["UIKit", "WebKit"],
    }
    .build();
}

/// Compiles the native menu (native/choice_menu.m) with ARC: icon rows, switch rows and submenus.
fn compile_choice_menu() {
    println!("cargo:rerun-if-changed=native/choice_menu.m");
    cc::Build::new()
        .file("native/choice_menu.m")
        .flag("-fobjc-arc")
        .compile("roci_choice_menu");
}

/// Compiles the system alert (native/alert.m) with ARC.
fn compile_native_alert() {
    println!("cargo:rerun-if-changed=native/alert.m");
    cc::Build::new()
        .file("native/alert.m")
        .flag("-fobjc-arc")
        .compile("roci_alert");
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
