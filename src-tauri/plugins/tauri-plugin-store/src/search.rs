//! Hybrid search over the one search index (`chunks`): BM25 keyword matches (FTS5) and nearest vectors (sqlite-vec), fused by
//! Reciprocal Rank Fusion in one query, for one kind of owner (`meeting`, `chat`, …). Ranking happens in SQL; Rust keeps the
//! best piece per owner. Every call runs on the store's one connection, so a search never sees half a write.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// A meeting piece as search returns it (the webview's `MeetingHit`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub meeting_id: String,
    pub meeting_title: String,
    pub chunk_text: String,
    pub chunk_type: String,
    pub score: f64,
    pub created_at: i64,
}

/// What to search: one kind of owner, the words, the query's vector (none: keywords only), how many owners to return, and
/// optionally only these owners (then every matching piece of theirs, not just the best).
pub struct SearchQuery<'a> {
    pub kind: &'a str,
    pub text: &'a str,
    pub embedding: Option<&'a [f32]>,
    pub limit: usize,
    pub within: Option<&'a [String]>,
}

/// One matching piece, best first.
#[derive(Debug, Clone)]
pub struct ChunkHit {
    pub owner_id: String,
    pub chunk_text: String,
    pub chunk_type: String,
    pub score: f64,
}

/// RRF's smoothing constant (60 is the standard).
const RRF_K: f64 = 60.0;
/// BM25 cutoff (FTS5 ranks are negative, lower is better): a match near 0 only shares common words.
const BM25_MAX_RANK: f64 = -0.5;
/// Each leg fetches this many times the owners asked for, so fusion has room to agree.
const OVERFETCH: usize = 3;

/// Keyword leg: BM25 order within the owner kind (and owners), weak matches dropped.
const KEYWORD_LEG: &str = "
    SELECT f.rowid AS chunk_id, row_number() OVER (ORDER BY f.rank) AS rank
    FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
    WHERE chunks_fts MATCH :words AND c.owner_kind = :kind AND f.rank <= :bm25_max
      AND (:within IS NULL OR c.owner_id IN (SELECT value FROM json_each(:within)))
    ORDER BY f.rank LIMIT :fetch";

/// Vector leg over every owner of the kind: sqlite-vec's KNN, within the kind's partition.
const VECTOR_LEG: &str = "
    SELECT chunk_id, row_number() OVER (ORDER BY distance) AS rank
    FROM vec_chunks
    WHERE embedding MATCH :vector AND k = :fetch AND owner_kind = :kind";

/// Vector leg within some owners: exact distance over just their pieces (few, so cheap; KNN can't filter by owner).
const VECTOR_LEG_WITHIN: &str = "
    SELECT v.chunk_id, row_number() OVER (ORDER BY vec_distance_l2(v.embedding, :vector)) AS rank
    FROM chunks c JOIN vec_chunks v ON v.chunk_id = c.id
    WHERE c.owner_kind = :kind AND c.owner_id IN (SELECT value FROM json_each(:within))
    ORDER BY vec_distance_l2(v.embedding, :vector) LIMIT :fetch";

/// The fused query: the legs given, each piece scored Σ 1 / (RRF_K + rank), best first.
fn fused(legs: &[&str]) -> String {
    let ctes: Vec<String> = legs.iter().enumerate().map(|(i, leg)| format!("leg{i} AS ({leg})")).collect();
    let union: Vec<String> = (0..legs.len()).map(|i| format!("SELECT chunk_id, rank FROM leg{i}")).collect();
    format!(
        "WITH {}
         SELECT c.owner_id, c.chunk_text, c.chunk_type, s.score
         FROM (SELECT chunk_id, SUM(1.0 / (:rrf_k + rank)) AS score FROM ({}) GROUP BY chunk_id) s
         JOIN chunks c ON c.id = s.chunk_id
         ORDER BY s.score DESC",
        ctes.join(",\n"),
        union.join(" UNION ALL ")
    )
}

/// Each term quoted for FTS5 (operators stripped, in-word apostrophes and hyphens kept), all required.
fn fts_words(query: &str) -> String {
    let cleaned: String = query.chars().filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '\'' || *c == '-').collect();
    cleaned.split_whitespace().map(|w| format!("\"{w}\"")).collect::<Vec<_>>().join(" AND ")
}

/// A vector as sqlite-vec stores it: little-endian f32s.
pub(crate) fn vector_bytes(vector: &[f32]) -> Vec<u8> {
    vector.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// The best owners' pieces (one per owner), or every piece of the owners searched `within`, best first.
pub fn hybrid_search(conn: &Connection, q: &SearchQuery) -> Result<Vec<ChunkHit>, String> {
    if let Some(vector) = q.embedding {
        if vector.len() != crate::schema::DEFAULT_DIM as usize {
            return Err(format!("Embedding dimension mismatch: expected {}, got {}", crate::schema::DEFAULT_DIM, vector.len()));
        }
    }
    let words = fts_words(q.text);
    let mut legs = Vec::new();
    if !words.is_empty() {
        legs.push(KEYWORD_LEG);
    }
    if q.embedding.is_some() {
        legs.push(if q.within.is_some() { VECTOR_LEG_WITHIN } else { VECTOR_LEG });
    }
    if legs.is_empty() {
        return Ok(vec![]);
    }
    let sql = fused(&legs);
    let within = q.within.map(|ids| serde_json::to_string(ids)).transpose().map_err(|e| e.to_string())?;
    let vector = q.embedding.map(vector_bytes);
    let fetch = (q.limit * OVERFETCH) as i64;
    let named: Vec<(&str, &dyn rusqlite::ToSql)> = vec![
        (":words", &words),
        (":kind", &q.kind),
        (":bm25_max", &BM25_MAX_RANK),
        (":within", &within),
        (":fetch", &fetch),
        (":vector", &vector),
        (":rrf_k", &RRF_K),
    ];
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("search prepare: {e}"))?;
    // Only the parameters this query's legs use.
    let params: Vec<(&str, &dyn rusqlite::ToSql)> = named.into_iter().filter(|(name, _)| sql.contains(name)).collect();
    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok(ChunkHit { owner_id: row.get(0)?, chunk_text: row.get(1)?, chunk_type: row.get(2)?, score: row.get(3)? })
        })
        .map_err(|e| format!("search: {e}"))?;
    let ranked = rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("search row: {e}"))?;
    Ok(if q.within.is_some() { ranked.into_iter().take(q.limit).collect() } else { best_per_owner(ranked, q.limit) })
}

/// The first (best) piece of each owner, up to `limit` owners.
fn best_per_owner(ranked: Vec<ChunkHit>, limit: usize) -> Vec<ChunkHit> {
    let mut seen = HashSet::new();
    ranked.into_iter().filter(|hit| seen.insert(hit.owner_id.clone())).take(limit).collect()
}
