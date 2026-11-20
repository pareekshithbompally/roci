//! API keys live in the system Keychain, one item per provider; roci.db never holds one. A provider row's settings keep
//! their API-key field empty on disk, and it's filled from the Keychain as the row is read.

use security_framework::passwords::{delete_generic_password, get_generic_password, set_generic_password};
use serde_json::Value;

use crate::error::StoreError;

/// The Keychain service Roci's API keys are filed under; the account is the provider id.
const SERVICE: &str = "ai.roci.roci.api-key";
/// `errSecItemNotFound`: no key saved for that provider.
const NOT_FOUND: i32 = -25300;
/// The provider setting that holds its API key.
const KEY_SETTING: &str = "api-key";

/// The provider's key, if one is saved.
pub(crate) fn read(provider: &str) -> Result<Option<String>, StoreError> {
    match get_generic_password(SERVICE, provider) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        Err(e) if e.code() == NOT_FOUND => Ok(None),
        Err(e) => Err(StoreError::from(format!("Keychain read for {provider}: {e}"))),
    }
}

/// Saves the provider's key; an empty one removes it.
pub(crate) fn save(provider: &str, key: &str) -> Result<(), StoreError> {
    if key.is_empty() {
        return remove(provider);
    }
    set_generic_password(SERVICE, provider, key.as_bytes()).map_err(|e| StoreError::from(format!("Keychain save for {provider}: {e}")))
}

/// Removes the provider's key; none saved is fine.
pub(crate) fn remove(provider: &str) -> Result<(), StoreError> {
    match delete_generic_password(SERVICE, provider) {
        Err(e) if e.code() != NOT_FOUND => Err(StoreError::from(format!("Keychain remove for {provider}: {e}"))),
        _ => Ok(()),
    }
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
