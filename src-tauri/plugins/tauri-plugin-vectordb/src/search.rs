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
    /// Optional: scope search to specific meetings (return multiple chunks per meeting)
    pub meeting_ids: Option<Vec<String>>,
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

/// BM25 score threshold for FTS5 results entering RRF.
/// FTS5 rank is negative (more negative = better). Results closer to 0.0 matched
/// only on high-IDF-penalized (common) words. Threshold filters noise before RRF
/// so rank-position fusion doesn't give irrelevant docs meaningful scores.
const BM25_MIN_SCORE: f64 = -0.5;

/// Hybrid search: KNN vector search + FTS5 full-text, merged via Reciprocal Rank Fusion,
/// grouped by meeting_id, returning the best chunk per meeting.
pub fn hybrid_search(
    conn: &Connection,
    params: &SearchParams,
) -> Result<Vec<SearchHit>, String> {
    let limit = if params.limit == 0 { 5 } else { params.limit };
    let fetch_limit = limit * 3; // Over-fetch for better RRF merging
    let mode = params.mode.as_deref().unwrap_or("hybrid");

    // Validate embedding dimensions for vector search
    if (mode == "hybrid" || mode == "vector") && !params.embedding.is_empty() {
        let expected = crate::schema::DEFAULT_DIM as usize;
        if params.embedding.len() != expected {
            return Err(format!(
                "Embedding dimension mismatch: expected {}, got {}",
                expected,
                params.embedding.len()
            ));
        }
    }

    let scoped = params.meeting_ids.as_ref().map_or(false, |ids| !ids.is_empty());

    // Build a set of allowed meeting IDs for fast lookup during scoped search
    let allowed_meeting_ids: std::collections::HashSet<&str> = if scoped {
        params.meeting_ids.as_ref().unwrap().iter().map(|s| s.as_str()).collect()
    } else {
        std::collections::HashSet::new()
    };

    let mut chunk_scores: HashMap<i64, f64> = HashMap::new();

    // Vector KNN search
    // sqlite-vec virtual tables don't support compound WHERE, so we over-fetch
    // and post-filter by meeting_id when scoped.
    if mode == "hybrid" || mode == "vector" {
        let embedding_bytes = floats_to_bytes(&params.embedding);
        let vec_fetch = if scoped { fetch_limit * 3 } else { fetch_limit };
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
                rusqlite::params![embedding_bytes, vec_fetch as i64],
                |row| {
                    let chunk_id: i64 = row.get(0)?;
                    let distance: f64 = row.get(1)?;
                    Ok((chunk_id, distance))
                },
            )
            .map_err(|e| format!("vec search query: {}", e))?;

        if scoped {
            // Post-filter: look up meeting_id for each chunk, keep only allowed
            let mut rank = 0usize;
            for row in rows {
                if let Ok((chunk_id, _distance)) = row {
                    let mid: Result<String, _> = conn.query_row(
                        "SELECT meeting_id FROM chunks WHERE id = ?1",
                        [chunk_id],
                        |r| r.get(0),
                    );
                    if let Ok(mid) = mid {
                        if allowed_meeting_ids.contains(mid.as_str()) {
                            *chunk_scores.entry(chunk_id).or_default() +=
                                1.0 / (RRF_K + rank as f64 + 1.0);
                            rank += 1;
                        }
                    }
                }
            }
        } else {
            for (rank, row) in rows.enumerate() {
                if let Ok((chunk_id, _distance)) = row {
                    *chunk_scores.entry(chunk_id).or_default() +=
                        1.0 / (RRF_K + rank as f64 + 1.0);
                }
            }
        }
    }

    // FTS5 full-text search
    if mode == "hybrid" || mode == "fulltext" {
        let fts_query = sanitize_fts_query(&params.query_text);
        if !fts_query.is_empty() {
            if scoped {
                // Scoped: JOIN with chunks to filter by meeting_id
                let placeholders: String = allowed_meeting_ids
                    .iter()
                    .map(|_| "?")
                    .collect::<Vec<_>>()
                    .join(",");
                let sql = format!(
                    "SELECT f.rowid, f.rank
                     FROM chunks_fts f
                     JOIN chunks c ON c.id = f.rowid
                     WHERE f.chunks_fts MATCH ?1
                       AND c.meeting_id IN ({})
                     ORDER BY f.rank
                     LIMIT ?2",
                    placeholders
                );
                let mut stmt = conn.prepare(&sql)
                    .map_err(|e| format!("fts scoped search prepare: {}", e))?;

                // Build params: [fts_query, ...meeting_ids, fetch_limit]
                let meeting_ids_vec: Vec<&str> = allowed_meeting_ids.iter().copied().collect();
                let mut sql_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
                sql_params.push(Box::new(fts_query.clone()));
                for mid in &meeting_ids_vec {
                    sql_params.push(Box::new(mid.to_string()));
                }
                sql_params.push(Box::new(fetch_limit as i64));

                let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                    sql_params.iter().map(|p| p.as_ref()).collect();

                let rows = stmt
                    .query_map(&*param_refs, |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?))
                    })
                    .map_err(|e| format!("fts scoped search query: {}", e))?;

                let mut rank = 0usize;
                for row in rows {
                    if let Ok((chunk_id, bm25_score)) = row {
                        if bm25_score > BM25_MIN_SCORE {
                            continue;
                        }
                        *chunk_scores.entry(chunk_id).or_default() +=
                            1.0 / (RRF_K + rank as f64 + 1.0);
                        rank += 1;
                    }
                }
            } else {
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
                        let bm25_score: f64 = row.get(1)?;
                        Ok((rowid, bm25_score))
                    })
                    .map_err(|e| format!("fts search query: {}", e))?;

                // Only include FTS results with meaningful BM25 scores in RRF.
                let mut rank = 0usize;
                for row in rows {
                    if let Ok((chunk_id, bm25_score)) = row {
                        if bm25_score > BM25_MIN_SCORE {
                            continue; // too weak — skip without incrementing rank
                        }
                        *chunk_scores.entry(chunk_id).or_default() +=
                            1.0 / (RRF_K + rank as f64 + 1.0);
                        rank += 1;
                    }
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

    if scoped {
        // Scoped mode: return top N chunks (multiple from same meeting)
        let mut results: Vec<SearchHit> = Vec::with_capacity(limit);
        for (chunk_id, score) in scored {
            if results.len() >= limit {
                break;
            }
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
                results.push(hit);
            }
        }
        Ok(results)
    } else {
        // Default mode: group by meeting (best chunk per meeting)
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
                        if hit.score > existing.score {
                            *existing = hit.clone();
                        }
                    })
                    .or_insert(hit);
            }

            if seen_meetings.len() >= limit {
                break;
            }
        }

        let mut results: Vec<SearchHit> = seen_meetings.into_values().collect();
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        Ok(results)
    }
}

// ── Chat Search ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatSearchParams {
    pub embedding: Vec<f32>,
    pub query_text: String,
    pub limit: usize,
    pub mode: Option<String>,
}

/// Hybrid search over chat chunks: KNN + FTS5, RRF-merged, grouped by session.
/// Mirrors hybrid_search() but queries chat_chunks + chat_vec_chunks + chat_sessions.
pub fn chat_hybrid_search(
    conn: &Connection,
    params: &ChatSearchParams,
) -> Result<Vec<crate::commands::ChatSearchHit>, String> {
    let limit = if params.limit == 0 { 5 } else { params.limit };
    let fetch_limit = limit * 3;
    let mode = params.mode.as_deref().unwrap_or("hybrid");

    if (mode == "hybrid" || mode == "vector") && !params.embedding.is_empty() {
        let expected = crate::schema::DEFAULT_DIM as usize;
        if params.embedding.len() != expected {
            return Err(format!(
                "Embedding dimension mismatch: expected {}, got {}",
                expected,
                params.embedding.len()
            ));
        }
    }

    let mut chunk_scores: HashMap<i64, f64> = HashMap::new();

    // Vector KNN on chat_vec_chunks
    if mode == "hybrid" || mode == "vector" {
        let embedding_bytes = floats_to_bytes(&params.embedding);
        let mut stmt = conn
            .prepare(
                "SELECT chunk_id, distance
                 FROM chat_vec_chunks
                 WHERE embedding MATCH ?1
                 ORDER BY distance
                 LIMIT ?2",
            )
            .map_err(|e| format!("chat vec search prepare: {}", e))?;

        let rows = stmt
            .query_map(
                rusqlite::params![embedding_bytes, fetch_limit as i64],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?)),
            )
            .map_err(|e| format!("chat vec search query: {}", e))?;

        for (rank, row) in rows.enumerate() {
            if let Ok((chunk_id, _)) = row {
                *chunk_scores.entry(chunk_id).or_default() +=
                    1.0 / (RRF_K + rank as f64 + 1.0);
            }
        }
    }

    // FTS5 on chat_chunks_fts
    if mode == "hybrid" || mode == "fulltext" {
        let fts_query = sanitize_fts_query(&params.query_text);
        if !fts_query.is_empty() {
            let mut stmt = conn
                .prepare(
                    "SELECT rowid, rank
                     FROM chat_chunks_fts
                     WHERE chat_chunks_fts MATCH ?1
                     ORDER BY rank
                     LIMIT ?2",
                )
                .map_err(|e| format!("chat fts search prepare: {}", e))?;

            let rows = stmt
                .query_map(
                    rusqlite::params![fts_query, fetch_limit as i64],
                    |row| Ok((row.get::<_, i64>(0)?, row.get::<_, f64>(1)?)),
                )
                .map_err(|e| format!("chat fts search query: {}", e))?;

            let mut rank = 0usize;
            for row in rows {
                if let Ok((chunk_id, bm25_score)) = row {
                    if bm25_score > BM25_MIN_SCORE {
                        continue; // too weak — skip without incrementing rank
                    }
                    *chunk_scores.entry(chunk_id).or_default() +=
                        1.0 / (RRF_K + rank as f64 + 1.0);
                    rank += 1;
                }
            }
        }
    }

    if chunk_scores.is_empty() {
        return Ok(vec![]);
    }

    let mut scored: Vec<(i64, f64)> = chunk_scores.into_iter().collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut seen_sessions: HashMap<String, crate::commands::ChatSearchHit> = HashMap::new();

    for (chunk_id, score) in scored {
        let result = conn.query_row(
            "SELECT c.session_id, c.chunk_text, c.chunk_type, cs.title, cs.last_message_at
             FROM chat_chunks c
             JOIN chat_sessions cs ON cs.id = c.session_id
             WHERE c.id = ?1",
            [chunk_id],
            |row| {
                Ok(crate::commands::ChatSearchHit {
                    session_id: row.get(0)?,
                    chunk_text: row.get(1)?,
                    chunk_type: row.get(2)?,
                    session_title: row.get(3)?,
                    last_message_at: row.get(4)?,
                    score,
                })
            },
        );

        if let Ok(hit) = result {
            seen_sessions
                .entry(hit.session_id.clone())
                .and_modify(|existing| {
                    if hit.score > existing.score {
                        *existing = hit.clone();
                    }
                })
                .or_insert(hit);
        }

        if seen_sessions.len() >= limit {
            break;
        }
    }

    let mut results: Vec<crate::commands::ChatSearchHit> =
        seen_sessions.into_values().collect();
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);
    Ok(results)
}

/// Convert f32 slice to little-endian bytes for sqlite-vec.
fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    floats.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Sanitize a query string for FTS5 MATCH.
/// Strips FTS5 operators while preserving word-internal punctuation (apostrophes, hyphens).
/// Wraps each term in quotes for exact matching.
fn sanitize_fts_query(query: &str) -> String {
    // Keep: alphanumeric, whitespace, apostrophes, hyphens (within words)
    // Strip: FTS5 operators (* " ( ) + ^ : etc.)
    let cleaned: String = query
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '\'' || *c == '-')
        .collect();

    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // Split into words and wrap each in quotes for exact matching
    let words: Vec<&str> = trimmed.split_whitespace().collect();
    if words.len() == 1 {
        return format!("\"{}\"", words[0]);
    }

    // Use AND so all terms must be present
    words
        .iter()
        .map(|w| format!("\"{}\"", w))
        .collect::<Vec<_>>()
        .join(" AND ")
}
