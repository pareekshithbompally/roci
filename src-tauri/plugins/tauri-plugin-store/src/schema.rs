use rusqlite::Connection;

/// Current schema version for the new roci.db.
pub const SCHEMA_VERSION: u32 = 6;

/// Default embedding model and dimension.
pub const DEFAULT_MODEL: &str = "mlx-community/Qwen3-Embedding-0.6B-8bit";
pub const DEFAULT_DIM: u32 = 1024;

/// Registers `sqlite_vec` once for all test modules; a second registration would panic.
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

    // v2 → v3: the built-in knowledge graph is gone; drop its tables and extraction state.
    if current == 2 {
        let result = (|| -> Result<(), String> {
            let tx = conn
                .unchecked_transaction()
                .map_err(|e| format!("begin migration v3 transaction: {}", e))?;
            tx.execute_batch(
                "DROP TABLE IF EXISTS kg_edges;
                 DROP TABLE IF EXISTS kg_nodes;
                 ALTER TABLE meeting_index_state DROP COLUMN extraction_hash;",
            )
            .map_err(|e| format!("migrate v2→v3 drop graph: {}", e))?;
            set_schema_version(&tx, 3)?;
            tx.commit()
                .map_err(|e| format!("commit migration v3: {}", e))?;
            Ok(())
        })();

        match result {
            Ok(()) => log::info!("[store] Migrated schema v2→v3 (knowledge graph removed)"),
            Err(e) => {
                log::error!("[store] Migration v2→v3 failed: {}", e);
                return Err(e);
            }
        }
    }

    if current == 2 || current == 3 {
        migrate_v4(conn)?;
    }
    if (2..=4).contains(&current) {
        migrate_v5(conn)?;
    }
    if (2..=5).contains(&current) {
        migrate_v6(conn)?;
    }

    match_embedding_model(conn)
}

/// Vectors from another embedding model can't be searched with this one's: the vector tables are rebuilt at this
/// model's size (chunks and full-text stay) and every meeting and chat is marked for embedding again.
fn match_embedding_model(conn: &Connection) -> Result<(), String> {
    let stored: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key = 'embedding_model'", [], |row| row.get(0))
        .ok();
    if stored.as_deref() == Some(DEFAULT_MODEL) {
        return Ok(());
    }
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin embedding model change: {}", e))?;
    // No model recorded: no vectors were ever written to drop.
    if stored.is_some() {
        tx.execute_batch(&format!(
            "DROP TABLE IF EXISTS vec_chunks;
             DROP TABLE IF EXISTS chat_vec_chunks;
             CREATE VIRTUAL TABLE vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{DEFAULT_DIM}]);
             CREATE VIRTUAL TABLE chat_vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{DEFAULT_DIM}]);
             UPDATE meeting_index_state SET embedding_hash = NULL;
             UPDATE chat_index_state SET embedding_hash = NULL;"
        ))
        .map_err(|e| format!("drop old embeddings: {}", e))?;
    }
    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_model', ?1), ('embedding_dim', ?2)",
        [DEFAULT_MODEL.to_string(), DEFAULT_DIM.to_string()],
    )
    .map_err(|e| format!("set embedding model: {}", e))?;
    tx.commit().map_err(|e| format!("commit embedding model change: {}", e))?;
    log::info!("[store] Embedding model is now {} (old vectors dropped)", DEFAULT_MODEL);
    Ok(())
}

/// Dictations made in the app, newest first: part of a new database, and added to an older one by `migrate_v6`.
const DICTATIONS_DDL: &str = "
    CREATE TABLE IF NOT EXISTS dictations (
        id          TEXT PRIMARY KEY,
        text        TEXT    NOT NULL,
        created_at  INTEGER NOT NULL,
        duration_ms INTEGER,
        model       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_dictations_created ON dictations(created_at DESC);";

/// v5 → v6: dictations made in the app are kept.
fn migrate_v6(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin migration v6 transaction: {}", e))?;
    tx.execute_batch(DICTATIONS_DDL).map_err(|e| format!("migrate v5→v6 dictations: {}", e))?;
    set_schema_version(&tx, 6)?;
    tx.commit().map_err(|e| format!("commit migration v6: {}", e))?;
    log::info!("[store] Migrated schema v5→v6 (dictations)");
    Ok(())
}

/// v4 → v5: a to-do may stand on its own (no meeting), so `todos.meeting_id` becomes optional. SQLite can't relax a
/// column in place: the table is rebuilt with its rows and indexes (SQLite's documented rebuild), with foreign keys
/// off meanwhile so dropping the old table can't cascade to reminders, and checked before commit.
fn migrate_v5(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys=OFF;").map_err(|e| format!("migration v5 foreign keys off: {}", e))?;
    let result = (|| -> Result<(), String> {
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("begin migration v5 transaction: {}", e))?;
        tx.execute_batch(
            "CREATE TABLE todos_v5 (
                 id         TEXT PRIMARY KEY,
                 meeting_id TEXT    REFERENCES meetings(id) ON DELETE CASCADE,
                 text       TEXT    NOT NULL,
                 owner      TEXT,
                 due_date   TEXT,
                 completed  INTEGER NOT NULL DEFAULT 0,
                 source     TEXT    NOT NULL CHECK(source IN ('ai','user')),
                 created_at INTEGER NOT NULL
             );
             INSERT INTO todos_v5 (id, meeting_id, text, owner, due_date, completed, source, created_at)
                 SELECT id, NULLIF(meeting_id, '_general'), text, owner, due_date, completed, source, created_at FROM todos;
             DROP TABLE todos;
             ALTER TABLE todos_v5 RENAME TO todos;
             CREATE INDEX idx_todos_meeting ON todos(meeting_id);
             CREATE INDEX idx_todos_open ON todos(completed, due_date);",
        )
        .map_err(|e| format!("migrate v4→v5 rebuild todos: {}", e))?;
        let broken: i64 = tx
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| row.get(0))
            .map_err(|e| format!("migrate v4→v5 check: {}", e))?;
        if broken > 0 {
            return Err(format!("migrate v4→v5: {broken} rows would point at nothing"));
        }
        set_schema_version(&tx, 5)?;
        tx.commit().map_err(|e| format!("commit migration v5: {}", e))
    })();
    conn.execute_batch("PRAGMA foreign_keys=ON;").map_err(|e| format!("migration v5 foreign keys on: {}", e))?;
    match &result {
        Ok(()) => log::info!("[store] Migrated schema v4→v5 (to-dos may stand without a meeting)"),
        Err(e) => log::error!("[store] Migration v4→v5 failed: {}", e),
    }
    result
}

/// v3 → v4: a meeting's pipeline status replaces the pending-transcription flag, and pending
/// recordings saved without their file get it linked (their id is the file's stem).
fn migrate_v4(conn: &Connection) -> Result<(), String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin migration v4 transaction: {}", e))?;
    tx.execute_batch(
        "ALTER TABLE meetings ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN (
             'recording','captured','transcribing','transcribed','summarizing','ready','failed'));
         ALTER TABLE meetings ADD COLUMN failed_step TEXT CHECK(failed_step IN ('record','transcribe','summarize'));
         ALTER TABLE meetings ADD COLUMN error TEXT;
         UPDATE meetings SET status = 'captured' WHERE pending_transcription = 1;
         INSERT INTO recordings (id, meeting_id, filename, created_at)
             SELECT lower(hex(randomblob(16))), m.id, m.id || '.wav', m.created_at
             FROM meetings m
             WHERE m.status = 'captured' AND substr(m.id, 1, 4) = 'rec_'
               AND NOT EXISTS (SELECT 1 FROM recordings r WHERE r.meeting_id = m.id);
         ALTER TABLE meetings DROP COLUMN pending_transcription;",
    )
    .map_err(|e| format!("migrate v3→v4 meeting status: {}", e))?;
    set_schema_version(&tx, SCHEMA_VERSION)?;
    tx.commit().map_err(|e| format!("commit migration v4: {}", e))?;
    log::info!("[store] Migrated schema v3→v4 (meeting status)");
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

/// Baseline DDL (migration v1): creates every table in one transaction.
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
            status                TEXT    NOT NULL DEFAULT 'ready' CHECK(status IN (
                                      'recording','captured','transcribing','transcribed',
                                      'summarizing','ready','failed')),
            failed_step           TEXT CHECK(failed_step IN ('record','transcribe','summarize')),
            error                 TEXT,
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
            meeting_id TEXT    REFERENCES meetings(id) ON DELETE CASCADE,
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

        -- ── 2.4 Derived — search, vectors, usage ─────────────────────────
        CREATE TABLE meeting_index_state (
            meeting_id      TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
            content_hash    TEXT,
            embedding_hash  TEXT,
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
    conn.execute_batch(DICTATIONS_DDL).map_err(|e| format!("create dictations table: {}", e))?;

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
            "dictations",
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

        // 'upsert' is not a valid operation; commands must map to create/update/delete.
        let err = conn.execute(
            "INSERT INTO audit_log (id, entity_type, entity_id, operation, actor, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["a3", "reminder", "t1", "upsert", "app", now],
        );
        assert!(err.is_err(), "audit_log.operation should reject 'upsert'");
    }

    /// Marking a chat indexed writes only `chat_index_state`, never the `chats` row.
    #[test]
    fn migrate_v6_adds_dictations_to_a_v5_database() {
        let conn = open_test_db();
        init_db(&conn);
        conn.execute_batch("DROP TABLE dictations;").expect("drop to v5 shape");
        set_schema_version(&conn, 5).expect("mark v5");

        migrate(&conn).expect("migrate v5→v6");

        assert_eq!(get_schema_version(&conn), 6);
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM dictations", [], |r| r.get(0)).expect("dictations exists");
        assert_eq!(count, 0);
    }

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

    #[test]
    fn migrate_v4_to_v5_lets_a_todo_stand_alone_and_keeps_rows() {
        let conn = open_test_db();
        init_db(&conn);
        // The v4 shape: every to-do had to belong to a meeting.
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
             DROP TABLE todos;
             CREATE TABLE todos (
                 id TEXT PRIMARY KEY,
                 meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                 text TEXT NOT NULL, owner TEXT, due_date TEXT,
                 completed INTEGER NOT NULL DEFAULT 0,
                 source TEXT NOT NULL CHECK(source IN ('ai','user')),
                 created_at INTEGER NOT NULL);
             PRAGMA foreign_keys=ON;
             INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m1', 'Standup', 1, 1);
             INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES ('t1', 'm1', 'Ship it', 'user', 1);
             INSERT INTO reminders (todo_id, notification_id, fire_at, status, created_at) VALUES ('t1', 7, 9, 'scheduled', 1);",
        )
        .expect("v4 shape");
        set_schema_version(&conn, 4).expect("set v4");

        migrate(&conn).expect("migrate v4→v5");

        assert_eq!(get_schema_version(&conn), SCHEMA_VERSION);
        let meeting: String = conn.query_row("SELECT meeting_id FROM todos WHERE id = 't1'", [], |r| r.get(0)).unwrap();
        assert_eq!(meeting, "m1");
        let reminders: i64 = conn.query_row("SELECT COUNT(*) FROM reminders WHERE todo_id = 't1'", [], |r| r.get(0)).unwrap();
        assert_eq!(reminders, 1, "reminders survive the rebuild");
        conn.execute("INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES ('t2', NULL, 'Book flight', 'user', 2)", [])
            .expect("a to-do without a meeting");
        let enforced: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        assert_eq!(enforced, 1, "foreign keys are back on");
        let err = conn.execute("INSERT INTO todos (id, meeting_id, text, source, created_at) VALUES ('t3', 'nope', 'x', 'user', 3)", []);
        assert!(err.is_err(), "a named meeting must still exist");
    }

    #[test]
    fn migrate_v2_to_v3_drops_graph() {
        let conn = open_test_db();
        conn.execute_batch(
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO meta VALUES ('schema_version', '2');
             CREATE TABLE meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL,
                 pending_transcription INTEGER NOT NULL DEFAULT 0,
                 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             INSERT INTO meetings VALUES ('m1', 't', 0, 0, 0);
             CREATE TABLE recordings (id TEXT PRIMARY KEY, meeting_id TEXT, filename TEXT NOT NULL,
                 duration_seconds REAL, input_source TEXT, created_at INTEGER NOT NULL);
             CREATE TABLE meeting_index_state (meeting_id TEXT PRIMARY KEY, content_hash TEXT,
                 embedding_hash TEXT, extraction_hash TEXT, indexed_at INTEGER);
             INSERT INTO meeting_index_state VALUES ('m1', 'c', 'e', 'x', 0);
             CREATE TABLE todos (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                 text TEXT NOT NULL, owner TEXT, due_date TEXT, completed INTEGER NOT NULL DEFAULT 0,
                 source TEXT NOT NULL, created_at INTEGER NOT NULL);
             CREATE TABLE kg_nodes (id TEXT PRIMARY KEY);
             CREATE TABLE kg_edges (id TEXT PRIMARY KEY);",
        )
        .expect("seed v2 db");

        migrate(&conn).expect("migrate v2→v3");

        let has = |t: &str| -> i64 {
            conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE name = ?1", [t], |r| r.get(0))
                .expect("sqlite_master")
        };
        assert_eq!(has("kg_nodes"), 0);
        assert_eq!(has("kg_edges"), 0);

        let cols: Vec<String> = conn
            .prepare("SELECT name FROM pragma_table_info('meeting_index_state')")
            .expect("prepare")
            .query_map([], |r| r.get(0))
            .expect("query")
            .map(|c| c.expect("col"))
            .collect();
        assert!(!cols.contains(&"extraction_hash".to_string()));

        let hash: String = conn
            .query_row("SELECT content_hash FROM meeting_index_state WHERE meeting_id = 'm1'", [], |r| r.get(0))
            .expect("index state kept");
        assert_eq!(hash, "c");
        assert_eq!(get_schema_version(&conn), SCHEMA_VERSION);
    }

    #[test]
    fn migrate_v3_to_v4_turns_pending_into_captured_with_its_recording() {
        let conn = open_test_db();
        conn.execute_batch(
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO meta VALUES ('schema_version', '3');
             CREATE TABLE meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL,
                 pending_transcription INTEGER NOT NULL DEFAULT 0,
                 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
             CREATE TABLE recordings (id TEXT PRIMARY KEY, meeting_id TEXT, filename TEXT NOT NULL,
                 duration_seconds REAL, input_source TEXT, created_at INTEGER NOT NULL);
             INSERT INTO meetings VALUES ('rec_1_a', 'unlinked', 1, 0, 0);
             INSERT INTO meetings VALUES ('rec_2_b', 'linked', 1, 0, 0);
             INSERT INTO recordings VALUES ('r2', 'rec_2_b', 'rec_2_b.wav', NULL, NULL, 0);
             INSERT INTO meetings VALUES ('done', 'transcribed', 0, 0, 0);
             CREATE TABLE todos (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                 text TEXT NOT NULL, owner TEXT, due_date TEXT, completed INTEGER NOT NULL DEFAULT 0,
                 source TEXT NOT NULL, created_at INTEGER NOT NULL);",
        )
        .expect("seed v3 db");

        migrate(&conn).expect("migrate v3→v4");

        let status = |id: &str| -> String {
            conn.query_row("SELECT status FROM meetings WHERE id = ?1", [id], |r| r.get(0)).expect("status")
        };
        let recordings = |id: &str| -> Vec<String> {
            conn.prepare("SELECT filename FROM recordings WHERE meeting_id = ?1")
                .expect("prepare")
                .query_map([id], |r| r.get(0))
                .expect("query")
                .map(|f| f.expect("filename"))
                .collect()
        };
        assert_eq!(status("rec_1_a"), "captured");
        assert_eq!(status("rec_2_b"), "captured");
        assert_eq!(status("done"), "ready");
        assert_eq!(recordings("rec_1_a"), vec!["rec_1_a.wav".to_string()]);
        assert_eq!(recordings("rec_2_b"), vec!["rec_2_b.wav".to_string()]);
        assert!(recordings("done").is_empty());
        assert_eq!(get_schema_version(&conn), SCHEMA_VERSION);
    }

    #[test]
    fn a_new_embedding_model_drops_old_vectors_once() {
        let conn = open_test_db();
        init_db(&conn);
        let now = now_test_millis();
        conn.execute("INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m1', 'M', ?1, ?1)", params![now])
            .expect("insert meeting");
        conn.execute("INSERT INTO meeting_index_state (meeting_id, content_hash, embedding_hash, indexed_at) VALUES ('m1', 'c', 'c', ?1)", params![now])
            .expect("insert index state");
        let vector = format!("[{}]", vec!["0.1"; DEFAULT_DIM as usize].join(","));
        conn.execute("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (1, ?1)", params![vector]).expect("insert vector");
        conn.execute("UPDATE meta SET value = 'old-model' WHERE key = 'embedding_model'", []).expect("set old model");

        migrate(&conn).expect("migrate");

        let vectors: i64 = conn.query_row("SELECT COUNT(*) FROM vec_chunks", [], |r| r.get(0)).unwrap();
        let stamp: Option<String> = conn.query_row("SELECT embedding_hash FROM meeting_index_state", [], |r| r.get(0)).unwrap();
        let model: String = conn.query_row("SELECT value FROM meta WHERE key = 'embedding_model'", [], |r| r.get(0)).unwrap();
        assert_eq!((vectors, stamp, model.as_str()), (0, None, DEFAULT_MODEL));

        conn.execute("INSERT INTO vec_chunks (chunk_id, embedding) VALUES (2, ?1)", params![vector]).expect("insert vector");
        migrate(&conn).expect("migrate again");
        let kept: i64 = conn.query_row("SELECT COUNT(*) FROM vec_chunks", [], |r| r.get(0)).unwrap();
        assert_eq!(kept, 1, "the same model keeps its vectors");
    }
}
