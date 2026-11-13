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
    }

    tauri_build::build()
}
