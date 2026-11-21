//! API keys live in the system Keychain as one item (every provider's key in it), read once per run and kept in memory,
//! so macOS asks at most once; roci.db never holds one. A provider row's settings keep their API-key field empty on disk,
//! and it's filled from these keys as the row is read.

use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard};

use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};
use serde_json::Value;

use crate::error::StoreError;

/// The one Keychain item: service and account.
const SERVICE: &str = "ai.roci.roci";
const ACCOUNT: &str = "api-keys";
/// `errSecItemNotFound`: no keys saved yet.
const NOT_FOUND: i32 = -25300;
/// The provider setting that holds its API key.
const KEY_SETTING: &str = "api-key";

/// Provider id → its key.
type Keys = BTreeMap<String, String>;

/// The keys as last read or written; `None` until first used (and after a failed write, so the next use reads again).
static KEYS: Mutex<Option<Keys>> = Mutex::new(None);

/// The item's keys; none saved is an empty set.
fn load() -> Result<Keys, StoreError> {
    match get_generic_password(SERVICE, ACCOUNT) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| StoreError::from(format!("Keychain keys unreadable: {e}"))),
        Err(e) if e.code() == NOT_FOUND => Ok(Keys::new()),
        Err(e) => Err(StoreError::from(format!("Keychain read: {e}"))),
    }
}

/// Writes `keys` as the one item (removing it once none are left).
fn write(keys: &Keys) -> Result<(), StoreError> {
    if keys.is_empty() {
        return match delete_generic_password(SERVICE, ACCOUNT) {
            Err(e) if e.code() != NOT_FOUND => Err(StoreError::from(format!("Keychain remove: {e}"))),
            _ => Ok(()),
        };
    }
    let json = serde_json::to_vec(keys).map_err(|e| StoreError::from(format!("Keychain keys: {e}")))?;
    set_generic_password(SERVICE, ACCOUNT, &json).map_err(|e| StoreError::from(format!("Keychain save: {e}")))
}

/// The keys, read from the Keychain on first use this run.
fn loaded() -> Result<MutexGuard<'static, Option<Keys>>, StoreError> {
    let mut guard = KEYS.lock().unwrap_or_else(|error| error.into_inner());
    if guard.is_none() {
        *guard = Some(load()?);
    }
    Ok(guard)
}

/// Sets (`Some`) or clears (`None`) the provider's key; the Keychain is written only when it changed.
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
