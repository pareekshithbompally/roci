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

/// What to search: one kind of owner, the words, the query's vector (none: keywords only), how many to return; optionally
/// only these owners, or only files kept in the library (then every matching piece, not just each owner's best), and the
/// farthest a piece may be from the query and still match by meaning.
pub struct SearchQuery<'a> {
    pub kind: &'a str,
    pub text: &'a str,
    pub embedding: Option<&'a [f32]>,
    pub limit: usize,
    pub within: Option<&'a [String]>,
    pub library: bool,
    pub max_distance: Option<f64>,
}

impl<'a> SearchQuery<'a> {
    /// The best piece of each owner of `kind`, at any distance.
    pub fn owners(kind: &'a str, text: &'a str, embedding: Option<&'a [f32]>, limit: usize) -> Self {
        Self { kind, text, embedding, limit, within: None, library: false, max_distance: None }
    }

    /// Every matching piece, not just each owner's best.
    fn passages(&self) -> bool {
        self.within.is_some() || self.library
    }
}

/// One matching piece, best first.
#[derive(Debug, Clone)]
pub struct ChunkHit {
    pub owner_id: String,
    pub chunk_text: String,
    pub chunk_type: String,
    pub score: f64,
    /// The page it is on (a document's), when it has one.
    pub page: Option<i32>,
}

/// RRF's smoothing constant (60 is the standard).
const RRF_K: f64 = 60.0;
/// BM25 cutoff (FTS5 ranks are negative, lower is better): a match near 0 only shares common words. Applied only beside the
/// vector leg — alone, keywords are all there is, and in a small library every rank sits near 0.
const BM25_MAX_RANK: f64 = -0.5;
/// Most owners one search returns (sqlite-vec's KNN takes at most 4096, after overfetch).
const MAX_LIMIT: usize = 1000;
/// Each leg fetches this many times the owners asked for, so fusion has room to agree.
const OVERFETCH: usize = 3;

/// Keyword leg: BM25 order within the owner kind (and owners, or the library), weak matches dropped.
fn keyword_leg(q: &SearchQuery) -> String {
    let library = if q.library { "AND EXISTS (SELECT 1 FROM assets a WHERE a.id = c.owner_id AND a.kept = 1)" } else { "" };
    format!(
        "SELECT f.rowid AS chunk_id, row_number() OVER (ORDER BY f.rank) AS rank
         FROM chunks_fts f JOIN chunks c ON c.id = f.rowid
         WHERE chunks_fts MATCH :words AND c.owner_kind = :kind AND f.rank <= :bm25_max
           AND (:within IS NULL OR c.owner_id IN (SELECT value FROM json_each(:within))) {library}
         ORDER BY f.rank LIMIT :fetch"
    )
}

/// Vector leg: sqlite-vec's KNN within the kind's partition (the library's files only, when asked, inside the KNN); or,
/// within some owners, exact distance over just their pieces (few, so cheap). A floor drops what isn't close enough.
fn vector_leg(q: &SearchQuery) -> String {
    let near = if q.max_distance.is_some() { "AND distance <= :max_distance" } else { "" };
    if q.within.is_some() {
        let near = if q.max_distance.is_some() { "AND vec_distance_l2(v.embedding, :vector) <= :max_distance" } else { "" };
        return format!(
            "SELECT v.chunk_id, row_number() OVER (ORDER BY vec_distance_l2(v.embedding, :vector)) AS rank
             FROM chunks c JOIN vec_chunks v ON v.chunk_id = c.id
             WHERE c.owner_kind = :kind AND c.owner_id IN (SELECT value FROM json_each(:within)) {near}
             ORDER BY vec_distance_l2(v.embedding, :vector) LIMIT :fetch"
        );
    }
    let library = if q.library { "AND kept = 1" } else { "" };
    format!(
        "SELECT chunk_id, row_number() OVER (ORDER BY distance) AS rank
         FROM vec_chunks
         WHERE embedding MATCH :vector AND k = :fetch AND owner_kind = :kind {library} {near}"
    )
}

/// The fused query: the legs given, each piece scored Σ 1 / (RRF_K + rank), best first.
fn fused(legs: &[String]) -> String {
    let ctes: Vec<String> = legs.iter().enumerate().map(|(i, leg)| format!("leg{i} AS ({leg})")).collect();
    let union: Vec<String> = (0..legs.len()).map(|i| format!("SELECT chunk_id, rank FROM leg{i}")).collect();
    format!(
        "WITH {}
         SELECT c.owner_id, c.chunk_text, c.chunk_type, s.score, c.page
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
        legs.push(keyword_leg(q));
    }
    if q.embedding.is_some() {
        legs.push(vector_leg(q));
    }
    if legs.is_empty() {
        return Ok(vec![]);
    }
    let sql = fused(&legs);
    let within = q.within.map(|ids| serde_json::to_string(ids)).transpose().map_err(|e| e.to_string())?;
    let vector = q.embedding.map(vector_bytes);
    let fetch = (q.limit.clamp(1, MAX_LIMIT) * OVERFETCH) as i64;
    let bm25_max = if q.embedding.is_some() { BM25_MAX_RANK } else { f64::MAX };
    let named: Vec<(&str, &dyn rusqlite::ToSql)> = vec![
        (":words", &words),
        (":kind", &q.kind),
        (":bm25_max", &bm25_max),
        (":within", &within),
        (":fetch", &fetch),
        (":vector", &vector),
        (":rrf_k", &RRF_K),
        (":max_distance", &q.max_distance),
    ];
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("search prepare: {e}"))?;
    // Only the parameters this query's legs use.
    let params: Vec<(&str, &dyn rusqlite::ToSql)> = named.into_iter().filter(|(name, _)| sql.contains(name)).collect();
    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok(ChunkHit { owner_id: row.get(0)?, chunk_text: row.get(1)?, chunk_type: row.get(2)?, score: row.get(3)?, page: row.get(4)? })
        })
        .map_err(|e| format!("search: {e}"))?;
    let ranked = rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("search row: {e}"))?;
    Ok(if q.passages() { ranked.into_iter().take(q.limit).collect() } else { best_per_owner(ranked, q.limit) })
}

/// The first (best) piece of each owner, up to `limit` owners.
fn best_per_owner(ranked: Vec<ChunkHit>, limit: usize) -> Vec<ChunkHit> {
    let mut seen = HashSet::new();
    ranked.into_iter().filter(|hit| seen.insert(hit.owner_id.clone())).take(limit).collect()
}
