use crate::error::StoreError;
use crate::graph;
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
    pub pending_transcription: bool,
    pub calendar_event_id: Option<String>,
    pub calendar_meta: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub categories: Vec<String>,
    pub recording_filename: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingListResult {
    pub items: Vec<MeetingRow>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct MeetingUpsertInput {
    pub id: String,
    pub title: String,
    pub input_source: Option<String>,
    pub pending_transcription: Option<bool>,
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
    pub pending_transcription: bool,
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

#[derive(Debug, Deserialize)]
pub struct TranscriptionSaveInput {
    pub meeting_id: String,
    pub title: String,
    pub transcript: String,
    pub transcript_language: Option<String>,
    pub transcript_model: Option<String>,
    pub transcript_segments: Option<String>,
    pub summary_overview: String,
    pub summary_data: String,
    pub categories: Option<Vec<String>>,
    pub recording_filename: Option<String>,
    pub recording_duration: Option<f64>,
    pub recording_input_source: Option<String>,
    pub input_source: Option<String>,
    pub calendar_meta: Option<String>,
    pub action_items: Option<Vec<ActionItemInput>>,
    pub created_at: Option<i64>,
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
    pub kg_nodes: i64,
    pub kg_edges: i64,
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
    pub session_id: String,
    pub session_title: String,
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
    pub by_provider_model: Vec<ProviderModelBreakdown>,
    pub by_category: Vec<CategoryBreakdown>,
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
    let db_path = app_data.join("kasset.db");

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

// ══════════════════════════════════════════════════════════════════
// Meeting Domain Commands (Phase 1)
// ══════════════════════════════════════════════════════════════════

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
            "SELECT m.id, m.title, m.input_source, m.pending_transcription,
                    m.calendar_event_id, m.calendar_meta, m.created_at, m.updated_at
             FROM meetings m
             ORDER BY m.created_at DESC
             LIMIT ?1 OFFSET ?2",
        )?;

        let meeting_rows: Vec<(String, String, Option<String>, bool, Option<String>, Option<String>, i64, i64)> = stmt
            .query_map(rusqlite::params![limit, offset], |row| {
                Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                    row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
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
            .map(|(id, title, input_source, pending, ceid, cmeta, cat, uat)| {
                let categories = category_map.get(&id).cloned().unwrap_or_default();
                let rec_fn = rec_filenames.get(&id).and_then(|v| v.clone());
                MeetingRow {
                    id,
                    title,
                    input_source,
                    pending_transcription: pending,
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

fn meetings_get_impl(db: &Connection, id: &str) -> Result<MeetingDetail, StoreError> {
        let meeting: (String, String, Option<String>, bool, Option<String>, Option<String>, i64, i64) = db
            .query_row(
                "SELECT id, title, input_source, pending_transcription,
                        calendar_event_id, calendar_meta, created_at, updated_at
                 FROM meetings WHERE id = ?1",
                [&id],
                |row| Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                    row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
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
            pending_transcription: meeting.3,
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
            "INSERT INTO meetings (id, title, input_source, pending_transcription, calendar_event_id, calendar_meta, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                input_source = excluded.input_source,
                pending_transcription = excluded.pending_transcription,
                calendar_event_id = excluded.calendar_event_id,
                calendar_meta = excluded.calendar_meta,
                updated_at = ?8",
            rusqlite::params![
                input.id,
                input.title,
                input.input_source,
                input.pending_transcription.unwrap_or(false) as i32,
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
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        meetings_upsert_impl(db, &input)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn meetings_delete_impl(db: &Connection, id: &str) -> Result<MeetingsDeleteResult, StoreError> {
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

        // Delete meeting — CASCADE handles: transcripts, summaries, recordings,
        // notes, todos, reminders, meeting_categories, meeting_index_state, kg_edges
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
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        meetings_delete_impl(db, &id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

fn save_transcription_impl(db: &Connection, input: &TranscriptionSaveInput) -> Result<(), StoreError> {
        let now = now_millis();
        let created_at = input.created_at.unwrap_or(now);

        let tx = db.unchecked_transaction()?;

        // 1. Upsert meeting
        let pending: i32 = 0; // transcription complete → not pending
        let is_new: bool = tx.query_row(
            "SELECT COUNT(*) FROM meetings WHERE id = ?1",
            [&input.meeting_id],
            |row| row.get::<_, i64>(0),
        ).map(|c| c == 0)?;

        tx.execute(
            "INSERT INTO meetings (id, title, input_source, pending_transcription, calendar_event_id, calendar_meta, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                input_source = excluded.input_source,
                pending_transcription = excluded.pending_transcription,
                calendar_event_id = excluded.calendar_event_id,
                calendar_meta = excluded.calendar_meta,
                updated_at = ?8",
            rusqlite::params![
                input.meeting_id,
                input.title,
                input.input_source,
                pending,
                None::<String>,  // calendar_event_id preserved from existing via separate logic
                input.calendar_meta,
                created_at,
                now,
            ],
        )?;

        // 2. Categories
        if let Some(cat_names) = &input.categories {
            if !cat_names.is_empty() {
                let cat_ids = upsert_categories(&tx, cat_names, now)?;
                sync_meeting_categories(&tx, &input.meeting_id, &cat_ids)?;
            }
        }

        // 3. Transcript
        tx.execute(
            "INSERT INTO transcripts (meeting_id, text, language, model, segments, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(meeting_id) DO UPDATE SET
                text = excluded.text,
                language = excluded.language,
                model = excluded.model,
                segments = excluded.segments",
            rusqlite::params![
                input.meeting_id,
                input.transcript,
                input.transcript_language,
                input.transcript_model,
                input.transcript_segments,
                created_at,
            ],
        )?;

        // 4. Summary
        tx.execute(
            "INSERT INTO summaries (meeting_id, overview, data, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(meeting_id) DO UPDATE SET
                overview = excluded.overview,
                data = excluded.data,
                updated_at = ?5",
            rusqlite::params![
                input.meeting_id,
                input.summary_overview,
                input.summary_data,
                created_at,
                now,
            ],
        )?;

        // 5. Recording (optional)
        if let Some(ref filename) = input.recording_filename {
            tx.execute(
                "INSERT INTO recordings (id, meeting_id, filename, duration_seconds, input_source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    generate_id(),
                    input.meeting_id,
                    filename,
                    input.recording_duration,
                    input.recording_input_source,
                    created_at,
                ],
            )?;
        }

        // 6. Action items → todos (AI-sourced)
        if let Some(action_items) = &input.action_items {
            for item in action_items {
                tx.execute(
                    "INSERT INTO todos (id, meeting_id, text, owner, due_date, completed, source, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, 0, 'ai', ?6)",
                    rusqlite::params![
                        generate_id(),
                        input.meeting_id,
                        item.text,
                        item.owner,
                        item.due_date,
                        created_at,
                    ],
                )?;
            }
        }

        // 7. Audit log
        let op = if is_new { "create" } else { "update" };
        write_audit_log(&tx, "meeting", &input.meeting_id, op, None)?;

        tx.commit()?;

        log::info!(
            "[store] Saved transcription for meeting {}: action_items={}, categories={:?}",
            input.meeting_id,
            input.action_items.as_ref().map_or(0, |a| a.len()),
            input.categories,
        );
        Ok(())
}

#[tauri::command]
pub async fn save_transcription(
    state: State<'_, StoreState>,
    input: TranscriptionSaveInput,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        save_transcription_impl(db, &input)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Recording Commands
// ══════════════════════════════════════════════════════════════════

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
            db.execute("DELETE FROM recordings WHERE id = ?1", [rid])?;
            log::info!("[store] Deleted recording {} ({})", filename, rid);
        }

        Ok(recording_id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Category Commands
// ══════════════════════════════════════════════════════════════════

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
        let affected = db.execute("DELETE FROM categories WHERE id = ?1", [&id])?;
        if affected == 0 {
            return Err(StoreError::from("Category not found"));
        }
        write_audit_log(db, "category", &id, "delete", None)?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Notes Commands (Phase 3)
// ══════════════════════════════════════════════════════════════════

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
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn notes_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let affected = db.execute("DELETE FROM notes WHERE id = ?1", [&id])?;
        if affected == 0 {
            return Err(StoreError::from("Note not found"));
        }
        write_audit_log(db, "note", &id, "delete", None)?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Todos Commands (Phase 3)
// ══════════════════════════════════════════════════════════════════

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
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        todos_upsert_impl(db, &input)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
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
        let affected = db.execute("DELETE FROM todos WHERE id = ?1", [&id])?;
        if affected == 0 {
            return Err(StoreError::from("Todo not found"));
        }
        write_audit_log(db, "todo", id, "delete", None)?;
        Ok(())
}

#[tauri::command]
pub async fn todos_delete(
    state: State<'_, StoreState>,
    id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        todos_delete_impl(db, &id)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Reminders Commands (Phase 3)
// ══════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════
// Settings Commands (Phase 4)
// ══════════════════════════════════════════════════════════════════

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

        db.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            rusqlite::params![input.key, input.value, now],
        )?;
        write_audit_log(db, "setting", &input.key, "update", Some(&format!("value={}", input.value)))?;
        Ok(())
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Providers Commands (Phase 4)
// ══════════════════════════════════════════════════════════════════

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

        let affected = db.execute(
            "UPDATE providers SET active = ?2 WHERE provider = ?1",
            rusqlite::params![provider, active as i32],
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

// ══════════════════════════════════════════════════════════════════
// Chat Domain Commands (Phase 2)
// ══════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════
// RAG Indexing Commands (fixed for new schema)
// ══════════════════════════════════════════════════════════════════

/// Insert or update a meeting's RAG metadata in meeting_index_state.
/// Used by the RAG indexer to track staleness.
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

/// Return meeting IDs that need entity extraction.
#[tauri::command]
pub async fn get_meetings_needing_extraction(
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
             WHERE mis.extraction_hash IS NULL OR mis.extraction_hash != mis.content_hash"
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

/// Mark a meeting's entity extraction as up-to-date.
#[tauri::command]
pub async fn mark_meeting_extracted(
    state: State<'_, StoreState>,
    meeting_id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        db.execute(
            "UPDATE meeting_index_state SET extraction_hash = content_hash WHERE meeting_id = ?1",
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
        let kg_nodes = count("SELECT COUNT(*) FROM kg_nodes");
        let kg_edges = count("SELECT COUNT(*) FROM kg_edges");
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
            kg_nodes,
            kg_edges,
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
             DELETE FROM kg_edges;
             DELETE FROM kg_nodes;
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

// ══════════════════════════════════════════════════════════════════
// Knowledge Graph Commands (unchanged logic, fixed error type)
// ══════════════════════════════════════════════════════════════════

#[tauri::command]
pub async fn graph_upsert(
    state: State<'_, StoreState>,
    meeting_id: String,
    nodes: Vec<graph::GraphNode>,
    edges: Vec<graph::GraphEdge>,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        graph::upsert_meeting_graph(db, &meeting_id, &nodes, &edges)
            .map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn graph_traverse(
    state: State<'_, StoreState>,
    params: graph::TraversalParams,
) -> Result<Vec<graph::TraversalResult>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        graph::traverse(db, &params).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn graph_neighbors(
    state: State<'_, StoreState>,
    node_id: String,
    edge_types: Option<Vec<String>>,
    direction: Option<String>,
) -> Result<Vec<graph::TraversalResult>, StoreError> {
    let direction_owned = direction.unwrap_or_else(|| "both".to_string());
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        graph::neighbors(db, &node_id, edge_types.as_deref(), &direction_owned)
            .map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn graph_search(
    state: State<'_, StoreState>,
    params: graph::GraphSearchParams,
) -> Result<Vec<graph::GraphNode>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        graph::search_nodes(db, &params).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn graph_delete_meeting(
    state: State<'_, StoreState>,
    meeting_id: String,
) -> Result<(), StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        graph::delete_meeting_graph(db, &meeting_id).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn graph_stats(
    state: State<'_, StoreState>,
) -> Result<graph::GraphStats, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        graph::stats(db).map_err(StoreError::from)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

#[tauri::command]
pub async fn graph_extracted_meeting_ids(
    state: State<'_, StoreState>,
) -> Result<Vec<String>, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;
        let mut stmt = db.prepare("SELECT DISTINCT meeting_id FROM kg_edges")?;
        let ids: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Usage Tracking Commands (unchanged logic)
// ══════════════════════════════════════════════════════════════════

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

#[tauri::command]
pub async fn get_usage_summary(
    state: State<'_, StoreState>,
    since: Option<i64>,
) -> Result<UsageSummary, StoreError> {
    let conn_arc = Arc::clone(&state.conn);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn_arc.lock().map_err(|e| StoreError::from(format!("Lock error: {}", e)))?;
        let db = guard.as_ref().ok_or(StoreError::from("Database not initialized"))?;

        let since_ts = since.unwrap_or(0);

        let (total_cost, total_input, total_output, total_cache_read, total_calls): (f64, i64, i64, i64, i64) = db
            .query_row(
                "SELECT COALESCE(SUM(estimated_cost), 0), COALESCE(SUM(input_tokens), 0),
                 COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cache_read_tokens), 0), COUNT(*)
                 FROM usage_log WHERE timestamp >= ?1",
                [since_ts],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )?;

        let mut stmt = db.prepare(
            "SELECT provider, model, COUNT(*), SUM(input_tokens), SUM(output_tokens),
             SUM(cache_read_tokens), SUM(cache_write_tokens), SUM(reasoning_tokens),
             SUM(estimated_cost)
             FROM usage_log WHERE timestamp >= ?1
             GROUP BY provider, model ORDER BY SUM(estimated_cost) DESC",
        )?;

        let by_provider_model: Vec<ProviderModelBreakdown> = stmt
            .query_map([since_ts], |row| {
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
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt2 = db.prepare(
            "SELECT category, COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(estimated_cost)
             FROM usage_log WHERE timestamp >= ?1
             GROUP BY category ORDER BY SUM(estimated_cost) DESC",
        )?;

        let by_category: Vec<CategoryBreakdown> = stmt2
            .query_map([since_ts], |row| {
                Ok(CategoryBreakdown {
                    category: row.get(0)?,
                    calls: row.get(1)?,
                    input_tokens: row.get(2)?,
                    output_tokens: row.get(3)?,
                    estimated_cost: row.get(4)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        Ok(UsageSummary {
            total_cost,
            total_input_tokens: total_input,
            total_output_tokens: total_output,
            total_cache_read_tokens: total_cache_read,
            total_calls,
            by_provider_model,
            by_category,
        })
    })
    .await
    .map_err(|e| StoreError::from(format!("spawn_blocking join: {}", e)))?
}

// ══════════════════════════════════════════════════════════════════
// Chat Indexing Commands (fixed: chat_sessions → chats, session_id → chat_id)
// ══════════════════════════════════════════════════════════════════

#[tauri::command]
/// Record a chat's RAG staleness in chat_index_state. Does NOT touch the canonical
/// `chats` table — that row is owned solely by `chats_upsert`. Mirrors `upsert_meeting_index`.
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

// ══════════════════════════════════════════════════════════════════
// Command-logic integration tests
//
// These exercise the `_impl` cores against an in-memory DB (the same
// migrated schema the app uses). They guard the mutation flows that
// `State<'_, StoreState>` makes impossible to test at the command layer.
// ══════════════════════════════════════════════════════════════════
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
                title: "Seed".into(),
                input_source: None,
                pending_transcription: None,
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

    fn audit_ops(conn: &Connection, entity_type: &str, entity_id: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(
                "SELECT operation FROM audit_log
                 WHERE entity_type = ?1 AND entity_id = ?2
                 ORDER BY created_at, id",
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
    //
    // `reminders_upsert` once wrote audit_log.operation = "upsert", which the
    // CHECK(operation IN ('create','update','delete')) rejected, silently
    // rolling back every reminder save. This test fails if that regresses:
    // it asserts a scheduled reminder row AND a VALID create/update audit op.

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

    #[test]
    fn meetings_upsert_get_roundtrip_with_categories() {
        let conn = db();
        meetings_upsert_impl(
            &conn,
            &MeetingUpsertInput {
                id: "m1".into(),
                title: "Standup".into(),
                input_source: Some("mic".into()),
                pending_transcription: Some(true),
                calendar_event_id: None,
                calendar_meta: None,
                categories: Some(vec!["work".into(), "team".into()]),
                created_at: Some(1234),
            },
        )
        .unwrap();

        let detail = meetings_get_impl(&conn, "m1").expect("get ok");
        assert_eq!(detail.title, "Standup");
        assert_eq!(detail.pending_transcription, true);
        assert_eq!(detail.created_at, 1234);
        assert_eq!(detail.categories, vec!["team".to_string(), "work".to_string()]);

        // Missing meeting → error.
        assert_eq!(meetings_get_impl(&conn, "nope").unwrap_err().message, "Meeting not found");
    }

    // ── save_transcription atomicity ─────────────────────────────────

    fn transcription_input(meeting_id: &str) -> TranscriptionSaveInput {
        TranscriptionSaveInput {
            meeting_id: meeting_id.to_string(),
            title: "Recorded call".into(),
            transcript: "hello world".into(),
            transcript_language: Some("en".into()),
            transcript_model: Some("whisper-1".into()),
            transcript_segments: None,
            summary_overview: "An overview".into(),
            summary_data: "{}".into(),
            categories: Some(vec!["sales".into()]),
            recording_filename: Some("rec.wav".into()),
            recording_duration: Some(12.5),
            recording_input_source: Some("mix".into()),
            input_source: Some("mix".into()),
            calendar_meta: None,
            action_items: Some(vec![
                ActionItemInput { text: "Follow up".into(), owner: Some("bob".into()), due_date: None },
                ActionItemInput { text: "Send notes".into(), owner: None, due_date: Some("2026-01-01".into()) },
            ]),
            created_at: Some(5000),
        }
    }

    #[test]
    fn save_transcription_persists_all_children() {
        let conn = db();
        save_transcription_impl(&conn, &transcription_input("m1")).expect("save ok");

        assert_eq!(count(&conn, "SELECT COUNT(*) FROM meetings WHERE id = ?1", "m1"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM transcripts WHERE meeting_id = ?1", "m1"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM summaries WHERE meeting_id = ?1", "m1"), 1);
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM todos WHERE meeting_id = ?1", "m1"),
            2,
            "both action items become todos"
        );
        let ai_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM todos WHERE meeting_id = 'm1' AND source = 'ai'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(ai_count, 2);

        let cat_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM meeting_categories WHERE meeting_id = 'm1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(cat_count, 1, "category linked");
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM recordings WHERE meeting_id = ?1", "m1"), 1);
    }

    #[test]
    fn save_transcription_rolls_back_fully_on_failure() {
        let conn = db();

        // Force a deterministic failure at the summary insert stage (step 4),
        // AFTER the meeting + transcript writes. A BEFORE INSERT trigger that
        // RAISE(ABORT) makes the whole transaction roll back, so NOTHING for
        // this meeting may persist.
        conn.execute_batch(
            "CREATE TRIGGER fail_on_summary BEFORE INSERT ON summaries BEGIN
                 SELECT RAISE(ABORT, 'forced failure');
             END;",
        )
        .unwrap();

        let err = save_transcription_impl(&conn, &transcription_input("m1")).unwrap_err();
        assert!(err.message.contains("forced failure"), "got: {}", err.message);

        // Full rollback: nothing for m1 persisted.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM meetings WHERE id = ?1", "m1"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM transcripts WHERE meeting_id = ?1", "m1"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM summaries WHERE meeting_id = ?1", "m1"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM todos WHERE meeting_id = ?1", "m1"), 0);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM recordings WHERE meeting_id = ?1", "m1"), 0);
    }

    // ── meetings_delete cascade ───────────────────────────────────────

    #[test]
    fn meetings_delete_cascades_children_keeps_chat() {
        let conn = db();
        save_transcription_impl(&conn, &transcription_input("m1")).unwrap();

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
        assert_eq!(result.recording_filenames, vec!["rec.wav".to_string()]);

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
