//! Reads Hex's discovery file: `<data dir>/hex/local-api.json` (`dirs::data_dir()`
//! joined with `hex`, the same path Hex writes and its SDK reads).

use serde::Deserialize;
use std::path::Path;

use super::HexError;

/// The only local API version this client speaks.
const SUPPORTED_API_VERSION: &str = "2";
const DISCOVERY_FILE: &str = "hex/local-api.json";

#[derive(Deserialize)]
struct DiscoveryFile {
    port: u16,
    token: String,
    #[serde(rename = "apiVersion")]
    api_version: String,
}

/// Where and how to reach the running Hex.
pub struct Endpoint {
    pub base_url: String,
    pub token: String,
}

pub fn read(data_dir: &Path) -> Result<Endpoint, HexError> {
    let raw = std::fs::read_to_string(data_dir.join(DISCOVERY_FILE)).map_err(|_| HexError::NotRunning)?;
    let file: DiscoveryFile = serde_json::from_str(&raw).map_err(|_| HexError::NotRunning)?;
    if file.api_version != SUPPORTED_API_VERSION {
        return Err(HexError::Incompatible);
    }
    Ok(Endpoint {
        base_url: format!("http://127.0.0.1:{}", file.port),
        token: file.token,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!("kasset-hex-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        std::fs::create_dir_all(&directory).unwrap();
        directory
    }

    fn write_discovery(dir: &Path, body: &str) {
        std::fs::create_dir_all(dir.join("hex")).unwrap();
        std::fs::write(dir.join(DISCOVERY_FILE), body).unwrap();
    }

    #[test]
    fn reads_port_and_token() {
        let dir = scratch("reads");
        write_discovery(&dir, r#"{"port":56958,"token":"t","apiVersion":"2","pid":1}"#);
        let endpoint = read(&dir).unwrap();
        assert_eq!(endpoint.base_url, "http://127.0.0.1:56958");
        assert_eq!(endpoint.token, "t");
    }

    #[test]
    fn missing_file_means_not_running() {
        let dir = scratch("missing");
        assert!(matches!(read(&dir), Err(HexError::NotRunning)));
    }

    #[test]
    fn other_api_version_is_incompatible() {
        let dir = scratch("version");
        write_discovery(&dir, r#"{"port":1,"token":"t","apiVersion":"3"}"#);
        assert!(matches!(read(&dir), Err(HexError::Incompatible)));
    }
}
