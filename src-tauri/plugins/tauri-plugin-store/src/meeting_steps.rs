//! A meeting's pipeline steps, owned here: a step starts only when that meeting runs none (so two runs never race), every
//! start is counted (a step a quit or crash keeps cutting off stops being retried at launch), and a step ends done,
//! cancelled (back to waiting) or failed (with its reason). Renaming makes the title the user's.

use crate::commands::{meetings_set_status_impl, write_meeting, MeetingStatus, StoreState};
use crate::pipeline::with_db;
use crate::error::StoreError;
use rusqlite::Connection;
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Runtime, State};

/// Automatic restarts of one step at launch; after this many the meeting waits for Retry.
const MAX_STEP_ATTEMPTS: i64 = 2;

/// Meetings with a step running in this app session; empty at launch, so a step a quit cut off is never "running".
static RUNNING: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/", rename = "MeetingStep"))]
#[serde(rename_all = "lowercase")]
pub enum Step {
    Transcribe,
    Summarize,
}

impl Step {
    fn working(self) -> &'static str {
        match self {
            Step::Transcribe => "transcribing",
            Step::Summarize => "summarizing",
        }
    }

    /// Where a cancelled step leaves the meeting: waiting for the step again.
    fn waiting(self) -> &'static str {
        match self {
            Step::Transcribe => "captured",
            Step::Summarize => "transcribed",
        }
    }

    /// The step a meeting in `status` is running, if any.
    fn running_in(status: &str) -> Option<Self> {
        match status {
            "transcribing" => Some(Step::Transcribe),
            "summarizing" => Some(Step::Summarize),
            _ => None,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Step::Transcribe => "transcribe",
            Step::Summarize => "summarize",
        }
    }
}

/// How a step ended. `Done`: its save already moved the meeting on (`transcribed` / `ready`).
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/", rename = "MeetingStepEnd"))]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum StepEnd {
    Done,
    Cancelled,
    Failed { error: String },
}

fn running() -> Result<std::sync::MutexGuard<'static, Vec<String>>, StoreError> {
    RUNNING.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))
}

fn begin_impl(db: &Connection, id: &str, step: Step) -> Result<bool, StoreError> {
    let mut active = running()?;
    if active.iter().any(|m| m == id) {
        return Ok(false);
    }
    meetings_set_status_impl(db, id, &MeetingStatus::at(step.working()))?;
    db.execute("UPDATE meetings SET step_attempts = step_attempts + 1 WHERE id = ?1", [id])?;
    active.push(id.to_string());
    Ok(true)
}

fn end_impl(db: &Connection, id: &str, step: Step, end: &StepEnd) -> Result<(), StoreError> {
    running()?.retain(|m| m != id);
    // a step that ended (any way) was not cut off: only starts a quit interrupted count toward the launch limit
    db.execute("UPDATE meetings SET step_attempts = 0 WHERE id = ?1", [id])?;
    match end {
        StepEnd::Done => Ok(()),
        StepEnd::Cancelled => meetings_set_status_impl(db, id, &MeetingStatus::at(step.waiting())),
        StepEnd::Failed { error } => meetings_set_status_impl(db, id, &MeetingStatus::failed(step.name(), error.clone())),
    }
}

fn rename_impl(db: &Connection, id: &str, title: &str) -> Result<(), StoreError> {
    let changed = db.execute(
        "UPDATE meetings SET title = ?2, title_source = 'user', updated_at = ?3 WHERE id = ?1",
        rusqlite::params![id, title, crate::commands::now_millis()],
    )?;
    if changed == 0 {
        return Err(StoreError::from("Meeting not found"));
    }
    Ok(())
}

/// At launch: every meeting a quit or crash left mid-step. Those started fewer than `MAX_STEP_ATTEMPTS` times are returned
/// to run again; the rest wait for Retry, saying why.
pub(crate) fn interrupted_impl(db: &Connection) -> Result<Vec<String>, StoreError> {
    running()?.clear();
    let mut stmt = db.prepare(
        "SELECT id, status, step_attempts FROM meetings WHERE status IN ('transcribing', 'summarizing') ORDER BY created_at",
    )?;
    let cut_off: Vec<(String, String, i64)> =
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?.collect::<Result<_, _>>()?;
    let mut resumable = Vec::new();
    for (id, status, attempts) in cut_off {
        let Some(step) = Step::running_in(&status) else { continue };
        if attempts < MAX_STEP_ATTEMPTS {
            resumable.push(id);
            continue;
        }
        meetings_set_status_impl(db, &id, &MeetingStatus::failed(step.name(), "It stopped before finishing twice. Try again."))?;
    }
    Ok(resumable)
}

/// Starts `step`; false when this meeting already runs a step (the caller leaves it alone).
#[tauri::command]
pub async fn meetings_begin_step(state: State<'_, StoreState>, id: String, step: Step) -> Result<bool, StoreError> {
    let target = id.clone();
    write_meeting(&state, id, move |db| begin_impl(db, &target, step)).await
}

#[tauri::command]
pub async fn meetings_end_step(state: State<'_, StoreState>, id: String, step: Step, end: StepEnd) -> Result<(), StoreError> {
    let target = id.clone();
    write_meeting(&state, id, move |db| end_impl(db, &target, step, &end)).await
}

#[tauri::command]
pub async fn meetings_rename(state: State<'_, StoreState>, id: String, title: String) -> Result<(), StoreError> {
    let target = id.clone();
    write_meeting(&state, id, move |db| rename_impl(db, &target, &title)).await
}

/// For the recorder's launch recovery (blocking; never on the main thread).
pub fn interrupted_meetings<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<String>, StoreError> {
    with_db(app, interrupted_impl)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::open_migrated_test_db;
    use rusqlite::OptionalExtension;

    fn meeting(db: &Connection, id: &str, status: &str, calendar: Option<&str>) {
        crate::commands::meetings_create_impl(
            db,
            &crate::commands::MeetingCreateInput {
                id: id.into(),
                title: "Recording".into(),
                status: status.into(),
                input_source: None,
                recording_filename: None,
                calendar_event_id: calendar.map(Into::into),
                calendar_meta: None,
                created_at: None,
                transcript: None,
            },
        )
        .expect("create");
    }

    fn field(db: &Connection, id: &str, column: &str) -> String {
        db.query_row(&format!("SELECT CAST({column} AS TEXT) FROM meetings WHERE id = ?1"), [id], |r| r.get(0))
            .optional()
            .expect("query")
            .expect("row")
    }

    #[test]
    fn a_meeting_runs_one_step_at_a_time() {
        let db = open_migrated_test_db();
        meeting(&db, "m-one-step", "captured", None);
        assert!(begin_impl(&db, "m-one-step", Step::Transcribe).expect("begin"));
        assert!(!begin_impl(&db, "m-one-step", Step::Transcribe).expect("second begin"), "a second run must be refused");
        assert_eq!(field(&db, "m-one-step", "status"), "transcribing");
        end_impl(&db, "m-one-step", Step::Transcribe, &StepEnd::Cancelled).expect("end");
        assert_eq!(field(&db, "m-one-step", "status"), "captured");
        assert!(begin_impl(&db, "m-one-step", Step::Transcribe).expect("begin again"));
        end_impl(&db, "m-one-step", Step::Transcribe, &StepEnd::Failed { error: "No key".into() }).expect("fail");
        assert_eq!(field(&db, "m-one-step", "status"), "failed");
        assert_eq!(field(&db, "m-one-step", "failed_step"), "transcribe");
    }

    #[test]
    fn a_step_that_ended_never_counts_toward_the_launch_limit() {
        let db = open_migrated_test_db();
        meeting(&db, "m-ended", "captured", None);
        begin_impl(&db, "m-ended", Step::Transcribe).expect("start");
        end_impl(&db, "m-ended", Step::Transcribe, &StepEnd::Failed { error: "offline".into() }).expect("fail");
        begin_impl(&db, "m-ended", Step::Transcribe).expect("retry");
        assert_eq!(interrupted_impl(&db).expect("launch"), vec!["m-ended".to_string()], "one cut-off start: resumed");
    }

    #[test]
    fn launch_resumes_a_cut_off_step_twice_then_waits_for_retry() {
        let db = open_migrated_test_db();
        meeting(&db, "m-cut", "captured", None);
        begin_impl(&db, "m-cut", Step::Summarize).expect("first start");
        assert_eq!(interrupted_impl(&db).expect("launch 1"), vec!["m-cut".to_string()]);
        begin_impl(&db, "m-cut", Step::Summarize).expect("second start");
        assert!(interrupted_impl(&db).expect("launch 2").is_empty());
        assert_eq!(field(&db, "m-cut", "status"), "failed");
        assert_eq!(field(&db, "m-cut", "failed_step"), "summarize");
    }

    #[test]
    fn a_summary_never_renames_a_calendar_or_user_title() {
        let db = open_migrated_test_db();
        meeting(&db, "m-cal", "transcribed", Some("event-1"));
        meeting(&db, "m-user", "transcribed", None);
        meeting(&db, "m-new", "transcribed", None);
        rename_impl(&db, "m-user", "My name").expect("rename");
        for id in ["m-cal", "m-user", "m-new"] {
            crate::commands::summaries_save_for_test(&db, id, "AI title").expect("save");
        }
        assert_eq!(field(&db, "m-cal", "title"), "Recording");
        assert_eq!(field(&db, "m-user", "title"), "My name");
        assert_eq!(field(&db, "m-new", "title"), "AI title");
    }

    #[test]
    fn a_new_summary_replaces_untouched_ai_todos_only() {
        let db = open_migrated_test_db();
        meeting(&db, "m-todos", "transcribed", None);
        let first = crate::commands::summaries_save_for_test(&db, "m-todos", "T").expect("first");
        assert!(first.replaced_todo_ids.is_empty(), "nothing to replace on the first summary");
        assert_eq!(first.new_todo_ids.len(), 2);
        let ai: Vec<String> = db
            .prepare("SELECT id FROM todos WHERE meeting_id = 'm-todos' ORDER BY text")
            .expect("prepare")
            .query_map([], |r| r.get(0))
            .expect("query")
            .collect::<Result<_, _>>()
            .expect("ids");
        db.execute("UPDATE todos SET completed = 1 WHERE id = ?1", [&ai[0]]).expect("tick one");
        let second = crate::commands::summaries_save_for_test(&db, "m-todos", "T").expect("second");
        assert_eq!(second.replaced_todo_ids, vec![ai[1].clone()], "returns the replaced to-do's id, not the ticked one's");
        assert_eq!(second.new_todo_ids.len(), 2, "and only the two it added");
        let count: i64 =
            db.query_row("SELECT COUNT(*) FROM todos WHERE meeting_id = 'm-todos'", [], |r| r.get(0)).expect("count");
        assert_eq!(count, 3, "the ticked one stays beside the new summary's two");
    }
}
