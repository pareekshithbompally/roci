use crate::{asset_adoption, assets};
use crate::changes::{notify, MeetingChange};
use crate::error::StoreError;
use crate::schema;
use rusqlite::{ffi::sqlite3_auto_extension, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime, State};

/// Plugin state holding the database connection.
pub struct StoreState {
    pub conn: Arc<Mutex<Option<Connection>>>,
}

impl Default for StoreState {
    fn default() -> Self {
        Self {
            conn: Arc::new(Mutex::new(None)),
        }
    }
}

// ── Meeting Domain Structs ──

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MeetingRow {
    pub id: String,
    pub title: String,
    pub input_source: Option<String>,
    #[serde(flatten)]
    pub status: MeetingStatus,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(test, ts(type = "number"))]
    pub updated_at: i64,
    pub categories: Vec<String>,
    pub recording_filename: Option<String>,
    /// When Keep or Delete All removed its recording; the meeting says "Audio removed".
    #[cfg_attr(test, ts(type = "number | null"))]
    pub audio_removed_at: Option<i64>,
}

/// Where a meeting is in its pipeline; `failed_step` and `error` are set only when `status` is `failed`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/", rename = "MeetingStatusRow"))]
pub struct MeetingStatus {
    pub status: String,
    pub failed_step: Option<String>,
    pub error: Option<String>,
}

impl MeetingStatus {
    pub fn at(status: &str) -> Self {
        Self { status: status.into(), failed_step: None, error: None }
    }

    pub fn failed(step: &str, error: impl Into<String>) -> Self {
        Self { status: "failed".into(), failed_step: Some(step.into()), error: Some(error.into()) }
    }
}

/// A new meeting, created before its pipeline starts (at Record, or by an import).
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MeetingCreateInput {
    pub id: String,
    pub title: String,
    pub status: String,
    pub input_source: Option<String>,
    pub recording_filename: Option<String>,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    #[cfg_attr(test, ts(type = "number | null"))]
    pub created_at: Option<i64>,
    /// The transcript it arrives with (an import): saved in the same write, and the meeting starts `transcribed`.
    pub transcript: Option<NewTranscript>,
}

/// A transcript that comes with a new meeting.
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct NewTranscript {
    pub text: String,
    pub language: Option<String>,
    pub model: Option<String>,
    pub segments: Option<String>,
}

/// A meeting update; only the fields given change.
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MeetingUpsertInput {
    pub id: String,
    pub title: Option<String>,
    pub input_source: Option<String>,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    pub categories: Option<Vec<String>>,
    #[cfg_attr(test, ts(type = "number | null"))]
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/", rename = "MeetingDetailRow"))]
pub struct MeetingDetail {
    pub id: String,
    pub title: String,
    pub input_source: Option<String>,
    #[serde(flatten)]
    pub status: MeetingStatus,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(test, ts(type = "number"))]
    pub updated_at: i64,
    pub categories: Vec<String>,
    #[cfg_attr(test, ts(type = "number | null"))]
    pub audio_removed_at: Option<i64>,
    pub transcript: Option<TranscriptRow>,
    pub summary: Option<SummaryRow>,
    pub recordings: Vec<RecordingRow>,
    pub notes: Vec<NoteRow>,
    pub todos: Vec<TodoRow>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct TranscriptRow {
    pub text: String,
    pub language: Option<String>,
    pub model: Option<String>,
    pub segments: Option<String>,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct SummaryRow {
    pub overview: String,
    pub data: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(test, ts(type = "number"))]
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct RecordingRow {
    pub id: String,
    pub filename: String,
    pub duration_seconds: Option<f64>,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct NoteRow {
    pub id: String,
    pub text: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(test, ts(type = "number"))]
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct TodoRow {
    pub id: String,
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
    pub completed: bool,
    pub source: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct ActionItemInput {
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
}

/// A finished transcript; saving it moves the meeting to `transcribed`.
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct TranscriptSaveInput {
    pub meeting_id: String,
    #[serde(flatten)]
    #[cfg_attr(test, ts(flatten))]
    pub transcript: NewTranscript,
}

/// A finished summary with its title, categories and action items; saving it moves the meeting to `ready`.
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct SummarySaveInput {
    pub meeting_id: String,
    pub title: String,
    pub overview: String,
    pub data: String,
    pub categories: Vec<String>,
    pub action_items: Vec<ActionItemInput>,
}

// ── Category Structs ──

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct CategoryRow {
    pub id: String,
    pub name: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
}

// ── Notes Domain Structs ──

#[derive(Debug, Deserialize)]
pub struct NoteUpsertInput {
    pub id: String,
    pub meeting_id: String,
    pub text: String,
    pub created_at: Option<i64>,
}

// ── Todos Domain Structs ──

#[derive(Debug, Deserialize)]
pub struct TodoUpsertInput {
    pub id: String,
    /// The meeting it came from; none for a to-do of its own.
    pub meeting_id: Option<String>,
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
    pub completed: Option<bool>,
    pub source: Option<String>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct TodoWithReminder {
    pub id: String,
    pub meeting_id: Option<String>,
    pub meeting_title: Option<String>,
    /// When its meeting was made (epoch ms), so to-do lists group by meeting without reading the meetings.
    #[cfg_attr(test, ts(type = "number | null"))]
    pub meeting_created_at: Option<i64>,
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
    pub completed: bool,
    pub source: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
    pub reminder: Option<ReminderRow>,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct TodosListResult {
    pub items: Vec<TodoWithReminder>,
    #[cfg_attr(test, ts(type = "number"))]
    pub total: i64,
}

// ── Reminders Domain Structs ──

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct ReminderRow {
    pub notification_id: i32,
    #[cfg_attr(test, ts(type = "number"))]
    pub fire_at: i64,
    pub status: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct ReminderDueItem {
    pub todo_id: String,
    /// The to-do's meeting and its title; none for a to-do of its own.
    pub meeting_id: Option<String>,
    pub todo_text: String,
    pub meeting_title: Option<String>,
    #[cfg_attr(test, ts(type = "number"))]
    pub fire_at: i64,
    pub notification_id: i32,
}

// ── Settings Structs ──

#[derive(Debug, Serialize)]
pub struct SettingsEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct SettingsSetInput {
    pub key: String,
    pub value: String,
}

// ── Providers Structs ──

/// A provider as the webview gets it: its API key decrypted from its row, also in its settings' API-key field.
#[derive(Debug, Serialize)]
pub struct ProviderRow {
    pub provider: String,
    pub active: bool,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub data: Option<String>,
    pub updated_at: i64,
}

/// A provider to save: its API key is encrypted into its row; its settings are saved without it.
#[derive(Debug, Deserialize)]
pub struct ProviderUpsertInput {
    pub provider: String,
    pub active: Option<bool>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub data: Option<String>,
}

// ── RAG Indexing Structs (carried over, fixed to match schema) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkData {
    pub chunk_index: i32,
    pub chunk_text: String,
    pub chunk_type: String,
    pub embedding: Option<Vec<f32>>,
    pub start_pos: Option<i32>,
    pub end_pos: Option<i32>,
}

/// The search index as Settings shows it: meetings and chats that have pieces, and how many pieces of each kind.
#[derive(Debug, Serialize)]
pub struct IndexStats {
    pub indexed_meetings: i64,
    pub indexed_chats: i64,
    pub transcript_pieces: i64,
    pub chat_pieces: i64,
}

// ── Chat Indexing Structs ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSearchHit {
    pub chat_id: String,
    pub chat_title: String,
    pub chunk_text: String,
    pub chunk_type: String,
    pub score: f64,
    pub last_message_at: i64,
}

// ── Chat Domain Structs (Phase 2) ──

#[derive(Debug, Serialize)]
pub struct ChatIndexRow {
    pub id: String,
    pub title: String,
    pub last_message_at: i64,
    pub message_count: i32,
}

#[derive(Debug, Serialize)]
pub struct ChatMessageRow {
    pub id: String,
    pub seq: i32,
    pub role: String,
    pub text: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub data: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ChatSessionResult {
    pub id: String,
    pub title: String,
    pub meeting_id: Option<String>,
    pub last_message_at: i64,
    pub messages: Vec<ChatMessageRow>,
}

#[derive(Debug, Deserialize)]
pub struct ChatMessageInput {
    pub id: String,
    pub role: String,
    pub text: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub data: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct ChatsUpsertInput {
    pub id: String,
    pub title: String,
    pub meeting_id: Option<String>,
    pub last_message_at: i64,
    pub messages: Vec<ChatMessageInput>,
    pub created_at: Option<i64>,
    /// Every app-data file the messages reference: the chat owns exactly these.
    pub asset_paths: Vec<String>,
}

// ── Dictation Structs ──

#[derive(Debug, Serialize, Deserialize)]
pub struct DictationRow {
    pub id: String,
    pub text: String,
    pub created_at: i64,
    pub duration_ms: Option<i64>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DictationsListResult {
    pub items: Vec<DictationRow>,
    pub total: i64,
}

// ── Usage Structs ──

#[derive(Debug, Serialize, Deserialize)]
pub struct UsageRecord {
    pub id: String,
    pub timestamp: i64,
    pub category: String,
    pub session_id: Option<String>,
    pub provider: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: Option<i64>,
    pub cache_write_tokens: Option<i64>,
    pub reasoning_tokens: Option<i64>,
    pub estimated_cost: Option<f64>,
    /// Length of the audio a speech call heard or spoke, in seconds (0 for text calls).
    pub audio_seconds: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProviderModelBreakdown {
    pub provider: String,
    pub model: String,
    pub calls: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub reasoning_tokens: i64,
    pub estimated_cost: f64,
    /// Calls with no known price (cloud models models.dev doesn't price): left out of `estimated_cost`, never counted as free.
    pub unpriced_calls: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryBreakdown {
    pub category: String,
    pub calls: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub estimated_cost: f64,
    /// Calls with no known price, left out of `estimated_cost`.
    pub unpriced_calls: i64,
}

/// One tool's calls in a window: how many, how many failed, how long they took on average, and the last one.
#[derive(Debug, Serialize, Deserialize)]
pub struct ToolBreakdown {
    pub tool: String,
    pub calls: i64,
    pub failed: i64,
    /// None when no call recorded its time.
    pub avg_ms: Option<f64>,
    pub last_used: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsageSummary {
    pub total_cost: f64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cache_read_tokens: i64,
    pub total_calls: i64,
    /// Calls whose cost is unknown (NULL: a cloud model with no known price); left out of `total_cost`.
    pub unpriced_calls: i64,
    /// Earliest record in the window (epoch ms); none when the window is empty.
    pub first_timestamp: Option<i64>,
    pub by_provider_model: Vec<ProviderModelBreakdown>,
    pub by_category: Vec<CategoryBreakdown>,
    /// The AI's tool calls in chats, most used first.
    pub by_tool: Vec<ToolBreakdown>,
    /// Totals per local day or month, oldest first; only buckets with records, empty unless `bucket` was asked for.
    pub trend: Vec<UsageBucket>,
}

/// Calendar bucket for a usage trend, in the machine's local time zone.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UsageBucketSize {
    Day,
    Month,
}

/// Which usage rows to sum: a time window `[since, until)` and optional provider / model / category.
#[derive(Debug, Default, Deserialize)]
pub struct UsageQuery {
    pub since: Option<i64>,
    pub until: Option<i64>,
    pub bucket: Option<UsageBucketSize>,
}

/// One trend bucket: `key` is the local date (`YYYY-MM-DD`) or month (`YYYY-MM`).
#[derive(Debug, Serialize, Deserialize)]
pub struct UsageBucket {
    pub key: String,
    pub calls: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub estimated_cost: f64,
}

// ── Helpers ──

pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub(crate) fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn upsert_categories(
    conn: &Connection,
    category_names: &[String],
    now: i64,
) -> Result<Vec<String>, StoreError> {
    let mut category_ids = Vec::new();
    let mut stmt = conn.prepare(
        "INSERT INTO categories (id, name, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET name = excluded.name
         RETURNING id",
    )?;
    for name in category_names {
        let id: String = stmt.query_row(
            rusqlite::params![generate_id(), name, now],
            |row| row.get(0),
        )?;
        category_ids.push(id);
    }
    Ok(category_ids)
}

fn sync_meeting_categories(
    conn: &Connection,
    meeting_id: &str,
    category_ids: &[String],
) -> Result<(), StoreError> {
    conn.execute(
        "DELETE FROM meeting_categories WHERE meeting_id = ?1",
        [meeting_id],
    )?;
    let mut stmt = conn.prepare(
        "INSERT OR IGNORE INTO meeting_categories (meeting_id, category_id) VALUES (?1, ?2)",
    )?;
    for cat_id in category_ids {
        stmt.execute(rusqlite::params![meeting_id, cat_id])?;
    }
    Ok(())
}

fn get_meeting_categories(conn: &Connection, meeting_id: &str) -> Result<Vec<String>, StoreError> {
    let mut stmt = conn.prepare(
        "SELECT c.name FROM categories c
         JOIN meeting_categories mc ON mc.category_id = c.id
         WHERE mc.meeting_id = ?1
         ORDER BY c.name",
    )?;
    let names: Vec<String> = stmt
        .query_map([meeting_id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(names)
}

fn get_meeting_categories_for_ids(
    conn: &Connection,
    meeting_ids: &[String],
) -> Result<std::collections::HashMap<String, Vec<String>>, StoreError> {
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    if meeting_ids.is_empty() {
        return Ok(map);
    }
    let placeholders: Vec<String> = meeting_ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT mc.meeting_id, c.name FROM categories c
         JOIN meeting_categories mc ON mc.category_id = c.id
         WHERE mc.meeting_id IN ({})
         ORDER BY c.name",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&sql)?;
    let params: Vec<&dyn rusqlite::types::ToSql> = meeting_ids
        .iter()
        .map(|id| id as &dyn rusqlite::types::ToSql)
        .collect();
    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        if let Ok((mid, name)) = row {
            map.entry(mid).or_default().push(name);
        }
    }
    Ok(map)
}

/// Runs `work` on the open database off the async runtime, holding the lock only for `work`.
pub(crate) async fn on_db<T, F>(state: &StoreState, work: F) -> Result<T, StoreError>
where
    T: Send + 'static,
    F: FnOnce(&Connection) -> Result<T, StoreError> + Send + 'static,
{
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        work(db)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── DB Init ──

#[tauri::command]
pub async fn initialize<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, StoreState>,
) -> Result<(), StoreError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| StoreError::from(format!("Failed to get app data dir: {}", e)))?;
    std::fs::create_dir_all(&app_data)
        .map_err(|e| StoreError::from(format!("Failed to create app data dir: {}", e)))?;
    let db_path = app_data.join("roci.db");

    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        if guard.is_some() {
            return Ok(());
        }

        log::info!("[store] Opening database at {:?}", db_path);

        unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(
                sqlite_vec::sqlite3_vec_init as *const (),
            )));
        }

        let db = Connection::open(&db_path)
            .map_err(|e| StoreError::from(format!("Failed to open database: {}", e)))?;

        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")
            .map_err(|e| StoreError::from(format!("Failed to set pragmas: {}", e)))?;

        schema::migrate(&db)?;
        // An image adoption that failed leaves real images without rows: no sweep this launch, or it would take them.
        match asset_adoption::adopt_images(&db, &app_data) {
            Ok(()) => {
                if let Err(error) = assets::sweep(&db, &app_data, now_millis()) {
                    log::error!("[store] Sweep at open failed: {}", error.message);
                }
            }
            Err(error) => log::error!("[store] Image adoption failed, sweep skipped: {}", error.message),
        }
        assets::set_app_data(app_data);

        log::info!("[store] Database initialized successfully");
        *guard = Some(db);
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Meeting Domain Commands ──

/// The status columns starting at `first` (status, failed_step, error).
fn status_at(row: &rusqlite::Row<'_>, first: usize) -> rusqlite::Result<MeetingStatus> {
    Ok(MeetingStatus {
        status: row.get(first)?,
        failed_step: row.get(first + 1)?,
        error: row.get(first + 2)?,
    })
}

pub(crate) fn meetings_get_impl(db: &Connection, id: &str) -> Result<MeetingDetail, StoreError> {
        type DetailRow = (String, String, Option<String>, MeetingStatus, Option<String>, Option<String>, i64, i64, Option<i64>);
        let meeting: DetailRow = db
            .query_row(
                "SELECT id, title, input_source, status, failed_step, error,
                        calendar_event_id, calendar_meta, created_at, updated_at, audio_removed_at
                 FROM meetings WHERE id = ?1",
                [&id],
                |row| Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, status_at(row, 3)?,
                    row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?,
                )),
            )
            .map_err(|_| StoreError::from("Meeting not found"))?;

        let categories = get_meeting_categories(db, id)?;

        let transcript: Option<TranscriptRow> = db.query_row(
            "SELECT text, language, model, segments, created_at FROM transcripts WHERE meeting_id = ?1",
            [&id],
            |row| Ok(TranscriptRow {
                text: row.get(0)?,
                language: row.get(1)?,
                model: row.get(2)?,
                segments: row.get(3)?,
                created_at: row.get(4)?,
            }),
        ).optional()?;

        let summary: Option<SummaryRow> = db.query_row(
            "SELECT overview, data, created_at, updated_at FROM summaries WHERE meeting_id = ?1",
            [&id],
            |row| Ok(SummaryRow {
                overview: row.get(0)?,
                data: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            }),
        ).optional()?;

        let mut rec_stmt = db.prepare(
            "SELECT id, path, duration_seconds, created_at FROM assets
             WHERE meeting_id = ?1 AND kind = 'recording' ORDER BY created_at",
        )?;
        let recordings: Vec<RecordingRow> = rec_stmt
            .query_map([&id], |row| {
                Ok(RecordingRow {
                    id: row.get(0)?,
                    filename: assets::recording_filename(&row.get::<_, String>(1)?),
                    duration_seconds: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut notes_stmt = db.prepare(
            "SELECT id, text, created_at, updated_at FROM notes WHERE meeting_id = ?1 ORDER BY created_at",
        )?;
        let notes: Vec<NoteRow> = notes_stmt
            .query_map([&id], |row| {
                Ok(NoteRow {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut todos_stmt = db.prepare(
            "SELECT id, text, owner, due_date, completed, source, created_at FROM todos WHERE meeting_id = ?1 ORDER BY created_at",
        )?;
        let todos: Vec<TodoRow> = todos_stmt
            .query_map([&id], |row| {
                Ok(TodoRow {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    owner: row.get(2)?,
                    due_date: row.get(3)?,
                    completed: row.get::<_, i32>(4)? != 0,
                    source: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(MeetingDetail {
            id: meeting.0,
            title: meeting.1,
            input_source: meeting.2,
            status: meeting.3,
            calendar_event_id: meeting.4,
            calendar_meta: meeting.5,
            created_at: meeting.6,
            updated_at: meeting.7,
            categories,
            audio_removed_at: meeting.8,
            transcript,
            summary,
            recordings,
            notes,
            todos,
        })
}

/// Which of `ids` are meetings still kept; a chat's meeting chip says "removed" for the rest.
#[tauri::command]
pub async fn meetings_existing(state: State<'_, StoreState>, ids: Vec<String>) -> Result<Vec<String>, StoreError> {
    on_db(&state, move |db| {
        let ids_json = serde_json::to_string(&ids).map_err(|e| StoreError::from(e.to_string()))?;
        let kept = db
            .prepare("SELECT id FROM meetings WHERE id IN (SELECT value FROM json_each(?1))")?
            .query_map([ids_json], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        Ok(kept)
    })
    .await
}

#[tauri::command]
pub async fn meetings_get(
    state: State<'_, StoreState>,
    id: String,
) -> Result<MeetingDetail, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        meetings_get_impl(db, &id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn meetings_upsert_impl(db: &Connection, input: &MeetingUpsertInput) -> Result<(), StoreError> {
        let now = now_millis();

        let tx = db.unchecked_transaction()?;

        let created_at = input.created_at.unwrap_or(now);
        tx.execute(
            "INSERT INTO meetings (id, title, input_source, calendar_event_id, calendar_meta, created_at, updated_at)
             VALUES (?1, COALESCE(?2, ''), ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                title = COALESCE(?2, meetings.title),
                input_source = COALESCE(excluded.input_source, meetings.input_source),
                calendar_event_id = COALESCE(excluded.calendar_event_id, meetings.calendar_event_id),
                calendar_meta = COALESCE(excluded.calendar_meta, meetings.calendar_meta),
                updated_at = ?7",
            rusqlite::params![
                input.id,
                input.title,
                input.input_source,
                input.calendar_event_id,
                input.calendar_meta,
                created_at,
                now,
            ],
        )?;

        // Categories
        if let Some(cat_names) = &input.categories {
            if !cat_names.is_empty() {
                let cat_ids = upsert_categories(&tx, cat_names, now)?;
                sync_meeting_categories(&tx, &input.id, &cat_ids)?;
            }
        }


        tx.commit()?;
        Ok(())
}

#[tauri::command]
pub async fn meetings_upsert(
    state: State<'_, StoreState>,
    input: MeetingUpsertInput,
) -> Result<(), StoreError> {
    let meeting_id = input.id.clone();
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        meetings_upsert_impl(db, &input)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    notify(MeetingChange::Saved(meeting_id));
    Ok(())
}

fn note_meeting_id(db: &Connection, id: &str) -> Result<Option<String>, StoreError> {
    Ok(db
        .query_row("SELECT meeting_id FROM notes WHERE id = ?1", [id], |row| row.get(0))
        .optional()?)
}

fn todo_meeting_id(db: &Connection, id: &str) -> Result<Option<String>, StoreError> {
    Ok(db
        .query_row("SELECT meeting_id FROM todos WHERE id = ?1", [id], |row| row.get::<_, Option<String>>(0))
        .optional()?
        .flatten())
}

/// Deletes a meeting and everything it owns in one transaction; its files are queued, removed by `assets::drain_files`.
pub(crate) fn meetings_delete_impl(db: &Connection, id: &str) -> Result<(), StoreError> {
    let tx = db.unchecked_transaction()?;
    delete_meeting_rows(&tx, id)?;
    tx.commit()?;
    Ok(())
}

/// A meeting and everything it owns, inside the caller's transaction; its files are queued for `assets::drain_files`.
pub(crate) fn delete_meeting_rows(tx: &Connection, id: &str) -> Result<(), StoreError> {
    // vec_chunks is a virtual table with no FK cascade.
    let chunk_ids: Vec<i64> = tx
        .prepare("SELECT id FROM chunks WHERE meeting_id = ?1")?
        .query_map([id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    for cid in &chunk_ids {
        tx.execute("DELETE FROM vec_chunks WHERE chunk_id = ?1", [cid])?;
    }
    // FTS5 triggers follow the chunks.
    tx.execute("DELETE FROM chunks WHERE meeting_id = ?1", [id])?;
    // CASCADE removes the meeting's transcripts, summaries, notes, todos, reminders, assets and index state.
    tx.execute("DELETE FROM meetings WHERE id = ?1", [id])?;
    log::info!("[store] Deleted meeting {} ({} chunks)", id, chunk_ids.len());
    Ok(())
}

#[tauri::command]
pub async fn meetings_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<(), StoreError> {
    let deleted_id = id.clone();
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        meetings_delete_impl(db, &id)?;
        assets::drain_files(db);
        Ok::<(), StoreError>(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    notify(MeetingChange::Deleted(deleted_id));
    Ok(())
}

/// Creates the meeting (and its recording row, and its transcript when it comes with one) in one write. False, changing
/// nothing, when a meeting with this id already exists: an import that raced another is a no-op, not an error.
pub(crate) fn meetings_create_impl(db: &Connection, input: &MeetingCreateInput) -> Result<bool, StoreError> {
        let created_at = input.created_at.unwrap_or_else(now_millis);
        let tx = db.unchecked_transaction()?;
        let inserted = tx.execute(
            "INSERT INTO meetings (id, title, title_source, status, input_source, calendar_event_id, calendar_meta, created_at, updated_at)
             VALUES (?1, ?2, CASE WHEN ?5 IS NULL THEN 'default' ELSE 'calendar' END, ?3, ?4, ?5, ?6, ?7, ?7)
             ON CONFLICT(id) DO NOTHING",
            rusqlite::params![
                input.id,
                input.title,
                input.status,
                input.input_source,
                input.calendar_event_id,
                input.calendar_meta,
                created_at,
            ],
        )? > 0;
        if !inserted {
            return Ok(false);
        }
        if let Some(filename) = &input.recording_filename {
            assets::insert_recording(&tx, &generate_id(), &input.id, filename, created_at)?;
        }
        if let Some(transcript) = &input.transcript {
            write_transcript(&tx, &input.id, transcript)?;
        }
        tx.commit()?;
        Ok(true)
}

pub(crate) fn meetings_set_status_impl(db: &Connection, id: &str, status: &MeetingStatus) -> Result<(), StoreError> {
        let changed = db.execute(
            "UPDATE meetings SET status = ?2, failed_step = ?3, error = ?4, updated_at = ?5 WHERE id = ?1",
            rusqlite::params![id, status.status, status.failed_step, status.error, now_millis()],
        )?;
        if changed == 0 {
            return Err(StoreError::from("Meeting not found"));
        }
        Ok(())
}

/// Writes a meeting's transcript (replacing any earlier one) and moves the meeting to `transcribed`.
fn write_transcript(tx: &Connection, meeting_id: &str, transcript: &NewTranscript) -> Result<(), StoreError> {
        tx.execute(
            "INSERT INTO transcripts (meeting_id, text, language, model, segments, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(meeting_id) DO UPDATE SET
                text = excluded.text,
                language = excluded.language,
                model = excluded.model,
                segments = excluded.segments",
            rusqlite::params![meeting_id, transcript.text, transcript.language, transcript.model, transcript.segments, now_millis()],
        )?;
        meetings_set_status_impl(tx, meeting_id, &MeetingStatus::at("transcribed"))
}

fn transcripts_save_impl(db: &Connection, input: &TranscriptSaveInput) -> Result<(), StoreError> {
        let tx = db.unchecked_transaction()?;
        write_transcript(&tx, &input.meeting_id, &input.transcript)?;
        tx.commit()?;
        Ok(())
}

/// Untouched AI to-dos a new summary replaces: not ticked, not edited, no scheduled reminder.
const REPLACED_AI_TODOS: &str = "meeting_id = ?1 AND source = 'ai' AND completed = 0
               AND id NOT IN (SELECT todo_id FROM reminders WHERE status = 'scheduled')";

/// What saving a summary did to the meeting's to-dos, so the webview mirrors exactly that (Reminders): the old AI to-dos it
/// replaced, and the new ones it added.
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct SummarySaved {
    pub replaced_todo_ids: Vec<String>,
    pub new_todo_ids: Vec<String>,
}

/// Saves the summary and its action items.
fn summaries_save_impl(db: &Connection, input: &SummarySaveInput) -> Result<SummarySaved, StoreError> {
        let now = now_millis();
        let tx = db.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO summaries (meeting_id, overview, data, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(meeting_id) DO UPDATE SET
                overview = excluded.overview,
                data = excluded.data,
                updated_at = ?4",
            rusqlite::params![input.meeting_id, input.overview, input.data, now],
        )?;
        // the summary names the meeting only when nobody else did: never over a calendar title or the user's own
        tx.execute(
            "UPDATE meetings SET title = ?2, title_source = 'ai'
             WHERE id = ?1 AND ?2 <> '' AND title_source IN ('default', 'ai')",
            rusqlite::params![input.meeting_id, input.title],
        )?;
        // a new summary's action items replace the last one's, except those the user ticked, edited or set a reminder on
        let removed = tx
            .prepare(&format!("SELECT id FROM todos WHERE {REPLACED_AI_TODOS}"))?
            .query_map([&input.meeting_id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        tx.execute(&format!("DELETE FROM todos WHERE {REPLACED_AI_TODOS}"), [&input.meeting_id])?;
        if !input.categories.is_empty() {
            let cat_ids = upsert_categories(&tx, &input.categories, now)?;
            sync_meeting_categories(&tx, &input.meeting_id, &cat_ids)?;
        }
        let mut added = Vec::with_capacity(input.action_items.len());
        for item in &input.action_items {
            let id = generate_id();
            tx.execute(
                "INSERT INTO todos (id, meeting_id, text, owner, due_date, completed, source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0, 'ai', ?6)",
                rusqlite::params![id, input.meeting_id, item.text, item.owner, item.due_date, now],
            )?;
            added.push(id);
        }
        meetings_set_status_impl(&tx, &input.meeting_id, &MeetingStatus::at("ready"))?;
        tx.commit()?;
        log::info!(
            "[store] Saved summary for meeting {}: action_items={} replaced={}",
            input.meeting_id,
            input.action_items.len(),
            removed.len(),
        );
        Ok(SummarySaved { replaced_todo_ids: removed, new_todo_ids: added })
}

/// A summary with two action items, for tests of what saving one does to the meeting.
#[cfg(test)]
pub(crate) fn summaries_save_for_test(db: &Connection, meeting_id: &str, title: &str) -> Result<SummarySaved, StoreError> {
    let item = |text: &str| ActionItemInput { text: text.into(), owner: None, due_date: None };
    summaries_save_impl(
        db,
        &SummarySaveInput {
            meeting_id: meeting_id.into(),
            title: title.into(),
            overview: "Overview".into(),
            data: "{}".into(),
            categories: Vec::new(),
            action_items: vec![item("Send the brief"), item("Book the room")],
        },
    )
}

/// Runs `write` on the open database off the async runtime, then announces the meeting change.
pub(crate) async fn write_meeting<T, F>(state: &StoreState, meeting_id: String, write: F) -> Result<T, StoreError>
where
    T: Send + 'static,
    F: FnOnce(&Connection) -> Result<T, StoreError> + Send + 'static,
{
    let written = on_db(state, write).await?;
    notify(MeetingChange::Saved(meeting_id));
    Ok(written)
}

#[tauri::command]
pub async fn meetings_create(state: State<'_, StoreState>, input: MeetingCreateInput) -> Result<bool, StoreError> {
    write_meeting(&state, input.id.clone(), move |db| meetings_create_impl(db, &input)).await
}

#[tauri::command]
pub async fn transcripts_save(state: State<'_, StoreState>, input: TranscriptSaveInput) -> Result<(), StoreError> {
    write_meeting(&state, input.meeting_id.clone(), move |db| transcripts_save_impl(db, &input)).await
}

/// Returns which AI to-dos the new summary replaced and which it added, so the webview mirrors exactly that.
#[tauri::command]
pub async fn summaries_save(state: State<'_, StoreState>, input: SummarySaveInput) -> Result<SummarySaved, StoreError> {
    write_meeting(&state, input.meeting_id.clone(), move |db| summaries_save_impl(db, &input)).await
}

// ── Category Commands ──

#[tauri::command]
pub async fn categories_list(
    state: State<'_, StoreState>,
) -> Result<Vec<CategoryRow>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let mut stmt = db.prepare("SELECT id, name, created_at FROM categories ORDER BY name")?;
        let rows: Vec<CategoryRow> = stmt
            .query_map([], |row| {
                Ok(CategoryRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn categories_rename(
    state: State<'_, StoreState>,
    id: String,
    name: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let affected = db.execute(
            "UPDATE categories SET name = ?2 WHERE id = ?1",
            rusqlite::params![id, name],
        )?;
        if affected == 0 {
            return Err(StoreError::from("Category not found"));
        }
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn categories_create(
    state: State<'_, StoreState>,
    name: String,
) -> Result<CategoryRow, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let now = now_millis();
        let id = generate_id();
        db.execute(
            "INSERT INTO categories (id, name, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, name, now],
        )?;
        Ok(CategoryRow { id, name, created_at: now })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn categories_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let tx = db.unchecked_transaction()?;
        let affected = tx.execute("DELETE FROM categories WHERE id = ?1", [&id])?;
        if affected == 0 {
            return Err(StoreError::from("Category not found"));
        }
        tx.commit()?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Notes Commands ──

#[tauri::command]
pub async fn notes_list(
    state: State<'_, StoreState>,
    meeting_id: String,
) -> Result<Vec<NoteRow>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let mut stmt = db.prepare(
            "SELECT id, text, created_at, updated_at FROM notes WHERE meeting_id = ?1 ORDER BY created_at",
        )?;
        let notes: Vec<NoteRow> = stmt
            .query_map([&meeting_id], |row| {
                Ok(NoteRow {
                    id: row.get(0)?,
                    text: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(notes)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn notes_upsert(
    state: State<'_, StoreState>,
    input: NoteUpsertInput,
) -> Result<(), StoreError> {
    let meeting_id = input.meeting_id.clone();
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let now = now_millis();
        let created_at = input.created_at.unwrap_or(now);

        let tx = db.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO notes (id, meeting_id, text, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = ?5",
            rusqlite::params![input.id, input.meeting_id, input.text, created_at, now],
        )?;


        tx.commit()?;
        Ok::<_, StoreError>(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    notify(MeetingChange::Saved(meeting_id));
    Ok(())
}

#[tauri::command]
pub async fn notes_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    let meeting_id = tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let meeting_id = note_meeting_id(db, &id)?;
        let tx = db.unchecked_transaction()?;
        let affected = tx.execute("DELETE FROM notes WHERE id = ?1", [&id])?;
        if affected == 0 {
            return Err(StoreError::from("Note not found"));
        }
        tx.commit()?;
        Ok::<_, StoreError>(meeting_id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    if let Some(meeting_id) = meeting_id {
        notify(MeetingChange::Saved(meeting_id));
    }
    Ok(())
}

// ── Todos Commands ──

/// A to-do row with its meeting's title (none for a to-do of its own) and its scheduled reminder.
const TODO_SELECT: &str = "SELECT t.id, t.meeting_id, m.title, t.text, t.owner, t.due_date, t.completed, t.source, t.created_at,
        r.notification_id, r.fire_at, r.status, r.created_at, m.created_at
 FROM todos t
 LEFT JOIN meetings m ON m.id = t.meeting_id
 LEFT JOIN reminders r ON r.todo_id = t.id AND r.status = 'scheduled'";

fn todo_row(row: &rusqlite::Row) -> rusqlite::Result<TodoWithReminder> {
    let reminder = row.get::<_, Option<i32>>(9)?.map(|notification_id| -> rusqlite::Result<ReminderRow> {
        Ok(ReminderRow {
            notification_id,
            fire_at: row.get::<_, Option<i64>>(10)?.unwrap_or(0),
            status: row.get::<_, Option<String>>(11)?.unwrap_or_else(|| "scheduled".into()),
            created_at: row.get::<_, Option<i64>>(12)?.unwrap_or(0),
        })
    }).transpose()?;
    Ok(TodoWithReminder {
        id: row.get(0)?,
        meeting_id: row.get(1)?,
        meeting_title: row.get(2)?,
        meeting_created_at: row.get(13)?,
        text: row.get(3)?,
        owner: row.get(4)?,
        due_date: row.get(5)?,
        completed: row.get::<_, i32>(6)? != 0,
        source: row.get(7)?,
        created_at: row.get(8)?,
        reminder,
    })
}

fn collect_todos_with_reminders(
    conn: &Connection,
    meeting_id_opt: Option<&str>,
    completed_filter: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<(Vec<TodoWithReminder>, i64), StoreError> {
    let filter = "(?1 IS NULL OR t.meeting_id = ?1) AND (?2 IS NULL OR t.completed = ?2)";
    let filters = rusqlite::params![meeting_id_opt, completed_filter.map(i32::from)];
    let total: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM todos t WHERE {filter}"), filters, |row| row.get(0))?;
    let mut stmt = conn.prepare(&format!("{TODO_SELECT} WHERE {filter} ORDER BY t.created_at DESC LIMIT ?3 OFFSET ?4"))?;
    let rows = stmt.query_map(
        rusqlite::params![meeting_id_opt, completed_filter.map(i32::from), limit.unwrap_or(200), offset.unwrap_or(0)],
        todo_row,
    )?;
    let items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    Ok((items, total))
}

/// The to-dos with these ids, in no particular order; unknown ids are left out.
fn todos_get_impl(conn: &Connection, ids: &[String]) -> Result<Vec<TodoWithReminder>, StoreError> {
    let ids = serde_json::to_string(ids).map_err(|e| StoreError::from(format!("encode ids: {}", e)))?;
    let mut stmt = conn.prepare(&format!("{TODO_SELECT} WHERE t.id IN (SELECT value FROM json_each(?1))"))?;
    let rows = stmt.query_map([ids], todo_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[tauri::command]
pub async fn todos_get(
    state: State<'_, StoreState>,
    ids: Vec<String>,
) -> Result<Vec<TodoWithReminder>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        todos_get_impl(db, &ids)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn todos_list_for_meeting(
    state: State<'_, StoreState>,
    meeting_id: String,
) -> Result<Vec<TodoWithReminder>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let (items, _) = collect_todos_with_reminders(db, Some(&meeting_id), None, None, None)?;
        Ok(items)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn todos_list_global(
    state: State<'_, StoreState>,
    completed: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<TodosListResult, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let (items, total) = collect_todos_with_reminders(db, None, completed, limit, offset)?;
        Ok(TodosListResult { items, total })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn todos_upsert_impl(db: &Connection, input: &TodoUpsertInput) -> Result<(), StoreError> {
        let now = now_millis();
        let created_at = input.created_at.unwrap_or(now);

        let tx = db.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO todos (id, meeting_id, text, owner, due_date, completed, source, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                text = excluded.text,
                owner = excluded.owner,
                due_date = excluded.due_date,
                completed = excluded.completed,
                -- an AI action item the user rewrites becomes theirs, so a later summary never replaces it
                source = CASE
                    WHEN todos.text IS NOT excluded.text OR todos.owner IS NOT excluded.owner
                      OR todos.due_date IS NOT excluded.due_date THEN 'user'
                    ELSE todos.source
                END",
            rusqlite::params![
                input.id,
                input.meeting_id,
                input.text,
                input.owner,
                input.due_date,
                input.completed.unwrap_or(false) as i32,
                input.source.clone().unwrap_or_else(|| "user".into()),
                created_at,
            ],
        )?;


        tx.commit()?;
        Ok(())
}

#[tauri::command]
pub async fn todos_upsert(
    state: State<'_, StoreState>,
    input: TodoUpsertInput,
) -> Result<(), StoreError> {
    let meeting_id = input.meeting_id.clone();
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        todos_upsert_impl(db, &input)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    if let Some(meeting_id) = meeting_id {
        notify(MeetingChange::Saved(meeting_id));
    }
    Ok(())
}

fn todos_set_completed_impl(db: &Connection, id: &str, completed: bool) -> Result<(), StoreError> {
        let affected = db.execute(
            "UPDATE todos SET completed = ?2 WHERE id = ?1",
            rusqlite::params![id, completed as i32],
        )?;
        if affected == 0 {
            return Err(StoreError::from("Todo not found"));
        }
        Ok(())
}

#[tauri::command]
pub async fn todos_set_completed(
    state: State<'_, StoreState>,
    id: String,
    completed: bool,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    let meeting_id = tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        todos_set_completed_impl(db, &id, completed)?;
        todo_meeting_id(db, &id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    // a ticked to-do changes its meeting like any other write
    if let Some(meeting_id) = meeting_id {
        notify(MeetingChange::Saved(meeting_id));
    }
    Ok(())
}

fn todos_delete_impl(db: &Connection, id: &str) -> Result<(), StoreError> {
        let tx = db.unchecked_transaction()?;
        let affected = tx.execute("DELETE FROM todos WHERE id = ?1", [&id])?;
        if affected == 0 {
            return Err(StoreError::from("Todo not found"));
        }
        tx.commit()?;
        Ok(())
}

#[tauri::command]
pub async fn todos_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    let meeting_id = tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let meeting_id = todo_meeting_id(db, &id)?;
        todos_delete_impl(db, &id)?;
        Ok::<_, StoreError>(meeting_id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    if let Some(meeting_id) = meeting_id {
        notify(MeetingChange::Saved(meeting_id));
    }
    Ok(())
}

// ── Reminders Commands ──

fn reminders_upsert_impl(
    db: &Connection,
    todo_id: &str,
    notification_id: i32,
    fire_at: i64,
) -> Result<(), StoreError> {
        let now = now_millis();

        let tx = db.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO reminders (todo_id, notification_id, fire_at, status, created_at)
             VALUES (?1, ?2, ?3, 'scheduled', ?4)
             ON CONFLICT(todo_id) DO UPDATE SET
                notification_id = excluded.notification_id,
                fire_at = excluded.fire_at,
                status = 'scheduled'",
            rusqlite::params![todo_id, notification_id, fire_at, now],
        )?;
        tx.commit()?;
        Ok(())
}

#[tauri::command]
pub async fn reminders_upsert(
    state: State<'_, StoreState>,
    todo_id: String,
    notification_id: i32,
    fire_at: i64,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        reminders_upsert_impl(db, &todo_id, notification_id, fire_at)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn reminders_set_status_impl(db: &Connection, todo_id: &str, status: &str) -> Result<(), StoreError> {
        let affected = db.execute(
            "UPDATE reminders SET status = ?2 WHERE todo_id = ?1",
            rusqlite::params![todo_id, status],
        )?;
        if affected == 0 {
            return Err(StoreError::from("Reminder not found"));
        }
        Ok(())
}

#[tauri::command]
pub async fn reminders_set_status(
    state: State<'_, StoreState>,
    todo_id: String,
    status: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        reminders_set_status_impl(db, &todo_id, &status)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn reminders_due_impl(db: &Connection) -> Result<Vec<ReminderDueItem>, StoreError> {
        let mut stmt = db.prepare(
            "SELECT r.todo_id, t.meeting_id, t.text, m.title, r.fire_at, r.notification_id
             FROM reminders r
             JOIN todos t ON t.id = r.todo_id
             LEFT JOIN meetings m ON m.id = t.meeting_id
             WHERE r.status = 'scheduled'
             ORDER BY r.fire_at",
        )?;

        let items: Vec<ReminderDueItem> = stmt
            .query_map([], |row| {
                Ok(ReminderDueItem {
                    todo_id: row.get(0)?,
                    meeting_id: row.get(1)?,
                    todo_text: row.get(2)?,
                    meeting_title: row.get(3)?,
                    fire_at: row.get(4)?,
                    notification_id: row.get(5)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(items)
}

#[tauri::command]
pub async fn reminders_due(
    state: State<'_, StoreState>,
) -> Result<Vec<ReminderDueItem>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        reminders_due_impl(db)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn reminders_prune(
    state: State<'_, StoreState>,
    max_age_ms: i64,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let cutoff = now_millis() - max_age_ms;

        db.execute(
            "DELETE FROM reminders WHERE status IN ('fired', 'cancelled') AND created_at < ?1",
            [cutoff],
        )?;

        log::info!("[store] Pruned stale reminders older than {}", cutoff);
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Settings Commands ──

#[tauri::command]
pub async fn settings_get_all(
    state: State<'_, StoreState>,
) -> Result<Vec<SettingsEntry>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let mut stmt = db.prepare("SELECT key, value FROM settings ORDER BY key")?;
        let entries: Vec<SettingsEntry> = stmt
            .query_map([], |row| {
                Ok(SettingsEntry {
                    key: row.get(0)?,
                    value: row.get(1)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(entries)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn settings_set(
    state: State<'_, StoreState>,
    input: SettingsSetInput,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let now = now_millis();

        let tx = db.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            rusqlite::params![input.key, input.value, now],
        )?;
        tx.commit()?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Providers Commands ──

#[tauri::command]
pub async fn providers_list(
    state: State<'_, StoreState>,
) -> Result<Vec<ProviderRow>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let mut stmt = db.prepare(
            "SELECT provider, active, base_url, data, updated_at, api_key FROM providers ORDER BY provider",
        )?;
        let rows: Vec<(ProviderRow, Option<Vec<u8>>)> = stmt
            .query_map([], |row| {
                let provider = ProviderRow {
                    provider: row.get(0)?,
                    active: row.get::<_, i32>(1)? != 0,
                    api_key: None,
                    base_url: row.get(2)?,
                    data: row.get(3)?,
                    updated_at: row.get(4)?,
                };
                Ok((provider, row.get(5)?))
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows.into_iter().map(|(row, sealed)| with_key(row, sealed.as_deref())).collect())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// The row with its decrypted key, in `api_key` and in its settings' API-key field. A key that can't be decrypted reads as
/// none (logged): its provider asks for the key again instead of hiding every provider.
fn with_key(row: ProviderRow, sealed: Option<&[u8]>) -> ProviderRow {
    let key = match sealed.map(crate::api_keys::open) {
        Some(Ok(key)) => key,
        Some(Err(e)) => {
            log::warn!("[store] {} API key unreadable: {}", row.provider, e);
            String::new()
        }
        None => String::new(),
    };
    let data = crate::api_keys::with_key_in_settings(row.data, &key);
    ProviderRow { api_key: (!key.is_empty()).then_some(key), data, ..row }
}

#[tauri::command]
pub async fn providers_upsert(
    state: State<'_, StoreState>,
    input: ProviderUpsertInput,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let now = now_millis();

        let key = input.api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()).map(str::to_string)
            .or_else(|| crate::api_keys::key_in_settings(input.data.as_deref()))
            .unwrap_or_default();
        let sealed = if key.is_empty() { None } else { Some(crate::api_keys::seal(&key)?) };
        let data = crate::api_keys::with_key_in_settings(input.data, "");

        let tx = db.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO providers (provider, active, base_url, data, updated_at, api_key)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(provider) DO UPDATE SET
                active = excluded.active,
                base_url = excluded.base_url,
                data = excluded.data,
                updated_at = excluded.updated_at,
                api_key = excluded.api_key",
            rusqlite::params![
                input.provider,
                input.active.unwrap_or(false) as i32,
                input.base_url,
                data,
                now,
                sealed,
            ],
        )?;
        tx.commit()?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn providers_set_active(
    state: State<'_, StoreState>,
    provider: String,
    active: bool,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let now = now_millis();
        let affected = db.execute(
            "UPDATE providers SET active = ?2, updated_at = ?3 WHERE provider = ?1",
            rusqlite::params![provider, active as i32, now],
        )?;
        if affected == 0 {
            return Err(StoreError::from("Provider not found"));
        }
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn providers_delete(
    state: State<'_, StoreState>,
    provider: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let affected = db.execute("DELETE FROM providers WHERE provider = ?1", [&provider])?;
        if affected == 0 {
            return Err(StoreError::from("Provider not found"));
        }
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Meeting list rows (no transcript or summary) for a query tail (`WHERE` / `ORDER BY` / `LIMIT` over `meetings m`); a row that
/// can't be read fails the read rather than vanishing from the list.
fn meeting_rows(db: &Connection, tail: &str, params: impl rusqlite::Params) -> Result<Vec<MeetingRow>, StoreError> {
    let mut stmt = db.prepare(&format!(
        "SELECT m.id, m.title, m.input_source, m.status, m.failed_step, m.error,
                m.calendar_event_id, m.calendar_meta, m.created_at, m.updated_at,
                (SELECT a.path FROM assets a WHERE a.meeting_id = m.id AND a.kind = 'recording'
                 ORDER BY a.created_at LIMIT 1),
                m.audio_removed_at
         FROM meetings m {tail}"
    ))?;
    type ListRow = (String, String, Option<String>, MeetingStatus, Option<String>, Option<String>, i64, i64, Option<String>, Option<i64>);
    let rows: Vec<ListRow> = stmt
        .query_map(params, |row| {
            Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, status_at(row, 3)?,
                row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?, row.get(11)?,
            ))
        })?
        .collect::<Result<_, _>>()?;
    let ids: Vec<String> = rows.iter().map(|r| r.0.clone()).collect();
    let category_map = get_meeting_categories_for_ids(db, &ids)?;
    Ok(rows
        .into_iter()
        .map(|(id, title, input_source, status, ceid, cmeta, cat, uat, recording, audio_removed_at)| MeetingRow {
            categories: category_map.get(&id).cloned().unwrap_or_default(),
            recording_filename: recording.as_deref().map(assets::recording_filename),
            id, title, input_source, status,
            calendar_event_id: ceid, calendar_meta: cmeta, created_at: cat, updated_at: uat, audio_removed_at,
        })
        .collect())
}

/// Chat list rows (no messages) for a query tail over `chats c`; a row that can't be read fails the read.
fn chat_rows(db: &Connection, tail: &str, params: impl rusqlite::Params) -> Result<Vec<ChatIndexRow>, StoreError> {
    Ok(db
        .prepare(&format!(
            "SELECT c.id, c.title, c.last_message_at,
                    (SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) AS message_count
             FROM chats c {tail}"
        ))?
        .query_map(params, |row| {
            Ok(ChatIndexRow { id: row.get(0)?, title: row.get(1)?, last_message_at: row.get(2)?, message_count: row.get(3)? })
        })?
        .collect::<Result<_, _>>()?)
}

// ── Items: meetings and chats, read the same way ──

/// Where a page ends: its last item's time and id (newest first; equal times ordered by id).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemCursor {
    pub at: i64,
    pub id: String,
}

/// One kind of item: a meeting (by when it was made) or a chat that has messages (by its last message).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemKind {
    Meeting,
    Chat,
}

/// One item as every list shows it: name, time and status only (no transcript, summary or messages).
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Item {
    Meeting(MeetingRow),
    Chat(ChatIndexRow),
}

impl Item {
    fn key(&self) -> (i64, &str) {
        match self {
            Item::Meeting(m) => (m.created_at, m.id.as_str()),
            Item::Chat(c) => (c.last_message_at, c.id.as_str()),
        }
    }
}

/// Which items a read covers: both kinds, or one, inside an optional time window and with every word in the title.
#[derive(Debug, Default, Deserialize)]
pub struct ItemFilter {
    pub kind: Option<ItemKind>,
    /// Epoch ms, inclusive.
    pub since: Option<i64>,
    /// Epoch ms, exclusive.
    pub until: Option<i64>,
    /// Words the title must all contain (any case).
    pub words: Option<Vec<String>>,
    /// Meetings in one of these statuses (meetings only).
    pub statuses: Option<Vec<String>>,
    /// Meetings recorded from this calendar event (meetings only).
    pub calendar_event: Option<String>,
}

impl ItemFilter {
    fn wants(&self, kind: ItemKind) -> bool {
        let meetings_only = self.statuses.is_some() || self.calendar_event.is_some();
        self.kind.is_none_or(|k| k == kind) && !(meetings_only && kind == ItemKind::Chat)
    }

    /// `AND`-joined conditions over one table's time and title columns, numbered after the cursor (?1, ?2) and limit (?3).
    fn conditions(&self, time: &str, title: &str) -> (String, Vec<rusqlite::types::Value>) {
        use rusqlite::types::Value;
        let mut sql = String::new();
        let mut values = Vec::new();
        let mut add = |clause: String, value: Value| {
            values.push(value);
            sql.push_str(&format!(" AND {}", clause.replace('#', &format!("?{}", values.len() + 3))));
        };
        if let Some(since) = self.since {
            add(format!("{time} >= #"), Value::Integer(since));
        }
        if let Some(until) = self.until {
            add(format!("{time} < #"), Value::Integer(until));
        }
        for word in self.words.iter().flatten().map(|w| w.trim()).filter(|w| !w.is_empty()) {
            add(format!("{title} LIKE '%' || # || '%' ESCAPE '!'"), Value::Text(escape_like(word)));
        }
        if let Some(statuses) = &self.statuses {
            add("m.status IN (SELECT value FROM json_each(#))".into(), Value::Text(serde_json::to_string(statuses).unwrap_or_default()));
        }
        if let Some(event) = &self.calendar_event {
            add("m.calendar_event_id = #".into(), Value::Text(event.clone()));
        }
        (sql, values)
    }
}

/// A word as a LIKE pattern matches it literally: its `%`, `_` and the escape mark `!` are escaped with `!`.
fn escape_like(word: &str) -> String {
    word.replace('!', "!!").replace('%', "!%").replace('_', "!_")
}

/// The next `limit` items after `before` (from the newest when none) that `filter` covers, meetings and chats merged by time:
/// the sidebar, a screen's recent meetings, a picker's matches and the AI's list tools all read this one way.
fn items_page_impl(db: &Connection, before: Option<&ItemCursor>, limit: u32, filter: &ItemFilter) -> Result<Vec<Item>, StoreError> {
    use rusqlite::types::Value;
    let (at, id) = before.map_or((Value::Null, Value::Text(String::new())), |c| (Value::Integer(c.at), Value::Text(c.id.clone())));
    let base = [at, id, Value::Integer(limit as i64)];
    let mut items = Vec::new();
    if filter.wants(ItemKind::Meeting) {
        let (extra, values) = filter.conditions("m.created_at", "m.title");
        let tail = format!(
            "WHERE (?1 IS NULL OR m.created_at < ?1 OR (m.created_at = ?1 AND m.id < ?2)){extra}
             ORDER BY m.created_at DESC, m.id DESC LIMIT ?3"
        );
        let params: Vec<Value> = base.iter().cloned().chain(values).collect();
        items.extend(meeting_rows(db, &tail, rusqlite::params_from_iter(params))?.into_iter().map(Item::Meeting));
    }
    if filter.wants(ItemKind::Chat) {
        let (extra, values) = filter.conditions("c.last_message_at", "c.title");
        let tail = format!(
            "WHERE EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = c.id)
               AND (?1 IS NULL OR c.last_message_at < ?1 OR (c.last_message_at = ?1 AND c.id < ?2)){extra}
             ORDER BY c.last_message_at DESC, c.id DESC LIMIT ?3"
        );
        let params: Vec<Value> = base.iter().cloned().chain(values).collect();
        items.extend(chat_rows(db, &tail, rusqlite::params_from_iter(params))?.into_iter().map(Item::Chat));
    }
    items.sort_by(|a, b| b.key().cmp(&a.key()));
    items.truncate(limit as usize);
    Ok(items)
}

#[tauri::command]
pub async fn items_page(
    state: State<'_, StoreState>,
    before: Option<ItemCursor>,
    limit: u32,
    filter: Option<ItemFilter>,
) -> Result<Vec<Item>, StoreError> {
    on_db(&state, move |db| items_page_impl(db, before.as_ref(), limit, &filter.unwrap_or_default())).await
}

/// These items by id (one kind), in no particular order; an id that no longer exists is left out.
fn items_by_id_impl(db: &Connection, kind: ItemKind, ids: &[String]) -> Result<Vec<Item>, StoreError> {
    let ids_json = serde_json::to_string(ids).map_err(|e| StoreError::from(e.to_string()))?;
    Ok(match kind {
        ItemKind::Meeting => meeting_rows(db, "WHERE m.id IN (SELECT value FROM json_each(?1))", [ids_json])?.into_iter().map(Item::Meeting).collect(),
        ItemKind::Chat => chat_rows(db, "WHERE c.id IN (SELECT value FROM json_each(?1))", [ids_json])?.into_iter().map(Item::Chat).collect(),
    })
}

#[tauri::command]
pub async fn items_by_id(state: State<'_, StoreState>, kind: ItemKind, ids: Vec<String>) -> Result<Vec<Item>, StoreError> {
    on_db(&state, move |db| items_by_id_impl(db, kind, &ids)).await
}

/// How many meetings and chats (with messages) there are.
#[derive(Debug, Serialize)]
pub struct ItemCounts {
    pub meetings: i64,
    pub chats: i64,
}

fn items_count_impl(db: &Connection) -> Result<ItemCounts, StoreError> {
    Ok(db.query_row(
        "SELECT (SELECT COUNT(*) FROM meetings),
                (SELECT COUNT(*) FROM chats c WHERE EXISTS (SELECT 1 FROM chat_messages WHERE chat_id = c.id))",
        [],
        |row| Ok(ItemCounts { meetings: row.get(0)?, chats: row.get(1)? }),
    )?)
}

#[tauri::command]
pub async fn items_count(state: State<'_, StoreState>) -> Result<ItemCounts, StoreError> {
    on_db(&state, items_count_impl).await
}

// ── Chat Domain Commands ──

#[tauri::command]
pub async fn chats_get(
    state: State<'_, StoreState>,
    id: String,
) -> Result<ChatSessionResult, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        chats_get_impl(db, &id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

pub(crate) fn chats_get_impl(db: &Connection, id: &str) -> Result<ChatSessionResult, StoreError> {
        let chat: (String, String, Option<String>, i64) = db
            .query_row(
                "SELECT id, title, meeting_id, last_message_at FROM chats WHERE id = ?1",
                [&id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|_| StoreError::from("Chat session not found"))?;

        let mut stmt = db.prepare(
            "SELECT id, seq, role, text, provider, model, data, created_at
             FROM chat_messages
             WHERE chat_id = ?1
             ORDER BY seq",
        )?;

        let messages: Vec<ChatMessageRow> = stmt
            .query_map([&id], |row| {
                Ok(ChatMessageRow {
                    id: row.get(0)?,
                    seq: row.get(1)?,
                    role: row.get(2)?,
                    text: row.get(3)?,
                    provider: row.get(4)?,
                    model: row.get(5)?,
                    data: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            // A message that can't be read fails the load: skipping it would lose it for good on the next save.
            .collect::<Result<_, _>>()?;

        Ok(ChatSessionResult {
            id: chat.0,
            title: chat.1,
            meeting_id: chat.2,
            last_message_at: chat.3,
            messages,
        })
}

#[tauri::command]
pub async fn chats_upsert(
    state: State<'_, StoreState>,
    input: ChatsUpsertInput,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        chats_upsert_impl(db, &input)?;
        assets::drain_files(db);
        Ok(input.id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
    .map(|id| crate::changes::notify_chat_saved(&id))
}

fn chats_upsert_impl(db: &Connection, input: &ChatsUpsertInput) -> Result<(), StoreError> {
        let now = now_millis();

        let tx = db.unchecked_transaction()?;


        let created_at = input.created_at.unwrap_or(now);

        tx.execute(
            "INSERT INTO chats (id, title, meeting_id, created_at, last_message_at)
             VALUES (?1, ?2, (SELECT id FROM meetings WHERE id = ?3), ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                meeting_id = excluded.meeting_id,
                last_message_at = excluded.last_message_at",
            rusqlite::params![input.id, input.title, input.meeting_id, created_at, input.last_message_at],
        )?;

        save_chat_messages(&tx, input)?;
        // The chat's tool calls, as its messages now show them.
        tx.execute("DELETE FROM tool_calls WHERE chat_id = ?1", [&input.id])?;
        tx.execute(crate::schema::FILL_TOOL_CALLS, [&input.id])?;

        assets::sync_chat_assets(&tx, &input.id, &input.asset_paths)?;

        tx.commit()?;
        Ok(())
}

/// A chat's messages written by change: removed ones deleted, new ones added, changed ones updated, unchanged ones not touched,
/// so continuing a conversation writes the new turn, not the whole chat again.
fn save_chat_messages(tx: &Connection, input: &ChatsUpsertInput) -> Result<(), StoreError> {
    let kept: std::collections::HashSet<&str> = input.messages.iter().map(|m| m.id.as_str()).collect();
    let stored: Vec<String> = tx
        .prepare("SELECT id FROM chat_messages WHERE chat_id = ?1")?
        .query_map([&input.id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    for id in stored.iter().filter(|id| !kept.contains(id.as_str())) {
        tx.execute("DELETE FROM chat_messages WHERE id = ?1", [id])?;
    }
    let mut upsert = tx.prepare(
        "INSERT INTO chat_messages (id, chat_id, seq, role, text, provider, model, data, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            seq = excluded.seq, role = excluded.role, text = excluded.text,
            provider = excluded.provider, model = excluded.model, data = excluded.data
         WHERE chat_messages.seq IS NOT excluded.seq OR chat_messages.text IS NOT excluded.text
            OR chat_messages.data IS NOT excluded.data OR chat_messages.provider IS NOT excluded.provider
            OR chat_messages.model IS NOT excluded.model OR chat_messages.role IS NOT excluded.role",
    )?;
    for (i, msg) in input.messages.iter().enumerate() {
        upsert.execute(rusqlite::params![
            msg.id, input.id, i as i32, msg.role, msg.text, msg.provider, msg.model, msg.data, msg.created_at,
        ])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn chats_rename(
    state: State<'_, StoreState>,
    id: String,
    title: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let affected = db.execute(
            "UPDATE chats SET title = ?2 WHERE id = ?1",
            rusqlite::params![id, title],
        )?;
        if affected == 0 {
            return Err(StoreError::from("Chat session not found"));
        }
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

pub(crate) fn chats_delete_impl(db: &Connection, id: &str) -> Result<(), StoreError> {
    let tx = db.unchecked_transaction()?;
    delete_chat_rows(&tx, id)?;
    tx.commit()?;
    Ok(())
}

/// A chat and everything it owns, inside the caller's transaction; its files are queued for `assets::drain_files`.
pub(crate) fn delete_chat_rows(tx: &Connection, id: &str) -> Result<(), StoreError> {
    // chat_vec_chunks is a virtual table with no FK cascade.
    let chunk_ids: Vec<i64> = tx
        .prepare("SELECT id FROM chat_chunks WHERE chat_id = ?1")?
        .query_map([id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    for cid in &chunk_ids {
        tx.execute("DELETE FROM chat_vec_chunks WHERE chunk_id = ?1", [cid])?;
    }
    tx.execute("DELETE FROM chat_chunks WHERE chat_id = ?1", [id])?;
    // CASCADE removes the chat's messages, assets and index state.
    tx.execute("DELETE FROM chats WHERE id = ?1", [id])?;
    Ok(())
}

#[tauri::command]
pub async fn chats_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        chats_delete_impl(db, &id)?;
        assets::drain_files(db);
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Dictation Commands ──

#[tauri::command]
pub async fn dictations_list(
    state: State<'_, StoreState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<DictationsListResult, StoreError> {
    let limit = limit.unwrap_or(200);
    let offset = offset.unwrap_or(0);
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        dictations_list_impl(db, limit, offset)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn dictations_list_impl(db: &Connection, limit: u32, offset: u32) -> Result<DictationsListResult, StoreError> {
    let total: i64 = db.query_row("SELECT COUNT(*) FROM dictations", [], |row| row.get(0))?;
    let mut stmt = db.prepare(
        "SELECT id, text, created_at, duration_ms, model FROM dictations
         ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
    )?;
    let items = stmt
        .query_map(rusqlite::params![limit, offset], |row| {
            Ok(DictationRow {
                id: row.get(0)?,
                text: row.get(1)?,
                created_at: row.get(2)?,
                duration_ms: row.get(3)?,
                model: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(DictationsListResult { items, total })
}

#[tauri::command]
pub async fn dictations_create(state: State<'_, StoreState>, input: DictationRow) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        dictations_create_impl(db, &input)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn dictations_create_impl(db: &Connection, input: &DictationRow) -> Result<(), StoreError> {
    let tx = db.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO dictations (id, text, created_at, duration_ms, model) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![input.id, input.text, input.created_at, input.duration_ms, input.model],
    )?;
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub async fn dictations_delete(state: State<'_, StoreState>, id: String) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        dictations_delete_impl(db, &id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn dictations_delete_impl(db: &Connection, id: &str) -> Result<(), StoreError> {
    let tx = db.unchecked_transaction()?;
    if tx.execute("DELETE FROM dictations WHERE id = ?1", [id])? == 0 {
        return Err(StoreError::from("Dictation not found"));
    }
    tx.commit()?;
    Ok(())
}

// ── RAG Indexing Commands ──

/// One chunk (its full-text entry follows by trigger) and its vector, when it has one.
fn insert_chunk(tx: &Connection, meeting_id: &str, chunk_index: i32, chunk: &ChunkData) -> Result<(), StoreError> {
    tx.execute(
        "INSERT INTO chunks (meeting_id, chunk_index, chunk_text, chunk_type, start_pos, end_pos)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![meeting_id, chunk_index, chunk.chunk_text, chunk.chunk_type, chunk.start_pos, chunk.end_pos],
    )?;
    if let Some(embedding) = &chunk.embedding {
        let bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
        tx.execute("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)", rusqlite::params![tx.last_insert_rowid(), bytes])?;
    }
    Ok(())
}

/// Adds chunks after the meeting's last one, keeping what is there (a meeting indexed while it records, stretch by stretch);
/// their own `chunk_index` is ignored. A later `upsert_chunks` (the final transcript) keeps the ones whose text it shares.
pub(crate) fn append_chunks_impl(db: &Connection, meeting_id: &str, chunks: &[ChunkData]) -> Result<(), StoreError> {
    let tx = db.unchecked_transaction()?;
    let next: i32 = tx.query_row(
        "SELECT COALESCE(MAX(chunk_index) + 1, 0) FROM chunks WHERE meeting_id = ?1",
        [meeting_id],
        |row| row.get(0),
    )?;
    for (offset, chunk) in (0..).zip(chunks) {
        insert_chunk(&tx, meeting_id, next + offset, chunk)?;
    }
    tx.commit()?;
    Ok(())
}

fn index_stats_impl(db: &Connection) -> Result<IndexStats, StoreError> {
    Ok(db.query_row(
        "SELECT (SELECT COUNT(DISTINCT meeting_id) FROM chunks),
                (SELECT COUNT(DISTINCT chat_id) FROM chat_chunks),
                (SELECT COUNT(*) FROM chunks WHERE chunk_type = 'transcript'),
                (SELECT COUNT(*) FROM chat_chunks)",
        [],
        |row| Ok(IndexStats { indexed_meetings: row.get(0)?, indexed_chats: row.get(1)?, transcript_pieces: row.get(2)?, chat_pieces: row.get(3)? }),
    )?)
}

#[tauri::command]
pub async fn index_stats(state: State<'_, StoreState>) -> Result<IndexStats, StoreError> {
    on_db(&state, index_stats_impl).await
}

// ── Usage Tracking Commands ──

#[tauri::command]
pub async fn insert_usage(
    state: State<'_, StoreState>,
    record: UsageRecord,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        db.execute(
            "INSERT INTO usage_log (id, timestamp, category, session_id, provider, model,
             input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
             reasoning_tokens, estimated_cost, audio_seconds)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                record.id,
                record.timestamp,
                record.category,
                record.session_id,
                record.provider,
                record.model,
                record.input_tokens,
                record.output_tokens,
                record.cache_read_tokens.unwrap_or(0),
                record.cache_write_tokens.unwrap_or(0),
                record.reasoning_tokens.unwrap_or(0),
                record.estimated_cost,
                record.audio_seconds.unwrap_or(0.0),
            ],
        )?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// One AI call made for a meeting (transcription, summary), newest first.
#[derive(Debug, Serialize)]
pub struct MeetingUsageRow {
    pub category: String,
    pub provider: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    /// None when the call's price is unknown (never shown as free).
    pub estimated_cost: Option<f64>,
    pub audio_seconds: f64,
    pub timestamp: i64,
}

fn meeting_usage_impl(db: &Connection, meeting_id: &str) -> Result<Vec<MeetingUsageRow>, StoreError> {
    let mut stmt = db.prepare(
        "SELECT category, provider, model, input_tokens, output_tokens, estimated_cost, timestamp, audio_seconds
         FROM usage_log WHERE session_id = ?1 ORDER BY timestamp DESC",
    )?;
    let rows = stmt
        .query_map([meeting_id], |row| {
            Ok(MeetingUsageRow {
                category: row.get(0)?,
                provider: row.get(1)?,
                model: row.get(2)?,
                input_tokens: row.get(3)?,
                output_tokens: row.get(4)?,
                estimated_cost: row.get(5)?,
                timestamp: row.get(6)?,
                audio_seconds: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[tauri::command]
pub async fn get_meeting_usage(
    state: State<'_, StoreState>,
    meeting_id: String,
) -> Result<Vec<MeetingUsageRow>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        meeting_usage_impl(db, &meeting_id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Prices a model's calls saved without a price (NULL) from their tokens and audio minutes, at the price the user just set;
/// returns how many. Same as `costOf` in extensions/usage/pricing.ts for a user's price, which has no cache rates (cached input
/// costs the input rate): a call billed only by its audio stays unknown while the price has no per-minute rate.
fn price_unpriced_usage_impl(
    db: &Connection,
    provider: &str,
    model: &str,
    input_per_million: f64,
    output_per_million: f64,
    per_minute: Option<f64>,
) -> Result<usize, StoreError> {
    Ok(db.execute(
        "UPDATE usage_log SET estimated_cost = (input_tokens * ?3 + output_tokens * ?4) / 1000000.0 + audio_seconds / 60.0 * COALESCE(?5, 0)
         WHERE provider = ?1 AND model = ?2 AND estimated_cost IS NULL
           AND (?5 IS NOT NULL OR audio_seconds = 0 OR input_tokens + output_tokens > 0)",
        rusqlite::params![provider, model, input_per_million, output_per_million, per_minute],
    )?)
}

#[tauri::command]
pub async fn price_unpriced_usage(
    state: State<'_, StoreState>,
    provider: String,
    model: String,
    input_per_million: f64,
    output_per_million: f64,
    per_minute: Option<f64>,
) -> Result<usize, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        price_unpriced_usage_impl(db, &provider, &model, input_per_million, output_per_million, per_minute)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// The window every usage query reads (`[since, until)`, on the timestamp index); parameters ?1–?2 in `usage_params` order.
const USAGE_WHERE: &str = "timestamp >= ?1 AND timestamp < ?2";

fn usage_params(q: &UsageQuery) -> (i64, i64) {
    (q.since.unwrap_or(0), q.until.unwrap_or(i64::MAX))
}

fn usage_trend(db: &Connection, q: &UsageQuery) -> Result<Vec<UsageBucket>, StoreError> {
    let Some(bucket) = q.bucket else { return Ok(Vec::new()) };
    let key = match bucket {
        UsageBucketSize::Day => "date(timestamp / 1000, 'unixepoch', 'localtime')",
        UsageBucketSize::Month => "strftime('%Y-%m', timestamp / 1000, 'unixepoch', 'localtime')",
    };
    let sql = format!(
        "SELECT {key} AS bucket, COUNT(*), SUM(input_tokens), SUM(output_tokens),
         SUM(COALESCE(cache_read_tokens, 0)), SUM(COALESCE(estimated_cost, 0))
         FROM usage_log WHERE {USAGE_WHERE} GROUP BY bucket ORDER BY bucket"
    );
    let p = usage_params(q);
    let mut stmt = db.prepare(&sql)?;
    let rows = stmt
        .query_map(rusqlite::params![p.0, p.1], |row| {
            Ok(UsageBucket {
                key: row.get(0)?,
                calls: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
                cache_read_tokens: row.get(4)?,
                estimated_cost: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// The window's tool calls per tool, most used first (on the tool calls' time index).
fn usage_tools(db: &Connection, q: &UsageQuery) -> Result<Vec<ToolBreakdown>, StoreError> {
    let p = usage_params(q);
    let rows = db
        .prepare(
            "SELECT tool, COUNT(*), SUM(ok = 0), AVG(duration_ms), MAX(created_at) FROM tool_calls
             WHERE created_at >= ?1 AND created_at < ?2 GROUP BY tool ORDER BY COUNT(*) DESC, tool",
        )?
        .query_map(rusqlite::params![p.0, p.1], |row| {
            Ok(ToolBreakdown { tool: row.get(0)?, calls: row.get(1)?, failed: row.get(2)?, avg_ms: row.get(3)?, last_used: row.get(4)? })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn usage_summary_impl(db: &Connection, q: &UsageQuery) -> Result<UsageSummary, StoreError> {
    let params = usage_params(q);
    let (total_cost, total_input, total_output, total_cache_read, total_calls, unpriced_calls, first_timestamp): (f64, i64, i64, i64, i64, i64, Option<i64>) = db
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(estimated_cost), 0), COALESCE(SUM(input_tokens), 0),
                 COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cache_read_tokens), 0), COUNT(*),
                 COALESCE(SUM(estimated_cost IS NULL), 0), MIN(timestamp)
                 FROM usage_log WHERE {USAGE_WHERE}"
            ),
            rusqlite::params![params.0, params.1],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
        )?;

    let mut stmt = db.prepare(&format!(
        "SELECT provider, model, COUNT(*), SUM(input_tokens), SUM(output_tokens),
         SUM(COALESCE(cache_read_tokens, 0)), SUM(COALESCE(cache_write_tokens, 0)), SUM(COALESCE(reasoning_tokens, 0)),
         SUM(COALESCE(estimated_cost, 0)), SUM(estimated_cost IS NULL)
         FROM usage_log WHERE {USAGE_WHERE}
         GROUP BY provider, model ORDER BY SUM(COALESCE(estimated_cost, 0)) DESC, COUNT(*) DESC"
    ))?;
    let by_provider_model = stmt
        .query_map(rusqlite::params![params.0, params.1], |row| {
            Ok(ProviderModelBreakdown {
                provider: row.get(0)?,
                model: row.get(1)?,
                calls: row.get(2)?,
                input_tokens: row.get(3)?,
                output_tokens: row.get(4)?,
                cache_read_tokens: row.get(5)?,
                cache_write_tokens: row.get(6)?,
                reasoning_tokens: row.get(7)?,
                estimated_cost: row.get(8)?,
                unpriced_calls: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = db.prepare(&format!(
        "SELECT category, COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(COALESCE(estimated_cost, 0)), SUM(estimated_cost IS NULL)
         FROM usage_log WHERE {USAGE_WHERE}
         GROUP BY category ORDER BY SUM(COALESCE(estimated_cost, 0)) DESC, COUNT(*) DESC"
    ))?;
    let by_category = stmt
        .query_map(rusqlite::params![params.0, params.1], |row| {
            Ok(CategoryBreakdown {
                category: row.get(0)?,
                calls: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
                estimated_cost: row.get(4)?,
                unpriced_calls: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(UsageSummary {
        total_cost,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_cache_read_tokens: total_cache_read,
        total_calls,
        unpriced_calls,
        first_timestamp,
        by_provider_model,
        by_category,
        by_tool: usage_tools(db, q)?,
        trend: usage_trend(db, q)?,
    })
}

#[tauri::command]
pub async fn get_usage_summary(
    state: State<'_, StoreState>,
    query: UsageQuery,
) -> Result<UsageSummary, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        usage_summary_impl(db, &query)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Chat Indexing Commands ──

/// Where one owner's search pieces live: meetings' and chats' have the same shape (a chat turn has no transcript positions).
pub(crate) struct ChunkStore {
    chunks: &'static str,
    vectors: &'static str,
    owner: &'static str,
    positions: bool,
}

pub(crate) const MEETING_CHUNKS: ChunkStore = ChunkStore { chunks: "chunks", vectors: "vec_chunks", owner: "meeting_id", positions: true };
pub(crate) const CHAT_CHUNKS: ChunkStore = ChunkStore { chunks: "chat_chunks", vectors: "chat_vec_chunks", owner: "chat_id", positions: false };

/// An owner's search pieces after a save: a piece whose text is unchanged keeps its row and vector (replaced only when a new
/// vector is sent), a changed or new piece is written, and pieces past the end are removed — so an edit writes and embeds
/// only what changed. The full-text index follows by trigger.
pub(crate) fn save_chunks(tx: &Connection, store: &ChunkStore, owner_id: &str, chunks: &[ChunkData]) -> Result<(), StoreError> {
    let (table, vectors, owner) = (store.chunks, store.vectors, store.owner);
    for chunk in chunks {
        let stored: Option<(i64, String)> = tx
            .query_row(
                &format!("SELECT id, chunk_text FROM {table} WHERE {owner} = ?1 AND chunk_index = ?2"),
                rusqlite::params![owner_id, chunk.chunk_index],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let chunk_id = match stored {
            Some((id, text)) if text == chunk.chunk_text => id,
            Some((id, _)) => {
                tx.execute(&format!("UPDATE {table} SET chunk_text = ?2, chunk_type = ?3 WHERE id = ?1"), rusqlite::params![id, chunk.chunk_text, chunk.chunk_type])?;
                tx.execute(&format!("DELETE FROM {vectors} WHERE chunk_id = ?1"), [id])?;
                id
            }
            None => {
                tx.execute(
                    &format!("INSERT INTO {table} ({owner}, chunk_index, chunk_text, chunk_type) VALUES (?1, ?2, ?3, ?4)"),
                    rusqlite::params![owner_id, chunk.chunk_index, chunk.chunk_text, chunk.chunk_type],
                )?;
                tx.last_insert_rowid()
            }
        };
        if store.positions {
            tx.execute(
                &format!("UPDATE {table} SET start_pos = ?2, end_pos = ?3 WHERE id = ?1 AND (start_pos IS NOT ?2 OR end_pos IS NOT ?3)"),
                rusqlite::params![chunk_id, chunk.start_pos, chunk.end_pos],
            )?;
        }
        if let Some(embedding) = &chunk.embedding {
            let bytes: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();
            tx.execute(&format!("DELETE FROM {vectors} WHERE chunk_id = ?1"), [chunk_id])?;
            tx.execute(&format!("INSERT INTO {vectors} (chunk_id, embedding) VALUES (?1, ?2)"), rusqlite::params![chunk_id, bytes])?;
        }
    }
    let gone: Vec<i64> = tx
        .prepare(&format!("SELECT id FROM {table} WHERE {owner} = ?1 AND chunk_index >= ?2"))?
        .query_map(rusqlite::params![owner_id, chunks.len() as i64], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    for id in gone {
        tx.execute(&format!("DELETE FROM {vectors} WHERE chunk_id = ?1"), [id])?;
        tx.execute(&format!("DELETE FROM {table} WHERE id = ?1"), [id])?;
    }
    Ok(())
}

/// The texts of an owner's search pieces that already have a vector, so a save embeds only the pieces that don't.
pub(crate) fn embedded_chunk_texts_impl(db: &Connection, store: &ChunkStore, owner_id: &str) -> Result<Vec<String>, StoreError> {
    let (table, vectors, owner) = (store.chunks, store.vectors, store.owner);
    Ok(db
        .prepare(&format!(
            "SELECT c.chunk_text FROM {table} c WHERE c.{owner} = ?1 AND EXISTS (SELECT 1 FROM {vectors} v WHERE v.chunk_id = c.id)"
        ))?
        .query_map([owner_id], |row| row.get(0))?
        .collect::<Result<_, _>>()?)
}

#[tauri::command]
pub async fn search_sessions(
    state: State<'_, StoreState>,
    params: crate::session_search::SessionSearchParams,
) -> Result<Vec<crate::session_search::SessionSearchHit>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        crate::session_search::search_sessions(db, &params).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Command-logic tests: `_impl` cores on an in-memory DB, since `State` blocks command-layer tests ──
#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::schema;

    pub(crate) fn db() -> Connection {
        schema::open_migrated_test_db()
    }

    fn dictation(id: &str, created_at: i64) -> DictationRow {
        DictationRow { id: id.into(), text: format!("said {id}"), created_at, duration_ms: Some(1_500), model: Some("parakeet".into()) }
    }

    #[test]
    fn dictations_list_newest_first_and_delete_one() {
        let conn = db();
        dictations_create_impl(&conn, &dictation("a", 1)).expect("create a");
        dictations_create_impl(&conn, &dictation("b", 2)).expect("create b");

        let listed = dictations_list_impl(&conn, 10, 0).expect("list");
        assert_eq!(listed.total, 2);
        assert_eq!(listed.items.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(), ["b", "a"]);
        assert_eq!(listed.items[0].model.as_deref(), Some("parakeet"));

        dictations_delete_impl(&conn, "b").expect("delete b");
        assert_eq!(dictations_list_impl(&conn, 10, 0).expect("list").total, 1);
        assert!(dictations_delete_impl(&conn, "b").is_err(), "deleting a missing dictation is an error");
    }

    pub(crate) fn seed_meeting(conn: &Connection, id: &str) {
        meetings_upsert_impl(
            conn,
            &MeetingUpsertInput {
                id: id.to_string(),
                title: Some("Seed".into()),
                input_source: None,
                calendar_event_id: None,
                calendar_meta: None,
                categories: None,
                created_at: None,
            },
        )
        .expect("seed meeting");
    }

    fn seed_todo(conn: &Connection, todo_id: &str, meeting_id: &str) {
        todos_upsert_impl(
            conn,
            &TodoUpsertInput {
                id: todo_id.to_string(),
                meeting_id: Some(meeting_id.to_string()),
                text: "Do the thing".into(),
                owner: None,
                due_date: None,
                completed: None,
                source: None,
                created_at: None,
            },
        )
        .expect("seed todo");
    }

    #[test]
    fn a_todo_without_a_meeting_saves_lists_and_resolves_by_id() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_todo(&conn, "t1", "m1");
        todos_upsert_impl(
            &conn,
            &TodoUpsertInput {
                id: "t2".into(),
                meeting_id: None,
                text: "Book the flight".into(),
                owner: None,
                due_date: Some("2026-11-20".into()),
                completed: None,
                source: None,
                created_at: None,
            },
        )
        .expect("a to-do of its own");

        let (all, total) = collect_todos_with_reminders(&conn, None, None, None, None).unwrap();
        assert_eq!(total, 2);
        let own = all.iter().find(|t| t.id == "t2").expect("listed");
        assert_eq!((own.meeting_id.as_deref(), own.meeting_title.as_deref()), (None, None));
        let (open, _) = collect_todos_with_reminders(&conn, None, Some(false), None, None).unwrap();
        assert_eq!(open.len(), 2);
        let (in_meeting, _) = collect_todos_with_reminders(&conn, Some("m1"), None, None, None).unwrap();
        assert_eq!(in_meeting.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), vec!["t1"]);
        assert_eq!(in_meeting[0].meeting_title.as_deref(), Some("Seed"));

        let found = todos_get_impl(&conn, &["t2".into(), "missing".into()]).unwrap();
        assert_eq!(found.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), vec!["t2"]);
        assert_eq!(todo_meeting_id(&conn, "t2").unwrap(), None);
    }

    #[test]
    fn note_meeting_id_resolves_before_delete() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_note(&conn, "n1", "m1");
        assert_eq!(note_meeting_id(&conn, "n1").unwrap(), Some("m1".to_string()));
        assert_eq!(note_meeting_id(&conn, "missing").unwrap(), None);
    }

    #[test]
    fn todo_meeting_id_resolves_before_delete() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_todo(&conn, "t1", "m1");
        assert_eq!(todo_meeting_id(&conn, "t1").unwrap(), Some("m1".to_string()));
        assert_eq!(todo_meeting_id(&conn, "missing").unwrap(), None);
    }

    fn count(conn: &Connection, sql: &str, id: &str) -> i64 {
        conn.query_row(sql, [id], |r| r.get(0)).unwrap()
    }

    // ── Reminders regression (historical bug #1) ──────────────────────

    // A reminder saves and saves again (create, then update).

    #[test]
    fn reminders_upsert_persists_and_updates() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_todo(&conn, "t1", "m1");

        // First call → create.
        reminders_upsert_impl(&conn, "t1", 42, 1_000).expect("first upsert ok");

        let status: String = conn
            .query_row("SELECT status FROM reminders WHERE todo_id = 't1'", [], |r| r.get(0))
            .expect("reminder row exists");
        assert_eq!(status, "scheduled");

        // Second call for the same todo → update path, no duplicate row.
        reminders_upsert_impl(&conn, "t1", 99, 2_000).expect("second upsert ok");

        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM reminders WHERE todo_id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 1, "reminder must be updated in place, not duplicated");

        let (notif, fire_at): (i32, i64) = conn
            .query_row(
                "SELECT notification_id, fire_at FROM reminders WHERE todo_id = 't1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(notif, 99, "updated notification_id");
        assert_eq!(fire_at, 2_000, "updated fire_at");

    }

    #[test]
    fn reminders_set_status_updates() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_todo(&conn, "t1", "m1");
        reminders_upsert_impl(&conn, "t1", 1, 100).unwrap();

        reminders_set_status_impl(&conn, "t1", "fired").expect("set status ok");
        let status: String = conn
            .query_row("SELECT status FROM reminders WHERE todo_id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(status, "fired");

        // Missing reminder → NotFound.
        let err = reminders_set_status_impl(&conn, "missing", "fired").unwrap_err();
        assert_eq!(err.message, "Reminder not found");
    }

    #[test]
    fn reminders_due_returns_only_scheduled_ordered_by_fire_at() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_todo(&conn, "a", "m1");
        seed_todo(&conn, "b", "m1");
        seed_todo(&conn, "c", "m1");
        reminders_upsert_impl(&conn, "a", 1, 300).unwrap();
        reminders_upsert_impl(&conn, "b", 2, 100).unwrap();
        reminders_upsert_impl(&conn, "c", 3, 200).unwrap();
        reminders_set_status_impl(&conn, "c", "fired").unwrap();

        let due = reminders_due_impl(&conn).expect("due ok");
        let ids: Vec<String> = due.iter().map(|d| d.todo_id.clone()).collect();
        assert_eq!(ids, vec!["b", "a"], "only scheduled, ordered by fire_at");
    }

    // ── Todos ─────────────────────────────────────────────────────────

    #[test]
    fn todos_upsert_create_then_update() {
        let conn = db();
        seed_meeting(&conn, "m1");

        seed_todo(&conn, "t1", "m1");

        // Update path.
        todos_upsert_impl(
            &conn,
            &TodoUpsertInput {
                id: "t1".into(),
                meeting_id: Some("m1".into()),
                text: "Changed".into(),
                owner: Some("alice".into()),
                due_date: None,
                completed: None,
                source: None,
                created_at: None,
            },
        )
        .unwrap();

        let text: String = conn
            .query_row("SELECT text FROM todos WHERE id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(text, "Changed");
    }

    #[test]
    fn todos_set_completed_and_delete() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_todo(&conn, "t1", "m1");

        todos_set_completed_impl(&conn, "t1", true).unwrap();
        let done: i32 = conn
            .query_row("SELECT completed FROM todos WHERE id = 't1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(done, 1);

        todos_delete_impl(&conn, "t1").unwrap();
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM todos WHERE id = ?1", "t1"), 0);

        // Both report NotFound on a missing id.
        assert_eq!(
            todos_set_completed_impl(&conn, "t1", true).unwrap_err().message,
            "Todo not found"
        );
        assert_eq!(todos_delete_impl(&conn, "t1").unwrap_err().message, "Todo not found");
    }

    // ── Meetings ──────────────────────────────────────────────────────

    fn update(id: &str) -> MeetingUpsertInput {
        MeetingUpsertInput {
            id: id.into(),
            title: None,
            input_source: None,
            calendar_event_id: None,
            calendar_meta: None,
            categories: None,
            created_at: None,
        }
    }

    fn create_recording(conn: &Connection, id: &str) {
        meetings_create_impl(
            conn,
            &MeetingCreateInput {
                id: id.into(),
                title: "Recording".into(),
                status: "recording".into(),
                input_source: Some("systemAndMicrophone".into()),
                recording_filename: Some(format!("{id}.wav")),
                calendar_event_id: Some("evt-123".into()),
                calendar_meta: Some(r#"{"scheduledTitle":"Standup"}"#.into()),
                created_at: Some(1234),
                transcript: None,
            },
        )
        .expect("create meeting");
    }

    fn stretch(text: &str) -> ChunkData {
        ChunkData { chunk_index: 99, chunk_text: text.into(), chunk_type: "transcript".into(), embedding: None, start_pos: None, end_pos: None }
    }

    fn chunk_texts(conn: &Connection, meeting_id: &str) -> Vec<(i32, String)> {
        let mut stmt = conn.prepare("SELECT chunk_index, chunk_text FROM chunks WHERE meeting_id = ?1 ORDER BY chunk_index").unwrap();
        stmt.query_map([meeting_id], |row| Ok((row.get(0)?, row.get(1)?))).unwrap().map(Result::unwrap).collect()
    }

    #[test]
    fn appending_keeps_earlier_chunks_numbers_after_them_and_is_searchable_at_once() {
        let conn = db();
        create_recording(&conn, "m1");
        append_chunks_impl(&conn, "m1", &[stretch("budget for the launch")]).unwrap();
        append_chunks_impl(&conn, "m1", &[stretch("ship on friday"), stretch("hire two engineers")]).unwrap();
        assert_eq!(
            chunk_texts(&conn, "m1"),
            vec![(0, "budget for the launch".into()), (1, "ship on friday".into()), (2, "hire two engineers".into())]
        );
        let found: i64 = conn
            .query_row("SELECT count(*) FROM chunks_fts WHERE chunks_fts MATCH 'budget'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(found, 1);
    }

    #[test]
    fn a_search_limited_to_one_meeting_finds_its_chunks_however_close_other_meetings_are() {
        let conn = db();
        create_recording(&conn, "this");
        create_recording(&conn, "other");
        let dim = crate::schema::DEFAULT_DIM as usize;
        let query: Vec<f32> = (0..dim).map(|i| if i == 0 { 1.0 } else { 0.0 }).collect();
        let near = |text: &str| ChunkData { embedding: Some(query.clone()), ..stretch(text) };
        let mine = ChunkData { embedding: Some((0..dim).map(|i| if i == 1 { 1.0 } else { 0.0 }).collect()), ..stretch("budget talk") };
        append_chunks_impl(&conn, "this", &[mine]).unwrap();
        append_chunks_impl(&conn, "other", &(0..40).map(|_| near("other meeting")).collect::<Vec<_>>()).unwrap();
        let params = crate::search::SearchParams {
            embedding: query.clone(),
            query_text: String::new(),
            limit: 3,
            mode: Some("vector".into()),
            meeting_ids: Some(vec!["this".into()]),
        };
        let hits = crate::search::hybrid_search(&conn, &params).unwrap();
        assert_eq!(hits.first().map(|h| h.chunk_text.as_str()), Some("budget talk"));
        assert!(hits.iter().all(|h| h.meeting_id == "this"));
    }

    fn import(conn: &Connection, id: &str, text: &str) -> bool {
        meetings_create_impl(
            conn,
            &MeetingCreateInput {
                id: id.into(),
                title: "From Hex".into(),
                status: "transcribed".into(),
                input_source: Some("hex".into()),
                recording_filename: None,
                calendar_event_id: None,
                calendar_meta: None,
                created_at: Some(1234),
                transcript: Some(NewTranscript { text: text.into(), language: None, model: None, segments: Some("[]".into()) }),
            },
        )
        .expect("import meeting")
    }

    #[test]
    fn an_imported_meeting_arrives_with_its_transcript_in_one_write() {
        let conn = db();
        assert!(import(&conn, "hex-1", "We ship Friday"));
        let (status, text): (String, String) = conn
            .query_row(
                "SELECT m.status, t.text FROM meetings m JOIN transcripts t ON t.meeting_id = m.id WHERE m.id = 'hex-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("meeting with transcript");
        assert_eq!((status.as_str(), text.as_str()), ("transcribed", "We ship Friday"));
    }

    #[test]
    fn creating_a_meeting_that_exists_changes_nothing() {
        let conn = db();
        assert!(import(&conn, "hex-1", "first"));
        assert!(!import(&conn, "hex-1", "second"));
        let text: String = conn
            .query_row("SELECT text FROM transcripts WHERE meeting_id = 'hex-1'", [], |row| row.get(0))
            .expect("transcript");
        assert_eq!(text, "first");
    }

    fn transcript(meeting_id: &str) -> TranscriptSaveInput {
        TranscriptSaveInput {
            meeting_id: meeting_id.into(),
            transcript: NewTranscript {
                text: "hello world".into(),
                language: Some("en".into()),
                model: Some("whisper-1".into()),
                segments: None,
            },
        }
    }

    fn summary(meeting_id: &str) -> SummarySaveInput {
        SummarySaveInput {
            meeting_id: meeting_id.into(),
            title: "Recorded call".into(),
            overview: "An overview".into(),
            data: "{}".into(),
            categories: vec!["sales".into()],
            action_items: vec![
                ActionItemInput { text: "Follow up".into(), owner: Some("bob".into()), due_date: None },
                ActionItemInput { text: "Send notes".into(), owner: None, due_date: Some("2026-01-01".into()) },
            ],
        }
    }

    fn status_of(conn: &Connection, id: &str) -> MeetingStatus {
        meetings_get_impl(conn, id).expect("get ok").status
    }

    #[test]
    fn meeting_created_at_record_has_its_recording_and_status() {
        let conn = db();
        create_recording(&conn, "m1");

        let detail = meetings_get_impl(&conn, "m1").expect("get ok");
        assert_eq!(detail.status, MeetingStatus::at("recording"));
        assert_eq!(detail.created_at, 1234);
        assert_eq!(detail.recordings.len(), 1);
        assert_eq!(detail.recordings[0].filename, "m1.wav");
        assert_eq!(meetings_get_impl(&conn, "nope").unwrap_err().message, "Meeting not found");
    }

    #[test]
    fn partial_update_changes_only_given_fields() {
        let conn = db();
        create_recording(&conn, "m1");

        meetings_upsert_impl(&conn, &MeetingUpsertInput { title: Some("Renamed".into()), ..update("m1") })
            .expect("rename");

        let detail = meetings_get_impl(&conn, "m1").unwrap();
        assert_eq!(detail.title, "Renamed");
        assert_eq!(detail.input_source.as_deref(), Some("systemAndMicrophone"));
        assert_eq!(detail.calendar_event_id.as_deref(), Some("evt-123"));
        assert!(detail.calendar_meta.is_some());
        assert_eq!(detail.status, MeetingStatus::at("recording"));

        meetings_upsert_impl(&conn, &MeetingUpsertInput { categories: Some(vec!["work".into()]), ..update("m1") })
            .expect("categorise");
        assert_eq!(meetings_get_impl(&conn, "m1").unwrap().title, "Renamed");
    }

    #[test]
    fn status_moves_through_the_pipeline() {
        let conn = db();
        create_recording(&conn, "m1");

        meetings_set_status_impl(&conn, "m1", &MeetingStatus::at("captured")).unwrap();
        assert_eq!(status_of(&conn, "m1"), MeetingStatus::at("captured"));

        meetings_set_status_impl(&conn, "m1", &MeetingStatus::failed("transcribe", "no key")).unwrap();
        assert_eq!(status_of(&conn, "m1"), MeetingStatus::failed("transcribe", "no key"));

        transcripts_save_impl(&conn, &transcript("m1")).unwrap();
        assert_eq!(status_of(&conn, "m1"), MeetingStatus::at("transcribed"), "saving the transcript clears the failure");

        summaries_save_impl(&conn, &summary("m1")).unwrap();
        let detail = meetings_get_impl(&conn, "m1").unwrap();
        assert_eq!(detail.status, MeetingStatus::at("ready"));
        assert_eq!(detail.title, "Recording", "a calendar meeting keeps its title; the summary's never replaces it");
        assert_eq!(detail.categories, vec!["sales".to_string()]);
        assert_eq!(detail.todos.len(), 2);
        assert!(detail.todos.iter().all(|t| t.source == "ai"));
        assert_eq!(detail.calendar_event_id.as_deref(), Some("evt-123"));

        assert_eq!(
            meetings_set_status_impl(&conn, "nope", &MeetingStatus::at("ready")).unwrap_err().message,
            "Meeting not found"
        );
    }

    #[test]
    fn failed_summary_keeps_the_transcript() {
        let conn = db();
        create_recording(&conn, "m1");
        transcripts_save_impl(&conn, &transcript("m1")).unwrap();

        conn.execute_batch(
            "CREATE TRIGGER fail_on_summary BEFORE INSERT ON summaries BEGIN
                 SELECT RAISE(ABORT, 'forced failure');
             END;",
        )
        .unwrap();
        let err = summaries_save_impl(&conn, &summary("m1")).unwrap_err();
        assert!(err.message.contains("forced failure"), "got: {}", err.message);

        assert_eq!(count(&conn, "SELECT COUNT(*) FROM transcripts WHERE meeting_id = ?1", "m1"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM todos WHERE meeting_id = ?1", "m1"), 0);
        assert_eq!(status_of(&conn, "m1"), MeetingStatus::at("transcribed"));
    }

    #[test]
    fn meeting_usage_lists_only_that_meeting_newest_first() {
        let conn = db();
        for (id, session, category, ts) in [("u1", "m1", "transcription", 1), ("u2", "m1", "summary", 2), ("u3", "m2", "summary", 3)] {
            conn.execute(
                "INSERT INTO usage_log (id, timestamp, category, session_id, provider, model, input_tokens, output_tokens)
                 VALUES (?1, ?2, ?3, ?4, 'openai', 'gpt', 10, 5)",
                rusqlite::params![id, ts, category, session],
            )
            .unwrap();
        }
        let rows = meeting_usage_impl(&conn, "m1").unwrap();
        assert_eq!(rows.iter().map(|r| r.category.as_str()).collect::<Vec<_>>(), vec!["summary", "transcription"]);
    }

    fn seed_usage(conn: &Connection, id: &str, ts: i64, provider: &str, model: &str, category: &str, input: i64, cost: f64) {
        conn.execute(
            "INSERT INTO usage_log (id, timestamp, category, provider, model, input_tokens, output_tokens, estimated_cost)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
            rusqlite::params![id, ts, category, provider, model, input, cost],
        )
        .unwrap();
    }

    const DAY_MS: i64 = 86_400_000;

    #[test]
    fn a_new_price_fills_in_only_that_models_unpriced_calls() {
        let conn = db();
        let unpriced = |id: &str, model: &str| {
            conn.execute(
                "INSERT INTO usage_log (id, timestamp, category, provider, model, input_tokens, output_tokens, estimated_cost)
                 VALUES (?1, 1, 'chat', 'openrouter', ?2, 1000000, 500000, NULL)",
                rusqlite::params![id, model],
            )
            .unwrap();
        };
        unpriced("a", "new-model");
        unpriced("b", "other-model");
        seed_usage(&conn, "c", 2, "openrouter", "new-model", "chat", 100, 0.5);

        assert_eq!(price_unpriced_usage_impl(&conn, "openrouter", "new-model", 2.0, 8.0, None).unwrap(), 1);
        let cost = |id: &str| -> Option<f64> {
            conn.query_row("SELECT estimated_cost FROM usage_log WHERE id = ?1", [id], |r| r.get(0)).unwrap()
        };
        assert_eq!(cost("a"), Some(6.0), "1M in at $2 + 0.5M out at $8");
        assert_eq!(cost("b"), None, "another model stays unknown");
        assert_eq!(cost("c"), Some(0.5), "an already priced call keeps its price");
    }

    #[test]
    fn a_speech_call_is_priced_by_its_minutes() {
        let conn = crate::schema::open_migrated_test_db();
        conn.execute(
            "INSERT INTO usage_log (id, timestamp, category, provider, model, estimated_cost, audio_seconds)
             VALUES ('s', 1, 'transcription', 'openai', 'whisper-1', NULL, 90)",
            [],
        )
        .unwrap();
        assert_eq!(price_unpriced_usage_impl(&conn, "openai", "whisper-1", 2.0, 8.0, None).unwrap(), 0, "token rates alone don't price a call billed by its minutes");
        assert_eq!(price_unpriced_usage_impl(&conn, "openai", "whisper-1", 0.0, 0.0, Some(0.006)).unwrap(), 1);
        let cost: f64 = conn.query_row("SELECT estimated_cost FROM usage_log WHERE id = 's'", [], |r| r.get(0)).unwrap();
        assert!((cost - 0.009).abs() < 1e-12, "1.5 minutes at $0.006 a minute");
    }

    #[test]
    fn usage_summary_counts_unknown_prices_apart_from_free() {
        let conn = db();
        seed_usage(&conn, "priced", 1, "gemini", "flash", "chat", 100, 0.10);
        seed_usage(&conn, "free", 2, "on-device", "gemma", "chat", 100, 0.0);
        conn.execute(
            "INSERT INTO usage_log (id, timestamp, category, provider, model, input_tokens, output_tokens, estimated_cost)
             VALUES ('unknown', 3, 'chat', 'openrouter', 'new-model', 100, 1, NULL)",
            [],
        )
        .unwrap();
        let all = usage_summary_impl(&conn, &UsageQuery::default()).unwrap();
        assert_eq!(all.total_calls, 3);
        assert_eq!(all.unpriced_calls, 1, "only the NULL cost is unknown; 0 is free");
        assert!((all.total_cost - 0.10).abs() < 1e-9);
    }

    #[test]
    fn usage_summary_filters_windows_and_buckets_add_up() {
        let conn = db();
        let noon = 20_000 * DAY_MS + DAY_MS / 2; // midday UTC, far from any local midnight
        seed_usage(&conn, "a", noon, "gemini", "flash", "chat", 100, 0.10);
        seed_usage(&conn, "b", noon + 60_000, "gemini", "flash", "summary", 50, 0.05);
        seed_usage(&conn, "c", noon + DAY_MS, "gemini", "pro", "chat", 10, 0.20);
        seed_usage(&conn, "d", noon + 2 * DAY_MS, "openai", "gpt", "chat", 7, 0.30);

        let all = usage_summary_impl(&conn, &UsageQuery { bucket: Some(UsageBucketSize::Day), ..Default::default() }).unwrap();
        assert_eq!(all.total_calls, 4);
        assert_eq!(all.first_timestamp, Some(noon));
        assert_eq!(all.trend.len(), 3);
        assert_eq!(all.trend.iter().map(|b| b.calls).sum::<i64>(), all.total_calls);
        assert_eq!(all.trend.iter().map(|b| b.input_tokens).sum::<i64>(), all.total_input_tokens);
        assert!((all.trend.iter().map(|b| b.estimated_cost).sum::<f64>() - all.total_cost).abs() < 1e-9);

        // [since, until): the first day only; the record exactly at `until` is excluded.
        let window = usage_summary_impl(&conn, &UsageQuery { since: Some(noon), until: Some(noon + DAY_MS), ..Default::default() }).unwrap();
        assert_eq!(window.total_calls, 2);

        let empty = usage_summary_impl(&conn, &UsageQuery { since: Some(i64::MAX - 1), bucket: Some(UsageBucketSize::Month), ..Default::default() }).unwrap();
        assert_eq!((empty.total_calls, empty.first_timestamp, empty.trend.len()), (0, None, 0));
    }

    // ── meetings_delete cascade ───────────────────────────────────────

    #[test]
    fn meetings_delete_cascades_children_keeps_chat() {
        let conn = db();
        create_recording(&conn, "m1");
        transcripts_save_impl(&conn, &transcript("m1")).unwrap();
        summaries_save_impl(&conn, &summary("m1")).unwrap();

        // Add a note, a chunk, and a chat linked to the meeting.
        seed_note(&conn, "n1", "m1");
        conn.execute(
            "INSERT INTO chunks (meeting_id, chunk_index, chunk_text) VALUES ('m1', 0, 'chunk text')",
            [],
        )
        .unwrap();
        chats_upsert_impl(
            &conn,
            &ChatsUpsertInput {
                id: "c1".into(),
                title: "Linked chat".into(),
                meeting_id: Some("m1".into()),
                asset_paths: vec![],
                last_message_at: 10,
                messages: vec![],
                created_at: None,
            },
        )
        .unwrap();

        meetings_delete_impl(&conn, "m1").expect("delete ok");
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM purge_queue WHERE ref = ?1", "recordings/m1.wav"), 1);

        for (table, col) in [
            ("transcripts", "meeting_id"),
            ("summaries", "meeting_id"),
            ("notes", "meeting_id"),
            ("todos", "meeting_id"),
            ("assets", "meeting_id"),
            ("chunks", "meeting_id"),
            ("meeting_categories", "meeting_id"),
        ] {
            let n: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {} WHERE {} = 'm1'", table, col), [], |r| r.get(0))
                .unwrap();
            assert_eq!(n, 0, "{} should be empty after cascade", table);
        }
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM meetings WHERE id = ?1", "m1"), 0);

        // Chat survives with meeting_id set NULL (ON DELETE SET NULL).
        let (chat_exists, mid): (i64, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), MAX(meeting_id) FROM chats WHERE id = 'c1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(chat_exists, 1, "chat must survive");
        assert!(mid.is_none(), "chat.meeting_id must be NULL");
    }

    fn seed_note(conn: &Connection, id: &str, meeting_id: &str) {
        let now = now_millis();
        conn.execute(
            "INSERT INTO notes (id, meeting_id, text, created_at, updated_at) VALUES (?1, ?2, 'note', ?3, ?3)",
            rusqlite::params![id, meeting_id, now],
        )
        .unwrap();
    }

    // ── Chats round-trip ──────────────────────────────────────────────

    #[test]
    fn a_chat_whose_meeting_was_deleted_still_saves() {
        let conn = db();
        let input = ChatsUpsertInput {
            id: "c1".into(),
            title: "Chat".into(),
            meeting_id: Some("deleted-meeting".into()),
            asset_paths: vec![],
            last_message_at: 1,
            messages: vec![],
            created_at: None,
        };
        chats_upsert_impl(&conn, &input).expect("saves without its meeting");
        let meeting: Option<String> = conn.query_row("SELECT meeting_id FROM chats WHERE id = 'c1'", [], |r| r.get(0)).unwrap();
        assert_eq!(meeting, None);
    }

    #[test]
    fn chats_upsert_get_roundtrip_preserves_order_and_data() {
        let conn = db();
        let input = ChatsUpsertInput {
            id: "c1".into(),
            title: "My chat".into(),
            meeting_id: None,
            asset_paths: vec![],
            last_message_at: 999,
            messages: vec![
                ChatMessageInput {
                    id: "msg-a".into(),
                    role: "user".into(),
                    text: "first".into(),
                    provider: Some("openai".into()),
                    model: Some("gpt".into()),
                    data: Some("{\"k\":1}".into()),
                    created_at: 1,
                },
                ChatMessageInput {
                    id: "msg-b".into(),
                    role: "model".into(),
                    text: "second".into(),
                    provider: None,
                    model: None,
                    data: None,
                    created_at: 2,
                },
            ],
            created_at: Some(100),
        };
        chats_upsert_impl(&conn, &input).expect("upsert ok");

        let got = chats_get_impl(&conn, "c1").expect("get ok");
        assert_eq!(got.title, "My chat");
        assert_eq!(got.last_message_at, 999);
        assert_eq!(got.messages.len(), 2);

        assert_eq!(got.messages[0].seq, 0);
        assert_eq!(got.messages[0].id, "msg-a");
        assert_eq!(got.messages[0].text, "first");
        assert_eq!(got.messages[0].data.as_deref(), Some("{\"k\":1}"));

        assert_eq!(got.messages[1].seq, 1);
        assert_eq!(got.messages[1].id, "msg-b");
        assert_eq!(got.messages[1].role, "model");
        assert!(got.messages[1].data.is_none());
    }

    #[test]
    fn saving_a_chat_records_its_sdk_tool_parts_as_tool_calls() {
        let conn = db();
        let data = r#"{"parts":[
            {"type":"step-start"},
            {"type":"tool-search_meetings","state":"output-available","output":{"content":"ok","isError":false,"meta":{"executionMs":120}}},
            {"type":"tool-get_meeting","state":"output-available","output":{"content":"gone","isError":true,"meta":{"executionMs":30}}},
            {"type":"dynamic-tool","toolName":"notion:search","state":"output-error","errorText":"boom"},
            {"type":"text","text":"Done."}
        ],"metadata":{"createdAt":5}}"#;
        let input = ChatsUpsertInput {
            id: "c1".into(),
            title: "Chat".into(),
            meeting_id: None,
            asset_paths: vec![],
            last_message_at: 5,
            messages: vec![ChatMessageInput {
                id: "m1".into(),
                role: "model".into(),
                text: "Done.".into(),
                provider: None,
                model: None,
                data: Some(data.into()),
                created_at: 5,
            }],
            created_at: None,
        };
        chats_upsert_impl(&conn, &input).expect("upsert ok");

        let rows: Vec<(String, bool, Option<f64>)> = conn
            .prepare("SELECT tool, ok, duration_ms FROM tool_calls WHERE chat_id = 'c1' ORDER BY rowid").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))).unwrap()
            .collect::<Result<_, _>>().unwrap();
        assert_eq!(rows, vec![
            ("search_meetings".into(), true, Some(120.0)),
            ("get_meeting".into(), false, Some(30.0)),
            ("notion:search".into(), false, None),
        ]);
    }

    fn msg(id: &str, text: &str) -> ChatMessageInput {
        ChatMessageInput { id: id.into(), role: "user".into(), text: text.into(), provider: None, model: None, data: None, created_at: 1 }
    }

    fn chat(messages: Vec<ChatMessageInput>) -> ChatsUpsertInput {
        ChatsUpsertInput { id: "c1".into(), title: "t".into(), meeting_id: None, asset_paths: vec![], last_message_at: 1, messages, created_at: Some(1) }
    }

    /// Counts every insert, update and delete on chat_messages from now on.
    fn count_message_writes(conn: &Connection) {
        conn.execute_batch(
            "CREATE TEMP TABLE writes(n INTEGER);
             CREATE TEMP TRIGGER w_i AFTER INSERT ON chat_messages BEGIN INSERT INTO writes VALUES (1); END;
             CREATE TEMP TRIGGER w_u AFTER UPDATE ON chat_messages BEGIN INSERT INTO writes VALUES (1); END;
             CREATE TEMP TRIGGER w_d AFTER DELETE ON chat_messages BEGIN INSERT INTO writes VALUES (1); END;",
        )
        .unwrap();
    }

    #[test]
    fn items_page_through_meetings_and_chats_by_time_with_nothing_missing() {
        let conn = db();
        for (i, id) in ["m1", "m2", "m3"].iter().enumerate() {
            seed_meeting(&conn, id);
            conn.execute("UPDATE meetings SET created_at = ?2 WHERE id = ?1", rusqlite::params![id, (i as i64 + 1) * 10]).unwrap();
        }
        for (id, at) in [("c1", 15), ("c2", 25), ("empty", 99)] {
            let mut input = chat(if id == "empty" { vec![] } else { vec![msg(&format!("{id}-q"), "hi")] });
            input.id = id.into();
            input.last_message_at = at;
            chats_upsert_impl(&conn, &input).unwrap();
        }
        let mut seen = Vec::new();
        let mut before: Option<ItemCursor> = None;
        loop {
            let page = items_page_impl(&conn, before.as_ref(), 2, &ItemFilter::default()).unwrap();
            if page.is_empty() { break; }
            let (at, id) = page.last().unwrap().key();
            before = Some(ItemCursor { at, id: id.to_string() });
            seen.extend(page.iter().map(|item| item.key().1.to_string()));
        }
        assert_eq!(seen, vec!["m3", "c2", "m2", "c1", "m1"], "newest first, every item once; a chat with no messages isn't listed");
    }

    #[test]
    fn items_are_found_by_kind_time_title_and_id_and_counted() {
        let conn = db();
        for (id, title, at) in [("m1", "Budget review", 10), ("m2", "Launch plan 100%", 20)] {
            seed_meeting(&conn, id);
            conn.execute("UPDATE meetings SET title = ?2, created_at = ?3 WHERE id = ?1", rusqlite::params![id, title, at]).unwrap();
        }
        let mut input = chat(vec![msg("q", "hi")]);
        input.title = "budget questions".into();
        input.last_message_at = 15;
        chats_upsert_impl(&conn, &input).unwrap();
        let ids = |filter: ItemFilter| -> Vec<String> {
            items_page_impl(&conn, None, 10, &filter).unwrap().iter().map(|i| i.key().1.to_string()).collect()
        };
        assert_eq!(ids(ItemFilter { kind: Some(ItemKind::Meeting), ..Default::default() }), vec!["m2", "m1"]);
        assert_eq!(ids(ItemFilter { words: Some(vec!["BUDGET".into()]), ..Default::default() }), vec!["c1", "m1"], "any case, both kinds");
        assert_eq!(ids(ItemFilter { words: Some(vec!["100%".into()]), ..Default::default() }), vec!["m2"], "% is matched as itself");
        assert_eq!(ids(ItemFilter { words: Some(vec!["1%0".into()]), ..Default::default() }), Vec::<String>::new());
        assert_eq!(ids(ItemFilter { since: Some(12), until: Some(20), ..Default::default() }), vec!["c1"], "since is in, until is out");
        let found = items_by_id_impl(&conn, ItemKind::Meeting, &["m2".into(), "gone".into()]).unwrap();
        assert_eq!(found.iter().map(|i| i.key().1).collect::<Vec<_>>(), vec!["m2"]);
        conn.execute("UPDATE meetings SET status = 'transcribing', calendar_event_id = 'ev' WHERE id = 'm1'", []).unwrap();
        assert_eq!(ids(ItemFilter { statuses: Some(vec!["transcribing".into()]), ..Default::default() }), vec!["m1"], "meetings only");
        assert_eq!(ids(ItemFilter { calendar_event: Some("ev".into()), ..Default::default() }), vec!["m1"]);
        let counts = items_count_impl(&conn).unwrap();
        assert_eq!((counts.meetings, counts.chats), (2, 1));
    }

    #[test]
    fn continuing_a_chat_writes_only_what_changed() {
        let conn = db();
        chats_upsert_impl(&conn, &chat(vec![msg("a", "hi"), msg("b", "hello")])).unwrap();
        count_message_writes(&conn);

        chats_upsert_impl(&conn, &chat(vec![msg("a", "hi"), msg("b", "hello, edited"), msg("c", "new")])).unwrap();
        let writes: i64 = conn.query_row("SELECT COUNT(*) FROM writes", [], |r| r.get(0)).unwrap();
        assert_eq!(writes, 2, "one changed message and one new one; the unchanged one is not touched");

        chats_upsert_impl(&conn, &chat(vec![msg("a", "hi"), msg("c", "new")])).unwrap();
        let got = chats_get_impl(&conn, "c1").unwrap();
        assert_eq!(got.messages.iter().map(|m| (m.id.as_str(), m.seq)).collect::<Vec<_>>(), vec![("a", 0), ("c", 1)]);
    }

    fn turn(index: i32, text: &str, embedded: bool) -> ChunkData {
        ChunkData { chunk_index: index, chunk_text: text.into(), chunk_type: "turn".into(), embedding: embedded.then(|| vec![0.5; crate::schema::DEFAULT_DIM as usize]), start_pos: None, end_pos: None }
    }

    #[test]
    fn a_meetings_pieces_keep_their_vectors_and_follow_their_positions() {
        let conn = db();
        seed_meeting(&conn, "m1");
        let piece = |index: i32, text: &str, embedded: bool, start: i32| ChunkData {
            start_pos: Some(start), end_pos: Some(start + 10), ..turn(index, text, embedded)
        };
        let save = |pieces: &[ChunkData]| {
            let tx = conn.unchecked_transaction().unwrap();
            save_chunks(&tx, &MEETING_CHUNKS, "m1", pieces).unwrap();
            tx.commit().unwrap();
        };
        save(&[piece(0, "title", true, 0), piece(1, "transcript", true, 0)]);
        save(&[piece(0, "title", false, 0), piece(1, "transcript", false, 5), piece(2, "notes", true, 0)]);
        let mut embedded = embedded_chunk_texts_impl(&conn, &MEETING_CHUNKS, "m1").unwrap();
        embedded.sort();
        assert_eq!(embedded, vec!["notes", "title", "transcript"], "a note edit embeds the notes piece only");
        let start: i32 = conn.query_row("SELECT start_pos FROM chunks WHERE meeting_id = 'm1' AND chunk_index = 1", [], |r| r.get(0)).unwrap();
        assert_eq!(start, 5, "an unchanged piece still takes its new position");
    }

    #[test]
    fn a_chats_search_turns_keep_their_vectors_unless_they_change() {
        let conn = db();
        chats_upsert_impl(&conn, &chat(vec![msg("a", "hi")])).unwrap();
        let save = |turns: &[ChunkData]| {
            let tx = conn.unchecked_transaction().unwrap();
            save_chunks(&tx, &CHAT_CHUNKS, "c1", turns).unwrap();
            tx.commit().unwrap();
        };
        let embedded = || { let mut t = embedded_chunk_texts_impl(&conn, &CHAT_CHUNKS, "c1").unwrap(); t.sort(); t };

        save(&[turn(0, "one", true), turn(1, "two", true)]);
        save(&[turn(0, "one", false), turn(1, "two", false), turn(2, "three", true)]);
        assert_eq!(embedded(), vec!["one", "three", "two"], "unchanged turns keep their vectors; only the new one was sent");

        save(&[turn(0, "one", false), turn(1, "two, edited", false)]);
        assert_eq!(embedded(), vec!["one"], "a changed turn loses its old vector and the turn past the end is gone");
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM chat_chunks WHERE chat_id = 'c1'", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);
    }

}
