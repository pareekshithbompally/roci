//! Providers' API keys, kept the way Chromium keeps saved passwords: each one AES-256-GCM-encrypted in its provider's row
//! (`providers.api_key`), under a random key that is the app's one Keychain item ("Roci Safe Storage"). The Keychain is
//! read once per run and only when a key is read or saved; the item is made with the first key ever saved. So macOS asks
//! at most once (again only after a rebuild changes the app's signature). A provider's settings never hold its key on
//! disk: the API-key field is blanked as the row is saved and filled as it's read.

use std::sync::OnceLock;

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use security_framework::passwords::{get_generic_password, set_generic_password};
use serde_json::Value;

use crate::error::StoreError;

/// The one Keychain item: the encryption key, base64.
const KEYCHAIN_SERVICE: &str = "Roci Safe Storage";
const KEYCHAIN_ACCOUNT: &str = "Roci";
/// `errSecItemNotFound`: no encryption key yet.
const NOT_FOUND: i32 = -25300;
/// AES-256's key length, in bytes.
const KEY_LEN: usize = 32;
/// AES-GCM's nonce, stored before the ciphertext.
const NONCE_LEN: usize = 12;
/// The provider setting that holds its API key.
const KEY_SETTING: &str = "api-key";

/// The encryption key, from the Keychain, once per run.
static CIPHER: OnceLock<Aes256Gcm> = OnceLock::new();

/// The Keychain's encryption key; `create` makes and saves one when there is none yet (the first key ever saved).
fn cipher(create: bool) -> Result<&'static Aes256Gcm, StoreError> {
    if let Some(cipher) = CIPHER.get() {
        return Ok(cipher);
    }
    let key = match get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok(encoded) => STANDARD.decode(encoded).map_err(|e| StoreError::from(format!("Roci Safe Storage key unreadable: {e}")))?,
        Err(e) if e.code() == NOT_FOUND && create => {
            let key = Aes256Gcm::generate_key(OsRng).to_vec();
            set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, STANDARD.encode(&key).as_bytes())
                .map_err(|e| StoreError::from(format!("Keychain save: {e}")))?;
            key
        }
        Err(e) => return Err(StoreError::from(format!("Keychain read: {e}"))),
    };
    if key.len() != KEY_LEN {
        return Err(StoreError::from("Roci Safe Storage key has the wrong length"));
    }
    Ok(CIPHER.get_or_init(|| Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key))))
}

/// `plaintext` under a fresh nonce: the nonce, then the ciphertext.
fn seal_with(cipher: &Aes256Gcm, plaintext: &[u8]) -> Result<Vec<u8>, StoreError> {
    let nonce = Aes256Gcm::generate_nonce(OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext).map_err(|_| StoreError::from("API key encryption failed"))?;
    Ok([nonce.as_slice(), &ciphertext].concat())
}

/// The plaintext `seal_with` made; damaged or foreign data is an error.
fn open_with(cipher: &Aes256Gcm, sealed: &[u8]) -> Result<Vec<u8>, StoreError> {
    if sealed.len() < NONCE_LEN {
        return Err(StoreError::from("API key is damaged"));
    }
    let (nonce, ciphertext) = sealed.split_at(NONCE_LEN);
    cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| StoreError::from("API key can't be decrypted with the Roci Safe Storage key"))
}

/// `key` encrypted for its provider's row.
pub(crate) fn seal(key: &str) -> Result<Vec<u8>, StoreError> {
    seal_with(cipher(true)?, key.as_bytes())
}

/// The key a provider's row holds.
pub(crate) fn open(sealed: &[u8]) -> Result<String, StoreError> {
    String::from_utf8(open_with(cipher(false)?, sealed)?).map_err(|_| StoreError::from("API key is not text"))
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
    fn sealed_keys_open_with_their_key_only_and_any_change_is_refused() {
        let cipher = Aes256Gcm::new(&Aes256Gcm::generate_key(OsRng));
        let sealed = seal_with(&cipher, b"{\"openai\":\"sk-1\"}").unwrap();
        assert_eq!(open_with(&cipher, &sealed).unwrap(), b"{\"openai\":\"sk-1\"}");
        assert_ne!(seal_with(&cipher, b"same").unwrap(), seal_with(&cipher, b"same").unwrap());
        let mut tampered = sealed.clone();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(open_with(&cipher, &tampered).is_err());
        assert!(open_with(&Aes256Gcm::new(&Aes256Gcm::generate_key(OsRng)), &sealed).is_err());
        assert!(open_with(&cipher, &sealed[..NONCE_LEN - 1]).is_err());
    }

    #[test]
    fn the_key_field_is_read_and_blanked_and_nothing_else_changes() {
        assert_eq!(key_in_settings(Some(DATA)).as_deref(), Some("sk-1"));
        let blanked = with_key_in_settings(Some(DATA.into()), "").unwrap();
        assert_eq!(key_in_settings(Some(&blanked)), None);
        assert!(blanked.contains(r#""value":"x""#));
    }
}
