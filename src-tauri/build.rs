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

        println!("cargo:rerun-if-changed=icons");

        compile_permission_guide();
    }

    tauri_build::build()
}

/// Compiles the native permission guide (native/permission_guide.m) with ARC.
#[cfg(target_os = "macos")]
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
