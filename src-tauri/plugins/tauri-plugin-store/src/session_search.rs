//! The in-app search over meetings and chats (⌘K palette, iPhone sidebar): title LIKE, then FTS5 snippets; no embeddings.
//! Not macOS Spotlight, which Roci feeds separately (url_actions, the Spotlight integration).

use rusqlite::{params_from_iter, types::Value, Connection};
use serde::{Deserialize, Serialize};

/// One in-app search result (a meeting or chat, by title or by content).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSearchHit {
    /// "meeting" or "chat"
    pub source_type: String,
    /// Meeting ID or chat session ID
    pub source_id: String,
    /// Meeting title or chat session title
    pub title: String,
    /// Excerpt with <<MARK>> / <</MARK>> around matched terms; empty for title-only matches.
    pub excerpt: String,
    /// Unix timestamp in milliseconds (meeting.created_at or chat.last_message_at)
    pub timestamp: i64,
    /// "title" or "content" — where the match was found
    pub match_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionSearchParams {
    pub query: String,
    /// Max results per source (meetings, chats). Total results ≤ limit × 2.
    pub limit: usize,
}

/// snippet() markers the frontend replaces with <mark> tags.
pub const MARK_OPEN: &str = "<<MARK>>";
pub const MARK_CLOSE: &str = "<</MARK>>";

/// snippet() window: 32 tokens ≈ 3–4 sentences.
const SNIPPET_TOKENS: i32 = 32;

/// Title LIKE matches then FTS5 content matches, deduplicated per source.
pub fn search_sessions(
    conn: &Connection,
    params: &SessionSearchParams,
) -> Result<Vec<SessionSearchHit>, String> {
    let limit = if params.limit == 0 { 6 } else { params.limit };
    let mut hits: Vec<SessionSearchHit> = Vec::new();

    // ── Tier 0: Title LIKE matches ──────────────────────────────────────────
    let title_tokens = extract_search_terms(&params.query);

    if !title_tokens.is_empty() {
        let meeting_title_sql = format!(
            "SELECT id, title, created_at
             FROM meetings
             WHERE {}
             ORDER BY created_at DESC
             LIMIT ?{}",
            build_title_like_where("lower(title)", title_tokens.len()),
            title_tokens.len() + 1,
        );

        let mut stmt = conn
            .prepare(&meeting_title_sql)
            .map_err(|e| format!("session search meetings title prepare: {}", e))?;

        let mut query_params: Vec<Value> = title_tokens
            .iter()
            .map(|token| Value::from(format!("%{}%", token)))
            .collect();
        query_params.push(Value::from(limit as i64));

        let rows = stmt
            .query_map(params_from_iter(query_params), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| format!("session search meetings title query: {}", e))?;

        for row in rows.filter_map(|r| r.ok()) {
            hits.push(SessionSearchHit {
                source_type: "meeting".to_string(),
                source_id: row.0,
                title: row.1,
                excerpt: String::new(),
                timestamp: row.2,
                match_type: "title".to_string(),
            });
        }

        let chat_title_sql = format!(
            "SELECT id, title, last_message_at
             FROM chats
             WHERE {}
             ORDER BY last_message_at DESC
             LIMIT ?{}",
            build_title_like_where("lower(title)", title_tokens.len()),
            title_tokens.len() + 1,
        );

        let mut stmt = conn
            .prepare(&chat_title_sql)
            .map_err(|e| format!("session search chat sessions title prepare: {}", e))?;

        let mut query_params: Vec<Value> = title_tokens
            .iter()
            .map(|token| Value::from(format!("%{}%", token)))
            .collect();
        query_params.push(Value::from(limit as i64));

        let rows = stmt
            .query_map(params_from_iter(query_params), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| format!("session search chat sessions title query: {}", e))?;

        for row in rows.filter_map(|r| r.ok()) {
            hits.push(SessionSearchHit {
                source_type: "chat".to_string(),
                source_id: row.0,
                title: row.1,
                excerpt: String::new(),
                timestamp: row.2,
                match_type: "title".to_string(),
            });
        }
    }

    // ── Tier 1: FTS5 content matches with snippet() ─────────────────────────
    let fts_query = build_session_fts_query(&params.query);
    if !fts_query.is_empty() {
        // Meeting content
        {
            let mut stmt = conn
                .prepare(
                    "SELECT
                         c.owner_id,
                         m.title,
                         m.created_at,
                         snippet(chunks_fts, 0, ?1, ?2, '...', ?3) as excerpt
                     FROM chunks_fts
                     JOIN chunks c ON c.id = chunks_fts.rowid AND c.owner_kind = 'meeting'
                     JOIN meetings m ON m.id = c.owner_id
                     WHERE chunks_fts MATCH ?4
                     ORDER BY rank
                     LIMIT ?5",
                )
                .map_err(|e| format!("session search meeting content prepare: {}", e))?;

            let rows = stmt
                .query_map(
                    rusqlite::params![MARK_OPEN, MARK_CLOSE, SNIPPET_TOKENS, fts_query, limit as i64],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, i64>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    },
                )
                .map_err(|e| format!("session search meeting content query: {}", e))?;

            for row in rows.filter_map(|r| r.ok()) {
                hits.push(SessionSearchHit {
                    source_type: "meeting".to_string(),
                    source_id: row.0,
                    title: row.1,
                    timestamp: row.2,
                    excerpt: row.3,
                    match_type: "content".to_string(),
                });
            }
        }

        // Chat content
        {
            let mut stmt = conn
                .prepare(
                    "SELECT
                         c.owner_id,
                         cs.title,
                         cs.last_message_at,
                         snippet(chunks_fts, 0, ?1, ?2, '...', ?3) as excerpt
                     FROM chunks_fts
                     JOIN chunks c ON c.id = chunks_fts.rowid AND c.owner_kind = 'chat'
                     JOIN chats cs ON cs.id = c.owner_id
                     WHERE chunks_fts MATCH ?4
                     ORDER BY rank
                     LIMIT ?5",
                )
                .map_err(|e| format!("session search chat content prepare: {}", e))?;

            let rows = stmt
                .query_map(
                    rusqlite::params![MARK_OPEN, MARK_CLOSE, SNIPPET_TOKENS, fts_query, limit as i64],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, i64>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    },
                )
                .map_err(|e| format!("session search chat content query: {}", e))?;

            for row in rows.filter_map(|r| r.ok()) {
                hits.push(SessionSearchHit {
                    source_type: "chat".to_string(),
                    source_id: row.0,
                    title: row.1,
                    timestamp: row.2,
                    excerpt: row.3,
                    match_type: "content".to_string(),
                });
            }
        }
    }

    // ── Dedup by (source_type, source_id) ───────────────────────────────────
    let deduped = dedup_session_hits(hits);
    Ok(deduped)
}

/// Search-as-you-type FTS5 query: "billing int" → `"billing" "int"*`; empty input → empty.
fn build_session_fts_query(query: &str) -> String {
    let words = extract_search_terms(query);
    if words.is_empty() {
        return String::new();
    }

    let mut parts: Vec<String> = words[..words.len() - 1]
        .iter()
        .map(|w| format!("\"{}\"", w))
        .collect();

    // Last word: prefix search for search-as-you-type
    parts.push(format!("\"{}\"*", words.last().unwrap()));

    parts.join(" ")
}

fn extract_search_terms(query: &str) -> Vec<String> {
    let cleaned: String = query
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '\'' || *c == '-')
        .collect();

    cleaned
        .split_whitespace()
        .map(|word| word.trim().to_lowercase())
        .filter(|word| !word.is_empty())
        .collect()
}

fn build_title_like_where(column: &str, token_count: usize) -> String {
    (0..token_count)
        .map(|idx| format!("{} LIKE ?{}", column, idx + 1))
        .collect::<Vec<_>>()
        .join(" AND ")
}

/// Dedups by source, keeping the first hit's position but taking a later duplicate's excerpt.
fn dedup_session_hits(hits: Vec<SessionSearchHit>) -> Vec<SessionSearchHit> {
    let mut seen: std::collections::HashMap<(String, String), usize> =
        std::collections::HashMap::new();
    let mut result: Vec<SessionSearchHit> = Vec::new();

    for hit in hits {
        let key = (hit.source_type.clone(), hit.source_id.clone());
        if let Some(&existing_idx) = seen.get(&key) {
            if let Some(existing) = result.get_mut(existing_idx) {
                let existing_has_excerpt = !existing.excerpt.is_empty();
                let incoming_has_excerpt = !hit.excerpt.is_empty();

                if incoming_has_excerpt && !existing_has_excerpt {
                    existing.excerpt = hit.excerpt;
                    existing.match_type = hit.match_type;
                }
            }
        } else {
            seen.insert(key, result.len());
            result.push(hit);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::{
        build_session_fts_query, build_title_like_where, dedup_session_hits,
        extract_search_terms, SessionSearchHit,
    };

    fn hit(source_id: &str, excerpt: &str, match_type: &str) -> SessionSearchHit {
        SessionSearchHit {
            source_type: "meeting".to_string(),
            source_id: source_id.to_string(),
            title: "Quarterly Planning".to_string(),
            excerpt: excerpt.to_string(),
            timestamp: 123,
            match_type: match_type.to_string(),
        }
    }

    #[test]
    fn dedup_merges_content_excerpt_into_existing_title_hit() {
        let deduped = dedup_session_hits(vec![
            hit("meeting-1", "", "title"),
            hit(
                "meeting-1",
                "...discussed <<MARK>>roadmap<</MARK>> milestones...",
                "content",
            ),
        ]);

        assert_eq!(deduped.len(), 1);
        assert_eq!(
            deduped[0].excerpt,
            "...discussed <<MARK>>roadmap<</MARK>> milestones..."
        );
        assert_eq!(deduped[0].match_type, "content");
    }

    #[test]
    fn dedup_keeps_existing_excerpt_when_duplicate_lacks_one() {
        let deduped = dedup_session_hits(vec![
            hit(
                "meeting-1",
                "...discussed <<MARK>>roadmap<</MARK>> milestones...",
                "content",
            ),
            hit("meeting-1", "", "title"),
        ]);

        assert_eq!(deduped.len(), 1);
        assert_eq!(
            deduped[0].excerpt,
            "...discussed <<MARK>>roadmap<</MARK>> milestones..."
        );
        assert_eq!(deduped[0].match_type, "content");
    }

    #[test]
    fn builds_prefix_fts_query_for_search_as_you_type() {
        assert_eq!(
            build_session_fts_query("billing int"),
            "\"billing\" \"int\"*"
        );
    }

    #[test]
    fn extracts_keyword_tokens_for_title_matching() {
        assert_eq!(
            extract_search_terms("  Wall Street   housing "),
            vec!["wall".to_string(), "street".to_string(), "housing".to_string()]
        );
    }

    #[test]
    fn builds_title_like_where_clause_for_all_keywords() {
        assert_eq!(
            build_title_like_where("lower(title)", 3),
            "lower(title) LIKE ?1 AND lower(title) LIKE ?2 AND lower(title) LIKE ?3"
        );
    }
}
