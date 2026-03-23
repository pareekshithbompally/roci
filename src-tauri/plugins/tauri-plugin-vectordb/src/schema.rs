use rusqlite::Connection;

/// Current schema version. Bump this when adding migrations.
pub const SCHEMA_VERSION: u32 = 2;

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
        CREATE TABLE IF NOT EXISTS meetings (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            timestamp    INTEGER NOT NULL,
            summary      TEXT,
            categories   TEXT,
            indexed_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL,
            content_hash TEXT NOT NULL
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
        "[vectordb] Created schema v{} (model={}, dim={})",
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

    log::info!("[vectordb] Migrated to schema v2 (added usage_log)");
    Ok(())
}
