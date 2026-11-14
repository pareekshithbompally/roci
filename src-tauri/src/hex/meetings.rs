//! Hex meetings through Hex's versioned CLI JSON (`hex meetings list|show --json`,
//! `"version": 1`). The CLI reads Hex's meetings folder read-only; Kasset never
//! writes to Hex. (Hex's MCP server renders prose for agents, so it is not used
//! as a data source.)

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command;

use super::HexError;

/// The only CLI JSON version this client reads.
const SUPPORTED_JSON_VERSION: u64 = 1;
/// Where macOS apps live; Hex's CLI is the app binary itself.
const APP_LOCATIONS: [&str; 2] = ["/Applications/Hex.app", "~/Applications/Hex.app"];
const CLI_IN_BUNDLE: &str = "Contents/MacOS/hex";
/// Hex's maximum `--limit`; older meetings are paged with `--until`.
const PAGE: u32 = 200;
/// A read of local files; anything slower means Hex is stuck.
const CLI_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexMeeting {
    pub id: String,
    pub title: String,
    pub timestamp_ms: u64,
    pub duration_ms: u64,
    /// starting · recording · transcribing · complete · interrupted · failed
    pub status: String,
    pub in_progress: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexNotes {
    pub title: String,
    pub summary: String,
}

/// One transcript line; `source` is `microphone` (you) or `system` (them).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexEntry {
    pub source: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexMeetingDetail {
    pub meeting: HexMeeting,
    pub notes: Option<HexNotes>,
    pub entries: Vec<HexEntry>,
}

#[derive(Deserialize)]
struct ListPage {
    version: u64,
    meetings: Vec<HexMeeting>,
    truncated: bool,
}

#[derive(Deserialize)]
struct ShowReply {
    version: u64,
    #[serde(flatten)]
    detail: HexMeetingDetail,
}

/// Hex's CLI, or `NotInstalled`.
fn cli() -> Result<PathBuf, HexError> {
    APP_LOCATIONS
        .iter()
        .map(|app| PathBuf::from(shellexpand_home(app)).join(CLI_IN_BUNDLE))
        .find(|path| path.is_file())
        .ok_or(HexError::NotInstalled)
}

fn shellexpand_home(path: &str) -> String {
    match (path.strip_prefix("~/"), std::env::var_os("HOME")) {
        (Some(rest), Some(home)) => PathBuf::from(home).join(rest).to_string_lossy().into_owned(),
        _ => path.to_string(),
    }
}

/// Runs the CLI with `args` and decodes its JSON reply.
async fn run<T: for<'de> Deserialize<'de>>(args: &[String]) -> Result<T, HexError> {
    let output = tokio::time::timeout(CLI_TIMEOUT, Command::new(cli()?).args(args).output())
        .await
        .map_err(|_| HexError::Rejected("hex cli timed out".into()))?
        .map_err(|error| HexError::Rejected(error.to_string()))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(HexError::Rejected(message));
    }
    serde_json::from_slice(&output.stdout).map_err(|error| HexError::Rejected(format!("hex cli json: {error}")))
}

fn check_version(version: u64) -> Result<(), HexError> {
    (version == SUPPORTED_JSON_VERSION).then_some(()).ok_or(HexError::Incompatible)
}

/// Every Hex meeting, newest first (pages of `PAGE`, older pages by `--until`).
pub async fn list_all() -> Result<Vec<HexMeeting>, HexError> {
    let mut all: Vec<HexMeeting> = Vec::new();
    loop {
        let mut args = vec!["meetings".into(), "list".into(), "--json".into(), "--limit".into(), PAGE.to_string()];
        if let Some(oldest) = all.last() {
            args.extend(["--until".into(), oldest.timestamp_ms.saturating_sub(1).to_string()]);
        }
        let page: ListPage = run(&args).await?;
        check_version(page.version)?;
        let done = !page.truncated || page.meetings.is_empty();
        all.extend(page.meetings);
        if done {
            return Ok(all);
        }
    }
}

/// One meeting with its notes and full transcript.
pub async fn show(id: &str) -> Result<HexMeetingDetail, HexError> {
    let reply: ShowReply = run(&["meetings".into(), "show".into(), id.into(), "--json".into()]).await?;
    check_version(reply.version)?;
    Ok(reply.detail)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_list_and_show_replies() {
        let list: ListPage = serde_json::from_str(
            r#"{"meetings":[{"application":null,"duration_ms":16215,"id":"1794650226059-66796","in_progress":false,
            "status":"complete","timestamp_ms":1794650226059,"title":"Reflection","transcript_source":"final","warnings":[]}],
            "skipped":[],"truncated":false,"version":1}"#,
        )
        .unwrap();
        assert_eq!(list.meetings[0].id, "1794650226059-66796");
        assert!(!list.truncated);

        let show: ShowReply = serde_json::from_str(
            r#"{"entries":[{"end_ms":3440,"source":"microphone","start_ms":2400,"text":"We are"}],
            "meeting":{"application":null,"duration_ms":16215,"id":"m","in_progress":false,"status":"complete",
            "timestamp_ms":1,"title":"T","transcript_source":"final","warnings":[]},
            "notes":{"generated_at_ms":2,"summary":"S","title":"T"},"version":1}"#,
        )
        .unwrap();
        assert_eq!(show.detail.entries[0].source, "microphone");
        assert_eq!(show.detail.notes.unwrap().summary, "S");
    }

    #[test]
    fn only_json_version_1_is_read() {
        assert!(check_version(1).is_ok());
        assert!(matches!(check_version(2), Err(HexError::Incompatible)));
    }
}
