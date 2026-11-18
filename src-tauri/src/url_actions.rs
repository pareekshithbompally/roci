//! `roci://` URL actions (record, stop, show, settings, ask, meeting), queued until the webview is ready.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::menubar::{self, item};

/// The scheme registered in tauri.conf.json (`plugins.deep-link.desktop.schemes`).
const SCHEME: &str = "roci";
/// Rust → webview: an action with a value (`UrlAction::Ask` / `Meeting`).
const ACTION_EVENT: &str = "url-action";

/// What one URL asks for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
enum UrlAction {
    /// A menu bar action id (`menubar::item`).
    #[serde(skip)]
    Menu(&'static str),
    Ask(String),
    Meeting(String),
}

/// An action Spotlight lists: its URL host (the Spotlight id is its URL), its title and the words that find it.
pub(crate) struct SpotlightAction {
    pub host: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub keywords: &'static [&'static str],
}

/// The fixed actions Spotlight lists; opening one runs the same URL a deep link would.
pub(crate) const SPOTLIGHT_ACTIONS: &[SpotlightAction] = &[
    SpotlightAction {
        host: "record",
        title: "Start Recording",
        description: "Record a meeting in Roci",
        keywords: &["record", "meeting", "transcribe"],
    },
    SpotlightAction {
        host: "stop",
        title: "Stop Recording",
        description: "Stop the meeting Roci is recording",
        keywords: &["stop", "recording"],
    },
    SpotlightAction {
        host: "show",
        title: "Open Roci",
        description: "Show the Roci window",
        keywords: &["roci", "chat"],
    },
    SpotlightAction {
        host: "settings",
        title: "Roci Settings",
        description: "Open Roci's settings",
        keywords: &["settings", "preferences"],
    },
];

/// The URL an action opens, also its Spotlight id (`roci://record`).
pub(crate) fn action_url(host: &str) -> String {
    format!("{SCHEME}://{host}")
}

/// Actions that arrived before the webview could take them.
#[derive(Default)]
pub struct UrlActionsState {
    inner: Mutex<Queue>,
}

#[derive(Default)]
struct Queue {
    ready: bool,
    pending: Vec<UrlAction>,
}

/// Listen for opened URLs for the app's lifetime. Called once from setup.
pub fn setup(app: &AppHandle) {
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            receive(&handle, &url);
        }
    });
}

impl Queue {
    /// The action to run now, or `None` when it waits for the webview.
    fn submit(&mut self, action: UrlAction) -> Option<UrlAction> {
        if self.ready {
            return Some(action);
        }
        self.pending.push(action);
        None
    }
}

fn receive(app: &AppHandle, url: &Url) {
    let Some(action) = action_for(url) else {
        log::warn!("[url-actions] ignored unknown URL: {url}");
        return;
    };
    submit(app, action);
}

/// Open meeting `id` in the webview (a Spotlight result or a recent meeting in the menu bar), once it is ready.
pub(crate) fn open_meeting(app: &AppHandle, id: String) {
    submit(app, UrlAction::Meeting(id));
}

/// A Spotlight result opened: an action's URL runs that action; any other id is a meeting.
pub(crate) fn open_spotlight_item(app: &AppHandle, id: String) {
    match spotlight_url(&id) {
        Some(url) => receive(app, &url),
        None => open_meeting(app, id),
    }
}

/// A Spotlight id that is a `roci://` action URL; meeting ids aren't URLs.
fn spotlight_url(id: &str) -> Option<Url> {
    Url::parse(id).ok().filter(|url| url.scheme() == SCHEME)
}

/// Run `action` now, or queue it until `url_actions_ready`.
fn submit(app: &AppHandle, action: UrlAction) {
    let state = app.state::<UrlActionsState>();
    let now = state.inner.lock().unwrap_or_else(|e| e.into_inner()).submit(action);
    if let Some(action) = now {
        run(app, action);
    }
}

fn run(app: &AppHandle, action: UrlAction) {
    match action {
        UrlAction::Menu(id) => menubar::dispatch(app, id),
        payload => {
            if let Err(e) = app.emit(ACTION_EVENT, &payload) {
                log::error!("[url-actions] failed to emit {ACTION_EVENT}: {e}");
            }
        }
    }
}

/// The action a URL asks for, or `None` for anything else.
fn action_for(url: &Url) -> Option<UrlAction> {
    if url.scheme() != SCHEME {
        return None;
    }
    let action = match url.host_str()? {
        "record" => UrlAction::Menu(item::START_RECORDING),
        "stop" => UrlAction::Menu(item::STOP_RECORDING),
        "show" => UrlAction::Menu(item::SHOW),
        "settings" => UrlAction::Menu(item::SETTINGS),
        "ask" => UrlAction::Ask(question(url)?),
        "meeting" => UrlAction::Meeting(meeting_id(url)?),
        _ => return None,
    };
    Some(action)
}

/// `q`, trimmed; `None` when missing or blank.
fn question(url: &Url) -> Option<String> {
    let (_, q) = url.query_pairs().find(|(key, _)| key == "q")?;
    let q = q.trim();
    (!q.is_empty()).then(|| q.to_string())
}

/// The single path segment of `roci://meeting/<id>`.
fn meeting_id(url: &Url) -> Option<String> {
    let mut segments = url.path_segments()?.filter(|s| !s.is_empty());
    let id = segments.next()?;
    segments.next().is_none().then(|| id.to_string())
}

/// The webview listens and settings are loaded: run what was waiting.
#[tauri::command]
pub async fn url_actions_ready(
    app: AppHandle,
    state: State<'_, UrlActionsState>,
) -> Result<(), String> {
    let pending = {
        let mut queue = state.inner.lock().unwrap_or_else(|e| e.into_inner());
        queue.ready = true;
        std::mem::take(&mut queue.pending)
    };
    for action in pending {
        run(&app, action);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn action(url: &str) -> Option<UrlAction> {
        action_for(&Url::parse(url).unwrap())
    }

    #[test]
    fn maps_fixed_actions_to_menu_ids() {
        assert_eq!(
            action("roci://record"),
            Some(UrlAction::Menu(item::START_RECORDING))
        );
        assert_eq!(
            action("roci://stop/"),
            Some(UrlAction::Menu(item::STOP_RECORDING))
        );
        assert_eq!(action("roci://show"), Some(UrlAction::Menu(item::SHOW)));
        assert_eq!(
            action("roci://settings"),
            Some(UrlAction::Menu(item::SETTINGS))
        );
    }

    #[test]
    fn ask_carries_the_decoded_question() {
        assert_eq!(
            action("roci://ask?q=what%20did%20we%20decide%3F"),
            Some(UrlAction::Ask("what did we decide?".into()))
        );
        assert_eq!(
            action("roci://ask?q=a+b"),
            Some(UrlAction::Ask("a b".into()))
        );
        assert_eq!(action("roci://ask?q=%20%20"), None);
        assert_eq!(action("roci://ask"), None);
    }

    #[test]
    fn meeting_takes_exactly_one_id() {
        assert_eq!(
            action("roci://meeting/rec_123"),
            Some(UrlAction::Meeting("rec_123".into()))
        );
        assert_eq!(action("roci://meeting/"), None);
        assert_eq!(action("roci://meeting/a/b"), None);
    }

    #[test]
    fn every_spotlight_action_opens_a_real_action() {
        for spotlight in SPOTLIGHT_ACTIONS {
            let url = action_url(spotlight.host);
            assert!(
                matches!(action(&url), Some(UrlAction::Menu(_))),
                "{url} is not an action"
            );
        }
    }

    #[test]
    fn spotlight_ids_are_action_urls_or_meetings() {
        assert!(spotlight_url("roci://record").is_some());
        assert!(spotlight_url("rec_123").is_none());
        assert!(spotlight_url("https://record").is_none());
    }

    #[test]
    fn rejects_other_schemes_and_hosts() {
        assert_eq!(action("https://record"), None);
        assert_eq!(action("roci://format-disk"), None);
    }

    #[test]
    fn open_meeting_waits_until_ready() {
        let mut queue = Queue::default();
        let meeting = |id: &str| UrlAction::Meeting(id.into());
        assert_eq!(queue.submit(meeting("m1")), None);
        assert_eq!(queue.pending, [meeting("m1")]);
        queue.ready = true;
        assert_eq!(queue.submit(meeting("m2")), Some(meeting("m2")));
        assert_eq!(queue.pending, [meeting("m1")]);
    }

    #[test]
    fn payload_actions_serialize_for_the_webview() {
        let ask = serde_json::to_value(UrlAction::Ask("hi".into())).unwrap();
        assert_eq!(ask, serde_json::json!({ "kind": "ask", "value": "hi" }));
        let meeting = serde_json::to_value(UrlAction::Meeting("m1".into())).unwrap();
        assert_eq!(
            meeting,
            serde_json::json!({ "kind": "meeting", "value": "m1" })
        );
    }
}
