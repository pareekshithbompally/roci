//! Finds the video call a calendar invitation links to.

use url::Url;

use crate::types::CalendarEvent;

/// A video call service recognized in an invitation.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum CallProvider {
    Zoom,
    GoogleMeet,
    Teams,
    Slack,
    Webex,
}

impl CallProvider {
    pub fn label(self) -> &'static str {
        match self {
            Self::Zoom => "Zoom",
            Self::GoogleMeet => "Google Meet",
            Self::Teams => "Microsoft Teams",
            Self::Slack => "Slack",
            Self::Webex => "Webex",
        }
    }

    /// App bundle IDs and website hosts (subdomains included) a detected call from this service can carry.
    pub fn detection_keys(self) -> &'static [&'static str] {
        match self {
            Self::Zoom => &["us.zoom.xos", "zoom.us", "zoomgov.com"],
            Self::GoogleMeet => &["meet.google.com"],
            Self::Teams => &[
                "com.microsoft.teams2",
                "teams.microsoft.com",
                "teams.live.com",
            ],
            Self::Slack => &["com.tinyspeck.slackmacgap", "app.slack.com"],
            Self::Webex => &["webex.com"],
        }
    }
}

/// The call an invitation links to.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CallLink {
    pub provider: CallProvider,
    pub url: String,
}

/// The first video call link in the event's URL, location, or notes.
pub fn call_link(event: &CalendarEvent) -> Option<CallLink> {
    [&event.url, &event.location, &event.notes]
        .into_iter()
        .flatten()
        .find_map(|text| links(text).find_map(|url| classify(&url)))
}

/// The http(s) URLs in free text, in order.
fn links(text: &str) -> impl Iterator<Item = Url> + '_ {
    let mut rest = text;
    std::iter::from_fn(move || loop {
        let start = rest.find("http")?;
        let candidate = &rest[start..];
        let end = candidate
            .find(|character: char| {
                character.is_whitespace() || "<>\"'()[]{}|\\^`".contains(character)
            })
            .unwrap_or(candidate.len());
        let token = candidate[..end].trim_end_matches(['.', ',', ';', ':', '!', '?']);
        if !(token.starts_with("https://") || token.starts_with("http://")) {
            // A link may follow inside this token, as in `http_link:https://…`.
            rest = &candidate[4..];
            continue;
        }
        rest = &candidate[end..];
        if let Ok(url) = Url::parse(token) {
            return Some(url);
        }
    })
}

fn host_is(host: &str, domain: &str) -> bool {
    host == domain
        || host
            .strip_suffix(domain)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

/// Whether a detected call's app bundle ID or website host is `known`.
pub fn key_matches(key: &str, known: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key == known || host_is(&key, known)
}

fn classify(url: &Url) -> Option<CallLink> {
    let host = url.host_str()?.to_ascii_lowercase();
    let path = url.path().to_ascii_lowercase();
    let provider = if (host_is(&host, "zoom.us") || host_is(&host, "zoomgov.com"))
        && ["/j/", "/my/", "/w/", "/s/"]
            .iter()
            .any(|prefix| path.starts_with(prefix))
    {
        CallProvider::Zoom
    } else if host == "meet.google.com" && is_meet_path(&path) {
        CallProvider::GoogleMeet
    } else if (host_is(&host, "teams.microsoft.com") || host_is(&host, "teams.live.com"))
        && (path.starts_with("/l/meetup-join/") || path.starts_with("/meet/"))
    {
        CallProvider::Teams
    } else if host_is(&host, "slack.com") && path.contains("/huddle") {
        CallProvider::Slack
    } else if host_is(&host, "webex.com")
        && (path.starts_with("/meet/")
            || path.starts_with("/join/")
            || path.ends_with("/j.php")
            || path.contains("/wbxmjs/joinservice/"))
    {
        CallProvider::Webex
    } else {
        return None;
    };
    Some(CallLink {
        provider,
        url: url.to_string(),
    })
}

/// A meeting code such as `/abc-defg-hij` or a nickname path; not the landing or new-meeting pages.
fn is_meet_path(path: &str) -> bool {
    let path = path.trim_matches('/');
    !path.is_empty()
        && !path.contains('/')
        && !matches!(path, "landing" | "new" | "_meet")
        && path
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(location: &str, notes: &str) -> CalendarEvent {
        CalendarEvent {
            event_id: "e".into(),
            title: "t".into(),
            start_date: String::new(),
            end_date: String::new(),
            start_ms: 0.0,
            end_ms: 0.0,
            organizer_name: None,
            organizer_email: None,
            attendees: vec![],
            location: Some(location.into()),
            notes: Some(notes.into()),
            url: None,
            calendar_name: "c".into(),
            is_all_day: false,
            is_cancelled: false,
            is_free: false,
            meeting_url: None,
            meeting_provider: None,
        }
    }

    #[test]
    fn finds_calls_and_skips_landing_pages() {
        let zoom = call_link(&event("Room 4", "Join: https://acme.zoom.us/j/123?pwd=x.")).unwrap();
        assert_eq!(zoom.provider, CallProvider::Zoom);
        assert_eq!(zoom.url, "https://acme.zoom.us/j/123?pwd=x");
        let meet = call_link(&event("http_link:https://meet.google.com/abc-defg-hij", "")).unwrap();
        assert_eq!(meet.provider, CallProvider::GoogleMeet);
        assert!(call_link(&event(
            "https://meet.google.com/landing",
            "https://example.com/j/1"
        ))
        .is_none());
    }

    #[test]
    fn key_matches_bundle_and_subdomain() {
        assert!(key_matches("US.ZOOM.XOS", "us.zoom.xos"));
        assert!(key_matches("x.zoom.us", "zoom.us"));
        assert!(!key_matches("notzoom.us", "zoom.us"));
    }
}
