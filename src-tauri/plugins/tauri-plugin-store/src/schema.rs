use rusqlite::Connection;

/// Current schema version. Bump this when adding migrations.
pub const SCHEMA_VERSION: u32 = 5;

/// Default embedding model and dimension.
pub const DEFAULT_MODEL: &str = "all-MiniLM-L6-v2";
pub const DEFAULT_DIM: u32 = 384;

/// Run all migrations up to SCHEMA_VERSION.
pub fn migrate(conn: &Connection) -> Result<(), String> {
    let current = get_schema_version(conn);

    if current == 0 {
        create_v1(conn)?;
    }

    if current < 2 {
        migrate_v2(conn)?;
    }

    if current < 3 {
        migrate_v3(conn)?;
    }

    if current < 4 {
        migrate_v4(conn)?;
    }

    if current < 5 {
        migrate_v5(conn)?;
    }

    Ok(())
}

fn get_schema_version(conn: &Connection) -> u32 {
    conn.query_row(
        "SELECT value FROM meta WHERE key = 'schema_version'",
        [],
        |row| {
            let v: String = row.get(0)?;
            Ok(v.parse::<u32>().unwrap_or(0))
        },
    )
    .unwrap_or(0)
}

fn create_v1(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- Metadata
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Meetings (lightweight index; source of truth is history.json)
        -- embedding_hash and extraction_hash are added by migrate_v5.
        CREATE TABLE IF NOT EXISTS meetings (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            timestamp    INTEGER NOT NULL,
            summary      TEXT,
            categories   TEXT,
            indexed_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL,
            content_hash TEXT NOT NULL DEFAULT ''
        );

        -- Chunks (one meeting → many chunks)
        CREATE TABLE IF NOT EXISTS chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            chunk_text  TEXT NOT NULL,
            chunk_type  TEXT NOT NULL DEFAULT 'transcript',
            start_pos   INTEGER,
            end_pos     INTEGER,
            UNIQUE(meeting_id, chunk_index)
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_meeting ON chunks(meeting_id);

        -- FTS5 for full-text search
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            chunk_text,
            content=chunks,
            content_rowid=id
        );

        -- Triggers to keep FTS5 in sync
        CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.id, old.chunk_text);
            INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;

        -- Knowledge graph nodes
        CREATE TABLE IF NOT EXISTS kg_nodes (
            id          TEXT PRIMARY KEY,
            type        TEXT NOT NULL,
            name        TEXT NOT NULL,
            name_lower  TEXT NOT NULL,
            properties  TEXT NOT NULL DEFAULT '{}',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_kg_nodes_type ON kg_nodes(type);
        CREATE INDEX IF NOT EXISTS idx_kg_nodes_name_lower ON kg_nodes(name_lower);

        -- Knowledge graph edges
        CREATE TABLE IF NOT EXISTS kg_edges (
            id          TEXT PRIMARY KEY,
            source_id   TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
            target_id   TEXT NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
            type        TEXT NOT NULL,
            properties  TEXT DEFAULT '{}',
            meeting_id  TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            UNIQUE(source_id, target_id, type, meeting_id)
        );
        CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_id, type);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_id, type);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_meeting ON kg_edges(meeting_id);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON kg_edges(type);

        -- Usage log (token tracking & billing)
        CREATE TABLE IF NOT EXISTS usage_log (
            id                 TEXT PRIMARY KEY,
            timestamp          INTEGER NOT NULL,
            category           TEXT NOT NULL,
            session_id         TEXT,
            provider           TEXT NOT NULL,
            model              TEXT NOT NULL,
            input_tokens       INTEGER NOT NULL DEFAULT 0,
            output_tokens      INTEGER NOT NULL DEFAULT 0,
            cache_read_tokens  INTEGER DEFAULT 0,
            cache_write_tokens INTEGER DEFAULT 0,
            reasoning_tokens   INTEGER DEFAULT 0,
            estimated_cost     REAL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_provider_model ON usage_log(provider, model);
        ",
    )
    .map_err(|e| format!("Failed to create base schema: {}", e))?;

    // Create sqlite-vec virtual table (must be separate — cannot be inside execute_batch
    // because vec0 is registered as an extension)
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
            chunk_id INTEGER PRIMARY KEY,
            embedding float[384]
        );",
    )
    .map_err(|e| format!("Failed to create vec_chunks: {}", e))?;

    // Insert metadata
    conn.execute_batch(&format!(
        "
        INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '{}');
        INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_model', '{}');
        INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_dim', '{}');
        ",
        SCHEMA_VERSION, DEFAULT_MODEL, DEFAULT_DIM,
    ))
    .map_err(|e| format!("Failed to insert meta: {}", e))?;

    log::info!(
        "[store] Created schema v{} (model={}, dim={})",
        SCHEMA_VERSION,
        DEFAULT_MODEL,
        DEFAULT_DIM,
    );
    Ok(())
}

/// v2: Add usage_log table for token tracking & billing.
/// Runs on existing v1 databases. The table also exists in create_v1 for fresh installs.
fn migrate_v2(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS usage_log (
            id                 TEXT PRIMARY KEY,
            timestamp          INTEGER NOT NULL,
            category           TEXT NOT NULL,
            session_id         TEXT,
            provider           TEXT NOT NULL,
            model              TEXT NOT NULL,
            input_tokens       INTEGER NOT NULL DEFAULT 0,
            output_tokens      INTEGER NOT NULL DEFAULT 0,
            cache_read_tokens  INTEGER DEFAULT 0,
            cache_write_tokens INTEGER DEFAULT 0,
            reasoning_tokens   INTEGER DEFAULT 0,
            estimated_cost     REAL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_provider_model ON usage_log(provider, model);

        UPDATE meta SET value = '2' WHERE key = 'schema_version';
        ",
    )
    .map_err(|e| format!("Failed to migrate to v2: {}", e))?;

    log::info!("[store] Migrated to schema v2 (added usage_log)");
    Ok(())
}

/// v3: Add chat indexing tables — chat_sessions, chat_chunks, FTS5, vec0.
/// Purely additive; does not touch existing meetings/chunks tables.
fn migrate_v3(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- Chat sessions (mirrors 'meetings' table)
        -- embedding_hash is added by migrate_v5.
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            last_message_at INTEGER NOT NULL,
            message_count   INTEGER NOT NULL DEFAULT 0,
            indexed_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL,
            content_hash    TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_chat_sessions_last_msg ON chat_sessions(last_message_at DESC);

        -- Chat chunks (mirrors 'chunks' table; FK to chat_sessions)
        CREATE TABLE IF NOT EXISTS chat_chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            chunk_text  TEXT NOT NULL,
            chunk_type  TEXT NOT NULL DEFAULT 'turn',
            UNIQUE(session_id, chunk_index)
        );
        CREATE INDEX IF NOT EXISTS idx_chat_chunks_session ON chat_chunks(session_id);

        -- FTS5 for full-text search on chat chunks.
        -- prefix='2 3': pre-builds posting lists for 2- and 3-char prefixes (search-as-you-type).
        CREATE VIRTUAL TABLE IF NOT EXISTS chat_chunks_fts USING fts5(
            chunk_text,
            content=chat_chunks,
            content_rowid=id,
            prefix='2 3'
        );

        -- Triggers to keep chat_chunks_fts in sync with chat_chunks.
        CREATE TRIGGER IF NOT EXISTS chat_chunks_ai AFTER INSERT ON chat_chunks BEGIN
            INSERT INTO chat_chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chat_chunks_ad AFTER DELETE ON chat_chunks BEGIN
            INSERT INTO chat_chunks_fts(chat_chunks_fts, rowid, chunk_text)
            VALUES('delete', old.id, old.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chat_chunks_bu BEFORE UPDATE ON chat_chunks BEGIN
            INSERT INTO chat_chunks_fts(chat_chunks_fts, rowid, chunk_text)
            VALUES('delete', old.id, old.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chat_chunks_au AFTER UPDATE ON chat_chunks BEGIN
            INSERT INTO chat_chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;

        UPDATE meta SET value = '3' WHERE key = 'schema_version';
        ",
    )
    .map_err(|e| format!("Failed to migrate to v3 (chat tables): {}", e))?;

    // chat_vec_chunks must be created outside execute_batch (vec0 extension)
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS chat_vec_chunks USING vec0(
            chunk_id INTEGER PRIMARY KEY,
            embedding float[384]
        );",
    )
    .map_err(|e| format!("Failed to create chat_vec_chunks: {}", e))?;

    log::info!("[store] Migrated to schema v3 (chat_sessions, chat_chunks, FTS5, vec0)");
    Ok(())
}

/// v4: Rebuild chunks_fts with prefix='2 3' for fast search-as-you-type.
/// FTS5 prefix indexes pre-build posting lists for 2- and 3-char prefixes,
/// turning O(range-scan) prefix queries into O(1) lookup. ~15% larger index.
///
/// chat_chunks_fts already has prefix='2 3' from v3; only meeting chunks_fts needs rebuilding.
/// Data is in the external content table (chunks) — no chunk data is lost.
fn migrate_v4(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- Drop old FTS5 sync triggers
        DROP TRIGGER IF EXISTS chunks_ai;
        DROP TRIGGER IF EXISTS chunks_ad;
        DROP TRIGGER IF EXISTS chunks_au;

        -- Drop old FTS5 table (data lives in external content 'chunks', not in the FTS table)
        DROP TABLE IF EXISTS chunks_fts;

        -- Recreate with prefix indexes for search-as-you-type
        CREATE VIRTUAL TABLE chunks_fts USING fts5(
            chunk_text,
            content=chunks,
            content_rowid=id,
            prefix='2 3'
        );

        -- Repopulate from external content table
        INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild');

        -- Recreate sync triggers with BEFORE UPDATE + AFTER UPDATE split to avoid index drift
        CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;
        CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text)
            VALUES('delete', old.id, old.chunk_text);
        END;
        CREATE TRIGGER chunks_bu BEFORE UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text)
            VALUES('delete', old.id, old.chunk_text);
        END;
        CREATE TRIGGER chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;

        UPDATE meta SET value = '4' WHERE key = 'schema_version';
        ",
    )
    .map_err(|e| format!("Failed to migrate to v4 (prefix indexes): {}", e))?;

    log::info!("[store] Migrated to schema v4 (chunks_fts prefix indexes + improved triggers)");
    Ok(())
}

/// v5: Add per-phase completion tracking columns.
///
/// Previously, `content_hash` was the sole staleness indicator — written by Phase 1
/// (FTS-only indexing), which prevented Phase 2 from adding embeddings or running
/// entity extraction. Now each concern tracks its own completion:
///
/// - `content_hash`: tracks chunk/FTS identity (unchanged)
/// - `embedding_hash`: content_hash at time embeddings were last computed
/// - `extraction_hash`: content_hash at time KG entities were last extracted
fn migrate_v5(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        ALTER TABLE meetings ADD COLUMN embedding_hash TEXT;
        ALTER TABLE meetings ADD COLUMN extraction_hash TEXT;
        ALTER TABLE chat_sessions ADD COLUMN embedding_hash TEXT;

        UPDATE meta SET value = '5' WHERE key = 'schema_version';
        ",
    )
    .map_err(|e| format!("Failed to migrate to v5 (phase tracking columns): {}", e))?;

    log::info!("[store] Migrated to schema v5 (embedding_hash, extraction_hash columns)");
    Ok(())
}
