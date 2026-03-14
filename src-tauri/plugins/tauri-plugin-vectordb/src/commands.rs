use crate::schema;
use crate::search::{hybrid_search, SearchHit, SearchParams};
use rusqlite::{ffi::sqlite3_auto_extension, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, State};

/// Plugin state holding the database connection.
pub struct VectorDbState {
    pub conn: Mutex<Option<Connection>>,
}

impl Default for VectorDbState {
    fn default() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingMeta {
    pub id: String,
    pub title: String,
    pub timestamp: i64,
    pub summary: Option<String>,
    pub categories: Option<String>,
    pub content_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkData {
    pub chunk_index: i32,
    pub chunk_text: String,
    pub chunk_type: String,
    pub embedding: Vec<f32>,
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
    pub db_size_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbMeta {
    pub schema_version: String,
    pub embedding_model: String,
    pub embedding_dim: String,
}

fn with_conn<R>(
    state: &State<'_, VectorDbState>,
    f: impl FnOnce(&Connection) -> Result<R, String>,
) -> Result<R, String> {
    let guard = state.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    let conn = guard.as_ref().ok_or("Database not initialized")?;
    f(conn)
}

/// Initialize the database: open/create the SQLite file, enable WAL, load sqlite-vec, run migrations.
#[tauri::command]
pub async fn initialize<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, VectorDbState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    if guard.is_some() {
        return Ok(()); // Already initialized
    }

    // Resolve DB path in app data dir
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&app_data)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let db_path = app_data.join("vectordb.sqlite");
    log::info!("[vectordb] Opening database at {:?}", db_path);

    // Register sqlite-vec as an auto-extension so it loads on every connection
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    }

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable WAL mode for crash safety and concurrent reads
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("Failed to set pragmas: {}", e))?;

    // Run migrations
    schema::migrate(&conn)?;

    log::info!("[vectordb] Database initialized successfully");
    *guard = Some(conn);
    Ok(())
}

/// Insert or update a meeting's metadata.
#[tauri::command]
pub async fn upsert_meeting(
    state: State<'_, VectorDbState>,
    meeting: MeetingMeta,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        let now = chrono_now();
        conn.execute(
            "INSERT INTO meetings (id, title, timestamp, summary, categories, indexed_at, updated_at, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                timestamp = excluded.timestamp,
                summary = excluded.summary,
                categories = excluded.categories,
                updated_at = ?6,
                content_hash = excluded.content_hash",
            rusqlite::params![
                meeting.id,
                meeting.title,
                meeting.timestamp,
                meeting.summary,
                meeting.categories,
                now,
                meeting.content_hash,
            ],
        )
        .map_err(|e| format!("upsert_meeting: {}", e))?;
        Ok(())
    })
}

/// Insert chunks + vectors for a meeting. Replaces all existing chunks for that meeting.
#[tauri::command]
pub async fn upsert_chunks(
    state: State<'_, VectorDbState>,
    meeting_id: String,
    chunks: Vec<ChunkData>,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        // Delete existing chunks for this meeting (CASCADE will handle vec_chunks via trigger? No —
        // vec0 virtual tables don't support triggers. We must delete vec rows manually.)
        let old_chunk_ids: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT id FROM chunks WHERE meeting_id = ?1")
                .map_err(|e| format!("select old chunks: {}", e))?;
            let ids: Vec<i64> = stmt
                .query_map([&meeting_id], |row| row.get(0))
                .map_err(|e| format!("query old chunks: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            ids
        };

        // Delete old vectors
        for chunk_id in &old_chunk_ids {
            conn.execute(
                "DELETE FROM vec_chunks WHERE chunk_id = ?1",
                [chunk_id],
            )
            .map_err(|e| format!("delete vec: {}", e))?;
        }

        // Delete old chunks (triggers will clean up FTS5)
        conn.execute(
            "DELETE FROM chunks WHERE meeting_id = ?1",
            [&meeting_id],
        )
        .map_err(|e| format!("delete chunks: {}", e))?;

        // Insert new chunks + vectors
        for chunk in &chunks {
            conn.execute(
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
            )
            .map_err(|e| format!("insert chunk: {}", e))?;

            let chunk_row_id = conn.last_insert_rowid();

            // Insert vector
            let embedding_bytes: Vec<u8> = chunk
                .embedding
                .iter()
                .flat_map(|f| f.to_le_bytes())
                .collect();

            conn.execute(
                "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)",
                rusqlite::params![chunk_row_id, embedding_bytes],
            )
            .map_err(|e| format!("insert vec: {}", e))?;
        }

        log::info!(
            "[vectordb] Upserted {} chunks for meeting {}",
            chunks.len(),
            meeting_id
        );
        Ok(())
    })
}

/// Delete a meeting and all its chunks/vectors.
#[tauri::command]
pub async fn delete_meeting(
    state: State<'_, VectorDbState>,
    meeting_id: String,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        // Delete vectors first (no CASCADE on virtual tables)
        let chunk_ids: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT id FROM chunks WHERE meeting_id = ?1")
                .map_err(|e| format!("select chunks: {}", e))?;
            let ids: Vec<i64> = stmt
                .query_map([&meeting_id], |row| row.get(0))
                .map_err(|e| format!("query chunks: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            ids
        };

        for chunk_id in &chunk_ids {
            conn.execute("DELETE FROM vec_chunks WHERE chunk_id = ?1", [chunk_id])
                .map_err(|e| format!("delete vec: {}", e))?;
        }

        // Delete chunks (triggers handle FTS5)
        conn.execute("DELETE FROM chunks WHERE meeting_id = ?1", [&meeting_id])
            .map_err(|e| format!("delete chunks: {}", e))?;

        // Delete meeting
        conn.execute("DELETE FROM meetings WHERE id = ?1", [&meeting_id])
            .map_err(|e| format!("delete meeting: {}", e))?;

        log::info!("[vectordb] Deleted meeting {} and {} chunks", meeting_id, chunk_ids.len());
        Ok(())
    })
}

/// Hybrid search: vector KNN + FTS5, merged via Reciprocal Rank Fusion.
#[tauri::command]
pub async fn search(
    state: State<'_, VectorDbState>,
    params: SearchParams,
) -> Result<Vec<SearchHit>, String> {
    with_conn(&state, |conn| hybrid_search(conn, &params))
}

/// Compare content hashes to find meetings that need re-indexing.
/// Returns IDs of meetings whose stored hash differs from the provided hash.
#[tauri::command]
pub async fn get_stale_meetings(
    state: State<'_, VectorDbState>,
    meetings: Vec<MeetingHash>,
) -> Result<Vec<String>, String> {
    with_conn(&state, |conn| {
        let mut stale = Vec::new();

        for m in &meetings {
            let stored_hash: Option<String> = conn
                .query_row(
                    "SELECT content_hash FROM meetings WHERE id = ?1",
                    [&m.id],
                    |row| row.get(0),
                )
                .ok();

            match stored_hash {
                Some(hash) if hash == m.content_hash => {} // Up to date
                _ => stale.push(m.id.clone()),             // New or changed
            }
        }

        Ok(stale)
    })
}

/// Return all indexed meeting IDs.
#[tauri::command]
pub async fn get_indexed_ids(
    state: State<'_, VectorDbState>,
) -> Result<Vec<String>, String> {
    with_conn(&state, |conn| {
        let mut stmt = conn
            .prepare("SELECT id FROM meetings")
            .map_err(|e| format!("prepare: {}", e))?;
        let ids = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("query: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    })
}

/// Return database statistics.
#[tauri::command]
pub async fn get_stats(
    state: State<'_, VectorDbState>,
) -> Result<DbStats, String> {
    with_conn(&state, |conn| {
        let total_meetings: i64 = conn
            .query_row("SELECT COUNT(*) FROM meetings", [], |row| row.get(0))
            .unwrap_or(0);
        let total_chunks: i64 = conn
            .query_row("SELECT COUNT(*) FROM chunks", [], |row| row.get(0))
            .unwrap_or(0);

        // Get file size from page_count * page_size
        let page_count: i64 = conn
            .query_row("PRAGMA page_count", [], |row| row.get(0))
            .unwrap_or(0);
        let page_size: i64 = conn
            .query_row("PRAGMA page_size", [], |row| row.get(0))
            .unwrap_or(4096);
        let db_size_bytes = (page_count * page_size) as u64;

        Ok(DbStats {
            total_meetings,
            total_chunks,
            db_size_bytes,
        })
    })
}

/// Return index metadata (schema version, embedding model, dimensions).
#[tauri::command]
pub async fn get_meta(
    state: State<'_, VectorDbState>,
) -> Result<DbMeta, String> {
    with_conn(&state, |conn| {
        let get = |key: &str| -> String {
            conn.query_row(
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
}

/// Drop all data and reset the database. Triggers full re-index from frontend.
#[tauri::command]
pub async fn rebuild(
    state: State<'_, VectorDbState>,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        // Delete all vector data
        conn.execute_batch(
            "DELETE FROM vec_chunks;
             DELETE FROM chunks;
             DELETE FROM meetings;
             INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');",
        )
        .map_err(|e| format!("rebuild: {}", e))?;

        log::info!("[vectordb] Database rebuilt (all data cleared)");
        Ok(())
    })
}

fn chrono_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
