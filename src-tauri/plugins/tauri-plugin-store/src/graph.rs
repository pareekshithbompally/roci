use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Data Types ──

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub name: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    #[serde(rename = "type")]
    pub edge_type: String,
    pub properties: Option<serde_json::Value>,
    pub meeting_id: String,
    pub created_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TraversalParams {
    pub start_node_id: String,
    pub edge_types: Option<Vec<String>>,
    pub target_node_types: Option<Vec<String>>,
    pub max_depth: u32,
    pub direction: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TraversalResult {
    pub node: GraphNode,
    pub path_depth: u32,
    pub via_edge_type: String,
    pub via_meeting_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphSearchParams {
    pub query: String,
    pub node_types: Option<Vec<String>>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GraphStats {
    pub total_nodes: i64,
    pub total_edges: i64,
    pub nodes_by_type: HashMap<String, i64>,
    pub edges_by_type: HashMap<String, i64>,
}

// ── Helpers ──

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

/// Validate that filter values only contain safe characters (alphanumeric, underscore, hyphen).
fn validate_filter_value(value: &str) -> Result<(), String> {
    if value.is_empty() || !value.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(format!("Invalid filter value: '{}'", value));
    }
    Ok(())
}

// ── Core Functions ──

/// Upsert nodes and edges for a meeting.
/// Deletes all existing edges from this meeting first (idempotent re-extraction).
pub fn upsert_meeting_graph(
    conn: &Connection,
    meeting_id: &str,
    nodes: &[GraphNode],
    edges: &[GraphEdge],
) -> Result<(), String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin transaction: {}", e))?;

    // 1. Delete existing edges from this meeting (re-extraction replaces)
    tx.execute("DELETE FROM kg_edges WHERE meeting_id = ?1", params![meeting_id])
        .map_err(|e| format!("delete old edges: {}", e))?;

    // 2. Upsert nodes (ON CONFLICT update name/properties if changed)
    {
        let mut node_stmt = tx
            .prepare(
                "INSERT INTO kg_nodes (id, type, name, name_lower, properties, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     name_lower = excluded.name_lower,
                     properties = excluded.properties,
                     updated_at = excluded.updated_at",
            )
            .map_err(|e| format!("prepare node upsert: {}", e))?;

        let now = now_millis();
        for node in nodes {
            let props = serde_json::to_string(&node.properties)
                .map_err(|e| format!("serialize node properties: {}", e))?;
            node_stmt
                .execute(params![
                    node.id,
                    node.node_type,
                    node.name,
                    node.name.to_lowercase(),
                    props,
                    now,
                ])
                .map_err(|e| format!("upsert node '{}': {}", node.id, e))?;
        }
    }

    // 3. Insert edges
    {
        let mut edge_stmt = tx
            .prepare(
                "INSERT OR IGNORE INTO kg_edges (id, source_id, target_id, type, properties, meeting_id, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| format!("prepare edge insert: {}", e))?;

        let now = now_millis();
        for edge in edges {
            let props = edge
                .properties
                .as_ref()
                .map(|p| serde_json::to_string(p).ok())
                .flatten();
            edge_stmt
                .execute(params![
                    edge.id,
                    edge.source_id,
                    edge.target_id,
                    edge.edge_type,
                    props,
                    meeting_id,
                    now,
                ])
                .map_err(|e| format!("insert edge '{}': {}", edge.id, e))?;
        }
    }

    // 4. Prune orphan nodes
    prune_orphan_nodes(&tx)?;

    tx.commit()
        .map_err(|e| format!("commit upsert_meeting_graph: {}", e))?;

    log::info!(
        "[store] Graph upserted for meeting {}: {} nodes, {} edges",
        meeting_id,
        nodes.len(),
        edges.len()
    );
    Ok(())
}

/// Traverse the graph from a start node using recursive CTE.
pub fn traverse(
    conn: &Connection,
    params: &TraversalParams,
) -> Result<Vec<TraversalResult>, String> {
    let direction = params.direction.as_deref().unwrap_or("both");
    let limit = params.limit.unwrap_or(50);
    const MAX_TRAVERSAL_DEPTH: u32 = 10;
    let max_depth = params.max_depth.min(MAX_TRAVERSAL_DEPTH);

    // Validate filter values before building SQL
    if let Some(types) = &params.edge_types {
        for t in types { validate_filter_value(t)?; }
    }
    if let Some(types) = &params.target_node_types {
        for t in types { validate_filter_value(t)?; }
    }

    let direction_clause = match direction {
        "outgoing" => "e.source_id = r.node_id",
        "incoming" => "e.target_id = r.node_id",
        _ => "(e.source_id = r.node_id OR e.target_id = r.node_id)",
    };

    // Build edge_type filter
    let edge_filter = match &params.edge_types {
        Some(types) if !types.is_empty() => {
            let placeholders: Vec<String> = types.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect();
            format!("AND e.type IN ({})", placeholders.join(","))
        }
        _ => String::new(),
    };

    // Build node_type filter
    let node_type_filter = match &params.target_node_types {
        Some(types) if !types.is_empty() => {
            let placeholders: Vec<String> = types.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect();
            format!("AND n.type IN ({})", placeholders.join(","))
        }
        _ => String::new(),
    };

    let sql = format!(
        "WITH RECURSIVE reachable(node_id, depth, via_edge_type, via_meeting_id) AS (
            SELECT ?1, 0, '', ''
            UNION ALL
            SELECT
                CASE WHEN e.source_id = r.node_id THEN e.target_id ELSE e.source_id END,
                r.depth + 1,
                e.type,
                e.meeting_id
            FROM kg_edges e
            JOIN reachable r ON ({direction_clause})
            WHERE r.depth < ?2 {edge_filter}
        )
        SELECT DISTINCT n.id, n.type, n.name, n.properties, r.depth, r.via_edge_type, r.via_meeting_id
        FROM reachable r
        JOIN kg_nodes n ON r.node_id = n.id
        WHERE r.depth > 0
        {node_type_filter}
        ORDER BY r.depth ASC
        LIMIT ?3",
        direction_clause = direction_clause,
        edge_filter = edge_filter,
        node_type_filter = node_type_filter,
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare traverse: {}", e))?;
    let results = stmt
        .query_map(
            params![params.start_node_id, max_depth, limit as i64],
            |row| {
                let props_str: String = row.get(3)?;
                let properties: serde_json::Value =
                    serde_json::from_str(&props_str).unwrap_or(serde_json::Value::Object(Default::default()));
                Ok(TraversalResult {
                    node: GraphNode {
                        id: row.get(0)?,
                        node_type: row.get(1)?,
                        name: row.get(2)?,
                        properties,
                    },
                    path_depth: row.get::<_, u32>(4)?,
                    via_edge_type: row.get(5)?,
                    via_meeting_id: row.get(6)?,
                })
            },
        )
        .map_err(|e| format!("query traverse: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

/// Find direct neighbors of a node (depth=1 shortcut).
pub fn neighbors(
    conn: &Connection,
    node_id: &str,
    edge_types: Option<&[String]>,
    direction: &str,
) -> Result<Vec<TraversalResult>, String> {
    let params = TraversalParams {
        start_node_id: node_id.to_string(),
        edge_types: edge_types.map(|t| t.to_vec()),
        target_node_types: None,
        max_depth: 1,
        direction: Some(direction.to_string()),
        limit: None,
    };
    traverse(conn, &params)
}

/// Search nodes by name (case-insensitive LIKE match).
pub fn search_nodes(
    conn: &Connection,
    params: &GraphSearchParams,
) -> Result<Vec<GraphNode>, String> {
    let limit = params.limit.unwrap_or(20);
    let query_lower = params.query.to_lowercase();
    let like_pattern = format!("%{}%", query_lower);

    // Validate filter values
    if let Some(types) = &params.node_types {
        for t in types { validate_filter_value(t)?; }
    }

    // Build node_type filter
    let type_filter = match &params.node_types {
        Some(types) if !types.is_empty() => {
            let placeholders: Vec<String> = types.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect();
            format!("AND type IN ({})", placeholders.join(","))
        }
        _ => String::new(),
    };

    let sql = format!(
        "SELECT id, type, name, properties FROM kg_nodes
         WHERE name_lower LIKE ?1 {type_filter}
         ORDER BY name ASC
         LIMIT ?2",
        type_filter = type_filter,
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare search: {}", e))?;
    let results = stmt
        .query_map(params![like_pattern, limit as i64], |row| {
            let props_str: String = row.get(3)?;
            let properties: serde_json::Value =
                serde_json::from_str(&props_str).unwrap_or(serde_json::Value::Object(Default::default()));
            Ok(GraphNode {
                id: row.get(0)?,
                node_type: row.get(1)?,
                name: row.get(2)?,
                properties,
            })
        })
        .map_err(|e| format!("query search: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(results)
}

/// Delete all graph data for a meeting (edges by meeting_id, then prune orphan nodes).
pub fn delete_meeting_graph(
    conn: &Connection,
    meeting_id: &str,
) -> Result<(), String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("begin transaction: {}", e))?;

    tx.execute("DELETE FROM kg_edges WHERE meeting_id = ?1", params![meeting_id])
        .map_err(|e| format!("delete edges: {}", e))?;

    // Explicitly delete the meeting node (not covered by prune_orphan_nodes which skips meeting-type nodes)
    let meeting_node_id = format!("meeting:{}", meeting_id);
    tx.execute("DELETE FROM kg_nodes WHERE id = ?1", params![meeting_node_id])
        .map_err(|e| format!("delete meeting node: {}", e))?;

    prune_orphan_nodes(&tx)?;

    tx.commit()
        .map_err(|e| format!("commit delete_meeting_graph: {}", e))?;

    log::info!("[store] Deleted graph data for meeting {}", meeting_id);
    Ok(())
}

/// Get graph statistics.
pub fn stats(conn: &Connection) -> Result<GraphStats, String> {
    let total_nodes: i64 = conn
        .query_row("SELECT COUNT(*) FROM kg_nodes", [], |row| row.get(0))
        .unwrap_or(0);
    let total_edges: i64 = conn
        .query_row("SELECT COUNT(*) FROM kg_edges", [], |row| row.get(0))
        .unwrap_or(0);

    let mut nodes_by_type = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT type, COUNT(*) FROM kg_nodes GROUP BY type")
            .map_err(|e| format!("prepare nodes_by_type: {}", e))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| format!("query nodes_by_type: {}", e))?;
        for row in rows.flatten() {
            nodes_by_type.insert(row.0, row.1);
        }
    }

    let mut edges_by_type = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT type, COUNT(*) FROM kg_edges GROUP BY type")
            .map_err(|e| format!("prepare edges_by_type: {}", e))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| format!("query edges_by_type: {}", e))?;
        for row in rows.flatten() {
            edges_by_type.insert(row.0, row.1);
        }
    }

    Ok(GraphStats {
        total_nodes,
        total_edges,
        nodes_by_type,
        edges_by_type,
    })
}

/// Prune nodes with zero edges (orphans).
/// Meeting nodes are preserved — they are anchors even without edges.
fn prune_orphan_nodes(conn: &Connection) -> Result<u64, String> {
    let deleted = conn
        .execute(
            "DELETE FROM kg_nodes WHERE type != 'meeting' AND id NOT IN (
                SELECT source_id FROM kg_edges
                UNION
                SELECT target_id FROM kg_edges
            )",
            [],
        )
        .map_err(|e| format!("prune orphans: {}", e))?;

    if deleted > 0 {
        log::info!("[store] Pruned {} orphan nodes", deleted);
    }
    Ok(deleted as u64)
}
