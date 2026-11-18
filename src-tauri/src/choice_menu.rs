//! The native choice menu (native/choice_menu.m): rows with an icon and a checkmark, which Tauri's menu items can't combine.

use std::ffi::CString;
use std::os::raw::c_char;

use tauri::AppHandle;

unsafe extern "C" {
    fn roci_choice_menu(json: *const c_char, x: f64, y: f64, icon_size: f64) -> i32;
}

/// Shows `entries` (JSON rows) at `x, y` in the window and returns the chosen row's index, or -1 when dismissed.
#[tauri::command]
pub async fn choice_menu(app: AppHandle, entries: String, x: f64, y: f64, icon_size: f64) -> Result<i32, String> {
    let json = CString::new(entries).map_err(|e| format!("menu entries: {e}"))?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    // AppKit menus run on the main thread; it blocks there until the menu closes.
    app.run_on_main_thread(move || {
        // SAFETY: `json` is a valid NUL-terminated string that outlives the call.
        let chosen = unsafe { roci_choice_menu(json.as_ptr(), x, y, icon_size) };
        let _ = sender.send(chosen);
    })
    .map_err(|e| format!("could not show the menu: {e}"))?;
    receiver.await.map_err(|e| format!("menu closed without an answer: {e}"))
}
