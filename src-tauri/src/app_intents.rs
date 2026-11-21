//! Roci's App Intents (native/RociIntents.swift) run in this process; each hands over the roci:// action it stands for.

use std::ffi::{CStr, c_char};
use std::sync::OnceLock;

use tauri::{AppHandle, Url};

use crate::url_actions;

static APP: OnceLock<AppHandle> = OnceLock::new();

unsafe extern "C" {
    fn roci_intents_setup(handler: extern "C" fn(*const c_char));
}

/// Takes the intents' actions from now on, and any that ran while Roci was starting. Called once from setup.
pub fn setup(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    unsafe { roci_intents_setup(on_action) };
}

/// An intent ran (on the main thread): its action runs as the same roci:// link opened would.
extern "C" fn on_action(url: *const c_char) {
    let url = unsafe { CStr::from_ptr(url) }.to_string_lossy();
    let Some(app) = APP.get() else { return };
    match Url::parse(&url) {
        Ok(url) => url_actions::receive(app, &url),
        Err(error) => log::warn!("[app-intents] unreadable action {url}: {error}"),
    }
}
