use crate::changes::{notify, MeetingChange};
use crate::error::StoreError;
use crate::schema;
use crate::search::{hybrid_search, SearchHit, SearchParams};
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
pub struct MeetingRow {
    pub id: String,
    pub title: String,
    pub input_source: Option<String>,
    #[serde(flatten)]
    pub status: MeetingStatus,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub categories: Vec<String>,
    pub recording_filename: Option<String>,
}

/// Where a meeting is in its pipeline; `failed_step` and `error` are set only when `status` is `failed`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
pub struct MeetingCreateInput {
    pub id: String,
    pub title: String,
    pub status: String,
    pub input_source: Option<String>,
    pub recording_filename: Option<String>,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingListResult {
    pub items: Vec<MeetingRow>,
    pub total: i64,
}

/// A meeting update; only the fields given change.
#[derive(Debug, Deserialize)]
pub struct MeetingUpsertInput {
    pub id: String,
    pub title: Option<String>,
    pub input_source: Option<String>,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    pub categories: Option<Vec<String>>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MeetingDetail {
    pub id: String,
    pub title: String,
    pub input_source: Option<String>,
    #[serde(flatten)]
    pub status: MeetingStatus,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub categories: Vec<String>,
    pub transcript: Option<TranscriptRow>,
    pub summary: Option<SummaryRow>,
    pub recordings: Vec<RecordingRow>,
    pub notes: Vec<NoteRow>,
    pub todos: Vec<TodoRow>,
}

#[derive(Debug, Serialize)]
pub struct TranscriptRow {
    pub text: String,
    pub language: Option<String>,
    pub model: Option<String>,
    pub segments: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct SummaryRow {
    pub overview: String,
    pub data: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct RecordingRow {
    pub id: String,
    pub filename: String,
    pub duration_seconds: Option<f64>,
    pub input_source: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct NoteRow {
    pub id: String,
    pub text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct TodoRow {
    pub id: String,
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
    pub completed: bool,
    pub source: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct ActionItemInput {
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
}

/// A finished transcript; saving it moves the meeting to `transcribed`.
#[derive(Debug, Deserialize)]
pub struct TranscriptSaveInput {
    pub meeting_id: String,
    pub text: String,
    pub language: Option<String>,
    pub model: Option<String>,
    pub segments: Option<String>,
}

/// A finished summary with its title, categories and action items; saving it moves the meeting to `ready`.
#[derive(Debug, Deserialize)]
pub struct SummarySaveInput {
    pub meeting_id: String,
    pub title: String,
    pub overview: String,
    pub data: String,
    pub categories: Vec<String>,
    pub action_items: Vec<ActionItemInput>,
}

#[derive(Debug, Serialize)]
pub struct MeetingsDeleteResult {
    pub recording_filenames: Vec<String>,
}

// ── Category Structs ──

#[derive(Debug, Serialize)]
pub struct CategoryRow {
    pub id: String,
    pub name: String,
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
    pub meeting_id: String,
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
    pub completed: Option<bool>,
    pub source: Option<String>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TodoWithReminder {
    pub id: String,
    pub meeting_id: String,
    pub meeting_title: String,
    pub text: String,
    pub owner: Option<String>,
    pub due_date: Option<String>,
    pub completed: bool,
    pub source: String,
    pub created_at: i64,
    pub reminder: Option<ReminderRow>,
}

#[derive(Debug, Serialize)]
pub struct TodosListResult {
    pub items: Vec<TodoWithReminder>,
    pub total: i64,
}

// ── Reminders Domain Structs ──

#[derive(Debug, Serialize)]
pub struct ReminderRow {
    pub notification_id: i32,
    pub fire_at: i64,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ReminderDueItem {
    pub todo_id: String,
    pub meeting_id: String,
    pub todo_text: String,
    pub meeting_title: String,
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

#[derive(Debug, Serialize)]
pub struct ProviderRow {
    pub provider: String,
    pub active: bool,
    pub api_key_encrypted: Option<String>,
    pub base_url: Option<String>,
    pub data: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct ProviderUpsertInput {
    pub provider: String,
    pub active: Option<bool>,
    pub api_key_encrypted: Option<String>,
    pub base_url: Option<String>,
    pub data: Option<String>,
}

// ── RAG Indexing Structs (carried over, fixed to match schema) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingIndexMeta {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub categories: Option<String>,
    pub content_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkData {
    pub chunk_index: i32,
    pub chunk_text: String,
    pub chunk_type: String,
    pub embedding: Option<Vec<f32>>,
    pub start_pos: Option<i32>,
    pub end_pos: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingHash {
    pub id: String,
    pub content_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbStats {
    pub total_meetings: i64,
    pub total_chunks: i64,
    pub transcript_chunks: i64,
    pub chat_sessions: i64,
    pub chat_chunks: i64,
    pub db_size_bytes: u64,
    pub fts_chunks: i64,
    pub fts_chat_chunks: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbMeta {
    pub schema_version: String,
    pub embedding_model: String,
    pub embedding_dim: String,
}

// ── Chat Indexing Structs ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSessionMeta {
    pub id: String,
    pub title: String,
    pub last_message_at: i64,
    pub message_count: i32,
    pub content_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatChunkData {
    pub chunk_index: i32,
    pub chunk_text: String,
    pub chunk_type: String,
    pub embedding: Option<Vec<f32>>,
}

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
pub struct ChatsListResult {
    pub items: Vec<ChatIndexRow>,
    pub total: i64,
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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryBreakdown {
    pub category: String,
    pub calls: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub estimated_cost: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsageSummary {
    pub total_cost: f64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cache_read_tokens: i64,
    pub total_calls: i64,
    /// Earliest record in the window (epoch ms); none when the window is empty.
    pub first_timestamp: Option<i64>,
    pub by_provider_model: Vec<ProviderModelBreakdown>,
    pub by_category: Vec<CategoryBreakdown>,
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
    pub provider: Option<String>,
    pub model: Option<String>,
    pub category: Option<String>,
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

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn write_audit_log(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    operation: &str,
    data: Option<&str>,
) -> Result<(), StoreError> {
    conn.execute(
        "INSERT INTO audit_log (id, entity_type, entity_id, operation, actor, data, created_at)
         VALUES (?1, ?2, ?3, ?4, 'app', ?5, ?6)",
        rusqlite::params![generate_id(), entity_type, entity_id, operation, data, now_millis()],
    )?;
    Ok(())
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

        log::info!("[store] Database initialized successfully");
        *guard = Some(db);
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Meeting Domain Commands ──

#[tauri::command]
pub async fn meetings_list(
    state: State<'_, StoreState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<MeetingListResult, StoreError> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let total: i64 = db.query_row(
            "SELECT COUNT(*) FROM meetings",
            [],
            |row| row.get(0),
        )?;

        let mut stmt = db.prepare(
            "SELECT m.id, m.title, m.input_source, m.status, m.failed_step, m.error,
                    m.calendar_event_id, m.calendar_meta, m.created_at, m.updated_at
             FROM meetings m
             ORDER BY m.created_at DESC
             LIMIT ?1 OFFSET ?2",
        )?;

        let meeting_rows: Vec<(String, String, Option<String>, MeetingStatus, Option<String>, Option<String>, i64, i64)> = stmt
            .query_map(rusqlite::params![limit, offset], |row| {
                Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, status_at(row, 3)?,
                    row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();

        let meeting_ids: Vec<String> = meeting_rows.iter().map(|r| r.0.clone()).collect();
        let category_map = get_meeting_categories_for_ids(db, &meeting_ids)?;

        // Get first recording filename per meeting
        let mut rec_filenames: std::collections::HashMap<String, Option<String>> = std::collections::HashMap::new();
        for mid in &meeting_ids {
            let filename: Option<String> = db.query_row(
                "SELECT filename FROM recordings WHERE meeting_id = ?1 LIMIT 1",
                [mid],
                |row| row.get(0),
            ).optional().ok().flatten();
            rec_filenames.insert(mid.clone(), filename);
        }

        let items: Vec<MeetingRow> = meeting_rows
            .into_iter()
            .map(|(id, title, input_source, status, ceid, cmeta, cat, uat)| {
                let categories = category_map.get(&id).cloned().unwrap_or_default();
                let rec_fn = rec_filenames.get(&id).and_then(|v| v.clone());
                MeetingRow {
                    id,
                    title,
                    input_source,
                    status,
                    calendar_event_id: ceid,
                    calendar_meta: cmeta,
                    created_at: cat,
                    updated_at: uat,
                    categories,
                    recording_filename: rec_fn,
                }
            })
            .collect();

        Ok(MeetingListResult { items, total })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// The status columns starting at `first` (status, failed_step, error).
fn status_at(row: &rusqlite::Row<'_>, first: usize) -> rusqlite::Result<MeetingStatus> {
    Ok(MeetingStatus {
        status: row.get(first)?,
        failed_step: row.get(first + 1)?,
        error: row.get(first + 2)?,
    })
}

pub(crate) fn meetings_get_impl(db: &Connection, id: &str) -> Result<MeetingDetail, StoreError> {
        let meeting: (String, String, Option<String>, MeetingStatus, Option<String>, Option<String>, i64, i64) = db
            .query_row(
                "SELECT id, title, input_source, status, failed_step, error,
                        calendar_event_id, calendar_meta, created_at, updated_at
                 FROM meetings WHERE id = ?1",
                [&id],
                |row| Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, status_at(row, 3)?,
                    row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?,
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
        ).optional().ok().flatten();

        let summary: Option<SummaryRow> = db.query_row(
            "SELECT overview, data, created_at, updated_at FROM summaries WHERE meeting_id = ?1",
            [&id],
            |row| Ok(SummaryRow {
                overview: row.get(0)?,
                data: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            }),
        ).optional().ok().flatten();

        let mut rec_stmt = db.prepare(
            "SELECT id, filename, duration_seconds, input_source, created_at FROM recordings WHERE meeting_id = ?1",
        )?;
        let recordings: Vec<RecordingRow> = rec_stmt
            .query_map([&id], |row| {
                Ok(RecordingRow {
                    id: row.get(0)?,
                    filename: row.get(1)?,
                    duration_seconds: row.get(2)?,
                    input_source: row.get(3)?,
                    created_at: row.get(4)?,
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
            transcript,
            summary,
            recordings,
            notes,
            todos,
        })
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
        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM meetings WHERE id = ?1",
            [&input.id],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;

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

        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "meeting", &input.id, op, None)?;

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
        .query_row("SELECT meeting_id FROM todos WHERE id = ?1", [id], |row| row.get(0))
        .optional()?)
}

pub(crate) fn meetings_delete_impl(db: &Connection, id: &str) -> Result<MeetingsDeleteResult, StoreError> {
        // Collect recording filenames BEFORE cascade deletes them
        let mut stmt = db.prepare("SELECT filename FROM recordings WHERE meeting_id = ?1")?;
        let filenames: Vec<String> = stmt
            .query_map([&id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        let tx = db.unchecked_transaction()?;

        // Delete vec_chunks manually (virtual table, no FK cascade)
        let chunk_ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM chunks WHERE meeting_id = ?1")?;
            let rows: Vec<i64> = stmt.query_map([&id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };
        for cid in &chunk_ids {
            tx.execute("DELETE FROM vec_chunks WHERE chunk_id = ?1", [cid])?;
        }

        // Delete chunks (FTS5 triggers handle cleanup)
        tx.execute("DELETE FROM chunks WHERE meeting_id = ?1", [&id])?;

        // CASCADE removes the meeting's transcripts, summaries, notes, todos, reminders, index state and KG edges.
        tx.execute("DELETE FROM meetings WHERE id = ?1", [&id])?;

        write_audit_log(&tx, "meeting", &id, "delete", None)?;

        tx.commit()?;

        log::info!("[store] Deleted meeting {} ({} recordings, {} chunks)", id, filenames.len(), chunk_ids.len());
        Ok(MeetingsDeleteResult { recording_filenames: filenames })
}

#[tauri::command]
pub async fn meetings_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<MeetingsDeleteResult, StoreError> {
    let deleted_id = id.clone();
    let conn_arc = Arc::clone(&state.conn);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        meetings_delete_impl(db, &id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    notify(MeetingChange::Deleted(deleted_id));
    Ok(result)
}

pub(crate) fn meetings_create_impl(db: &Connection, input: &MeetingCreateInput) -> Result<(), StoreError> {
        let created_at = input.created_at.unwrap_or_else(now_millis);
        let tx = db.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO meetings (id, title, status, input_source, calendar_event_id, calendar_meta, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            rusqlite::params![
                input.id,
                input.title,
                input.status,
                input.input_source,
                input.calendar_event_id,
                input.calendar_meta,
                created_at,
            ],
        )?;
        if let Some(filename) = &input.recording_filename {
            tx.execute(
                "INSERT INTO recordings (id, meeting_id, filename, input_source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![generate_id(), input.id, filename, input.input_source, created_at],
            )?;
        }
        write_audit_log(&tx, "meeting", &input.id, "create", None)?;
        tx.commit()?;
        Ok(())
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

fn transcripts_save_impl(db: &Connection, input: &TranscriptSaveInput) -> Result<(), StoreError> {
        let now = now_millis();
        let tx = db.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO transcripts (meeting_id, text, language, model, segments, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(meeting_id) DO UPDATE SET
                text = excluded.text,
                language = excluded.language,
                model = excluded.model,
                segments = excluded.segments",
            rusqlite::params![input.meeting_id, input.text, input.language, input.model, input.segments, now],
        )?;
        meetings_set_status_impl(&tx, &input.meeting_id, &MeetingStatus::at("transcribed"))?;
        write_audit_log(&tx, "meeting", &input.meeting_id, "update", None)?;
        tx.commit()?;
        Ok(())
}

fn summaries_save_impl(db: &Connection, input: &SummarySaveInput) -> Result<(), StoreError> {
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
        tx.execute(
            "UPDATE meetings SET title = ?2 WHERE id = ?1 AND ?2 <> ''",
            rusqlite::params![input.meeting_id, input.title],
        )?;
        if !input.categories.is_empty() {
            let cat_ids = upsert_categories(&tx, &input.categories, now)?;
            sync_meeting_categories(&tx, &input.meeting_id, &cat_ids)?;
        }
        for item in &input.action_items {
            tx.execute(
                "INSERT INTO todos (id, meeting_id, text, owner, due_date, completed, source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 0, 'ai', ?6)",
                rusqlite::params![generate_id(), input.meeting_id, item.text, item.owner, item.due_date, now],
            )?;
        }
        meetings_set_status_impl(&tx, &input.meeting_id, &MeetingStatus::at("ready"))?;
        write_audit_log(&tx, "meeting", &input.meeting_id, "update", None)?;
        tx.commit()?;
        log::info!(
            "[store] Saved summary for meeting {}: action_items={}",
            input.meeting_id,
            input.action_items.len(),
        );
        Ok(())
}

/// Runs `write` on the open database off the async runtime, then announces the meeting change.
async fn write_meeting<F>(state: &StoreState, meeting_id: String, write: F) -> Result<(), StoreError>
where
    F: FnOnce(&Connection) -> Result<(), StoreError> + Send + 'static,
{
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        write(db)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))??;
    notify(MeetingChange::Saved(meeting_id));
    Ok(())
}

#[tauri::command]
pub async fn meetings_create(state: State<'_, StoreState>, input: MeetingCreateInput) -> Result<(), StoreError> {
    write_meeting(&state, input.id.clone(), move |db| meetings_create_impl(db, &input)).await
}

#[tauri::command]
pub async fn meetings_set_status(
    state: State<'_, StoreState>,
    id: String,
    status: MeetingStatus,
) -> Result<(), StoreError> {
    let target = id.clone();
    write_meeting(&state, id, move |db| meetings_set_status_impl(db, &target, &status)).await
}

#[tauri::command]
pub async fn transcripts_save(state: State<'_, StoreState>, input: TranscriptSaveInput) -> Result<(), StoreError> {
    write_meeting(&state, input.meeting_id.clone(), move |db| transcripts_save_impl(db, &input)).await
}

#[tauri::command]
pub async fn summaries_save(state: State<'_, StoreState>, input: SummarySaveInput) -> Result<(), StoreError> {
    write_meeting(&state, input.meeting_id.clone(), move |db| summaries_save_impl(db, &input)).await
}

// ── Recording Commands ──

#[derive(Debug, Deserialize)]
pub struct RecordingUpsertInput {
    pub id: String,
    pub meeting_id: Option<String>,
    pub filename: String,
    pub duration_seconds: Option<f64>,
    pub input_source: Option<String>,
    pub created_at: Option<i64>,
}

#[tauri::command]
pub async fn recordings_upsert(
    state: State<'_, StoreState>,
    input: RecordingUpsertInput,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let now = now_millis();
        let created_at = input.created_at.unwrap_or(now);

        db.execute(
            "INSERT INTO recordings (id, meeting_id, filename, duration_seconds, input_source, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                 meeting_id = COALESCE(excluded.meeting_id, recordings.meeting_id),
                 filename = excluded.filename,
                 duration_seconds = excluded.duration_seconds,
                 input_source = excluded.input_source",
            rusqlite::params![
                input.id,
                input.meeting_id,
                input.filename,
                input.duration_seconds,
                input.input_source,
                created_at,
            ],
        )?;

        log::info!("[store] Upserted recording {}", input.filename);
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn recordings_list_for_meeting(
    state: State<'_, StoreState>,
    meeting_id: String,
) -> Result<Vec<RecordingRow>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let mut stmt = db.prepare(
            "SELECT id, filename, duration_seconds, input_source, created_at FROM recordings WHERE meeting_id = ?1",
        )?;
        let rows: Vec<RecordingRow> = stmt
            .query_map([&meeting_id], |row| {
                Ok(RecordingRow {
                    id: row.get(0)?,
                    filename: row.get(1)?,
                    duration_seconds: row.get(2)?,
                    input_source: row.get(3)?,
                    created_at: row.get(4)?,
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
pub async fn recordings_list_orphan(
    state: State<'_, StoreState>,
) -> Result<Vec<RecordingRow>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let mut stmt = db.prepare(
            "SELECT id, filename, duration_seconds, input_source, created_at FROM recordings WHERE meeting_id IS NULL",
        )?;
        let rows: Vec<RecordingRow> = stmt
            .query_map([], |row| {
                Ok(RecordingRow {
                    id: row.get(0)?,
                    filename: row.get(1)?,
                    duration_seconds: row.get(2)?,
                    input_source: row.get(3)?,
                    created_at: row.get(4)?,
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
pub async fn recordings_delete(
    state: State<'_, StoreState>,
    filename: String,
) -> Result<Option<String>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        // Find the recording ID before deleting (for audit)
        let recording_id: Option<String> = db.query_row(
            "SELECT id FROM recordings WHERE filename = ?1",
            [&filename],
            |row| row.get(0),
        ).optional().ok().flatten();

        if let Some(ref rid) = recording_id {
            let tx = db.unchecked_transaction()?;
            tx.execute("DELETE FROM recordings WHERE id = ?1", [rid])?;
            write_audit_log(&tx, "recording", rid, "delete", None)?;
            tx.commit()?;
            log::info!("[store] Deleted recording {} ({})", filename, rid);
        }

        Ok(recording_id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
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
        write_audit_log(db, "category", &id, "update", Some(&format!("name={}", name)))?;
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
        write_audit_log(db, "category", &id, "create", Some(&format!("name={}", name)))?;
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
        write_audit_log(&tx, "category", &id, "delete", None)?;
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
        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM notes WHERE id = ?1",
            [&input.id],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;

        tx.execute(
            "INSERT INTO notes (id, meeting_id, text, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = ?5",
            rusqlite::params![input.id, input.meeting_id, input.text, created_at, now],
        )?;

        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "note", &input.id, op, None)?;

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
        write_audit_log(&tx, "note", &id, "delete", None)?;
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

fn collect_todos_with_reminders(
    conn: &Connection,
    meeting_id_opt: Option<&str>,
    completed_filter: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<(Vec<TodoWithReminder>, i64), StoreError> {
    let limit = limit.unwrap_or(200);
    let offset = offset.unwrap_or(0);

    let mut where_bits: Vec<String> = Vec::new();
    let mut count_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut list_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(mid) = meeting_id_opt {
        where_bits.push("t.meeting_id = ?1".to_string());
        count_params.push(Box::new(mid.to_string()));
        list_params.push(Box::new(mid.to_string()));
    }
    if let Some(comp) = completed_filter {
        let idx = list_params.len() + 1;
        where_bits.push(format!("t.completed = ?{}", idx));
        count_params.push(Box::new(comp as i32));
        list_params.push(Box::new(comp as i32));
    }

    let where_str = if where_bits.is_empty() {
        String::from("1=1")
    } else {
        where_bits.join(" AND ")
    };

    let count_sql = format!("SELECT COUNT(*) FROM todos t WHERE {}", where_str);
    let count_param_refs: Vec<&dyn rusqlite::types::ToSql> = count_params.iter().map(|p| p.as_ref()).collect();
    let total: i64 = conn.query_row(&count_sql, count_param_refs.as_slice(), |row| row.get(0))?;

    let lim_idx = list_params.len() + 1;
    let off_idx = list_params.len() + 2;
    list_params.push(Box::new(limit));
    list_params.push(Box::new(offset));

    let list_sql = format!(
        "SELECT t.id, t.meeting_id, m.title, t.text, t.owner, t.due_date, t.completed, t.source, t.created_at,
                r.notification_id, r.fire_at, r.status, r.created_at
         FROM todos t
         JOIN meetings m ON m.id = t.meeting_id
         LEFT JOIN reminders r ON r.todo_id = t.id AND r.status = 'scheduled'
         WHERE {}
         ORDER BY t.created_at DESC
         LIMIT ?{} OFFSET ?{}",
        where_str, lim_idx, off_idx,
    );

    let mut stmt = conn.prepare(&list_sql)?;

    type TodoRow = (String, String, String, String, Option<String>, Option<String>, i32, String, i64, Option<i32>, Option<i64>, Option<String>, Option<i64>);

    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<TodoRow> {
        Ok((
            row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
            row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?,
            row.get(9)?, row.get(10)?, row.get(11)?, row.get(12)?,
        ))
    };

    let list_param_refs: Vec<&dyn rusqlite::types::ToSql> = list_params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(list_param_refs.as_slice(), map_row)?;

    let items: Vec<TodoWithReminder> = rows.filter_map(|r| r.ok()).map(|(id, meeting_id, meeting_title, text, owner, due_date, completed, source, created_at, notif_id, fire_at, status, created_at_r)| {
        let reminder = notif_id.map(|nid| ReminderRow {
            notification_id: nid,
            fire_at: fire_at.unwrap_or(0),
            status: status.unwrap_or_else(|| "scheduled".into()),
            created_at: created_at_r.unwrap_or(0),
        });
        TodoWithReminder {
            id, meeting_id, meeting_title, text, owner, due_date,
            completed: completed != 0,
            source, created_at, reminder,
        }
    }).collect();

    Ok((items, total))
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
        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM todos WHERE id = ?1",
            [&input.id],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;

        tx.execute(
            "INSERT INTO todos (id, meeting_id, text, owner, due_date, completed, source, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                text = excluded.text,
                owner = excluded.owner,
                due_date = excluded.due_date,
                completed = excluded.completed,
                source = excluded.source",
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

        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "todo", &input.id, op, None)?;

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
    notify(MeetingChange::Saved(meeting_id));
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
        write_audit_log(db, "todo", id, "update", Some(&format!("completed={}", completed)))?;
        Ok(())
}

#[tauri::command]
pub async fn todos_set_completed(
    state: State<'_, StoreState>,
    id: String,
    completed: bool,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        todos_set_completed_impl(db, &id, completed)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn todos_delete_impl(db: &Connection, id: &str) -> Result<(), StoreError> {
        let tx = db.unchecked_transaction()?;
        let affected = tx.execute("DELETE FROM todos WHERE id = ?1", [&id])?;
        if affected == 0 {
            return Err(StoreError::from("Todo not found"));
        }
        write_audit_log(&tx, "todo", id, "delete", None)?;
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
        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM reminders WHERE todo_id = ?1",
            [&todo_id],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;
        tx.execute(
            "INSERT INTO reminders (todo_id, notification_id, fire_at, status, created_at)
             VALUES (?1, ?2, ?3, 'scheduled', ?4)
             ON CONFLICT(todo_id) DO UPDATE SET
                notification_id = excluded.notification_id,
                fire_at = excluded.fire_at,
                status = 'scheduled'",
            rusqlite::params![todo_id, notification_id, fire_at, now],
        )?;
        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "reminder", todo_id, op, None)?;
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
        write_audit_log(db, "reminder", todo_id, "update", Some(&format!("status={}", status)))?;
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
             JOIN meetings m ON m.id = t.meeting_id
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
        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM settings WHERE key = ?1",
            [&input.key],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;
        tx.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            rusqlite::params![input.key, input.value, now],
        )?;
        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "setting", &input.key, op, Some(&format!("value={}", input.value)))?;
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
            "SELECT provider, active, api_key_encrypted, base_url, data, updated_at FROM providers ORDER BY provider",
        )?;
        let providers: Vec<ProviderRow> = stmt
            .query_map([], |row| {
                Ok(ProviderRow {
                    provider: row.get(0)?,
                    active: row.get::<_, i32>(1)? != 0,
                    api_key_encrypted: row.get(2)?,
                    base_url: row.get(3)?,
                    data: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(providers)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
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

        let tx = db.unchecked_transaction()?;
        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM providers WHERE provider = ?1",
            [&input.provider],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;

        tx.execute(
            "INSERT INTO providers (provider, active, api_key_encrypted, base_url, data, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(provider) DO UPDATE SET
                active = excluded.active,
                api_key_encrypted = excluded.api_key_encrypted,
                base_url = excluded.base_url,
                data = excluded.data,
                updated_at = excluded.updated_at",
            rusqlite::params![
                input.provider,
                input.active.unwrap_or(false) as i32,
                input.api_key_encrypted,
                input.base_url,
                input.data,
                now,
            ],
        )?;

        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "provider", &input.provider, op, None)?;

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
        write_audit_log(db, "provider", &provider, "update", Some(&format!("active={}", active)))?;
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
        write_audit_log(db, "provider", &provider, "delete", None)?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Chat Domain Commands ──

#[tauri::command]
pub async fn chats_list(
    state: State<'_, StoreState>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<ChatsListResult, StoreError> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let total: i64 = db.query_row("SELECT COUNT(*) FROM chats", [], |row| row.get(0))?;

        let mut stmt = db.prepare(
            "SELECT c.id, c.title, c.last_message_at,
                    (SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) AS message_count
             FROM chats c
             ORDER BY c.last_message_at DESC
             LIMIT ?1 OFFSET ?2",
        )?;

        let items: Vec<ChatIndexRow> = stmt
            .query_map(rusqlite::params![limit, offset], |row| {
                Ok(ChatIndexRow {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    last_message_at: row.get(2)?,
                    message_count: row.get(3)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ChatsListResult { items, total })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

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

fn chats_get_impl(db: &Connection, id: &str) -> Result<ChatSessionResult, StoreError> {
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
            .filter_map(|r| r.ok())
            .collect();

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
        chats_upsert_impl(db, &input)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn chats_upsert_impl(db: &Connection, input: &ChatsUpsertInput) -> Result<(), StoreError> {
        let now = now_millis();

        let tx = db.unchecked_transaction()?;

        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM chats WHERE id = ?1",
            [&input.id],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;

        let created_at = input.created_at.unwrap_or(now);

        tx.execute(
            "INSERT INTO chats (id, title, meeting_id, created_at, last_message_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                meeting_id = excluded.meeting_id,
                last_message_at = excluded.last_message_at",
            rusqlite::params![input.id, input.title, input.meeting_id, created_at, input.last_message_at],
        )?;

        // Replace messages: delete all existing, then batch-insert new ones
        tx.execute("DELETE FROM chat_messages WHERE chat_id = ?1", [&input.id])?;

        {
            let mut insert_stmt = tx.prepare(
                "INSERT INTO chat_messages (id, chat_id, seq, role, text, provider, model, data, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;

            for (i, msg) in input.messages.iter().enumerate() {
                insert_stmt.execute(rusqlite::params![
                    msg.id,
                    input.id,
                    i as i32,
                    msg.role,
                    msg.text,
                    msg.provider,
                    msg.model,
                    msg.data,
                    msg.created_at,
                ])?;
            }
        } // drop insert_stmt before commit

        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "chat", &input.id, op, None)?;

        tx.commit()?;
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
        write_audit_log(db, "chat", &id, "update", Some(&format!("title={}", title)))?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
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

        let tx = db.unchecked_transaction()?;

        // Delete vec_chunks manually (virtual table, no FK cascade)
        let chunk_ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM chat_chunks WHERE chat_id = ?1")?;
            let rows: Vec<i64> = stmt.query_map([&id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };
        for cid in &chunk_ids {
            tx.execute("DELETE FROM chat_vec_chunks WHERE chunk_id = ?1", [cid])?;
        }
        tx.execute("DELETE FROM chat_chunks WHERE chat_id = ?1", [&id])?;

        // Delete chat — CASCADE handles: chat_messages, chat_index_state
        tx.execute("DELETE FROM chats WHERE id = ?1", [&id])?;

        write_audit_log(&tx, "chat", &id, "delete", None)?;

        tx.commit()?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── RAG Indexing Commands ──

/// Upserts a meeting's `meeting_index_state` so the RAG indexer can track staleness.
#[tauri::command]
pub async fn upsert_meeting_index(
    state: State<'_, StoreState>,
    meeting: MeetingIndexMeta,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let now = now_millis();
        db.execute(
            "INSERT INTO meeting_index_state (meeting_id, content_hash, indexed_at)
             VALUES (?1, COALESCE(?2, ''), ?3)
             ON CONFLICT(meeting_id) DO UPDATE SET
                content_hash = CASE WHEN ?2 IS NOT NULL THEN ?2 ELSE meeting_index_state.content_hash END,
                indexed_at = ?3",
            rusqlite::params![meeting.id, meeting.content_hash, now],
        )?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Insert chunks + vectors for a meeting. Replaces all existing chunks for that meeting.
#[tauri::command]
pub async fn upsert_chunks(
    state: State<'_, StoreState>,
    meeting_id: String,
    chunks: Vec<ChunkData>,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let tx = db.unchecked_transaction()?;

        let old_chunk_ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM chunks WHERE meeting_id = ?1")?;
            let rows: Vec<i64> = stmt.query_map([&meeting_id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };

        for chunk_id in &old_chunk_ids {
            tx.execute("DELETE FROM vec_chunks WHERE chunk_id = ?1", [chunk_id])?;
        }

        tx.execute("DELETE FROM chunks WHERE meeting_id = ?1", [&meeting_id])?;

        for chunk in &chunks {
            tx.execute(
                "INSERT INTO chunks (meeting_id, chunk_index, chunk_text, chunk_type, start_pos, end_pos)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    meeting_id,
                    chunk.chunk_index,
                    chunk.chunk_text,
                    chunk.chunk_type,
                    chunk.start_pos,
                    chunk.end_pos,
                ],
            )?;

            let chunk_row_id = tx.last_insert_rowid();

            if let Some(embedding) = &chunk.embedding {
                let embedding_bytes: Vec<u8> = embedding
                    .iter()
                    .flat_map(|f| f.to_le_bytes())
                    .collect();
                tx.execute(
                    "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)",
                    rusqlite::params![chunk_row_id, embedding_bytes],
                )?;
            }
        }

        tx.commit()?;
        log::info!("[store] Upserted {} chunks for meeting {}", chunks.len(), meeting_id);
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Hybrid search: vector KNN + FTS5, merged via Reciprocal Rank Fusion.
#[tauri::command]
pub async fn meetings_search(
    state: State<'_, StoreState>,
    params: SearchParams,
) -> Result<Vec<SearchHit>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        hybrid_search(db, &params).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Compare content hashes to find meetings that need re-indexing.
#[tauri::command]
pub async fn get_stale_meetings(
    state: State<'_, StoreState>,
    meetings: Vec<MeetingHash>,
) -> Result<Vec<String>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        db.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS _check_hashes (id TEXT PRIMARY KEY, content_hash TEXT);"
        )?;
        db.execute("DELETE FROM _check_hashes", [])?;

        {
            let mut stmt = db.prepare(
                "INSERT INTO _check_hashes (id, content_hash) VALUES (?1, ?2)"
            )?;
            for m in &meetings {
                stmt.execute(rusqlite::params![m.id, m.content_hash])?;
            }
        }

        let mut stmt = db.prepare(
            "SELECT ch.id FROM _check_hashes ch
             LEFT JOIN meeting_index_state mis ON mis.meeting_id = ch.id
             WHERE mis.meeting_id IS NULL OR mis.content_hash != ch.content_hash"
        )?;

        let stale: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(stale)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Return meeting IDs that need embeddings.
#[tauri::command]
pub async fn get_meetings_needing_embeddings(
    state: State<'_, StoreState>,
    meeting_ids: Vec<String>,
) -> Result<Vec<String>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        db.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS _check_ids (id TEXT PRIMARY KEY);"
        )?;
        db.execute("DELETE FROM _check_ids", [])?;

        {
            let mut stmt = db.prepare("INSERT INTO _check_ids (id) VALUES (?1)")?;
            for id in &meeting_ids {
                stmt.execute([id])?;
            }
        }

        let mut stmt = db.prepare(
            "SELECT ci.id FROM _check_ids ci
             INNER JOIN meeting_index_state mis ON mis.meeting_id = ci.id
             WHERE mis.embedding_hash IS NULL OR mis.embedding_hash != mis.content_hash"
        )?;

        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ids)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Mark a meeting's embeddings as up-to-date.
#[tauri::command]
pub async fn mark_meeting_embedded(
    state: State<'_, StoreState>,
    meeting_id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        db.execute(
            "UPDATE meeting_index_state SET embedding_hash = content_hash WHERE meeting_id = ?1",
            [&meeting_id],
        )?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Stamp a meeting's content_hash after chunks have been upserted.
#[tauri::command]
pub async fn mark_meeting_content_indexed(
    state: State<'_, StoreState>,
    meeting_id: String,
    content_hash: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        db.execute(
            "INSERT INTO meeting_index_state (meeting_id, content_hash, indexed_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(meeting_id) DO UPDATE SET
                content_hash = ?2, indexed_at = ?3",
            rusqlite::params![meeting_id, content_hash, now_millis()],
        )?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

/// Return all meeting IDs that have entries in meetings table.
#[tauri::command]
pub async fn get_indexed_ids(
    state: State<'_, StoreState>,
) -> Result<Vec<String>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let mut stmt = db.prepare("SELECT id FROM meetings")?;
        let ids = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn get_stats(
    state: State<'_, StoreState>,
) -> Result<DbStats, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let count = |sql: &str| -> i64 {
            db.query_row(sql, [], |row| row.get(0)).unwrap_or(0)
        };

        let total_meetings = count("SELECT COUNT(*) FROM meetings");
        let total_chunks = count("SELECT COUNT(*) FROM chunks");
        let transcript_chunks = count("SELECT COUNT(*) FROM chunks WHERE chunk_type = 'transcript'");
        let chat_sessions = count("SELECT COUNT(*) FROM chats");
        let chat_chunks = count("SELECT COUNT(*) FROM chat_chunks");
        let fts_chunks = count("SELECT COUNT(*) FROM chunks_fts");
        let fts_chat_chunks = count("SELECT COUNT(*) FROM chat_chunks_fts");

        let page_count: i64 = db
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .unwrap_or(0);
        let page_size: i64 = db
            .query_row("PRAGMA page_size", [], |row| row.get(0))
            .unwrap_or(4096);
        let db_size_bytes = (page_count * page_size) as u64;

        Ok(DbStats {
            total_meetings,
            total_chunks,
            transcript_chunks,
            chat_sessions,
            chat_chunks,
            db_size_bytes,
            fts_chunks,
            fts_chat_chunks,
        })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn get_meta(
    state: State<'_, StoreState>,
) -> Result<DbMeta, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let get = |key: &str| -> String {
            db.query_row(
                "SELECT value FROM meta WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .unwrap_or_default()
        };

        Ok(DbMeta {
            schema_version: get("schema_version"),
            embedding_model: get("embedding_model"),
            embedding_dim: get("embedding_dim"),
        })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn rebuild(
    state: State<'_, StoreState>,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        db.execute_batch(
            "DELETE FROM vec_chunks;
             DELETE FROM chunks;
             DELETE FROM meeting_index_state;
             INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');
             DELETE FROM chat_vec_chunks;
             DELETE FROM chat_chunks;
             DELETE FROM chat_index_state;
             INSERT INTO chat_chunks_fts(chat_chunks_fts) VALUES('rebuild');",
        )?;

        log::info!("[store] Database rebuilt (derived data cleared)");
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn rebuild_fts(
    state: State<'_, StoreState>,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        db.execute_batch(
            "INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');
             INSERT INTO chat_chunks_fts(chat_chunks_fts) VALUES('rebuild');
             UPDATE meeting_index_state SET content_hash = NULL;
             UPDATE chat_index_state SET content_hash = NULL;",
        )?;

        log::info!("[store] FTS5 indexes rebuilt, content hashes cleared for re-indexing");
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
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
             reasoning_tokens, estimated_cost)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                record.estimated_cost.unwrap_or(0.0),
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
    pub estimated_cost: f64,
    pub timestamp: i64,
}

fn meeting_usage_impl(db: &Connection, meeting_id: &str) -> Result<Vec<MeetingUsageRow>, StoreError> {
    let mut stmt = db.prepare(
        "SELECT category, provider, model, input_tokens, output_tokens, COALESCE(estimated_cost, 0), timestamp
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

/// The window and filters every usage query shares; parameters ?1–?5 in `usage_params` order.
const USAGE_WHERE: &str = "timestamp >= ?1 AND timestamp < ?2
     AND (?3 IS NULL OR provider = ?3) AND (?4 IS NULL OR model = ?4) AND (?5 IS NULL OR category = ?5)";

fn usage_params(q: &UsageQuery) -> (i64, i64, Option<&str>, Option<&str>, Option<&str>) {
    (
        q.since.unwrap_or(0),
        q.until.unwrap_or(i64::MAX),
        q.provider.as_deref(),
        q.model.as_deref(),
        q.category.as_deref(),
    )
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
        .query_map(rusqlite::params![p.0, p.1, p.2, p.3, p.4], |row| {
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

fn usage_summary_impl(db: &Connection, q: &UsageQuery) -> Result<UsageSummary, StoreError> {
    let params = usage_params(q);
    let (total_cost, total_input, total_output, total_cache_read, total_calls, first_timestamp): (f64, i64, i64, i64, i64, Option<i64>) = db
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(estimated_cost), 0), COALESCE(SUM(input_tokens), 0),
                 COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cache_read_tokens), 0), COUNT(*), MIN(timestamp)
                 FROM usage_log WHERE {USAGE_WHERE}"
            ),
            rusqlite::params![params.0, params.1, params.2, params.3, params.4],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )?;

    let mut stmt = db.prepare(&format!(
        "SELECT provider, model, COUNT(*), SUM(input_tokens), SUM(output_tokens),
         SUM(COALESCE(cache_read_tokens, 0)), SUM(COALESCE(cache_write_tokens, 0)), SUM(COALESCE(reasoning_tokens, 0)),
         SUM(COALESCE(estimated_cost, 0))
         FROM usage_log WHERE {USAGE_WHERE}
         GROUP BY provider, model ORDER BY SUM(COALESCE(estimated_cost, 0)) DESC, COUNT(*) DESC"
    ))?;
    let by_provider_model = stmt
        .query_map(rusqlite::params![params.0, params.1, params.2, params.3, params.4], |row| {
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
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = db.prepare(&format!(
        "SELECT category, COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(COALESCE(estimated_cost, 0))
         FROM usage_log WHERE {USAGE_WHERE}
         GROUP BY category ORDER BY SUM(COALESCE(estimated_cost, 0)) DESC, COUNT(*) DESC"
    ))?;
    let by_category = stmt
        .query_map(rusqlite::params![params.0, params.1, params.2, params.3, params.4], |row| {
            Ok(CategoryBreakdown {
                category: row.get(0)?,
                calls: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
                estimated_cost: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(UsageSummary {
        total_cost,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_cache_read_tokens: total_cache_read,
        total_calls,
        first_timestamp,
        by_provider_model,
        by_category,
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

#[tauri::command]
/// Records a chat's RAG staleness in `chat_index_state`; never touches `chats`, which `chats_upsert` owns.
fn mark_chat_indexed_impl(db: &Connection, session: &ChatSessionMeta) -> Result<(), StoreError> {
        let now = now_millis();
        db.execute(
            "INSERT INTO chat_index_state (chat_id, content_hash, indexed_at)
             VALUES (?1, COALESCE(?2, ''), ?3)
             ON CONFLICT(chat_id) DO UPDATE SET
                content_hash = CASE WHEN ?2 IS NOT NULL THEN ?2 ELSE chat_index_state.content_hash END,
                indexed_at = ?3",
            rusqlite::params![session.id, session.content_hash, now],
        )?;
        Ok(())
}

#[tauri::command]
pub async fn mark_chat_indexed(
    state: State<'_, StoreState>,
    session: ChatSessionMeta,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        mark_chat_indexed_impl(db, &session)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn upsert_chat_chunks(
    state: State<'_, StoreState>,
    session_id: String,
    chunks: Vec<ChatChunkData>,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let tx = db.unchecked_transaction()?;

        let old_chunk_ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM chat_chunks WHERE chat_id = ?1")?;
            let rows: Vec<i64> = stmt.query_map([&session_id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };

        for chunk_id in &old_chunk_ids {
            tx.execute("DELETE FROM chat_vec_chunks WHERE chunk_id = ?1", [chunk_id])?;
        }

        tx.execute("DELETE FROM chat_chunks WHERE chat_id = ?1", [&session_id])?;

        for chunk in &chunks {
            tx.execute(
                "INSERT INTO chat_chunks (chat_id, chunk_index, chunk_text, chunk_type)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![session_id, chunk.chunk_index, chunk.chunk_text, chunk.chunk_type],
            )?;

            let chunk_row_id = tx.last_insert_rowid();

            if let Some(embedding) = &chunk.embedding {
                let embedding_bytes: Vec<u8> = embedding
                    .iter()
                    .flat_map(|f| f.to_le_bytes())
                    .collect();
                tx.execute(
                    "INSERT INTO chat_vec_chunks (chunk_id, embedding) VALUES (?1, ?2)",
                    rusqlite::params![chunk_row_id, embedding_bytes],
                )?;
            }
        }

        tx.commit()?;
        log::info!("[store] Upserted {} chat chunks for session {}", chunks.len(), session_id);
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn delete_chat_session(
    state: State<'_, StoreState>,
    session_id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let tx = db.unchecked_transaction()?;

        let chunk_ids: Vec<i64> = {
            let mut stmt = tx.prepare("SELECT id FROM chat_chunks WHERE chat_id = ?1")?;
            let rows: Vec<i64> = stmt.query_map([&session_id], |row| row.get(0))?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };

        for chunk_id in &chunk_ids {
            tx.execute("DELETE FROM chat_vec_chunks WHERE chunk_id = ?1", [chunk_id])?;
        }

        tx.execute("DELETE FROM chat_chunks WHERE chat_id = ?1", [&session_id])?;
        tx.execute("DELETE FROM chats WHERE id = ?1", [&session_id])?;

        tx.commit()?;
        log::info!("[store] Deleted chat session {} and {} chunks", session_id, chunk_ids.len());
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn chat_is_stale(
    state: State<'_, StoreState>,
    session_id: String,
    content_hash: String,
) -> Result<bool, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let existing: Option<String> = db
            .query_row(
                "SELECT content_hash FROM chat_index_state WHERE chat_id = ?1",
                [&session_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(match existing {
            None => true,
            Some(stored) => stored != content_hash,
        })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn chats_get_stale(
    state: State<'_, StoreState>,
    sessions: Vec<MeetingHash>,
) -> Result<Vec<String>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        db.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS _check_hashes (id TEXT PRIMARY KEY, content_hash TEXT);"
        )?;
        db.execute("DELETE FROM _check_hashes", [])?;

        {
            let mut stmt = db.prepare(
                "INSERT INTO _check_hashes (id, content_hash) VALUES (?1, ?2)"
            )?;
            for s in &sessions {
                stmt.execute(rusqlite::params![s.id, s.content_hash])?;
            }
        }

        let mut stmt = db.prepare(
            "SELECT ch.id FROM _check_hashes ch
             LEFT JOIN chat_index_state cis ON cis.chat_id = ch.id
             WHERE cis.chat_id IS NULL OR cis.content_hash != ch.content_hash"
        )?;

        let stale: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(stale)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn get_chats_needing_embeddings(
    state: State<'_, StoreState>,
    session_ids: Vec<String>,
) -> Result<Vec<String>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        db.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS _check_ids (id TEXT PRIMARY KEY);"
        )?;
        db.execute("DELETE FROM _check_ids", [])?;

        {
            let mut stmt = db.prepare("INSERT INTO _check_ids (id) VALUES (?1)")?;
            for id in &session_ids {
                stmt.execute([id])?;
            }
        }

        let mut stmt = db.prepare(
            "SELECT ci.id FROM _check_ids ci
             INNER JOIN chat_index_state cis ON cis.chat_id = ci.id
             WHERE cis.embedding_hash IS NULL OR cis.embedding_hash != cis.content_hash"
        )?;

        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ids)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn mark_chat_embedded(
    state: State<'_, StoreState>,
    session_id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        db.execute(
            "UPDATE chat_index_state SET embedding_hash = content_hash WHERE chat_id = ?1",
            [&session_id],
        )?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn mark_chat_content_indexed(
    state: State<'_, StoreState>,
    session_id: String,
    content_hash: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        db.execute(
            "INSERT INTO chat_index_state (chat_id, content_hash, indexed_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(chat_id) DO UPDATE SET
                content_hash = ?2, indexed_at = ?3",
            rusqlite::params![session_id, content_hash, now_millis()],
        )?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn chats_search(
    state: State<'_, StoreState>,
    params: crate::search::ChatSearchParams,
) -> Result<Vec<ChatSearchHit>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        crate::search::chat_hybrid_search(db, &params).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn spotlight_search(
    state: State<'_, StoreState>,
    params: crate::spotlight::SpotlightParams,
) -> Result<Vec<crate::spotlight::SpotlightHit>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        crate::spotlight::spotlight_search(db, &params).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ── Command-logic tests: `_impl` cores on an in-memory DB, since `State` blocks command-layer tests ──
#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema;

    fn db() -> Connection {
        schema::open_migrated_test_db()
    }

    fn seed_meeting(conn: &Connection, id: &str) {
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
                meeting_id: meeting_id.to_string(),
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

    fn audit_ops(conn: &Connection, entity_type: &str, entity_id: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(
                // rowid is insertion order; created_at can tie within a millisecond and `id` is random.
                "SELECT operation FROM audit_log
                 WHERE entity_type = ?1 AND entity_id = ?2
                 ORDER BY rowid",
            )
            .unwrap();
        stmt.query_map(rusqlite::params![entity_type, entity_id], |r| r.get::<_, String>(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect()
    }

    fn count(conn: &Connection, sql: &str, id: &str) -> i64 {
        conn.query_row(sql, [id], |r| r.get(0)).unwrap()
    }

    // ── Reminders regression (historical bug #1) ──────────────────────

    // A reminder save must write a create/update audit op; "upsert" fails the CHECK and rolls back.

    #[test]
    fn reminders_upsert_writes_valid_audit_op_and_persists() {
        let conn = db();
        seed_meeting(&conn, "m1");
        seed_todo(&conn, "t1", "m1");

        // First call → create.
        reminders_upsert_impl(&conn, "t1", 42, 1_000).expect("first upsert ok");

        let status: String = conn
            .query_row("SELECT status FROM reminders WHERE todo_id = 't1'", [], |r| r.get(0))
            .expect("reminder row exists");
        assert_eq!(status, "scheduled");
        assert_eq!(audit_ops(&conn, "reminder", "t1"), vec!["create"]);

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

        assert_eq!(
            audit_ops(&conn, "reminder", "t1"),
            vec!["create", "update"],
            "second audit op must be a valid 'update'"
        );
    }

    #[test]
    fn reminders_set_status_updates_and_audits() {
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
    fn todos_upsert_create_then_update_audits_correctly() {
        let conn = db();
        seed_meeting(&conn, "m1");

        seed_todo(&conn, "t1", "m1");
        assert_eq!(audit_ops(&conn, "todo", "t1"), vec!["create"]);

        // Update path.
        todos_upsert_impl(
            &conn,
            &TodoUpsertInput {
                id: "t1".into(),
                meeting_id: "m1".into(),
                text: "Changed".into(),
                owner: Some("alice".into()),
                due_date: None,
                completed: None,
                source: None,
                created_at: None,
            },
        )
        .unwrap();
        assert_eq!(audit_ops(&conn, "todo", "t1"), vec!["create", "update"]);

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
            },
        )
        .expect("create meeting");
    }

    fn transcript(meeting_id: &str) -> TranscriptSaveInput {
        TranscriptSaveInput {
            meeting_id: meeting_id.into(),
            text: "hello world".into(),
            language: Some("en".into()),
            model: Some("whisper-1".into()),
            segments: None,
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
        assert_eq!(detail.title, "Recorded call");
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

        let gemini = usage_summary_impl(&conn, &UsageQuery { provider: Some("gemini".into()), ..Default::default() }).unwrap();
        assert_eq!(gemini.total_calls, 3);
        assert_eq!(gemini.by_provider_model.iter().map(|r| r.model.as_str()).collect::<Vec<_>>(), vec!["pro", "flash"]);
        assert!(gemini.trend.is_empty(), "no bucket asked, no trend");

        let flash_chat = usage_summary_impl(&conn, &UsageQuery {
            model: Some("flash".into()), category: Some("chat".into()), ..Default::default()
        }).unwrap();
        assert_eq!(flash_chat.total_calls, 1);
        assert_eq!(flash_chat.total_input_tokens, 100);

        // [since, until): the first day only; the record exactly at `until` is excluded.
        let window = usage_summary_impl(&conn, &UsageQuery { since: Some(noon), until: Some(noon + DAY_MS), ..Default::default() }).unwrap();
        assert_eq!(window.total_calls, 2);

        let empty = usage_summary_impl(&conn, &UsageQuery { provider: Some("none".into()), bucket: Some(UsageBucketSize::Month), ..Default::default() }).unwrap();
        assert_eq!((empty.total_calls, empty.first_timestamp, empty.trend.len()), (0, None, 0));
    }

    // ── meetings_delete cascade ───────────────────────────────────────

    #[test]
    fn meetings_delete_cascades_children_keeps_chat() {
        let conn = db();
        create_recording(&conn, "m1");
        transcripts_save_impl(&conn, &transcript("m1")).unwrap();
        summaries_save_impl(&conn, &summary("m1")).unwrap();

        // Add a note, a chunk + index_state, and a chat linked to the meeting.
        seed_note(&conn, "n1", "m1");
        conn.execute(
            "INSERT INTO chunks (meeting_id, chunk_index, chunk_text) VALUES ('m1', 0, 'chunk text')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO meeting_index_state (meeting_id, content_hash, indexed_at) VALUES ('m1', 'h', 1)",
            [],
        )
        .unwrap();
        chats_upsert_impl(
            &conn,
            &ChatsUpsertInput {
                id: "c1".into(),
                title: "Linked chat".into(),
                meeting_id: Some("m1".into()),
                last_message_at: 10,
                messages: vec![],
                created_at: None,
            },
        )
        .unwrap();

        let result = meetings_delete_impl(&conn, "m1").expect("delete ok");
        assert_eq!(result.recording_filenames, vec!["m1.wav".to_string()]);

        for (table, col) in [
            ("transcripts", "meeting_id"),
            ("summaries", "meeting_id"),
            ("notes", "meeting_id"),
            ("todos", "meeting_id"),
            ("recordings", "meeting_id"),
            ("chunks", "meeting_id"),
            ("meeting_index_state", "meeting_id"),
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
    fn chats_upsert_get_roundtrip_preserves_order_and_data() {
        let conn = db();
        let input = ChatsUpsertInput {
            id: "c1".into(),
            title: "My chat".into(),
            meeting_id: None,
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

    // ── mark_chat_indexed isolation (dual-write guard) ────────────────

    #[test]
    fn mark_chat_indexed_does_not_touch_chat_title() {
        let conn = db();
        chats_upsert_impl(
            &conn,
            &ChatsUpsertInput {
                id: "c1".into(),
                title: "Original".into(),
                meeting_id: None,
                last_message_at: 5,
                messages: vec![],
                created_at: None,
            },
        )
        .unwrap();

        mark_chat_indexed_impl(
            &conn,
            &ChatSessionMeta {
                id: "c1".into(),
                title: "SHOULD NOT BE WRITTEN".into(),
                last_message_at: 5,
                message_count: 0,
                content_hash: Some("hash-123".into()),
            },
        )
        .expect("mark ok");

        let title: String = conn
            .query_row("SELECT title FROM chats WHERE id = 'c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "Original", "title must be untouched");

        let hash: String = conn
            .query_row("SELECT content_hash FROM chat_index_state WHERE chat_id = 'c1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(hash, "hash-123", "index state holds the content hash");
    }
}
