//! Kasset meetings in macOS Spotlight through Core Spotlight (Swift bridge, the
//! notifications-plugin pattern).
//!
//! In: [`index`], [`remove`] and [`remove_all`] keep the `meetings` domain of
//! the on-device index in step. They block until Core Spotlight answers, so
//! never call them on the main thread.
//!
//! Out: a Spotlight result the user opens goes to the [`on_open`] handler with
//! the item's id.

mod bridge;

use std::ffi::CStr;
use std::os::raw::c_char;
use std::sync::OnceLock;

use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

/// One meeting in Spotlight.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightItem {
    /// Reusing an id replaces the earlier item; [`on_open`] receives it.
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    /// Searchable body text.
    pub text: String,
    pub keywords: Vec<String>,
    /// When the meeting happened (wall clock).
    pub created_ms: i64,
}

type Handler = Box<dyn Fn(String) + Send + Sync>;

static HANDLER: OnceLock<Handler> = OnceLock::new();

/// Whether Core Spotlight can run (false without an app bundle, e.g. `cargo test`).
pub fn supported() -> bool {
    bridge::supported()
}

/// Add or replace `items` by id. Blocks; never call on the main thread.
pub fn index(items: &[SpotlightItem]) -> Result<(), String> {
    bridge::index(&items)
}

/// Remove items by id. Blocks; never call on the main thread.
pub fn remove(ids: &[String]) -> Result<(), String> {
    bridge::remove(&ids)
}

/// Remove every Kasset meeting from Spotlight. Blocks; never call on the main thread.
pub fn remove_all() -> Result<(), String> {
    bridge::remove_all()
}

/// Call `handler` with the item id when the user opens a Spotlight result.
/// The first handler wins; later calls are ignored.
pub fn on_open(handler: impl Fn(String) + Send + Sync + 'static) {
    if HANDLER.set(Box::new(handler)).is_err() {
        log::warn!("[core-spotlight] open handler already set");
        return;
    }
    bridge::setup(opened);
}

extern "C" fn opened(id: *const c_char) {
    let id = unsafe { CStr::from_ptr(id) }.to_string_lossy().into_owned();
    if let Some(handler) = HANDLER.get() {
        handler(id);
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("core-spotlight").build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_serializes_for_swift() {
        let item = SpotlightItem {
            id: "m1".into(),
            title: "Standup".into(),
            description: Some("Daily".into()),
            text: "We shipped".into(),
            keywords: vec!["team".into()],
            created_ms: 1_700_000_000_000,
        };
        let value = serde_json::to_value(item).unwrap();
        let mut keys: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "createdMs",
                "description",
                "id",
                "keywords",
                "text",
                "title"
            ]
        );
    }
}
