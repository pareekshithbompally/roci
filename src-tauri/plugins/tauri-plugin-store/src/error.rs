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
        _ => {
            let msg = e.to_string();
            let code = if msg.contains("UNIQUE constraint failed") {
                StoreErrorCode::Conflict
            } else if msg.contains("FOREIGN KEY constraint failed") {
                StoreErrorCode::Constraint
            } else if msg.contains("CHECK constraint failed") {
                StoreErrorCode::Constraint
            } else {
                StoreErrorCode::Db
            };
            (code, msg)
        }
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
