use crate::assets;
use rusqlite::Connection;

/// Current schema version for the new roci.db.
pub const SCHEMA_VERSION: u32 = 17;

/// Default embedding model and dimension.
pub const DEFAULT_MODEL: &str = "qwen3-embedding-0.6b";
pub const DEFAULT_DIM: u32 = 1024;

extern "C" {
    /// GraphQLite's entry point, compiled in by build.rs.
    fn sqlite3_graphqlite_init(
        db: *mut rusqlite::ffi::sqlite3,
        err: *mut *mut std::os::raw::c_char,
        api: *const rusqlite::ffi::sqlite3_api_routines,
    ) -> std::os::raw::c_int;
}

/// Registers the store's SQLite extensions for every connection opened after: sqlite-vec (vectors) and GraphQLite (the
/// knowledge graph, Cypher). Once per process.
pub(crate) fn register_extensions() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(sqlite_vec::sqlite3_vec_init as *const ())));
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_graphqlite_init as *const ())));
    });
}

#[cfg(test)]
pub(crate) fn open_migrated_test_db() -> Connection {
    register_extensions();

    let conn = Connection::open_in_memory().expect("open in-memory");
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .expect("set pragmas");
    migrate(&conn).expect("migrate");
    conn
}

/// Creates the schema in a new database, or brings a v10–v16 database to the current version with its data. Any other
/// version is refused, not upgraded: pre-release, there is nothing else to carry forward.
pub fn migrate(conn: &Connection) -> Result<(), String> {
    match get_schema_version(conn) {
        0 => create_new(conn)?,
        version @ 10..=16 => upgrade_from(conn, version)?,
        SCHEMA_VERSION => {}
        other => {
            let e = format!("roci.db is schema v{other}, this build is v{SCHEMA_VERSION}: remove it to start fresh");
            log::error!("[store] {e}");
            return Err(e);
        }
    }
    match_embedding_model(conn)
}

/// v10 → v11: the index-state tables nothing reads any more go (Rust indexes on save), and a chat's usage is found by
/// its session without reading the whole log.
fn upgrade_v11(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin v11: {}", e))?;
    tx.execute_batch(
        "DROP TABLE IF EXISTS meeting_index_state;
         DROP TABLE IF EXISTS chat_index_state;
         CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_log(session_id);",
    )
    .map_err(|e| format!("v11: {}", e))?;
    set_schema_version(&tx, 11)?;
    tx.commit().map_err(|e| format!("commit v11: {}", e))?;
    log::info!("[store] Schema v10→v11 (index state dropped, usage by session indexed)");
    Ok(())
}

/// v11 → v12: API keys stop being plain text. Each saved key (its plain-text column, or its settings field) is encrypted
/// into the new `api_key` column, the settings fields are blanked and the old column dropped, in one transaction.
fn upgrade_v12(conn: &Connection) -> Result<(), String> {
    let rows: Vec<(String, Option<String>, Option<String>)> = conn
        .prepare("SELECT provider, api_key_encrypted, data FROM providers")
        .and_then(|mut stmt| stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect())
        .map_err(|e| format!("v12 read providers: {}", e))?;
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin v12: {}", e))?;
    tx.execute_batch("ALTER TABLE providers ADD COLUMN api_key BLOB;").map_err(|e| format!("v12 key column: {}", e))?;
    for (provider, column, data) in rows {
        let key = column.filter(|k| !k.trim().is_empty()).or_else(|| crate::api_keys::key_in_settings(data.as_deref()));
        let sealed = key.map(|key| crate::api_keys::seal(key.trim())).transpose().map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE providers SET data = ?2, api_key = ?3 WHERE provider = ?1",
            rusqlite::params![provider, crate::api_keys::with_key_in_settings(data, ""), sealed],
        )
        .map_err(|e| format!("v12 {provider}: {}", e))?;
    }
    tx.execute_batch("ALTER TABLE providers DROP COLUMN api_key_encrypted;").map_err(|e| format!("v12: {}", e))?;
    set_schema_version(&tx, 12)?;
    tx.commit().map_err(|e| format!("commit v12: {}", e))?;
    log::info!("[store] Schema v11→v12 (API keys encrypted in their rows)");
    Ok(())
}

/// Each step from `version` up, in order.
fn upgrade_from(conn: &Connection, version: u32) -> Result<(), String> {
    if version <= 10 {
        upgrade_v11(conn)?;
    }
    if version <= 11 {
        upgrade_v12(conn)?;
    }
    if version <= 12 {
        upgrade_v13(conn)?;
    }
    if version <= 13 {
        upgrade_v14(conn)?;
    }
    if version <= 14 {
        upgrade_v15(conn)?;
    }
    if version <= 15 {
        upgrade_v16(conn)?;
    }
    upgrade_v17(conn)
}

/// v16 → v17: every kept file lives in one folder, `assets/` (its kind says what it is), a file can be kept in the Knowledge
/// library, and each indexed source has its index state. The rows point into `assets/` here; the files themselves move at
/// the next open (`assets::move_into_assets`), outside the transaction. Image paths saved in chats follow.
fn upgrade_v17(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin v17: {}", e))?;
    let has_kept: bool = tx
        .query_row("SELECT COUNT(*) FROM pragma_table_info('assets') WHERE name = 'kept'", [], |r| r.get::<_, i64>(0))
        .map(|count| count > 0)
        .map_err(|e| format!("v17 read assets: {}", e))?;
    if !has_kept {
        tx.execute_batch("ALTER TABLE assets ADD COLUMN kept INTEGER NOT NULL DEFAULT 0;").map_err(|e| format!("v17 kept: {}", e))?;
    }
    tx.execute_batch(
        "UPDATE assets SET path = 'assets/' || substr(path, instr(path, '/') + 1)
             WHERE path LIKE 'recordings/%' OR path LIKE 'images/%' OR path LIKE 'speech/%';
         UPDATE assets SET preview_path = 'assets/' || substr(preview_path, instr(preview_path, '/') + 1)
             WHERE preview_path LIKE 'images/%';
         UPDATE chat_messages SET data = replace(data, '\"path\":\"images/', '\"path\":\"assets/')
             WHERE data LIKE '%\"path\":\"images/%';
         DELETE FROM meta WHERE key = 'images_adopted';",
    )
    .map_err(|e| format!("v17 one assets folder: {}", e))?;
    tx.execute_batch(SOURCES_DDL).map_err(|e| format!("v17 index state: {}", e))?;
    set_schema_version(&tx, 17)?;
    tx.commit().map_err(|e| format!("commit v17: {}", e))?;
    log::info!("[store] Schema v16→v17 (one assets folder, kept files, index state)");
    Ok(())
}

/// v15 → v16: meetings' and chats' search tables become the one search index (memories live in the graph).
fn upgrade_v16(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin v16: {}", e))?;
    one_search_index(&tx)?;
    set_schema_version(&tx, 16)?;
    tx.commit().map_err(|e| format!("commit v16: {}", e))?;
    log::info!("[store] Schema v15→v16 (one search index)");
    Ok(())
}

/// v16: meetings' and chats' separate search tables become the one index. Their pieces move over (new ids), their vectors
/// don't: the indexer's catch-up embeds every piece without one at launch. A database without the old tables has nothing to move.
fn one_search_index(tx: &Connection) -> Result<(), String> {
    let old: bool = tx
        .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'chat_chunks'", [], |r| r.get::<_, i64>(0))
        .map(|n| n > 0)
        .map_err(|e| format!("v16 read search tables: {}", e))?;
    if !old {
        return Ok(());
    }
    tx.execute_batch(
        "DROP TRIGGER IF EXISTS chunks_ai; DROP TRIGGER IF EXISTS chunks_ad; DROP TRIGGER IF EXISTS chunks_bu; DROP TRIGGER IF EXISTS chunks_au;
         DROP TRIGGER IF EXISTS chat_chunks_ai; DROP TRIGGER IF EXISTS chat_chunks_ad; DROP TRIGGER IF EXISTS chat_chunks_bu; DROP TRIGGER IF EXISTS chat_chunks_au;
         DROP TABLE IF EXISTS chunks_fts; DROP TABLE IF EXISTS chat_chunks_fts;
         DROP TABLE IF EXISTS vec_chunks; DROP TABLE IF EXISTS chat_vec_chunks;
         ALTER TABLE chunks RENAME TO meeting_chunks_v15;",
    )
    .map_err(|e| format!("v16 drop old search tables: {}", e))?;
    tx.execute_batch(SEARCH_DDL).map_err(|e| format!("v16 search index: {}", e))?;
    create_vectors(tx)?;
    tx.execute_batch(
        "INSERT INTO chunks (owner_kind, owner_id, chunk_index, chunk_text, chunk_type, start_pos, end_pos)
             SELECT 'meeting', meeting_id, chunk_index, chunk_text, chunk_type, start_pos, end_pos FROM meeting_chunks_v15;
         INSERT INTO chunks (owner_kind, owner_id, chunk_index, chunk_text, chunk_type)
             SELECT 'chat', chat_id, chunk_index, chunk_text, chunk_type FROM chat_chunks;
         DROP TABLE meeting_chunks_v15; DROP TABLE chat_chunks;",
    )
    .map_err(|e| format!("v16 move search pieces: {}", e))
}

/// v14 → v15: a provider's API key is kept encrypted in its row; a database v12 made already has the column.
fn upgrade_v15(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin v15: {}", e))?;
    let has_column: bool = tx
        .query_row("SELECT COUNT(*) FROM pragma_table_info('providers') WHERE name = 'api_key'", [], |r| r.get::<_, i64>(0))
        .map(|count| count > 0)
        .map_err(|e| format!("v15 read providers: {}", e))?;
    if !has_column {
        tx.execute_batch("ALTER TABLE providers ADD COLUMN api_key BLOB;").map_err(|e| format!("v15: {}", e))?;
    }
    set_schema_version(&tx, 15)?;
    tx.commit().map_err(|e| format!("commit v15: {}", e))?;
    log::info!("[store] Schema v14→v15 (API keys encrypted in their rows)");
    Ok(())
}

/// v13 → v14: a speech call's audio length is kept with its usage, so speech billed by the minute is priced and counted.
fn upgrade_v14(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin v14: {}", e))?;
    tx.execute_batch("ALTER TABLE usage_log ADD COLUMN audio_seconds REAL NOT NULL DEFAULT 0;").map_err(|e| format!("v14: {}", e))?;
    set_schema_version(&tx, 14)?;
    tx.commit().map_err(|e| format!("commit v14: {}", e))?;
    log::info!("[store] Schema v13→v14 (usage keeps audio seconds)");
    Ok(())
}

/// v12 → v13: tool calls get their own table, filled from the chats saved so far; the audit log nothing read goes.
fn upgrade_v13(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin v13: {}", e))?;
    tx.execute_batch(TOOL_CALLS_DDL).map_err(|e| format!("v13 tool calls: {}", e))?;
    tx.execute(FILL_TOOL_CALLS, [Option::<String>::None]).map_err(|e| format!("v13 fill tool calls: {}", e))?;
    tx.execute_batch("DROP TABLE IF EXISTS audit_log;").map_err(|e| format!("v13 drop audit log: {}", e))?;
    set_schema_version(&tx, 13)?;
    tx.commit().map_err(|e| format!("commit v13: {}", e))?;
    log::info!("[store] Schema v12→v13 (tool calls; audit log dropped)");
    Ok(())
}

/// Every table, in one transaction, at the current version.
fn create_new(conn: &Connection) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| format!("begin schema: {}", e))?;
    create_baseline(&tx)?;
    set_schema_version(&tx, SCHEMA_VERSION)?;
    tx.commit().map_err(|e| format!("commit schema: {}", e))?;
    log::info!("[store] Created schema v{} (model={}, dim={})", SCHEMA_VERSION, DEFAULT_MODEL, DEFAULT_DIM);
    Ok(())
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
        tx.execute_batch("DROP TABLE IF EXISTS vec_chunks;").map_err(|e| format!("drop old embeddings: {}", e))?;
        create_vectors(&tx)?;
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

/// The search index: every searchable piece of a meeting, a chat or any later owner (`owner_kind`, `owner_id`), its BM25
/// keyword index kept in step by triggers, and the owners' delete triggers that take their pieces with them (a new indexed
/// owner adds one). Vectors are `create_vectors`'.
const SEARCH_DDL: &str = "
    CREATE TABLE IF NOT EXISTS chunks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_kind  TEXT    NOT NULL,
        owner_id    TEXT    NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text  TEXT    NOT NULL,
        chunk_type  TEXT    NOT NULL,
        start_pos   INTEGER,
        end_pos     INTEGER,
        UNIQUE (owner_kind, owner_id, chunk_index)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(chunk_text, content=chunks, content_rowid=id, prefix='2 3');
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES ('delete', old.id, old.chunk_text);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE OF chunk_text ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES ('delete', old.id, old.chunk_text);
        INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text);
    END;
    CREATE TRIGGER IF NOT EXISTS meetings_chunks_ad AFTER DELETE ON meetings BEGIN
        DELETE FROM chunks WHERE owner_kind = 'meeting' AND owner_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS chats_chunks_ad AFTER DELETE ON chats BEGIN
        DELETE FROM chunks WHERE owner_kind = 'chat' AND owner_id = old.id;
    END;";

/// Knowledge sources: each indexed source's state, keyed like its pieces (`owner_kind`, `owner_id`): the text it was indexed
/// from (its hash), by which indexer version, and how that went, so a source is indexed again only when its text or the
/// indexer changes, and a failed one is retried. A file kept in the library is a source too (`owner_kind` 'file', its asset
/// id); every owner's delete takes its state, and a file's its pieces, with it.
const SOURCES_DDL: &str = "
    CREATE TABLE IF NOT EXISTS index_state (
        owner_kind   TEXT    NOT NULL,
        owner_id     TEXT    NOT NULL,
        text_hash    TEXT    NOT NULL,
        version      INTEGER NOT NULL,
        state        TEXT    NOT NULL CHECK(state IN ('pending','ready','failed')),
        error        TEXT,
        attempted_at INTEGER NOT NULL,
        PRIMARY KEY (owner_kind, owner_id)
    );
    CREATE TRIGGER IF NOT EXISTS meetings_index_state_ad AFTER DELETE ON meetings BEGIN
        DELETE FROM index_state WHERE owner_kind = 'meeting' AND owner_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS chats_index_state_ad AFTER DELETE ON chats BEGIN
        DELETE FROM index_state WHERE owner_kind = 'chat' AND owner_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS files_source_ad AFTER DELETE ON assets WHEN old.kind = 'file' BEGIN
        DELETE FROM chunks WHERE owner_kind = 'file' AND owner_id = old.id;
        DELETE FROM index_state WHERE owner_kind = 'file' AND owner_id = old.id;
    END;";

/// The pieces' vectors (sqlite-vec, partitioned by owner kind so a search reads one kind's), and the trigger that drops a
/// piece's vector with it. Separate from `SEARCH_DDL`: vec0 is the extension's, and an embedding model change remakes it.
fn create_vectors(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(&format!(
        "CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
             chunk_id INTEGER PRIMARY KEY,
             owner_kind TEXT PARTITION KEY,
             embedding float[{DEFAULT_DIM}]
         );
         CREATE TRIGGER IF NOT EXISTS chunks_vec_ad AFTER DELETE ON chunks BEGIN
             DELETE FROM vec_chunks WHERE chunk_id = old.id;
         END;"
    ))
    .map_err(|e| format!("create vectors: {}", e))
}

/// Each tool call the AI made in a chat, as its saved message shows it: read by usage over a time window.
const TOOL_CALLS_DDL: &str = "
    CREATE TABLE IF NOT EXISTS tool_calls (
        id          INTEGER PRIMARY KEY,
        chat_id     TEXT    NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        tool        TEXT    NOT NULL,
        ok          INTEGER NOT NULL,
        duration_ms INTEGER,
        created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tool_calls_created ON tool_calls(created_at);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_chat ON tool_calls(chat_id);";

/// The tool-call rows of one chat's saved messages (`?1`), or of every chat (`?1` NULL), read from the AI SDK's tool parts:
/// `tool-<name>`, or `dynamic-tool` with its `toolName`. A call is ok once it answered without Roci's `isError`. A message
/// whose data isn't JSON adds none rather than failing the save.
pub(crate) const FILL_TOOL_CALLS: &str = "
    INSERT INTO tool_calls (chat_id, tool, ok, duration_ms, created_at)
    SELECT m.chat_id,
           COALESCE(json_extract(p.value, '$.toolName'), substr(json_extract(p.value, '$.type'), 6)),
           json_extract(p.value, '$.state') IS 'output-available' AND COALESCE(json_extract(p.value, '$.output.isError'), 0) = 0,
           json_extract(p.value, '$.output.meta.executionMs'), m.created_at
    FROM chat_messages m, json_each(CASE WHEN json_valid(m.data) THEN m.data END, '$.parts') p
    WHERE (?1 IS NULL OR m.chat_id = ?1)
      AND (json_extract(p.value, '$.type') LIKE 'tool-%' OR json_extract(p.value, '$.type') = 'dynamic-tool')";

/// Dictations made in the app, newest first.
const DICTATIONS_DDL: &str = "
    CREATE TABLE IF NOT EXISTS dictations (
        id          TEXT PRIMARY KEY,
        text        TEXT    NOT NULL,
        created_at  INTEGER NOT NULL,
        duration_ms INTEGER,
        model       TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_dictations_created ON dictations(created_at DESC);";

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
            title_source          TEXT    NOT NULL DEFAULT 'default' CHECK(title_source IN ('default','calendar','user','ai')),
            step_attempts         INTEGER NOT NULL DEFAULT 0,
            audio_removed_at      INTEGER,
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
            base_url          TEXT,
            data              TEXT,
            updated_at        INTEGER NOT NULL,
            -- AES-256-GCM under the Keychain's Roci Safe Storage key (api_keys.rs); NULL when none is saved.
            api_key           BLOB
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

        ",
    )
    .map_err(|e| format!("create baseline tables: {}", e))?;

    conn.execute_batch(assets::DDL).map_err(|e| format!("create assets: {}", e))?;
    conn.execute_batch(assets::RECORDING_REMOVED_TRIGGER).map_err(|e| format!("create assets: {}", e))?;
    conn.execute_batch(DICTATIONS_DDL).map_err(|e| format!("create dictations table: {}", e))?;
    conn.execute_batch(TOOL_CALLS_DDL).map_err(|e| format!("create tool calls table: {}", e))?;

    conn.execute_batch(SEARCH_DDL).map_err(|e| format!("create search index: {}", e))?;
    conn.execute_batch(SOURCES_DDL).map_err(|e| format!("create index state: {}", e))?;

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
            estimated_cost     REAL DEFAULT 0,
            audio_seconds      REAL NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_provider_model ON usage_log(provider, model);
        CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_log(session_id);
        ",
    )
    .map_err(|e| format!("create usage_log: {}", e))?;

    create_vectors(conn)?;

    // Insert metadata
    conn.execute_batch(&format!(
        "
        INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_model', '{}');
        INSERT OR REPLACE INTO meta (key, value) VALUES ('embedding_dim', '{}');
        INSERT OR REPLACE INTO meta (key, value) VALUES ('created_at', CAST(CAST(unixepoch('subsec') * 1000 AS INTEGER) AS TEXT));
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
        super::register_extensions();

        let conn = Connection::open_in_memory().expect("open in-memory");
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .expect("set pragmas");

        conn
    }

    fn init_db(conn: &Connection) {
        migrate(conn).expect("migrate");
    }

    fn has_api_key_column(conn: &Connection) -> bool {
        conn.query_row("SELECT COUNT(*) FROM pragma_table_info('providers') WHERE name = 'api_key'", [], |r| r.get::<_, i64>(0))
            .expect("read providers")
            > 0
    }

    #[test]
    fn providers_keep_their_encrypted_key_in_the_row_and_v15_adds_it_to_older_databases() {
        let conn = open_test_db();
        init_db(&conn);
        assert!(has_api_key_column(&conn));

        let older = open_test_db();
        older
            .execute_batch(
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE providers (provider TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0, base_url TEXT, data TEXT, updated_at INTEGER NOT NULL);",
            )
            .expect("v14 providers");
        upgrade_v15(&older).expect("v15");
        assert!(has_api_key_column(&older));
        assert_eq!(get_schema_version(&older), 15);
        upgrade_v15(&older).expect("v15 again keeps the column");
    }

    #[test]
    fn the_graph_runs_on_the_store_connection() {
        let conn = open_migrated_test_db();
        let cypher = |q: &str| conn.query_row("SELECT cypher(?1)", [q], |r| r.get::<_, Option<String>>(0)).unwrap().unwrap_or_default();
        cypher("MERGE (:Person {id:'p1', name:'Priya'})");
        cypher("MERGE (:Person {id:'p1', name:'Priya'})");
        assert_eq!(cypher("MATCH (p:Person) RETURN count(p) AS n"), r#"[{"n":1}]"#);
    }

    /// v16 → v17: every asset row and every image a chat saved point into `assets/`; nothing else in a message changes.
    #[test]
    fn v16_paths_move_into_the_one_assets_folder() {
        let conn = open_test_db();
        init_db(&conn);
        conn.execute_batch(
            r#"INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m', 'Standup', 1, 1);
               INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c', 'Chat', 1, 1);
               INSERT INTO assets (id, kind, path, meeting_id, created_at) VALUES ('r', 'recording', 'recordings/m.wav', 'm', 1);
               INSERT INTO assets (id, kind, path, preview_path, chat_id, created_at) VALUES ('i', 'image', 'images/x.png', 'images/x.thumb.jpg', 'c', 1);
               INSERT INTO chat_messages (id, chat_id, seq, role, data, created_at)
                   VALUES ('q', 'c', 0, 'model', '{"parts":[{"text":"see images/ folder"},{"output":{"meta":{"image":{"path":"images/x.png"}}}}]}', 1);
               UPDATE meta SET value = '16' WHERE key = 'schema_version';"#,
        )
        .expect("v16 rows");

        migrate(&conn).expect("upgrade");

        let paths: Vec<(String, Option<String>)> = conn.prepare("SELECT path, preview_path FROM assets ORDER BY id").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap().collect::<Result<_, _>>().unwrap();
        assert_eq!(paths, vec![("assets/x.png".into(), Some("assets/x.thumb.jpg".into())), ("assets/m.wav".into(), None)]);
        let data: String = conn.query_row("SELECT data FROM chat_messages", [], |r| r.get(0)).unwrap();
        assert!(data.contains(r#""path":"assets/x.png""#) && data.contains("see images/ folder"), "{data}");
        assert_eq!(get_schema_version(&conn), SCHEMA_VERSION);
    }

    #[test]
    fn v15_search_pieces_move_into_the_one_index() {
        let conn = open_test_db();
        init_db(&conn);
        // The v15 search tables, as they were (each owner's pieces, keyword index and vectors apart).
        conn.execute_batch(&format!(
            "DROP TRIGGER meetings_chunks_ad; DROP TRIGGER chats_chunks_ad; DROP TRIGGER files_source_ad; DROP TABLE vec_chunks; DROP TABLE chunks_fts; DROP TABLE chunks;
             CREATE TABLE chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                 chunk_index INTEGER NOT NULL, chunk_text TEXT NOT NULL, chunk_type TEXT NOT NULL DEFAULT 'transcript',
                 start_pos INTEGER, end_pos INTEGER, UNIQUE(meeting_id, chunk_index));
             CREATE TABLE chat_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                 chunk_index INTEGER NOT NULL, chunk_text TEXT NOT NULL, chunk_type TEXT NOT NULL DEFAULT 'turn', UNIQUE(chat_id, chunk_index));
             CREATE VIRTUAL TABLE chunks_fts USING fts5(chunk_text, content=chunks, content_rowid=id);
             CREATE VIRTUAL TABLE chat_chunks_fts USING fts5(chunk_text, content=chat_chunks, content_rowid=id);
             CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text); END;
             CREATE TRIGGER chat_chunks_ai AFTER INSERT ON chat_chunks BEGIN INSERT INTO chat_chunks_fts(rowid, chunk_text) VALUES (new.id, new.chunk_text); END;
             CREATE VIRTUAL TABLE vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{DEFAULT_DIM}]);
             CREATE VIRTUAL TABLE chat_vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{DEFAULT_DIM}]);
             INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m', 'Standup', 1, 1);
             INSERT INTO chats (id, title, created_at, last_message_at) VALUES ('c', 'Chat', 1, 1);
             INSERT INTO chunks (meeting_id, chunk_index, chunk_text) VALUES ('m', 0, 'budget review');
             INSERT INTO chat_chunks (chat_id, chunk_index, chunk_text) VALUES ('c', 0, 'budget question');
             UPDATE meta SET value = '15' WHERE key = 'schema_version';"
        ))
        .expect("v15 search tables");

        migrate(&conn).expect("upgrade");

        let owners: Vec<String> = conn
            .prepare("SELECT c.owner_kind || ':' || c.owner_id FROM chunks_fts f JOIN chunks c ON c.id = f.rowid WHERE chunks_fts MATCH 'budget' ORDER BY 1")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(owners, ["chat:c", "meeting:m"], "both pieces moved, keyword index rebuilt");
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('chat_chunks', 'chat_chunks_fts', 'chat_vec_chunks', 'meeting_chunks_v15')", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 0, "the old tables are gone");
        conn.execute("DELETE FROM chats WHERE id = 'c'", []).unwrap();
        let chat_pieces: i64 = conn.query_row("SELECT COUNT(*) FROM chunks WHERE owner_kind = 'chat'", [], |r| r.get(0)).unwrap();
        assert_eq!(chat_pieces, 0, "an owner's delete trigger is in place");
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
            "assets",
            "purge_queue",
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
            "chunks",
            "chunks_fts",
            "vec_chunks",
            "usage_log",
            "tool_calls",
            // GraphQLite's own (it creates and owns them; an update that renames them fails here).
            "nodes",
            "edges",
            "node_labels",
            "property_keys",
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
    fn a_v13_database_keeps_its_usage_and_gains_audio_seconds() {
        let conn = open_test_db();
        init_db(&conn);
        conn.execute_batch(
            "INSERT INTO usage_log (id, timestamp, category, provider, model) VALUES ('old', 1, 'summary', 'openai', 'gpt');
             ALTER TABLE usage_log DROP COLUMN audio_seconds;",
        )
        .unwrap();
        set_schema_version(&conn, 13).unwrap();
        migrate(&conn).expect("v13 upgrades");
        assert_eq!(get_schema_version(&conn), SCHEMA_VERSION);
        let seconds: f64 = conn.query_row("SELECT audio_seconds FROM usage_log WHERE id = 'old'", [], |r| r.get(0)).unwrap();
        assert_eq!(seconds, 0.0, "the old row stays, with no audio");
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
            "INSERT INTO chunks (owner_kind, owner_id, chunk_index, chunk_text, chunk_type) VALUES ('meeting', ?1, ?2, ?3, 'transcript')",
            params!["m1", 0, "chunk text"],
        )
        .expect("insert chunk");
        conn.execute(
            "INSERT INTO assets (id, kind, path, meeting_id, created_at) VALUES (?1, 'recording', ?2, ?3, ?4)",
            params!["r1", "recordings/test.wav", "m1", now],
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
            .query_row("SELECT COUNT(*) FROM chunks WHERE owner_kind = 'meeting' AND owner_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(chunks_count, 0, "chunks should cascade-delete");

        let assets_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(assets_count, 0, "assets should cascade-delete");
        let queued: String = conn
            .query_row("SELECT ref FROM purge_queue WHERE kind = 'file'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(queued, "recordings/test.wav", "a deleted asset queues its file");

        let mc_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM meeting_categories WHERE meeting_id = ?1", params!["m1"], |r| r.get(0))
            .unwrap();
        assert_eq!(mc_count, 0, "meeting_categories should cascade-delete");

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
    fn a_new_embedding_model_drops_old_vectors_once() {
        let conn = open_test_db();
        init_db(&conn);
        let now = now_test_millis();
        conn.execute("INSERT INTO meetings (id, title, created_at, updated_at) VALUES ('m1', 'M', ?1, ?1)", params![now])
            .expect("insert meeting");
        let vector = format!("[{}]", vec!["0.1"; DEFAULT_DIM as usize].join(","));
        conn.execute("INSERT INTO vec_chunks (chunk_id, owner_kind, embedding) VALUES (1, 'meeting', ?1)", params![vector]).expect("insert vector");
        conn.execute("UPDATE meta SET value = 'old-model' WHERE key = 'embedding_model'", []).expect("set old model");

        migrate(&conn).expect("migrate");

        let vectors: i64 = conn.query_row("SELECT COUNT(*) FROM vec_chunks", [], |r| r.get(0)).unwrap();
        let model: String = conn.query_row("SELECT value FROM meta WHERE key = 'embedding_model'", [], |r| r.get(0)).unwrap();
        assert_eq!((vectors, model.as_str()), (0, DEFAULT_MODEL));

        conn.execute("INSERT INTO vec_chunks (chunk_id, owner_kind, embedding) VALUES (2, 'meeting', ?1)", params![vector]).expect("insert vector");
        migrate(&conn).expect("migrate again");
        let kept: i64 = conn.query_row("SELECT COUNT(*) FROM vec_chunks", [], |r| r.get(0)).unwrap();
        assert_eq!(kept, 1, "the same model keeps its vectors");
    }
}
