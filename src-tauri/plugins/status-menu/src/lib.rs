//! Kasset's menu bar menu (macOS): Swift owns an `NSStatusItem` with a native `NSMenu`; this crate is its safe Rust face.
//! Rust sends the menu's state as JSON; the menu sends picked items back as action ids.

#[cfg(target_os = "macos")]
mod bridge {
    use std::ffi::{c_char, CStr, CString};
    use std::sync::OnceLock;

    extern "C" {
        fn status_menu_install(callback: extern "C" fn(*const c_char)) -> *mut c_char;
        fn status_menu_update(json: *const c_char) -> *mut c_char;
        fn status_menu_free_string(pointer: *mut c_char);
    }

    /// Where picked actions go (set once at install).
    static ON_ACTION: OnceLock<Box<dyn Fn(&str) + Send + Sync>> = OnceLock::new();

    extern "C" fn on_action(action: *const c_char) {
        if action.is_null() {
            return;
        }
        let action = unsafe { CStr::from_ptr(action) }.to_string_lossy();
        if let Some(handler) = ON_ACTION.get() {
            handler(&action);
        }
    }

    /// The bridge's `{"ok":bool,"error":?}` reply, freed after reading.
    fn reply(pointer: *mut c_char) -> Result<(), String> {
        if pointer.is_null() {
            return Err("null reply from the status menu".into());
        }
        let text = unsafe { CStr::from_ptr(pointer) }.to_string_lossy().into_owned();
        unsafe { status_menu_free_string(pointer) };
        if text.contains("\"ok\":true") {
            Ok(())
        } else {
            Err(format!("status menu: {text}"))
        }
    }

    pub fn install(on_click: impl Fn(&str) + Send + Sync + 'static) -> Result<(), String> {
        if ON_ACTION.set(Box::new(on_click)).is_err() {
            return Err("status menu already installed".into());
        }
        reply(unsafe { status_menu_install(on_action) })
    }

    pub fn update(json: &str) -> Result<(), String> {
        let json = CString::new(json).map_err(|e| format!("menu state has a NUL byte: {e}"))?;
        reply(unsafe { status_menu_update(json.as_ptr()) })
    }
}

/// Create the status item and its menu; `on_click` receives each picked action id. Call once, on the main thread.
#[cfg(target_os = "macos")]
pub use bridge::install;

/// Replace what the menu shows with `json` (`menubar::MenuState`).
#[cfg(target_os = "macos")]
pub use bridge::update;
