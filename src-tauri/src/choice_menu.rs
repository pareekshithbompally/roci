//! The native menu (native/choice_menu.m): icon rows with a subtitle and a checkmark, switch rows that keep it open, and
//! submenus — what Tauri's menu items can't do. Returns what was picked and switched.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use tauri::AppHandle;

unsafe extern "C" {
    fn roci_menu(json: *const c_char, x: f64, y: f64, icon_size: f64, red: f64, green: f64, blue: f64) -> *mut c_char;
    fn roci_menu_free_string(value: *mut c_char);
}

/// Shows `entries` (JSON rows) at `x, y` in the window, switches on in `accent` (sRGB 0–1); resolves
/// `{"chosen": id | null, "toggled": {id: bool}}` as JSON once it closes.
#[tauri::command]
pub async fn native_menu(app: AppHandle, entries: String, x: f64, y: f64, icon_size: f64, accent: [f64; 3]) -> Result<String, String> {
    let json = CString::new(entries).map_err(|e| format!("menu entries: {e}"))?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    // AppKit menus run on the main thread; it blocks there until the menu closes.
    app.run_on_main_thread(move || {
        // SAFETY: `json` is a valid NUL-terminated string that outlives the call; the result is a C string we free once copied.
        let result = unsafe {
            let [red, green, blue] = accent;
            let raw = roci_menu(json.as_ptr(), x, y, icon_size, red, green, blue);
            let text = CStr::from_ptr(raw).to_string_lossy().into_owned();
            roci_menu_free_string(raw);
            text
        };
        let _ = sender.send(result);
    })
    .map_err(|e| format!("could not show the menu: {e}"))?;
    receiver.await.map_err(|e| format!("menu closed without an answer: {e}"))
}
