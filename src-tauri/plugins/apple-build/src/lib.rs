//! Compiles a plugin's Swift bridge for Cargo's target; build scripts run on the host, so the target comes from env.

use std::{env, ffi::OsString, fs, path::{Path, PathBuf}, process::Command};

/// Minimum macOS when Cargo does not set one (`bundle.macOS.minimumSystemVersion`).
const DEFAULT_MACOS: &str = "26.0";
/// Minimum iOS when Cargo does not set one (`bundle.iOS.minimumSystemVersion`).
const DEFAULT_IOS: &str = "26.0";
/// The protocols whose conformances the compiler records for App Intents: Xcode's own list.
const APP_INTENTS_PROTOCOLS: &[&str] = &[
    "AppIntent", "EntityQuery", "AppEntity", "TransientEntity", "AppEnum", "AppShortcutProviding", "AppShortcutsProvider",
    "AnyResolverProviding", "AppIntentsPackage", "DynamicOptionsProvider", "_IntentValueRepresentable", "_AssistantIntentsProvider",
    "_GenerativeFunctionExtractable", "IntentValueQuery", "Resolver",
];

/// A Swift static library linked into the crate that builds it.
pub struct SwiftLibrary<'a> {
    /// Output library name: `lib<name>.a`, linked as `static=<name>`.
    pub name: &'a str,
    pub module: &'a str,
    /// Swift files, relative to the crate's manifest directory.
    pub sources: &'a [&'a str],
    pub frameworks: &'a [&'a str],
}

/// The `swiftc -target` triple and the `xcrun --sdk` it builds against.
#[derive(Debug, PartialEq, Eq)]
pub struct SwiftTarget {
    pub triple: String,
    pub sdk: &'static str,
    /// The minimum OS version in the triple.
    pub deployment: String,
}

impl SwiftLibrary<'_> {
    /// Compiles and links the library when the target is Apple; does nothing otherwise.
    pub fn build(&self) {
        let Some(target) = self.target() else { return };
        self.compile(&target, &[]);
        self.link();
    }

    /// Like [`build`](Self::build) for a library of App Intents, whose index the system reads them from is written to
    /// `resources/Metadata.appintents` for the app bundle `bundle_id` to carry.
    pub fn build_with_app_intents(&self, bundle_id: &str, resources: &Path) {
        let Some(target) = self.target() else { return };
        let values = out_dir().join(format!("{}.swiftconstvalues", self.module));
        let protocols = out_dir().join("app-intents-protocols.json");
        fs::write(&protocols, protocols_json()).expect("write the App Intents protocol list");
        self.compile(&target, &const_value_args(&values, &protocols));
        self.extract_intents(&target, &values, bundle_id, resources);
        self.link();
    }

    /// The Swift target for Cargo's target; `None` when it isn't Apple.
    fn target(&self) -> Option<SwiftTarget> {
        println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");
        println!("cargo:rerun-if-env-changed=IPHONEOS_DEPLOYMENT_TARGET");
        if env::var("CARGO_CFG_TARGET_VENDOR").as_deref() != Ok("apple") {
            return None;
        }
        let rust_target = env::var("TARGET").expect("TARGET is not set");
        let macos = env::var("MACOSX_DEPLOYMENT_TARGET").unwrap_or_else(|_| DEFAULT_MACOS.into());
        let ios = env::var("IPHONEOS_DEPLOYMENT_TARGET").unwrap_or_else(|_| DEFAULT_IOS.into());
        let target = swift_target(&rust_target, &macos, &ios)
            .unwrap_or_else(|| panic!("no Swift target for {rust_target} ({})", self.module));
        Some(target)
    }

    fn compile(&self, target: &SwiftTarget, extra: &[OsString]) {
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is not set"));
        let library = out_dir().join(format!("lib{}.a", self.name));
        // `xcrun` so the selected Xcode toolchain wins over any Swift.org toolchain on PATH.
        // Release matches the Rust side (`opt-level = "s"`): optimise for size.
        let optimize = env::var("PROFILE").is_ok_and(|profile| profile == "release");
        let status = Command::new("xcrun")
            .args(["--sdk", target.sdk, "swiftc", "-emit-library", "-static"])
            .args(optimize.then_some("-Osize"))
            .args(["-module-name", self.module, "-target", &target.triple, "-o"])
            .arg(&library)
            .args(self.sources.iter().map(|source| manifest_dir.join(source)))
            .args(extra)
            .status()
            .unwrap_or_else(|error| panic!("xcrun swiftc is required to compile {}: {error}", self.module));
        assert!(status.success(), "Swift compilation of {} failed", self.module);
    }

    /// Apple's App Intents metadata processor, as Xcode runs it, over the compiled module's const values.
    fn extract_intents(&self, target: &SwiftTarget, values: &Path, bundle_id: &str, resources: &Path) {
        let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is not set"));
        let sources = out_dir().join(format!("{}.sources", self.module));
        let source_paths: Vec<String> = self.sources.iter().map(|s| manifest_dir.join(s).display().to_string()).collect();
        fs::write(&sources, source_paths.join("\n")).expect("write the App Intents source list");
        let values_list = out_dir().join(format!("{}.constvalues", self.module));
        fs::write(&values_list, values.display().to_string()).expect("write the App Intents const values list");
        let resources = manifest_dir.join(resources);
        fs::create_dir_all(&resources).expect("create the App Intents metadata folder");
        println!("cargo:rerun-if-changed={}", resources.join("Metadata.appintents").display());
        let status = Command::new("xcrun")
            .args(["appintentsmetadataprocessor", "--force", "--module-name", self.module, "--bundle-identifier", bundle_id])
            .args(["--toolchain-dir", &toolchain_dir(), "--sdk-root", &xcrun_output(&["--sdk", target.sdk, "--show-sdk-path"])])
            .args(["--xcode-version", &xcode_build_version(), "--platform-family", platform_family(target.sdk)])
            .args(["--deployment-target", &target.deployment, "--target-triple", &target.triple])
            .arg("--source-file-list").arg(&sources)
            .arg("--swift-const-vals-list").arg(&values_list)
            .arg("--output").arg(&resources)
            .status()
            .unwrap_or_else(|error| panic!("xcrun appintentsmetadataprocessor is required for {}: {error}", self.module));
        assert!(status.success(), "App Intents metadata extraction for {} failed", self.module);
    }

    fn link(&self) {
        println!("cargo:rustc-link-search=native={}", out_dir().display());
        println!("cargo:rustc-link-lib=static={}", self.name);
        for framework in self.frameworks {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        for source in self.sources {
            println!("cargo:rerun-if-changed={source}");
        }
    }
}

fn out_dir() -> PathBuf {
    PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"))
}

/// The compiler flags Xcode adds so the compiler records the App Intents types for the metadata processor.
fn const_value_args(values: &Path, protocols: &Path) -> Vec<OsString> {
    let mut args: Vec<OsString> = ["-wmo", "-emit-const-values-path"].map(OsString::from).to_vec();
    args.push(values.into());
    args.extend(["-Xfrontend", "-const-gather-protocols-file", "-Xfrontend"].map(OsString::from));
    args.push(protocols.into());
    args
}

fn protocols_json() -> String {
    let names: Vec<String> = APP_INTENTS_PROTOCOLS.iter().map(|name| format!("\"{name}\"")).collect();
    format!("[{}]", names.join(","))
}

/// The selected Xcode toolchain: three levels above its `swiftc` (`<toolchain>/usr/bin/swiftc`).
fn toolchain_dir() -> String {
    let swiftc = PathBuf::from(xcrun_output(&["--find", "swiftc"]));
    let toolchain = swiftc.ancestors().nth(3).expect("swiftc sits in <toolchain>/usr/bin");
    toolchain.display().to_string()
}

/// Xcode's build version (`27B52`), from `xcodebuild -version`.
fn xcode_build_version() -> String {
    let version = xcrun_output(&["xcodebuild", "-version"]);
    let build = version.lines().find_map(|line| line.strip_prefix("Build version "));
    build.expect("xcodebuild -version names its build").trim().to_string()
}

fn platform_family(sdk: &str) -> &'static str {
    if sdk == "macosx" { "macOS" } else { "iOS" }
}

fn xcrun_output(args: &[&str]) -> String {
    let output = Command::new("xcrun").args(args).output().unwrap_or_else(|error| panic!("xcrun {args:?} failed: {error}"));
    assert!(output.status.success(), "xcrun {args:?} failed");
    String::from_utf8(output.stdout).expect("xcrun prints UTF-8").trim().to_string()
}

/// Maps a Rust Apple target to its Swift triple and SDK; `None` for targets Roci does not ship.
pub fn swift_target(rust_target: &str, macos: &str, ios: &str) -> Option<SwiftTarget> {
    let (triple, sdk, deployment) = match rust_target {
        "aarch64-apple-darwin" => (format!("arm64-apple-macosx{macos}"), "macosx", macos),
        "x86_64-apple-darwin" => (format!("x86_64-apple-macosx{macos}"), "macosx", macos),
        "aarch64-apple-ios" => (format!("arm64-apple-ios{ios}"), "iphoneos", ios),
        "aarch64-apple-ios-sim" => (format!("arm64-apple-ios{ios}-simulator"), "iphonesimulator", ios),
        "x86_64-apple-ios" => (format!("x86_64-apple-ios{ios}-simulator"), "iphonesimulator", ios),
        _ => return None,
    };
    Some(SwiftTarget { triple, sdk, deployment: deployment.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapped(rust_target: &str) -> Option<(String, &'static str)> {
        swift_target(rust_target, DEFAULT_MACOS, DEFAULT_IOS).map(|target| (target.triple, target.sdk))
    }

    #[test]
    fn maps_macos_targets() {
        assert_eq!(mapped("aarch64-apple-darwin"), Some(("arm64-apple-macosx26.0".into(), "macosx")));
        assert_eq!(mapped("x86_64-apple-darwin"), Some(("x86_64-apple-macosx26.0".into(), "macosx")));
    }

    #[test]
    fn maps_ios_device_and_simulator_targets() {
        assert_eq!(mapped("aarch64-apple-ios"), Some(("arm64-apple-ios26.0".into(), "iphoneos")));
        assert_eq!(mapped("aarch64-apple-ios-sim"), Some(("arm64-apple-ios26.0-simulator".into(), "iphonesimulator")));
        assert_eq!(mapped("x86_64-apple-ios"), Some(("x86_64-apple-ios26.0-simulator".into(), "iphonesimulator")));
    }

    #[test]
    fn uses_the_given_deployment_targets() {
        let target = swift_target("aarch64-apple-ios", "26.0", "26.1").unwrap();
        assert_eq!(target.triple, "arm64-apple-ios26.1");
        let target = swift_target("aarch64-apple-darwin", "26.1", "26.0").unwrap();
        assert_eq!(target.triple, "arm64-apple-macosx26.1");
    }

    #[test]
    fn ignores_unshipped_targets() {
        assert_eq!(mapped("x86_64-unknown-linux-gnu"), None);
        assert_eq!(mapped("aarch64-apple-tvos"), None);
    }
}
