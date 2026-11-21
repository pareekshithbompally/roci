//! The knowledge graph's one bridge to GraphQLite (vendor/graphqlite): Cypher on the store's connection, parameters always
//! bound (`$name`, never written into the query), rows read as typed values. GraphQLite reports a failed query as an SQLite
//! error (`sqlite3_result_error`, BUSY kept as BUSY), so it arrives here as one. Nothing else in the store calls `cypher()`.

use crate::error::StoreError;
use rusqlite::Connection;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

/// Runs `cypher` with `params` (a JSON object); returns its rows, keyed by the names it RETURNs.
pub(crate) fn run(db: &Connection, cypher: &str, params: Value) -> Result<Vec<Value>, StoreError> {
    let out: Option<String> = db.query_row("SELECT cypher(?1, ?2)", [cypher, &params.to_string()], |row| row.get(0))?;
    let Some(out) = out else { return Ok(vec![]) };
    match serde_json::from_str::<Value>(&out).map_err(|e| StoreError::from(format!("graph result: {e}")))? {
        Value::Array(rows) => Ok(rows),
        // A write without RETURN answers with its counts, not rows.
        _ => Ok(vec![]),
    }
}

/// `run`, each row read as a `T`.
pub(crate) fn rows<T: DeserializeOwned>(db: &Connection, cypher: &str, params: Value) -> Result<Vec<T>, StoreError> {
    run(db, cypher, params)?
        .into_iter()
        .map(|row| serde_json::from_value(row).map_err(|e| StoreError::from(format!("graph row: {e}"))))
        .collect()
}

/// The `id` column of each row `cypher` returns.
pub(crate) fn ids(db: &Connection, cypher: &str, params: Value) -> Result<Vec<String>, StoreError> {
    #[derive(serde::Deserialize)]
    struct Row {
        id: String,
    }
    Ok(rows::<Row>(db, cypher, params)?.into_iter().map(|row| row.id).collect())
}

/// A graph algorithm (`pageRank(0.85, 20)`): its result per node, each read as a `T` (the node's own `id` is its `user_id`).
pub(crate) fn algorithm<T: DeserializeOwned>(db: &Connection, call: &str) -> Result<Vec<T>, StoreError> {
    let Some(Value::Object(mut row)) = run(db, &format!("RETURN {call} AS result"), json!({}))?.pop() else {
        return Err(StoreError::from(format!("graph algorithm {call}: no result")));
    };
    let results = row.remove("result").ok_or_else(|| StoreError::from(format!("graph algorithm {call}: no result column")))?;
    serde_json::from_value(results).map_err(|e| StoreError::from(format!("graph algorithm {call}: {e}")))
}
