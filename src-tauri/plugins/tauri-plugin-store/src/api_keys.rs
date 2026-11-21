//! Providers' API keys, stored the way Chromium's safe storage keeps secrets: one file in the app data folder
//! (`api-keys.enc`, owner-only), AES-256-GCM-encrypted with a random key that is the app's single Keychain item
//! ("Roci Safe Storage"). The Keychain is read once per run and written once ever, so macOS asks at most once (again
//! after a rebuild, which changes the app's signature). roci.db never holds a key: a provider row's settings keep their
//! API-key field empty on disk, and it's filled from these keys as the row is read.

use std::collections::BTreeMap;
use std::fs;
use std::io::{ErrorKind, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use security_framework::passwords::{get_generic_password, set_generic_password};
use serde_json::Value;

use crate::error::StoreError;

const FILE: &str = "api-keys.enc";
/// Owner read and write only.
const FILE_MODE: u32 = 0o600;
/// The one Keychain item: the encryption key, base64.
const KEYCHAIN_SERVICE: &str = "Roci Safe Storage";
const KEYCHAIN_ACCOUNT: &str = "Roci";
/// `errSecItemNotFound`: no encryption key yet.
const NOT_FOUND: i32 = -25300;
/// AES-GCM's nonce, stored before the ciphertext.
const NONCE_LEN: usize = 12;
/// The provider setting that holds its API key.
const KEY_SETTING: &str = "api-key";

/// Provider id → its key.
type Keys = BTreeMap<String, String>;

/// The app data folder, set once the store opens.
static DIR: OnceLock<PathBuf> = OnceLock::new();
/// The encryption key, from the Keychain, once per run.
static CIPHER: OnceLock<Aes256Gcm> = OnceLock::new();
/// The keys as last read or written; `None` until first used (and after a failed write, so the next use reads again).
static KEYS: Mutex<Option<Keys>> = Mutex::new(None);

/// Where the keys file lives; called as the store opens, before anything reads a key.
pub(crate) fn set_dir(dir: &Path) {
    let _ = DIR.set(dir.to_path_buf());
}

fn path() -> Result<PathBuf, StoreError> {
    DIR.get().map(|dir| dir.join(FILE)).ok_or_else(|| StoreError::from("API keys read before the store opened"))
}

/// The Keychain's encryption key; `create` makes and saves one when there is none yet (the first key saved).
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
    if key.len() != 32 {
        return Err(StoreError::from("Roci Safe Storage key has the wrong length"));
    }
    Ok(CIPHER.get_or_init(|| Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key))))
}

/// `plaintext` encrypted under a fresh nonce: the nonce, then the ciphertext.
fn seal(cipher: &Aes256Gcm, plaintext: &[u8]) -> Result<Vec<u8>, StoreError> {
    let nonce = Aes256Gcm::generate_nonce(OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext).map_err(|_| StoreError::from("API keys encryption failed"))?;
    Ok([nonce.as_slice(), &ciphertext].concat())
}

/// The plaintext `seal` made; damaged or foreign data is an error.
fn open(cipher: &Aes256Gcm, sealed: &[u8]) -> Result<Vec<u8>, StoreError> {
    if sealed.len() < NONCE_LEN {
        return Err(StoreError::from("API keys file is damaged"));
    }
    let (nonce, ciphertext) = sealed.split_at(NONCE_LEN);
    cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| StoreError::from("API keys can't be decrypted with the Roci Safe Storage key"))
}

/// The saved keys; no file yet is none, and needs no Keychain read. A file that won't decrypt is an error, never empty,
/// so a later save can't overwrite keys that couldn't be read.
fn load() -> Result<Keys, StoreError> {
    let sealed = match fs::read(path()?) {
        Ok(sealed) => sealed,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(Keys::new()),
        Err(e) => return Err(StoreError::from(format!("API keys read: {e}"))),
    };
    let json = open(cipher(false)?, &sealed)?;
    serde_json::from_slice(&json).map_err(|e| StoreError::from(format!("API keys unreadable: {e}")))
}

/// Encrypts `keys` with a fresh nonce and writes them whole (a temporary file renamed over the old one, so a crash
/// never leaves half a file); none left removes the file.
fn write(keys: &Keys) -> Result<(), StoreError> {
    let target = path()?;
    if keys.is_empty() {
        return match fs::remove_file(&target) {
            Err(e) if e.kind() != ErrorKind::NotFound => Err(StoreError::from(format!("API keys remove: {e}"))),
            _ => Ok(()),
        };
    }
    let json = serde_json::to_vec(keys).map_err(|e| StoreError::from(format!("API keys: {e}")))?;
    let sealed = seal(cipher(true)?, &json)?;
    let temporary = target.with_extension("enc.tmp");
    let saved = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(FILE_MODE)
        .open(&temporary)
        .and_then(|mut file| file.write_all(&sealed).and_then(|()| file.sync_all()))
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
    fn sealed_keys_open_with_their_key_only_and_any_change_is_refused() {
        let cipher = Aes256Gcm::new(&Aes256Gcm::generate_key(OsRng));
        let sealed = seal(&cipher, b"{\"openai\":\"sk-1\"}").unwrap();
        assert_eq!(open(&cipher, &sealed).unwrap(), b"{\"openai\":\"sk-1\"}");
        assert_ne!(seal(&cipher, b"same").unwrap(), seal(&cipher, b"same").unwrap());
        let mut tampered = sealed.clone();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(open(&cipher, &tampered).is_err());
        assert!(open(&Aes256Gcm::new(&Aes256Gcm::generate_key(OsRng)), &sealed).is_err());
        assert!(open(&cipher, &sealed[..NONCE_LEN - 1]).is_err());
    }

    #[test]
    fn the_key_field_is_read_and_blanked_and_nothing_else_changes() {
        assert_eq!(key_in_settings(Some(DATA)).as_deref(), Some("sk-1"));
        let blanked = with_key_in_settings(Some(DATA.into()), "").unwrap();
        assert_eq!(key_in_settings(Some(&blanked)), None);
        assert!(blanked.contains(r#""value":"x""#));
    }
}
