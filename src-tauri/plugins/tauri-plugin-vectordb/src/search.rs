use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchParams {
    /// Query embedding vector (Float32, 384-dim)
    pub embedding: Vec<f32>,
    /// Raw query text for FTS5 search
    pub query_text: String,
    /// Max results to return
    pub limit: usize,
    /// Search mode: "hybrid", "vector", "fulltext"
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub meeting_id: String,
    pub meeting_title: String,
    pub chunk_text: String,
    pub chunk_type: String,
    pub score: f64,
    pub timestamp: i64,
}

/// RRF constant (k=60 is standard)
const RRF_K: f64 = 60.0;

/// Hybrid search: KNN vector search + FTS5 full-text, merged via Reciprocal Rank Fusion,
/// grouped by meeting_id, returning the best chunk per meeting.
pub fn hybrid_search(
    conn: &Connection,
    params: &SearchParams,
) -> Result<Vec<SearchHit>, String> {
    let limit = if params.limit == 0 { 5 } else { params.limit };
    let fetch_limit = limit * 3; // Over-fetch for better RRF merging
    let mode = params.mode.as_deref().unwrap_or("hybrid");

    let mut chunk_scores: HashMap<i64, f64> = HashMap::new();

    // Vector KNN search
    if mode == "hybrid" || mode == "vector" {
        let embedding_bytes = floats_to_bytes(&params.embedding);
        let mut stmt = conn
            .prepare(
                "SELECT chunk_id, distance
                 FROM vec_chunks
                 WHERE embedding MATCH ?1
                 ORDER BY distance
                 LIMIT ?2",
            )
            .map_err(|e| format!("vec search prepare: {}", e))?;

        let rows = stmt
            .query_map(
                rusqlite::params![embedding_bytes, fetch_limit as i64],
                |row| {
                    let chunk_id: i64 = row.get(0)?;
                    let distance: f64 = row.get(1)?;
                    Ok((chunk_id, distance))
                },
            )
            .map_err(|e| format!("vec search query: {}", e))?;

        for (rank, row) in rows.enumerate() {
            if let Ok((chunk_id, _distance)) = row {
                *chunk_scores.entry(chunk_id).or_default() += 1.0 / (RRF_K + rank as f64 + 1.0);
            }
        }
    }

    // FTS5 full-text search
    if mode == "hybrid" || mode == "fulltext" {
        // Escape FTS5 special characters in query
        let fts_query = sanitize_fts_query(&params.query_text);
        if !fts_query.is_empty() {
            let mut stmt = conn
                .prepare(
                    "SELECT rowid, rank
                     FROM chunks_fts
                     WHERE chunks_fts MATCH ?1
                     ORDER BY rank
                     LIMIT ?2",
                )
                .map_err(|e| format!("fts search prepare: {}", e))?;

            let rows = stmt
                .query_map(rusqlite::params![fts_query, fetch_limit as i64], |row| {
                    let rowid: i64 = row.get(0)?;
                    let _rank: f64 = row.get(1)?;
                    Ok(rowid)
                })
                .map_err(|e| format!("fts search query: {}", e))?;

            for (rank, row) in rows.enumerate() {
                if let Ok(chunk_id) = row {
                    *chunk_scores.entry(chunk_id).or_default() +=
                        1.0 / (RRF_K + rank as f64 + 1.0);
                }
            }
        }
    }

    if chunk_scores.is_empty() {
        return Ok(vec![]);
    }

    // Sort chunks by RRF score
    let mut scored: Vec<(i64, f64)> = chunk_scores.into_iter().collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Fetch chunk details + group by meeting (best chunk per meeting)
    let mut seen_meetings: HashMap<String, SearchHit> = HashMap::new();

    for (chunk_id, score) in scored {
        let result = conn.query_row(
            "SELECT c.meeting_id, c.chunk_text, c.chunk_type, m.title, m.timestamp
             FROM chunks c
             JOIN meetings m ON m.id = c.meeting_id
             WHERE c.id = ?1",
            [chunk_id],
            |row| {
                Ok(SearchHit {
                    meeting_id: row.get(0)?,
                    chunk_text: row.get(1)?,
                    chunk_type: row.get(2)?,
                    meeting_title: row.get(3)?,
                    timestamp: row.get(4)?,
                    score,
                })
            },
        );

        if let Ok(hit) = result {
            let entry = seen_meetings.entry(hit.meeting_id.clone());
            entry
                .and_modify(|existing| {
                    // Keep the higher-scoring chunk
                    if hit.score > existing.score {
                        *existing = hit.clone();
                    }
                })
                .or_insert(hit);
        }

        // Stop once we have enough unique meetings
        if seen_meetings.len() >= limit {
            break;
        }
    }

    // Return sorted by score descending
    let mut results: Vec<SearchHit> = seen_meetings.into_values().collect();
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);

    Ok(results)
}

/// Convert f32 slice to little-endian bytes for sqlite-vec.
fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    floats.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Sanitize a query string for FTS5 MATCH.
/// Remove special FTS5 operators and wrap in quotes for phrase-like matching.
fn sanitize_fts_query(query: &str) -> String {
    // Remove FTS5 special characters: * " ( ) + - ^ : OR AND NOT NEAR
    let cleaned: String = query
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();

    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // Split into words and join with OR for broad matching
    let words: Vec<&str> = trimmed.split_whitespace().collect();
    if words.len() == 1 {
        return format!("\"{}\"", words[0]);
    }

    // Use implicit OR: each word is a separate term
    words
        .iter()
        .map(|w| format!("\"{}\"", w))
        .collect::<Vec<_>>()
        .join(" OR ")
}
