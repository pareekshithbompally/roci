//! Compiles a plugin's Swift bridge for Cargo's target; build scripts run on the host, so the target comes from env.

use std::{env, path::PathBuf, process::Command};

/// Minimum macOS when Cargo does not set one (`bundle.macOS.minimumSystemVersion`).
const DEFAULT_MACOS: &str = "15.0";
/// Minimum iOS when Cargo does not set one (`bundle.iOS.minimumSystemVersion`).
const DEFAULT_IOS: &str = "18.0";

/// A Swift static library linked into the crate that builds it.
pub struct SwiftLibrary<'a> {
    /// Output library name: `lib<name>.a`, linked as `static=<name>`.
    pub name: &'a str,
    pub module: &'a str,
    /// Swift files, relative to the crate's manifest directory.
    pub sources: &'a [&'a str],
    pub frameworks: &'a [&'a str],
    /// Frameworks newer than the minimum OS, linked weak so the app still launches without them.
    pub weak_frameworks: &'a [&'a str],
}

/// The `swiftc -target` triple and the `xcrun --sdk` it builds against.
#[derive(Debug, PartialEq, Eq)]
pub struct SwiftTarget {
    pub triple: String,
    pub sdk: &'static str,
}

impl SwiftLibrary<'_> {
    /// Compiles and links the library when the target is Apple; does nothing otherwise.
    pub fn build(&self) {
        println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");
        println!("cargo:rerun-if-env-changed=IPHONEOS_DEPLOYMENT_TARGET");
        if env::var("CARGO_CFG_TARGET_VENDOR").as_deref() != Ok("apple") {
            return;
        }
        let rust_target = env::var("TARGET").expect("TARGET is not set");
        let macos = env::var("MACOSX_DEPLOYMENT_TARGET").unwrap_or_else(|_| DEFAULT_MACOS.into());
        let ios = env::var("IPHONEOS_DEPLOYMENT_TARGET").unwrap_or_else(|_| DEFAULT_IOS.into());
        let target = swift_target(&rust_target, &macos, &ios)
            .unwrap_or_else(|| panic!("no Swift target for {rust_target} ({})", self.module));
        self.compile(&target);
        self.link();
    }

    fn compile(&self, target: &SwiftTarget) {
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is not set"));
        let library = out_dir().join(format!("lib{}.a", self.name));
        // `xcrun` so the selected Xcode toolchain wins over any Swift.org toolchain on PATH.
        let status = Command::new("xcrun")
            .args(["--sdk", target.sdk, "swiftc", "-emit-library", "-static"])
            .args(["-module-name", self.module, "-target", &target.triple, "-o"])
            .arg(&library)
            .args(self.sources.iter().map(|source| manifest_dir.join(source)))
            .status()
            .unwrap_or_else(|error| panic!("xcrun swiftc is required to compile {}: {error}", self.module));
        assert!(status.success(), "Swift compilation of {} failed", self.module);
    }

    fn link(&self) {
        println!("cargo:rustc-link-search=native={}", out_dir().display());
        println!("cargo:rustc-link-lib=static={}", self.name);
        for framework in self.frameworks {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        for framework in self.weak_frameworks {
            println!("cargo:rustc-link-arg=-Wl,-weak_framework,{framework}");
        }
        for source in self.sources {
            println!("cargo:rerun-if-changed={source}");
        }
    }
}

fn out_dir() -> PathBuf {
    PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"))
}

/// Maps a Rust Apple target to its Swift triple and SDK; `None` for targets Roci does not ship.
pub fn swift_target(rust_target: &str, macos: &str, ios: &str) -> Option<SwiftTarget> {
    let (triple, sdk) = match rust_target {
        "aarch64-apple-darwin" => (format!("arm64-apple-macosx{macos}"), "macosx"),
        "x86_64-apple-darwin" => (format!("x86_64-apple-macosx{macos}"), "macosx"),
        "aarch64-apple-ios" => (format!("arm64-apple-ios{ios}"), "iphoneos"),
        "aarch64-apple-ios-sim" => (format!("arm64-apple-ios{ios}-simulator"), "iphonesimulator"),
        "x86_64-apple-ios" => (format!("x86_64-apple-ios{ios}-simulator"), "iphonesimulator"),
        _ => return None,
    };
    Some(SwiftTarget { triple, sdk })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapped(rust_target: &str) -> Option<(String, &'static str)> {
        swift_target(rust_target, DEFAULT_MACOS, DEFAULT_IOS).map(|target| (target.triple, target.sdk))
    }

    #[test]
    fn maps_macos_targets() {
        assert_eq!(mapped("aarch64-apple-darwin"), Some(("arm64-apple-macosx15.0".into(), "macosx")));
        assert_eq!(mapped("x86_64-apple-darwin"), Some(("x86_64-apple-macosx15.0".into(), "macosx")));
    }

    #[test]
    fn maps_ios_device_and_simulator_targets() {
        assert_eq!(mapped("aarch64-apple-ios"), Some(("arm64-apple-ios18.0".into(), "iphoneos")));
        assert_eq!(mapped("aarch64-apple-ios-sim"), Some(("arm64-apple-ios18.0-simulator".into(), "iphonesimulator")));
        assert_eq!(mapped("x86_64-apple-ios"), Some(("x86_64-apple-ios18.0-simulator".into(), "iphonesimulator")));
    }

    #[test]
    fn uses_the_given_deployment_targets() {
        let target = swift_target("aarch64-apple-ios", "14.0", "26.1").unwrap();
        assert_eq!(target.triple, "arm64-apple-ios26.1");
        let target = swift_target("aarch64-apple-darwin", "26.0", "18.0").unwrap();
        assert_eq!(target.triple, "arm64-apple-macosx26.0");
    }

    #[test]
    fn ignores_unshipped_targets() {
        assert_eq!(mapped("x86_64-unknown-linux-gnu"), None);
        assert_eq!(mapped("aarch64-apple-tvos"), None);
    }
}
