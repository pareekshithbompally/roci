use rusqlite::Connection;

/// Current schema version for the new kasset.db.
pub const SCHEMA_VERSION: u32 = 2;

/// Default embedding model and dimension.
pub const DEFAULT_MODEL: &str = "onnx-community/embeddinggemma-300m-ONNX";
pub const DEFAULT_DIM: u32 = 768;

/// Open an in-memory test database with the `sqlite_vec` extension loaded and
/// the schema migrated. Shared by every test module in this crate so the vec
/// extension is only registered once (a re-registration would panic).
#[cfg(test)]
pub(crate) fn register_vec_extension_once() {
    use std::sync::Once;
    static EXT_INIT: Once = Once::new();

    EXT_INIT.call_once(|| unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

#[cfg(test)]
pub(crate) fn open_migrated_test_db() -> Connection {
    register_vec_extension_once();

    let conn = Connection::open_in_memory().expect("open in-memory");
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .expect("set pragmas");
    migrate(&conn).expect("migrate");
    conn
}

/// Run all migrations up to SCHEMA_VERSION inside a single transaction.
pub fn migrate(conn: &Connection) -> Result<(), String> {
    let current = get_schema_version(conn);

    if current == 0 {
        let result = (|| -> Result<(), String> {
            let tx = conn
                .unchecked_transaction()
                .map_err(|e| format!("begin migration transaction: {}", e))?;
            create_baseline(&tx)?;
            set_schema_version(&tx, SCHEMA_VERSION)?;
            tx.commit()
                .map_err(|e| format!("commit migration v1: {}", e))?;
            Ok(())
        })();

        match result {
            Ok(()) => {
                log::info!(
                    "[store] Created baseline schema v{} (model={}, dim={})",
                    SCHEMA_VERSION,
                    DEFAULT_MODEL,
                    DEFAULT_DIM,
                );
            },
            Err(e) => {
                log::error!("[store] Migration failed: {}", e);
                return Err(e);
            }
        }
    }

    // v1 → v2: embedding model swap (MiniLM 384-dim → EmbeddingGemma 768-dim).
    // Old vectors are unusable, so drop the vec tables and recreate them at the
    // new dimension; NULL the embedding hashes so the normal Phase-2 indexing
    // re-embeds every meeting and chat with the new model on the next run.
    // FTS tables and chunk text are untouched.
    if current == 1 {
        let result = (|| -> Result<(), String> {
            let tx = conn
                .unchecked_transaction()
                .map_err(|e| format!("begin migration v2 transaction: {}", e))?;
            tx.execute_batch(&format!(
                "DROP TABLE IF EXISTS vec_chunks;
                 DROP TABLE IF EXISTS chat_vec_chunks;
                 CREATE VIRTUAL TABLE vec_chunks USING vec0(
                     chunk_id INTEGER PRIMARY KEY,
                     embedding float[{}]
                 );
                 CREATE VIRTUAL TABLE chat_vec_chunks USING vec0(
                     chunk_id INTEGER PRIMARY KEY,
                     embedding float[{}]
                 );
                 UPDATE meeting_index_state SET embedding_hash = NULL;
                 UPDATE chat_index_state SET embedding_hash = NULL;",
                DEFAULT_DIM, DEFAULT_DIM,
            ))
            .map_err(|e| format!("migrate v1→v2 vec tables: {}", e))?;
            set_schema_version(&tx, SCHEMA_VERSION)?;
            tx.commit()
                .map_err(|e| format!("commit migration v2: {}", e))?;
            Ok(())
        })();

        match result {
            Ok(()) => {
                log::info!(
                    "[store] Migrated schema v1→v2 (model={}, dim={})",
                    DEFAULT_MODEL,
                    DEFAULT_DIM,
                );
            }
            Err(e) => {
                log::error!("[store] Migration v1→v2 failed: {}", e);
                return Err(e);
            }
        }
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

fn set_schema_version(conn: &Connection, version: u32) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?1)",
        [version.to_string()],
    )
    .map_err(|e| format!("set schema_version: {}", e))?;
    Ok(())
}

/// Full baseline DDL — migration v1 of the new kasset.db.
/// Creates every table from spec §2.1–§2.5 in one transaction.
fn create_baseline(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        -- ── Metadata ──────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- ── 2.1 Meetings domain ──────────────────────────────────────────
        CREATE TABLE meetings (
            id                    TEXT PRIMARY KEY,
            title                 TEXT    NOT NULL,
            input_source          TEXT,
            pending_transcription INTEGER NOT NULL DEFAULT 0,
            calendar_event_id     TEXT,
            calendar_meta         TEXT,
            created_at            INTEGER NOT NULL,
            updated_at            INTEGER NOT NULL
        );
        CREATE INDEX idx_meetings_created_at ON meetings(created_at DESC);
        CREATE INDEX idx_meetings_calendar_event ON meetings(calendar_event_id) WHERE calendar_event_id IS NOT NULL;

        CREATE TABLE transcripts (
            meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
            text       TEXT    NOT NULL,
            language   TEXT,
            model      TEXT,
            segments   TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE summaries (
            meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
            overview   TEXT    NOT NULL DEFAULT '',
            data       TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE recordings (
            id               TEXT PRIMARY KEY,
            meeting_id       TEXT REFERENCES meetings(id) ON DELETE CASCADE,
            filename         TEXT    NOT NULL,
            duration_seconds REAL,
            input_source     TEXT,
            created_at       INTEGER NOT NULL
        );
        CREATE INDEX idx_recordings_meeting ON recordings(meeting_id);

        CREATE TABLE notes (
            id         TEXT PRIMARY KEY,
            meeting_id TEXT    NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            text       TEXT    NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_notes_meeting ON notes(meeting_id);

        CREATE TABLE todos (
            id         TEXT PRIMARY KEY,
            meeting_id TEXT    NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            text       TEXT    NOT NULL,
            owner      TEXT,
            due_date   TEXT,
            completed  INTEGER NOT NULL DEFAULT 0,
            source     TEXT    NOT NULL CHECK(source IN ('ai','user')),
            created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_todos_meeting ON todos(meeting_id);
        CREATE INDEX idx_todos_open ON todos(completed, due_date);

        CREATE TABLE reminders (
            todo_id         TEXT PRIMARY KEY REFERENCES todos(id) ON DELETE CASCADE,
            notification_id INTEGER NOT NULL,
            fire_at         INTEGER NOT NULL,
            status          TEXT    NOT NULL CHECK(status IN ('scheduled','fired','cancelled')),
            created_at      INTEGER NOT NULL
        );
        CREATE INDEX idx_reminders_due ON reminders(status, fire_at);

        -- ── 2.2 Chat domain ──────────────────────────────────────────────
        CREATE TABLE chats (
            id              TEXT PRIMARY KEY,
            title           TEXT    NOT NULL,
            meeting_id      TEXT REFERENCES meetings(id) ON DELETE SET NULL,
            created_at      INTEGER NOT NULL,
            last_message_at INTEGER NOT NULL
        );
        CREATE INDEX idx_chats_last_message ON chats(last_message_at DESC);
        CREATE INDEX idx_chats_meeting ON chats(meeting_id);

        CREATE TABLE chat_messages (
            id         TEXT PRIMARY KEY,
            chat_id    TEXT    NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            seq        INTEGER NOT NULL,
            role       TEXT    NOT NULL CHECK(role IN ('user','model')),
            text       TEXT    NOT NULL DEFAULT '',
            provider   TEXT,
            model      TEXT,
            data       TEXT,
            created_at INTEGER NOT NULL,
            UNIQUE(chat_id, seq)
        );
        CREATE INDEX idx_chat_messages_chat_time ON chat_messages(chat_id, created_at, id);

        -- ── 2.3 Config ───────────────────────────────────────────────────
        CREATE TABLE settings (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE providers (
            provider          TEXT PRIMARY KEY,
            active            INTEGER NOT NULL DEFAULT 0,
            api_key_encrypted TEXT,
            base_url          TEXT,
            data              TEXT,
            updated_at        INTEGER NOT NULL
        );

        CREATE TABLE categories (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE meeting_categories (
            meeting_id  TEXT NOT NULL REFERENCES meetings(id)    ON DELETE CASCADE,
            category_id TEXT NOT NULL REFERENCES categories(id)  ON DELETE CASCADE,
            PRIMARY KEY(meeting_id, category_id)
        );
        CREATE INDEX idx_meeting_categories_category ON meeting_categories(category_id);

        -- ── 2.4 Derived — search, vectors, knowledge graph, usage ────────
        CREATE TABLE meeting_index_state (
            meeting_id      TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
            content_hash    TEXT,
            embedding_hash  TEXT,
            extraction_hash TEXT,
            indexed_at      INTEGER
        );

        CREATE TABLE chat_index_state (
            chat_id        TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
            content_hash   TEXT,
            embedding_hash TEXT,
            indexed_at     INTEGER
        );

        CREATE TABLE chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id  TEXT    NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            chunk_text  TEXT    NOT NULL,
            chunk_type  TEXT    NOT NULL DEFAULT 'transcript',
            start_pos   INTEGER,
            end_pos     INTEGER,
            UNIQUE(meeting_id, chunk_index)
        );
        CREATE INDEX idx_chunks_meeting ON chunks(meeting_id);

        CREATE TABLE chat_chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id     TEXT    NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            chunk_text  TEXT    NOT NULL,
            chunk_type  TEXT    NOT NULL DEFAULT 'turn',
            UNIQUE(chat_id, chunk_index)
        );
        CREATE INDEX idx_chat_chunks_chat ON chat_chunks(chat_id);
        ",
    )
    .map_err(|e| format!("create baseline tables: {}", e))?;

    // FTS5 virtual tables (must be separate from execute_batch with the rebuild step)
    conn.execute_batch(
        "
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            chunk_text,
            content=chunks,
            content_rowid=id,
            prefix='2 3'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS chat_chunks_fts USING fts5(
            chunk_text,
            content=chat_chunks,
            content_rowid=id,
            prefix='2 3'
        );
        ",
    )
    .map_err(|e| format!("create FTS5 virtual tables: {}", e))?;

    // FTS5 sync triggers
    conn.execute_batch(
        "
        -- chunks ↔ chunks_fts
        CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text)
            VALUES('delete', old.id, old.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chunks_bu BEFORE UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text)
            VALUES('delete', old.id, old.chunk_text);
        END;
        CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
        END;

        -- chat_chunks ↔ chat_chunks_fts
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
        ",
    )
    .map_err(|e| format!("create FTS5 triggers: {}", e))?;

    // Knowledge graph
    conn.execute_batch(
        "
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

        CREATE TABLE IF NOT EXISTS kg_edges (
            id          TEXT PRIMARY KEY,
            source_id   TEXT    NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
            target_id   TEXT    NOT NULL REFERENCES kg_nodes(id) ON DELETE CASCADE,
            type        TEXT    NOT NULL,
            properties  TEXT    DEFAULT '{}',
            meeting_id  TEXT    NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
            created_at  INTEGER NOT NULL,
            UNIQUE(source_id, target_id, type, meeting_id)
        );
        CREATE INDEX IF NOT EXISTS idx_kg_edges_source ON kg_edges(source_id, type);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_target ON kg_edges(target_id, type);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_meeting ON kg_edges(meeting_id);
        CREATE INDEX IF NOT EXISTS idx_kg_edges_type ON kg_edges(type);
        ",
    )
    .map_err(|e| format!("create knowledge graph tables: {}", e))?;

    // Usage log
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
        ",
    )
    .map_err(|e| format!("create usage_log: {}", e))?;

    // sqlite-vec virtual tables (must be separate — vec0 uses its own extension)
    conn.execute_batch(&format!(
        "CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
            chunk_id INTEGER PRIMARY KEY,
            embedding float[{}]
        );",
        DEFAULT_DIM,
    ))
    .map_err(|e| format!("create vec_chunks: {}", e))?;

    conn.execute_batch(&format!(
        "CREATE VIRTUAL TABLE IF NOT EXISTS chat_vec_chunks USING vec0(
            chunk_id INTEGER PRIMARY KEY,
            embedding float[{}]
        );",
        DEFAULT_DIM,
    ))
    .map_err(|e| format!("create chat_vec_chunks: {}", e))?;

    // Audit trail (§2.5)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS audit_log (
            id          TEXT PRIMARY KEY,
            entity_type TEXT    NOT NULL,
            entity_id   TEXT    NOT NULL,
            operation   TEXT    NOT NULL CHECK(operation IN ('create','update','delete')),
            actor       TEXT    NOT NULL DEFAULT 'app' CHECK(actor IN ('app','mcp','system')),
            data        TEXT,
            created_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
        ",
    )
    .map_err(|e| format!("create audit_log: {}", e))?;

    // Insert metadata
    conn.execute_batch(&format!(
        "
        INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_model', '{}');
        INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_dim', '{}');
        ",
        DEFAULT_MODEL, DEFAULT_DIM,
    ))
    .map_err(|e| format!("insert meta: {}", e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{Connection, params};

    fn open_test_db() -> Connection {
        super::register_vec_extension_once();

        let conn = Connection::open_in_memory().expect("open in-memory");
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .expect("set pragmas");

        conn
    }

    fn init_db(conn: &Connection) {
        migrate(conn).expect("migrate");
    }

    #[test]
    fn schema_creates_all_tables() {
        let conn = open_test_db();
        init_db(&conn);

        let expected_tables = vec![
            "meta",
            "meetings",
            "transcripts",
            "summaries",
            "recordings",
            "notes",
            "todos",
            "reminders",
            "chats",
            "chat_messages",
            "settings",
            "providers",
            "categories",
            "meeting_categories",
            "meeting_index_state",
            "chat_index_state",
            "chunks",
            "chat_chunks",
            "chunks_fts",
            "chat_chunks_fts",
            "vec_chunks",
            "chat_vec_chunks",
            "kg_nodes",
            "kg_edges",
            "usage_log",
            "audit_log",
        ];

        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .expect("prepare");

        let existing: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .expect("query")
            .filter_map(|r| r.ok())
            .collect();

        for table in &expected_tables {
            assert!(
                existing.contains(&table.to_string()),
                "missing table: {}",
                table
            );
        }

        // Verify meta entries
        let sv: String = conn
            .query_row(
                "SELECT value FROM meta WHERE key='schema_version'",
                [],
                |row| row.get(0),
            )
            .expect("schema_version");
        assert_eq!(sv, SCHEMA_VERSION.to_string());

        let model: String = conn
            .query_row(
                "SELECT value FROM meta WHERE key='embedding_model'",
                [],
                |row| row.get(0),
            )
            .expect("embedding_model");
        assert_eq!(model, DEFAULT_MODEL);
    }

    #[test]
    fn foreign_keys_cascade_on_meeting_delete() {
        let conn = open_test_db();
        init_db(&conn);

        let now = now_test_millis();

        // Insert meeting
        conn.execute(
            "INSERT INTO meetings (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params!["m1", "Test Meeting", now, now],
        )
        .expect("insert meeting");

        // Insert children
        conn.execute(
            "INSERT INTO transcripts (meeting_id, text, created_at) VALUES (?1, ?2, ?3)",
            params!["m1", "Hello world", now],
        )
        .expect("insert transcript");
        conn.execute(
            "INSERT INTO summaries (meeting_id, overview, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["m1", "", "{}", now, now],
        )
        .expect("insert summary");
        conn.execute(
            "INSERT INTO notes (id, meeting_id, text, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["n1", "m1", "a note", now, now],
        )
        .expect("insert note");
        conn.execute(
            "INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["t1", "m1", "do thing", "ai", now],
        )
        .expect("insert todo");
        conn.execute(
            "INSERT INTO chunks (meeting_id, chunk_index, chunk_text) VALUES (?1, ?2, ?3)",
            params!["m1", 0, "chunk text"],
        )
        .expect("insert chunk");
        conn.execute(
            "INSERT INTO recordings (id, meeting_id, filename, created_at) VALUES (?1, ?2, ?3, ?4)",
            params!["r1", "m1", "test.wav", now],
        )
        .expect("insert recording");

        // Insert category + meeting_category
        conn.execute(
            "INSERT INTO categories (id, name, created_at) VALUES (?1, ?2, ?3)",
            params!["cat1", "Design", now],
        )
        .expect("insert category");
        conn.execute(
            "INSERT INTO meeting_categories (meeting_id, category_id) VALUES (?1, ?2)",
            params!["m1", "cat1"],
        )
        .expect("insert meeting_category");

        // Insert chat linked to meeting
        conn.execute(
            "INSERT INTO chats (id, title, meeting_id, created_at, last_message_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["c1", "Chat 1", "m1", now, now],
        )
        .expect("insert chat");

        // Insert kg_nodes + kg_edges
        conn.execute(
            "INSERT INTO kg_nodes (id, type, name, name_lower, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["kn1", "person", "Alice", "alice", now, now],
        )
        .expect("insert kg_node");
        conn.execute(
            "INSERT INTO kg_nodes (id, type, name, name_lower, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["kn2", "meeting", "Test Meeting", "test meeting", now, now],
        )
        .expect("insert kg_node");
        conn.execute(
            "INSERT INTO kg_edges (id, source_id, target_id, type, meeting_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["ke1", "kn1", "kn2", "attended", "m1", now],
        )
        .expect("insert kg_edge");

        // Insert index_state
        conn.execute(
            "INSERT INTO meeting_index_state (meeting_id, content_hash, indexed_at) VALUES (?1, ?2, ?3)",
            params!["m1", "hash123", now],
        )
        .expect("insert meeting_index_state");

        // Delete meeting — should cascade
        conn.execute("DELETE FROM meetings WHERE id = ?1", params!["m1"])
            .expect("delete meeting");

        // Assert cascaded deletions
        let transcript_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM transcripts WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(transcript_count, 0, "transcript should cascade-delete");

        let summary_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM summaries WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(summary_count, 0, "summary should cascade-delete");

        let notes_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(notes_count, 0, "notes should cascade-delete");

        let todos_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM todos WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(todos_count, 0, "todos should cascade-delete");

        let chunks_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chunks WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(chunks_count, 0, "chunks should cascade-delete");

        let recordings_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM recordings WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(recordings_count, 0, "recordings should cascade-delete");

        let mc_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM meeting_categories WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(mc_count, 0, "meeting_categories should cascade-delete");

        let index_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM meeting_index_state WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(index_count, 0, "meeting_index_state should cascade-delete");

        let kg_edges_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM kg_edges WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(kg_edges_count, 0, "kg_edges should cascade-delete");

        // Chat should survive but meeting_id set to NULL
        let chat_meeting_id: Option<String> = conn
            .query_row("SELECT meeting_id FROM chats WHERE id = ?1", params!["c1"], |r| r.get(0))
            .unwrap();
        assert_eq!(chat_meeting_id, None, "chat meeting_id should be SET NULL");

        // Category should survive
        let cat_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM categories WHERE id = ?1", params!["cat1"], |r| r.get(0))
            .unwrap();
        assert_eq!(cat_count, 1, "category should survive");
    }

    #[test]
    fn check_constraints_reject_invalid_enum_values() {
        let conn = open_test_db();
        init_db(&conn);
        let now = now_test_millis();

        // Insert meeting (required for FK)
        conn.execute(
            "INSERT INTO meetings (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params!["m1", "Test", now, now],
        )
        .expect("insert meeting");

        // todos.source CHECK
        let err = conn.execute(
            "INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["t1", "m1", "do", "invalid_source", now],
        );
        assert!(err.is_err(), "todos.source should reject invalid value");

        // reminders.status CHECK
        conn.execute(
            "INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["t2", "m1", "do", "ai", now],
        )
        .expect("insert todo for reminder test");
        let err = conn.execute(
            "INSERT INTO reminders (todo_id, notification_id, fire_at, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["t2", 1, now, "invalid_status", now],
        );
        assert!(err.is_err(), "reminders.status should reject invalid value");

        // chat_messages.role CHECK
        conn.execute(
            "INSERT INTO chats (id, title, created_at, last_message_at) VALUES (?1, ?2, ?3, ?4)",
            params!["c1", "Chat", now, now],
        )
        .expect("insert chat");
        let err = conn.execute(
            "INSERT INTO chat_messages (id, chat_id, seq, role, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["msg1", "c1", 0, "bot", "hi", now],
        );
        assert!(err.is_err(), "chat_messages.role should reject 'bot'");

        // audit_log.operation CHECK
        let err = conn.execute(
            "INSERT INTO audit_log (id, entity_type, entity_id, operation, actor, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["a1", "meeting", "m1", "remove", "app", now],
        );
        assert!(err.is_err(), "audit_log.operation should reject 'remove'");

        // audit_log.actor CHECK
        let err = conn.execute(
            "INSERT INTO audit_log (id, entity_type, entity_id, operation, actor, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["a2", "meeting", "m1", "create", "user", now],
        );
        assert!(err.is_err(), "audit_log.actor should reject 'user'");

        // 'upsert' is NOT a valid operation — commands must map to create/update/delete.
        // (Regression guard: reminders_upsert previously wrote 'upsert' and rolled back every save.)
        let err = conn.execute(
            "INSERT INTO audit_log (id, entity_type, entity_id, operation, actor, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["a3", "reminder", "t1", "upsert", "app", now],
        );
        assert!(err.is_err(), "audit_log.operation should reject 'upsert'");
    }

    /// Regression guard: recording chat RAG staleness (the mark_chat_indexed path) writes ONLY
    /// chat_index_state and must never mutate the canonical `chats` row (title/last_message_at).
    #[test]
    fn chat_index_state_write_does_not_touch_chat_row() {
        let conn = open_test_db();
        init_db(&conn);
        let now = now_test_millis();

        conn.execute(
            "INSERT INTO chats (id, title, created_at, last_message_at) VALUES (?1, ?2, ?3, ?4)",
            params!["c1", "Original Title", now, now],
        )
        .expect("insert chat");

        // Mirror exactly what mark_chat_indexed does — only chat_index_state.
        conn.execute(
            "INSERT INTO chat_index_state (chat_id, content_hash, indexed_at)
             VALUES (?1, COALESCE(?2, ''), ?3)
             ON CONFLICT(chat_id) DO UPDATE SET content_hash = ?2, indexed_at = ?3",
            params!["c1", "hash-abc", now + 1000],
        )
        .expect("upsert chat_index_state");

        let title: String = conn
            .query_row("SELECT title FROM chats WHERE id = ?1", params!["c1"], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "Original Title", "canonical chat title must be untouched by indexing");

        let hash: String = conn
            .query_row("SELECT content_hash FROM chat_index_state WHERE chat_id = ?1", params!["c1"], |r| r.get(0))
            .unwrap();
        assert_eq!(hash, "hash-abc", "chat_index_state should hold the content hash");
    }

    #[test]
    fn unique_constraint_rejects_duplicate_chat_message_seq() {
        let conn = open_test_db();
        init_db(&conn);
        let now = now_test_millis();

        conn.execute(
            "INSERT INTO chats (id, title, created_at, last_message_at) VALUES (?1, ?2, ?3, ?4)",
            params!["c1", "Chat", now, now],
        )
        .expect("insert chat");

        conn.execute(
            "INSERT INTO chat_messages (id, chat_id, seq, role, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["msg1", "c1", 0, "user", "first", now],
        )
        .expect("insert first message");

        let err = conn.execute(
            "INSERT INTO chat_messages (id, chat_id, seq, role, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["msg2", "c1", 0, "model", "dupe", now],
        );
        assert!(err.is_err(), "UNIQUE(chat_id, seq) should reject duplicate");
    }

    #[test]
    fn foreign_key_rejects_invalid_parent() {
        let conn = open_test_db();
        init_db(&conn);
        let now = now_test_millis();

        let err = conn.execute(
            "INSERT INTO transcripts (meeting_id, text, created_at) VALUES (?1, ?2, ?3)",
            params!["nonexistent", "text", now],
        );
        assert!(err.is_err(), "should reject transcript with nonexistent meeting_id");

        let err = conn.execute(
            "INSERT INTO chunks (meeting_id, chunk_index, chunk_text) VALUES (?1, ?2, ?3)",
            params!["nonexistent", 0, "text"],
        );
        assert!(err.is_err(), "should reject chunk with nonexistent meeting_id");
    }

    #[test]
    fn migration_is_transactional_no_partial_apply() {
        let conn = open_test_db();

        // Table doesn't exist yet because migrate() hasn't run
        let has_meta: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='meta'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);
        assert!(!has_meta, "meta table should not exist before migration");

        migrate(&conn).expect("migrate");

        // After migration, schema_version is current
        let sv: String = conn
            .query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| r.get(0))
            .expect("schema_version");
        assert_eq!(sv, SCHEMA_VERSION.to_string());

        // Running migrate again is idempotent
        migrate(&conn).expect("migrate again");
        let sv2: String = conn
            .query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| r.get(0))
            .expect("schema_version");
        assert_eq!(sv2, SCHEMA_VERSION.to_string());
    }

    fn now_test_millis() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }

    /// v1-shaped DB (MiniLM 384-dim vectors + stamped embedding hashes)
    /// must migrate to v2: vec tables recreated at the new dimension with
    /// old vectors gone, embedding hashes nulled so Phase-2 re-embeds.
    #[test]
    fn migrate_v1_to_v2_swaps_embedding_model() {
        let conn = open_test_db();
        conn.execute_batch(
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO meta (key, value) VALUES ('schema_version', '1');
             CREATE VIRTUAL TABLE vec_chunks USING vec0(
                 chunk_id INTEGER PRIMARY KEY, embedding float[384]);
             CREATE VIRTUAL TABLE chat_vec_chunks USING vec0(
                 chunk_id INTEGER PRIMARY KEY, embedding float[384]);
             CREATE TABLE meeting_index_state (
                 meeting_id TEXT PRIMARY KEY, content_hash TEXT,
                 embedding_hash TEXT, extraction_hash TEXT, indexed_at INTEGER);
             INSERT INTO meeting_index_state VALUES ('m1', 'abc', 'abc', NULL, 1);
             CREATE TABLE chat_index_state (
                 chat_id TEXT PRIMARY KEY, content_hash TEXT,
                 embedding_hash TEXT, indexed_at INTEGER);
             INSERT INTO chat_index_state VALUES ('c1', 'def', 'def', 1);",
        )
        .expect("seed v1 db");

        // One stale 384-dim vector, stored the way the app binds them.
        let stale: Vec<u8> = (0..384u32)
            .flat_map(|i| (i as f32).to_le_bytes())
            .collect();
        conn.execute(
            "INSERT INTO vec_chunks (chunk_id, embedding) VALUES (1, ?1)",
            params![stale],
        )
        .expect("seed stale vector");

        migrate(&conn).expect("migrate v1→v2");

        let sv: String = conn
            .query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| r.get(0))
            .expect("schema_version");
        assert_eq!(sv, "2");

        for table in ["vec_chunks", "chat_vec_chunks"] {
            let sql: String = conn
                .query_row(
                    "SELECT sql FROM sqlite_master WHERE name = ?1",
                    params![table],
                    |r| r.get(0),
                )
                .expect("vec table sql");
            assert!(
                sql.contains("float[768]"),
                "{table} not recreated at new dim: {sql}"
            );
        }

        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM vec_chunks", [], |r| r.get(0))
            .expect("vec row count");
        assert_eq!(remaining, 0, "stale vectors must be gone");

        let m_hash: Option<String> = conn
            .query_row(
                "SELECT embedding_hash FROM meeting_index_state WHERE meeting_id = 'm1'",
                [],
                |r| r.get(0),
            )
            .expect("meeting hash");
        assert_eq!(m_hash, None);
        let c_hash: Option<String> = conn
            .query_row(
                "SELECT embedding_hash FROM chat_index_state WHERE chat_id = 'c1'",
                [],
                |r| r.get(0),
            )
            .expect("chat hash");
        assert_eq!(c_hash, None);
    }
}
