use serde::Serialize;

/// Structured error contract for every store command.
///
/// Every command returns `Result<T, StoreError>`.
/// Serialized as `{ code: string, message: string }` to the frontend.
#[derive(Debug, Serialize)]
pub struct StoreError {
    pub code: StoreErrorCode,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StoreErrorCode {
    NotFound,
    Conflict,
    InvalidInput,
    Constraint,
    Io,
    Db,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", serde_json::to_string(&self.code).unwrap_or_default(), self.message)
    }
}

impl From<rusqlite::Error> for StoreError {
    fn from(e: rusqlite::Error) -> Self {
        let (code, message) = map_rusqlite_error(&e);
        StoreError { code, message }
    }
}

fn map_rusqlite_error(e: &rusqlite::Error) -> (StoreErrorCode, String) {
    match e {
        rusqlite::Error::QueryReturnedNoRows => (
            StoreErrorCode::NotFound,
            "Entity not found".to_string(),
        ),
        rusqlite::Error::SqliteFailure(ffi_error, _) => {
            (constraint_code(ffi_error), e.to_string())
        }
        _ => (StoreErrorCode::Db, e.to_string()),
    }
}

/// Classifies a `SqliteFailure`'s underlying FFI error using its primary
/// `ErrorCode` and, for constraint violations, its extended code.
fn constraint_code(ffi_error: &rusqlite::ffi::Error) -> StoreErrorCode {
    if ffi_error.code != rusqlite::ErrorCode::ConstraintViolation {
        return StoreErrorCode::Db;
    }

    match ffi_error.extended_code {
        rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE | rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY => {
            StoreErrorCode::Conflict
        }
        _ => StoreErrorCode::Constraint,
    }
}

impl From<String> for StoreError {
    fn from(msg: String) -> Self {
        StoreError {
            code: StoreErrorCode::Db,
            message: msg,
        }
    }
}

impl From<&str> for StoreError {
    fn from(msg: &str) -> Self {
        StoreError {
            code: StoreErrorCode::Db,
            message: msg.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Connection with a `parents`/`children` schema covering UNIQUE,
    /// CHECK, and FOREIGN KEY constraints, used to trigger real
    /// `rusqlite::Error::SqliteFailure` values.
    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE parents (
                 id INTEGER PRIMARY KEY,
                 name TEXT NOT NULL UNIQUE
             );
             CREATE TABLE children (
                 id INTEGER PRIMARY KEY,
                 parent_id INTEGER NOT NULL,
                 age INTEGER CHECK (age >= 0),
                 FOREIGN KEY (parent_id) REFERENCES parents(id)
             );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn unique_violation_maps_to_conflict() {
        let conn = test_conn();
        conn.execute("INSERT INTO parents (name) VALUES ('alice')", [])
            .unwrap();

        let err = conn
            .execute("INSERT INTO parents (name) VALUES ('alice')", [])
            .unwrap_err();
        let store_err = StoreError::from(err);

        assert!(matches!(store_err.code, StoreErrorCode::Conflict));
    }

    #[test]
    fn check_violation_maps_to_constraint() {
        let conn = test_conn();
        conn.execute("INSERT INTO parents (name) VALUES ('alice')", [])
            .unwrap();

        let err = conn
            .execute(
                "INSERT INTO children (parent_id, age) VALUES (1, -1)",
                [],
            )
            .unwrap_err();
        let store_err = StoreError::from(err);

        assert!(matches!(store_err.code, StoreErrorCode::Constraint));
    }

    #[test]
    fn foreign_key_violation_maps_to_constraint() {
        let conn = test_conn();

        let err = conn
            .execute(
                "INSERT INTO children (parent_id, age) VALUES (999, 1)",
                [],
            )
            .unwrap_err();
        let store_err = StoreError::from(err);

        assert!(matches!(store_err.code, StoreErrorCode::Constraint));
    }

    #[test]
    fn query_returned_no_rows_maps_to_not_found() {
        let conn = test_conn();

        let err = conn
            .query_row("SELECT id FROM parents WHERE id = 1", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap_err();
        let store_err = StoreError::from(err);

        assert!(matches!(store_err.code, StoreErrorCode::NotFound));
        assert_eq!(store_err.message, "Entity not found");
    }
}
