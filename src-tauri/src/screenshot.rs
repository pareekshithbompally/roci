//! Screenshot capture module (macOS).
//!
//! Provides two Tauri commands:
//! - `list_capturable_windows`: returns a deduplicated list of on-screen app windows.
//! - `take_screenshot`: captures full screen or a specific window via `screencapture`.

use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

use core_foundation::base::TCFType;
use core_foundation::dictionary::CFDictionaryRef;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use core_graphics::display::{
    kCGNullWindowID, kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly,
    CGWindowListCopyWindowInfo,
};

#[derive(Debug, Clone, Serialize)]
pub struct WindowInfo {
    pub window_id: u32,
    pub app_name: String,
    pub title: String,
    pub icon_base64: Option<String>,
}

/// Extract a 32x32 PNG app icon as base64 from a PID using standard macOS CLI tools.
fn get_app_icon_base64(pid: u32) -> Option<String> {
    use base64::Engine;

    // 1. Get the executable path from PID
    let output = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output()
        .ok()?;
    let comm = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if comm.is_empty() {
        return None;
    }

    // 2. Derive .app bundle path (everything up to and including ".app")
    let app_path = if let Some(idx) = comm.find(".app/") {
        &comm[..idx + 4]
    } else if comm.ends_with(".app") {
        comm.as_str()
    } else {
        return None;
    };

    // 3. Read CFBundleIconFile from Info.plist
    let plist = format!("{}/Contents/Info.plist", app_path);
    let output = std::process::Command::new("plutil")
        .args(["-extract", "CFBundleIconFile", "raw", "-o", "-", &plist])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let mut icon_name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if icon_name.is_empty() {
        return None;
    }
    if !icon_name.ends_with(".icns") {
        icon_name.push_str(".icns");
    }

    let icns_path = format!("{}/Contents/Resources/{}", app_path, icon_name);
    if !std::path::Path::new(&icns_path).exists() {
        return None;
    }

    // 4. Convert .icns → 32x32 PNG using sips
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let tmp_png = format!("/tmp/kasset_icon_{}_{}.png", pid, ts);
    let output = std::process::Command::new("sips")
        .args(["-s", "format", "png", "-z", "32", "32", &icns_path, "--out", &tmp_png])
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    // 5. Read, encode, clean up
    let data = std::fs::read(&tmp_png).ok()?;
    let _ = std::fs::remove_file(&tmp_png);
    Some(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// Helper: extract a value from a CFDictionary by key.
unsafe fn dict_get_value(dict: CFDictionaryRef, key: &str) -> Option<core_foundation::base::CFTypeRef> {
    use core_foundation::base::kCFAllocatorDefault;
    use core_foundation::dictionary::CFDictionaryGetValue;
    use core_foundation::string::CFStringCreateWithCString;
    use std::ffi::CString;

    let c_key = CString::new(key).ok()?;
    let cf_key = CFStringCreateWithCString(kCFAllocatorDefault, c_key.as_ptr(), 0x08000100); // kCFStringEncodingUTF8
    if cf_key.is_null() {
        return None;
    }
    let value = CFDictionaryGetValue(dict, cf_key as *const _);
    core_foundation::base::CFRelease(cf_key as *const _);
    if value.is_null() {
        None
    } else {
        Some(value)
    }
}

/// List on-screen application windows, deduplicated by app name (largest window per app).
#[tauri::command]
pub fn list_capturable_windows() -> Result<Vec<WindowInfo>, String> {
    unsafe {
        let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
        let window_list = CGWindowListCopyWindowInfo(options, kCGNullWindowID);

        if window_list.is_null() {
            return Ok(Vec::new());
        }

        let count = core_foundation::array::CFArrayGetCount(window_list as _);
        // Map: app_name -> (window_id, title, area, pid)
        let mut best_per_app: HashMap<String, (u32, String, f64, u32)> = HashMap::new();

        for i in 0..count {
            let dict = core_foundation::array::CFArrayGetValueAtIndex(window_list as _, i)
                as CFDictionaryRef;

            // Filter: only normal windows (layer == 0)
            let layer = dict_get_value(dict, "kCGWindowLayer")
                .and_then(|v| {
                    let n = CFNumber::wrap_under_get_rule(v as _);
                    n.to_i32()
                })
                .unwrap_or(-1);
            if layer != 0 {
                continue;
            }

            // Must have an owner name
            let app_name = match dict_get_value(dict, "kCGWindowOwnerName") {
                Some(v) => {
                    let s = CFString::wrap_under_get_rule(v as _);
                    s.to_string()
                }
                None => continue,
            };

            // Skip empty names
            if app_name.is_empty() {
                continue;
            }

            let window_id = dict_get_value(dict, "kCGWindowNumber")
                .and_then(|v| {
                    let n = CFNumber::wrap_under_get_rule(v as _);
                    n.to_i32().map(|x| x as u32)
                })
                .unwrap_or(0);

            let pid = dict_get_value(dict, "kCGWindowOwnerPID")
                .and_then(|v| {
                    let n = CFNumber::wrap_under_get_rule(v as _);
                    n.to_i32().map(|x| x as u32)
                })
                .unwrap_or(0);

            let title = dict_get_value(dict, "kCGWindowName")
                .map(|v| {
                    let s = CFString::wrap_under_get_rule(v as _);
                    s.to_string()
                })
                .unwrap_or_default();

            // Get bounds to compute area
            let bounds_dict = dict_get_value(dict, "kCGWindowBounds");
            let area = bounds_dict
                .map(|bd| {
                    let bd = bd as CFDictionaryRef;
                    let w = dict_get_value(bd, "Width")
                        .and_then(|v| {
                            let n = CFNumber::wrap_under_get_rule(v as _);
                            n.to_f64()
                        })
                        .unwrap_or(0.0);
                    let h = dict_get_value(bd, "Height")
                        .and_then(|v| {
                            let n = CFNumber::wrap_under_get_rule(v as _);
                            n.to_f64()
                        })
                        .unwrap_or(0.0);
                    w * h
                })
                .unwrap_or(0.0);

            // Skip tiny windows (e.g. menu bar items)
            if area < 1000.0 {
                continue;
            }

            // Keep the largest window per app
            let entry = best_per_app
                .entry(app_name.clone())
                .or_insert((window_id, title.clone(), 0.0, pid));
            if area > entry.2 {
                *entry = (window_id, title, area, pid);
            }
        }

        core_foundation::base::CFRelease(window_list as _);

        let mut windows: Vec<WindowInfo> = best_per_app
            .into_iter()
            .map(|(app_name, (window_id, title, _, pid))| {
                let icon_base64 = get_app_icon_base64(pid);
                WindowInfo {
                    window_id,
                    app_name,
                    title,
                    icon_base64,
                }
            })
            .collect();

        // Sort alphabetically by app name
        windows.sort_by(|a, b| a.app_name.to_lowercase().cmp(&b.app_name.to_lowercase()));

        Ok(windows)
    }
}

/// Take a screenshot of the full screen or a specific window.
/// Returns the PNG data as a base64-encoded string.
#[tauri::command]
pub async fn take_screenshot(window_id: Option<u32>) -> Result<String, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    let tmp_path = PathBuf::from(format!("/tmp/kasset_screenshot_{}.png", timestamp));
    let tmp_str = tmp_path.to_string_lossy().to_string();

    let mut cmd = std::process::Command::new("screencapture");
    cmd.arg("-x"); // no sound

    if let Some(wid) = window_id {
        cmd.arg("-l").arg(wid.to_string());
    }

    cmd.arg(&tmp_str);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run screencapture: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("screencapture failed: {}", stderr));
    }

    // Read the PNG file
    let png_data = std::fs::read(&tmp_path)
        .map_err(|e| format!("Failed to read screenshot: {}", e))?;

    // Clean up temp file
    let _ = std::fs::remove_file(&tmp_path);

    // Encode to base64
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_data);

    Ok(b64)
}
