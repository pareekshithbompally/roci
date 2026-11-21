//! Providers' API keys: one file in the app data folder (`api-keys.json`, readable and writable by its owner only), read
//! once per run and kept in memory; roci.db never holds one. A provider row's settings keep their API-key field empty on
//! disk, and it's filled from these keys as the row is read.

use std::collections::BTreeMap;
use std::fs;
use std::io::{ErrorKind, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

use serde_json::Value;

use crate::error::StoreError;

const FILE: &str = "api-keys.json";
/// Owner read and write only.
const FILE_MODE: u32 = 0o600;
/// The provider setting that holds its API key.
const KEY_SETTING: &str = "api-key";

/// Provider id → its key.
type Keys = BTreeMap<String, String>;

/// The app data folder, set once the store opens.
static DIR: OnceLock<PathBuf> = OnceLock::new();
/// The keys as last read or written; `None` until first used (and after a failed write, so the next use reads again).
static KEYS: Mutex<Option<Keys>> = Mutex::new(None);

/// Where the keys file lives; called as the store opens, before anything reads a key.
pub(crate) fn set_dir(dir: &Path) {
    let _ = DIR.set(dir.to_path_buf());
}

fn path() -> Result<PathBuf, StoreError> {
    DIR.get().map(|dir| dir.join(FILE)).ok_or_else(|| StoreError::from("API keys read before the store opened"))
}

/// The saved keys; no file yet is none.
fn load() -> Result<Keys, StoreError> {
    match fs::read(path()?) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| StoreError::from(format!("API keys file unreadable: {e}"))),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Keys::new()),
        Err(e) => Err(StoreError::from(format!("API keys read: {e}"))),
    }
}

/// Writes `keys` whole (a temporary file renamed over the old one, so a crash never leaves half a file); none left
/// removes the file.
fn write(keys: &Keys) -> Result<(), StoreError> {
    let target = path()?;
    if keys.is_empty() {
        return match fs::remove_file(&target) {
            Err(e) if e.kind() != ErrorKind::NotFound => Err(StoreError::from(format!("API keys remove: {e}"))),
            _ => Ok(()),
        };
    }
    let json = serde_json::to_vec(keys).map_err(|e| StoreError::from(format!("API keys: {e}")))?;
    let temporary = target.with_extension("json.tmp");
    let saved = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(FILE_MODE)
        .open(&temporary)
        .and_then(|mut file| file.write_all(&json).and_then(|()| file.sync_all()))
        .and_then(|()| fs::rename(&temporary, &target));
    saved.map_err(|e| StoreError::from(format!("API keys save: {e}")))
}

/// The keys, read from the file on first use this run.
fn loaded() -> Result<MutexGuard<'static, Option<Keys>>, StoreError> {
    let mut guard = KEYS.lock().unwrap_or_else(|error| error.into_inner());
    if guard.is_none() {
        *guard = Some(load()?);
    }
    Ok(guard)
}

/// Sets (`Some`) or clears (`None`) the provider's key; the file is written only when it changed.
fn change(provider: &str, key: Option<&str>) -> Result<(), StoreError> {
    let mut guard = loaded()?;
    let keys = guard.get_or_insert_with(Keys::new);
    if keys.get(provider).map(String::as_str) == key {
        return Ok(());
    }
    match key {
        Some(key) => keys.insert(provider.to_string(), key.to_string()),
        None => keys.remove(provider),
    };
    let written = write(keys);
    if written.is_err() {
        *guard = None;
    }
    written
}

/// The provider's key, if one is saved.
pub(crate) fn read(provider: &str) -> Result<Option<String>, StoreError> {
    Ok(loaded()?.as_ref().and_then(|keys| keys.get(provider).cloned()))
}

/// Saves the provider's key; an empty one removes it.
pub(crate) fn save(provider: &str, key: &str) -> Result<(), StoreError> {
    change(provider, (!key.is_empty()).then_some(key))
}

/// Removes the provider's key; none saved is fine.
pub(crate) fn remove(provider: &str) -> Result<(), StoreError> {
    change(provider, None)
}

/// The key typed into a provider's settings JSON (its API-key field), if any.
pub(crate) fn key_in_settings(data: Option<&str>) -> Option<String> {
    let json: Value = serde_json::from_str(data?).ok()?;
    let value = key_field(&json)?.as_str()?.trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// The settings JSON with its API-key field set to `key` (empty for disk). JSON that can't be read is returned as it is.
pub(crate) fn with_key_in_settings(data: Option<String>, key: &str) -> Option<String> {
    let text = data?;
    let Ok(mut json) = serde_json::from_str::<Value>(&text) else { return Some(text) };
    let Some(settings) = json.get_mut("settings").and_then(Value::as_array_mut) else { return Some(text) };
    for setting in settings.iter_mut().filter(|s| s.get("key").and_then(Value::as_str) == Some(KEY_SETTING)) {
        if let Some(props) = setting.get_mut("controller_props").and_then(Value::as_object_mut) {
            props.insert("value".into(), Value::String(key.to_string()));
        }
    }
    Some(json.to_string())
}

/// The API-key field's value in a provider's settings JSON.
fn key_field(json: &Value) -> Option<&Value> {
    json.get("settings")?
        .as_array()?
        .iter()
        .find(|s| s.get("key").and_then(Value::as_str) == Some(KEY_SETTING))?
        .get("controller_props")?
        .get("value")
}

#[cfg(test)]
mod tests {
    use super::*;

    const DATA: &str = r#"{"settings":[{"key":"api-key","controller_props":{"value":"sk-1"}},{"key":"other","controller_props":{"value":"x"}}]}"#;

    #[test]
    fn the_key_field_is_read_and_blanked_and_nothing_else_changes() {
        assert_eq!(key_in_settings(Some(DATA)).as_deref(), Some("sk-1"));
        let blanked = with_key_in_settings(Some(DATA.into()), "").unwrap();
        assert_eq!(key_in_settings(Some(&blanked)), None);
        assert!(blanked.contains(r#""value":"x""#));
    }
}
