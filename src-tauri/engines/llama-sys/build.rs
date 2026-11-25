//! Builds `CMakeLists.txt` here (llama.cpp and Roci's shim) against the ggml transcribe-cpp-sys installed, and links every
//! static library it produced. ggml is linked once, by transcribe-cpp-sys.

use std::env;
use std::path::{Path, PathBuf};

fn main() {
    let ggml_lib = PathBuf::from(env::var("DEP_TRANSCRIBE_LIB_DIR").expect("transcribe-cpp-sys exports DEP_TRANSCRIBE_LIB_DIR"));
    let out = cmake::Config::new(env!("CARGO_MANIFEST_DIR"))
        .define("LLAMA_USE_SYSTEM_GGML", "ON")
        .define("ggml_DIR", ggml_lib.join("cmake/ggml"))
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("LLAMA_BUILD_COMMON", "ON")
        .define("LLAMA_BUILD_MTMD", "ON")
        .define("LLAMA_BUILD_TESTS", "OFF")
        .define("LLAMA_BUILD_TOOLS", "OFF")
        .define("LLAMA_BUILD_EXAMPLES", "OFF")
        .define("LLAMA_BUILD_SERVER", "OFF")
        .define("LLAMA_BUILD_APP", "OFF")
        .define("LLAMA_OPENSSL", "OFF")
        .define("LLAMA_SUBPROCESS", "OFF")
        .build_target("roci-llama")
        .build();
    link_static_libraries(&out.join("build"));
    println!("cargo:rustc-link-lib=c++");
    println!("cargo:rerun-if-changed=shim/roci_llama.cpp");
    println!("cargo:rerun-if-changed=CMakeLists.txt");
    println!("cargo:rerun-if-changed=../llama.cpp/src");
}

/// Every `lib*.a` the build produced, linked statically (the folder layout differs between CMake generators).
fn link_static_libraries(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            link_static_libraries(&path);
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        if let Some(lib) = name.strip_prefix("lib").and_then(|n| n.strip_suffix(".a")) {
            println!("cargo:rustc-link-search=native={}", dir.display());
            println!("cargo:rustc-link-lib=static={lib}");
        }
    }
}
