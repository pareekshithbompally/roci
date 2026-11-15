//! One meeting as a Spotlight item: title, overview, notes, to-dos and attendees, never the transcript.

use serde_json::Value;
use tauri_plugin_core_spotlight::SpotlightItem;
use tauri_plugin_store::MeetingDetail;

/// The Spotlight item for `detail`.
pub fn item_for(detail: &MeetingDetail) -> SpotlightItem {
    SpotlightItem {
        id: detail.id.clone(),
        title: detail.title.clone(),
        description: overview(detail).map(str::to_string),
        text: body(detail),
        keywords: participants(detail.calendar_meta.as_deref()),
        created_ms: detail.created_at,
    }
}

fn overview(detail: &MeetingDetail) -> Option<&str> {
    let overview = detail.summary.as_ref()?.overview.trim();
    (!overview.is_empty()).then_some(overview)
}

/// Overview, then notes, then to-dos, one per line.
fn body(detail: &MeetingDetail) -> String {
    let notes = detail.notes.iter().map(|note| note.text.trim());
    let todos = detail.todos.iter().map(|todo| todo.text.trim());
    overview(detail)
        .into_iter()
        .chain(notes)
        .chain(todos)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Attendee names (or emails) from the stored calendar metadata; empty when missing or malformed.
fn participants(calendar_meta: Option<&str>) -> Vec<String> {
    let Some(meta) = calendar_meta.and_then(|meta| serde_json::from_str::<Value>(meta).ok()) else {
        return Vec::new();
    };
    let Some(list) = meta.get("participants").and_then(Value::as_array) else {
        return Vec::new();
    };
    list.iter().filter_map(participant).collect()
}

fn participant(value: &Value) -> Option<String> {
    let label = match value {
        Value::String(name) => name.trim(),
        Value::Object(person) => field(person, "name").or_else(|| field(person, "email"))?,
        _ => return None,
    };
    (!label.is_empty()).then(|| label.to_string())
}

fn field<'a>(person: &'a serde_json::Map<String, Value>, key: &str) -> Option<&'a str> {
    let value = person.get(key)?.as_str()?.trim();
    (!value.is_empty()).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_store::{NoteRow, SummaryRow, TodoRow, TranscriptRow};

    fn detail() -> MeetingDetail {
        MeetingDetail {
            id: "m1".into(),
            title: "Q3 plan".into(),
            input_source: None,
            pending_transcription: false,
            calendar_event_id: None,
            calendar_meta: None,
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_000,
            categories: Vec::new(),
            transcript: Some(TranscriptRow {
                text: "secret spoken words".into(),
                language: None,
                model: None,
                segments: None,
                created_at: 0,
            }),
            summary: Some(SummaryRow {
                overview: "We ship in May".into(),
                data: "{}".into(),
                created_at: 0,
                updated_at: 0,
            }),
            recordings: Vec::new(),
            notes: vec![NoteRow {
                id: "n1".into(),
                text: "budget".into(),
                created_at: 0,
                updated_at: 0,
            }],
            todos: vec![TodoRow {
                id: "t1".into(),
                text: "Send deck".into(),
                owner: None,
                due_date: None,
                completed: false,
                source: "manual".into(),
                created_at: 0,
            }],
        }
    }

    fn keywords(meta: &str) -> Vec<String> {
        let mut detail = detail();
        detail.calendar_meta = Some(meta.into());
        item_for(&detail).keywords
    }

    #[test]
    fn item_carries_title_summary_notes_todos() {
        let detail = detail();
        let item = item_for(&detail);
        assert_eq!(item.id, "m1");
        assert_eq!(item.title, "Q3 plan");
        assert_eq!(item.description.as_deref(), Some("We ship in May"));
        assert_eq!(item.text, "We ship in May\nbudget\nSend deck");
        assert_eq!(item.created_ms, detail.created_at);
    }

    #[test]
    fn item_never_carries_the_transcript() {
        let item = item_for(&detail());
        assert!(!item.text.contains("secret spoken words"));
        assert!(!item.description.unwrap_or_default().contains("secret"));
    }

    #[test]
    fn item_without_summary_has_no_description() {
        let mut detail = detail();
        detail.summary = None;
        let item = item_for(&detail);
        assert_eq!(item.description, None);
        assert_eq!(item.text, "budget\nSend deck");
    }

    #[test]
    fn keywords_are_calendar_participants() {
        assert_eq!(
            keywords(r#"{"participants":["Ana","Raj"]}"#),
            ["Ana", "Raj"]
        );
        assert_eq!(
            keywords(
                r#"{"participants":[{"name":"Ana","email":"ana@x.io"},{"email":"raj@x.io"},{"status":"accepted"}]}"#
            ),
            ["Ana", "raj@x.io"]
        );
        assert!(keywords("not json").is_empty());
        assert!(keywords(r#"{"participants":"Ana"}"#).is_empty());
        assert!(item_for(&detail()).keywords.is_empty());
    }
}
