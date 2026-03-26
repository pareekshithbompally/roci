use crate::graph;
use crate::schema;
use crate::search::{hybrid_search, SearchHit, SearchParams};
use rusqlite::{ffi::sqlite3_auto_extension, Connection, OptionalExtension};
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
    pub content_hash: String,
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
        let now = now_millis();
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
/// Wrapped in a transaction for atomicity — crash at any point rolls back entirely.
#[tauri::command]
pub async fn upsert_chunks(
    state: State<'_, VectorDbState>,
    meeting_id: String,
    chunks: Vec<ChunkData>,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin transaction: {}", e))?;

        // Delete existing chunks for this meeting (vec0 virtual tables don't support
        // triggers/CASCADE, so we must delete vec rows manually.)
        let old_chunk_ids: Vec<i64> = {
            let mut stmt = tx
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
            tx.execute(
                "DELETE FROM vec_chunks WHERE chunk_id = ?1",
                [chunk_id],
            )
            .map_err(|e| format!("delete vec: {}", e))?;
        }

        // Delete old chunks (triggers will clean up FTS5)
        tx.execute(
            "DELETE FROM chunks WHERE meeting_id = ?1",
            [&meeting_id],
        )
        .map_err(|e| format!("delete chunks: {}", e))?;

        // Insert new chunks, and vectors when embeddings are available.
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
            )
            .map_err(|e| format!("insert chunk: {}", e))?;

            let chunk_row_id = tx.last_insert_rowid();

            if let Some(embedding) = &chunk.embedding {
                let embedding_bytes: Vec<u8> = embedding
                    .iter()
                    .flat_map(|f| f.to_le_bytes())
                    .collect();

                tx.execute(
                    "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?1, ?2)",
                    rusqlite::params![chunk_row_id, embedding_bytes],
                )
                .map_err(|e| format!("insert vec: {}", e))?;
            }
        }

        tx.commit().map_err(|e| format!("commit upsert_chunks: {}", e))?;

        log::info!(
            "[vectordb] Upserted {} chunks for meeting {}",
            chunks.len(),
            meeting_id
        );
        Ok(())
    })
}

/// Delete a meeting and all its chunks/vectors.
/// Wrapped in a transaction for atomicity.
#[tauri::command]
pub async fn delete_meeting(
    state: State<'_, VectorDbState>,
    meeting_id: String,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin transaction: {}", e))?;

        // Delete vectors first (no CASCADE on virtual tables)
        let chunk_ids: Vec<i64> = {
            let mut stmt = tx
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
            tx.execute("DELETE FROM vec_chunks WHERE chunk_id = ?1", [chunk_id])
                .map_err(|e| format!("delete vec: {}", e))?;
        }

        // Delete chunks (triggers handle FTS5)
        tx.execute("DELETE FROM chunks WHERE meeting_id = ?1", [&meeting_id])
            .map_err(|e| format!("delete chunks: {}", e))?;

        // Delete meeting
        tx.execute("DELETE FROM meetings WHERE id = ?1", [&meeting_id])
            .map_err(|e| format!("delete meeting: {}", e))?;

        tx.commit().map_err(|e| format!("commit delete_meeting: {}", e))?;

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
/// Uses a temp table + single JOIN query instead of N individual queries.
#[tauri::command]
pub async fn get_stale_meetings(
    state: State<'_, VectorDbState>,
    meetings: Vec<MeetingHash>,
) -> Result<Vec<String>, String> {
    with_conn(&state, |conn| {
        // Create temp table (no-op after first call in this connection)
        conn.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS _check_hashes (id TEXT PRIMARY KEY, content_hash TEXT);"
        ).map_err(|e| format!("create temp: {}", e))?;

        conn.execute("DELETE FROM _check_hashes", [])
            .map_err(|e| format!("clear temp: {}", e))?;

        // Batch insert incoming hashes using a prepared statement
        {
            let mut stmt = conn.prepare(
                "INSERT INTO _check_hashes (id, content_hash) VALUES (?1, ?2)"
            ).map_err(|e| format!("prepare insert: {}", e))?;

            for m in &meetings {
                stmt.execute(rusqlite::params![m.id, m.content_hash])
                    .map_err(|e| format!("insert hash: {}", e))?;
            }
        }

        // Single query: find IDs that are new or have changed hashes
        let mut stmt = conn.prepare(
            "SELECT ch.id FROM _check_hashes ch
             LEFT JOIN meetings m ON m.id = ch.id
             WHERE m.id IS NULL OR m.content_hash != ch.content_hash"
        ).map_err(|e| format!("prepare stale: {}", e))?;

        let stale: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| format!("query stale: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

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
        let count = |sql: &str| -> i64 {
            conn.query_row(sql, [], |row| row.get(0)).unwrap_or(0)
        };

        let total_meetings = count("SELECT COUNT(*) FROM meetings");
        let total_chunks = count("SELECT COUNT(*) FROM chunks");
        let transcript_chunks = count("SELECT COUNT(*) FROM chunks WHERE chunk_type = 'transcript'");
        let chat_sessions = count("SELECT COUNT(*) FROM chat_sessions");
        let chat_chunks = count("SELECT COUNT(*) FROM chat_chunks");
        let kg_nodes = count("SELECT COUNT(*) FROM kg_nodes");
        let kg_edges = count("SELECT COUNT(*) FROM kg_edges");

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
            transcript_chunks,
            chat_sessions,
            chat_chunks,
            kg_nodes,
            kg_edges,
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
        // Delete all vector + graph data
        conn.execute_batch(
            "DELETE FROM vec_chunks;
             DELETE FROM chunks;
             DELETE FROM meetings;
             INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');
             DELETE FROM kg_edges;
             DELETE FROM kg_nodes;
             DELETE FROM chat_vec_chunks;
             DELETE FROM chat_chunks;
             DELETE FROM chat_sessions;
             INSERT INTO chat_chunks_fts(chat_chunks_fts) VALUES('rebuild');",
        )
        .map_err(|e| format!("rebuild: {}", e))?;

        log::info!("[vectordb] Database rebuilt (all data cleared, including graph and chats)");
        Ok(())
    })
}

// ── Knowledge Graph Commands ──

#[tauri::command]
pub async fn graph_upsert(
    state: State<'_, VectorDbState>,
    meeting_id: String,
    nodes: Vec<graph::GraphNode>,
    edges: Vec<graph::GraphEdge>,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        graph::upsert_meeting_graph(conn, &meeting_id, &nodes, &edges)
    })
}

#[tauri::command]
pub async fn graph_traverse(
    state: State<'_, VectorDbState>,
    params: graph::TraversalParams,
) -> Result<Vec<graph::TraversalResult>, String> {
    with_conn(&state, |conn| graph::traverse(conn, &params))
}

#[tauri::command]
pub async fn graph_neighbors(
    state: State<'_, VectorDbState>,
    node_id: String,
    edge_types: Option<Vec<String>>,
    direction: Option<String>,
) -> Result<Vec<graph::TraversalResult>, String> {
    with_conn(&state, |conn| {
        graph::neighbors(
            conn,
            &node_id,
            edge_types.as_deref(),
            direction.as_deref().unwrap_or("both"),
        )
    })
}

#[tauri::command]
pub async fn graph_search(
    state: State<'_, VectorDbState>,
    params: graph::GraphSearchParams,
) -> Result<Vec<graph::GraphNode>, String> {
    with_conn(&state, |conn| graph::search_nodes(conn, &params))
}

#[tauri::command]
pub async fn graph_delete_meeting(
    state: State<'_, VectorDbState>,
    meeting_id: String,
) -> Result<(), String> {
    with_conn(&state, |conn| graph::delete_meeting_graph(conn, &meeting_id))
}

#[tauri::command]
pub async fn graph_stats(
    state: State<'_, VectorDbState>,
) -> Result<graph::GraphStats, String> {
    with_conn(&state, |conn| graph::stats(conn))
}

// ── Usage Tracking Commands ──

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

/// Insert a single usage record.
#[tauri::command]
pub async fn insert_usage(
    state: State<'_, VectorDbState>,
    record: UsageRecord,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        conn.execute(
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
        )
        .map_err(|e| format!("insert_usage: {}", e))?;
        Ok(())
    })
}

/// Return aggregated usage summary for a time range.
#[tauri::command]
pub async fn get_usage_summary(
    state: State<'_, VectorDbState>,
    since: Option<i64>,
) -> Result<UsageSummary, String> {
    with_conn(&state, |conn| {
        let since_ts = since.unwrap_or(0);

        // Totals
        let (total_cost, total_input, total_output, total_cache_read, total_calls): (f64, i64, i64, i64, i64) = conn
            .query_row(
                "SELECT COALESCE(SUM(estimated_cost), 0), COALESCE(SUM(input_tokens), 0),
                 COALESCE(SUM(output_tokens), 0), COALESCE(SUM(cache_read_tokens), 0), COUNT(*)
                 FROM usage_log WHERE timestamp >= ?1",
                [since_ts],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .map_err(|e| format!("usage totals: {}", e))?;

        // By provider + model
        let mut stmt = conn
            .prepare(
                "SELECT provider, model, COUNT(*), SUM(input_tokens), SUM(output_tokens),
                 SUM(cache_read_tokens), SUM(cache_write_tokens), SUM(reasoning_tokens),
                 SUM(estimated_cost)
                 FROM usage_log WHERE timestamp >= ?1
                 GROUP BY provider, model ORDER BY SUM(estimated_cost) DESC",
            )
            .map_err(|e| format!("prepare provider breakdown: {}", e))?;

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
            })
            .map_err(|e| format!("query provider breakdown: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        // By category
        let mut stmt2 = conn
            .prepare(
                "SELECT category, COUNT(*), SUM(input_tokens), SUM(output_tokens), SUM(estimated_cost)
                 FROM usage_log WHERE timestamp >= ?1
                 GROUP BY category ORDER BY SUM(estimated_cost) DESC",
            )
            .map_err(|e| format!("prepare category breakdown: {}", e))?;

        let by_category: Vec<CategoryBreakdown> = stmt2
            .query_map([since_ts], |row| {
                Ok(CategoryBreakdown {
                    category: row.get(0)?,
                    calls: row.get(1)?,
                    input_tokens: row.get(2)?,
                    output_tokens: row.get(3)?,
                    estimated_cost: row.get(4)?,
                })
            })
            .map_err(|e| format!("query category breakdown: {}", e))?
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
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ── Chat Indexing Commands ──

#[tauri::command]
pub async fn upsert_chat_session(
    state: State<'_, VectorDbState>,
    session: ChatSessionMeta,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        let now = now_millis();
        conn.execute(
            "INSERT INTO chat_sessions (id, title, last_message_at, message_count,
             indexed_at, updated_at, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                last_message_at = excluded.last_message_at,
                message_count = excluded.message_count,
                updated_at = ?5,
                content_hash = excluded.content_hash",
            rusqlite::params![
                session.id,
                session.title,
                session.last_message_at,
                session.message_count,
                now,
                session.content_hash,
            ],
        )
        .map_err(|e| format!("upsert_chat_session: {}", e))?;
        Ok(())
    })
}

/// Replace all chunks for a chat session atomically.
#[tauri::command]
pub async fn upsert_chat_chunks(
    state: State<'_, VectorDbState>,
    session_id: String,
    chunks: Vec<ChatChunkData>,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin transaction: {}", e))?;

        // Collect old chunk IDs before deletion (vec0 has no CASCADE support)
        let old_chunk_ids: Vec<i64> = {
            let mut stmt = tx
                .prepare("SELECT id FROM chat_chunks WHERE session_id = ?1")
                .map_err(|e| format!("select old chat chunks: {}", e))?;
            let ids: Vec<i64> = stmt
                .query_map([&session_id], |row| row.get(0))
                .map_err(|e| format!("query old chat chunks: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            ids
        };

        for chunk_id in &old_chunk_ids {
            tx.execute("DELETE FROM chat_vec_chunks WHERE chunk_id = ?1", [chunk_id])
                .map_err(|e| format!("delete chat vec: {}", e))?;
        }

        // DELETE triggers handle FTS5 cleanup
        tx.execute("DELETE FROM chat_chunks WHERE session_id = ?1", [&session_id])
            .map_err(|e| format!("delete chat chunks: {}", e))?;

        for chunk in &chunks {
            tx.execute(
                "INSERT INTO chat_chunks (session_id, chunk_index, chunk_text, chunk_type)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    session_id,
                    chunk.chunk_index,
                    chunk.chunk_text,
                    chunk.chunk_type,
                ],
            )
            .map_err(|e| format!("insert chat chunk: {}", e))?;

            let chunk_row_id = tx.last_insert_rowid();

            if let Some(embedding) = &chunk.embedding {
                let embedding_bytes: Vec<u8> = embedding
                    .iter()
                    .flat_map(|f| f.to_le_bytes())
                    .collect();

                tx.execute(
                    "INSERT INTO chat_vec_chunks (chunk_id, embedding) VALUES (?1, ?2)",
                    rusqlite::params![chunk_row_id, embedding_bytes],
                )
                .map_err(|e| format!("insert chat vec: {}", e))?;
            }
        }

        tx.commit()
            .map_err(|e| format!("commit upsert_chat_chunks: {}", e))?;
        log::info!(
            "[vectordb] Upserted {} chat chunks for session {}",
            chunks.len(),
            session_id
        );
        Ok(())
    })
}

/// Delete a chat session and all its chunks/vectors.
#[tauri::command]
pub async fn delete_chat_session(
    state: State<'_, VectorDbState>,
    session_id: String,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin transaction: {}", e))?;

        let chunk_ids: Vec<i64> = {
            let mut stmt = tx
                .prepare("SELECT id FROM chat_chunks WHERE session_id = ?1")
                .map_err(|e| format!("select chat chunks: {}", e))?;
            let ids: Vec<i64> = stmt
                .query_map([&session_id], |row| row.get(0))
                .map_err(|e| format!("query chat chunks: {}", e))?
                .filter_map(|r| r.ok())
                .collect();
            ids
        };

        for chunk_id in &chunk_ids {
            tx.execute("DELETE FROM chat_vec_chunks WHERE chunk_id = ?1", [chunk_id])
                .map_err(|e| format!("delete chat vec: {}", e))?;
        }

        tx.execute("DELETE FROM chat_chunks WHERE session_id = ?1", [&session_id])
            .map_err(|e| format!("delete chat chunks: {}", e))?;

        tx.execute("DELETE FROM chat_sessions WHERE id = ?1", [&session_id])
            .map_err(|e| format!("delete chat session: {}", e))?;

        tx.commit()
            .map_err(|e| format!("commit delete_chat_session: {}", e))?;
        log::info!(
            "[vectordb] Deleted chat session {} and {} chunks",
            session_id,
            chunk_ids.len()
        );
        Ok(())
    })
}

/// Returns true if the session is not indexed or the content hash has changed.
#[tauri::command]
pub async fn is_chat_session_stale(
    state: State<'_, VectorDbState>,
    session_id: String,
    content_hash: String,
) -> Result<bool, String> {
    with_conn(&state, |conn| {
        let existing: Option<String> = conn
            .query_row(
                "SELECT content_hash FROM chat_sessions WHERE id = ?1",
                [&session_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("is_chat_session_stale: {}", e))?;

        Ok(match existing {
            None => true,                           // never indexed → stale
            Some(stored) => stored != content_hash, // hash changed → stale
        })
    })
}

/// Hybrid search over chat chunks: KNN + FTS5, RRF-merged, grouped by session.
#[tauri::command]
pub async fn search_chats(
    state: State<'_, VectorDbState>,
    params: crate::search::ChatSearchParams,
) -> Result<Vec<ChatSearchHit>, String> {
    with_conn(&state, |conn| crate::search::chat_hybrid_search(conn, &params))
}

/// Spotlight search: tier-0 title LIKE + tier-1 FTS5 snippet() across meetings and chats.
/// Fast FTS5-only — no vector embeddings required.
#[tauri::command]
pub async fn spotlight_search(
    state: State<'_, VectorDbState>,
    params: crate::spotlight::SpotlightParams,
) -> Result<Vec<crate::spotlight::SpotlightHit>, String> {
    with_conn(&state, |conn| crate::spotlight::spotlight_search(conn, &params))
}
