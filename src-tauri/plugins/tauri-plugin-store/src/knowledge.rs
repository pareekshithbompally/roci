//! The knowledge graph's shared vocabulary and what meetings add to it.
//!
//! One graph, kept apart by label and provenance: entities (`Person`, `Organization`, `Project`, `Event`, `Topic`) are shared
//! by memory (`Fact` -ABOUT-> entity, memories.rs) and meetings (`Meeting` -DISCUSSED-> entity, and `RELATES {type, source}`
//! between entities, here). A meeting's knowledge is everything carrying its id, so it is replaced or removed exactly, never
//! touching memory. Labels come only from `ENTITY_KINDS`; a relation's name is data (a property), never Cypher.

use crate::commands::generate_id;
use crate::error::StoreError;
use crate::graph;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};

/// Longest entity name or relation.
const MAX_NAME_CHARS: usize = 100;
/// Most entities and relations kept from one meeting (the analysis asks for at most 12 entities); the rest of a runaway
/// answer is dropped rather than held in the summary's transaction.
const MAX_ENTITIES: usize = 12;
const MAX_RELATIONS: usize = 24;
/// Most entities one find returns.
const MAX_FOUND: i64 = 50;
/// Most nodes one graph view draws (the most central first).
const MAX_DRAWN: i64 = 300;
/// GraphQLite's algorithms as the view runs them: PageRank (damping, iterations) and Louvain (resolution).
const PAGERANK: &str = "pageRank(0.85, 20)";
const LOUVAIN: &str = "louvain(1.0)";
/// What an entity can be, as the webview names it and as the graph labels it.
const ENTITY_KINDS: [(&str, &str); 5] =
    [("person", "Person"), ("organization", "Organization"), ("project", "Project"), ("event", "Event"), ("topic", "Topic")];

/// An entity named by the model or the user; found by kind and name (any case), created when new.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct EntityRef {
    pub name: String,
    pub entity_type: String,
}

/// A lasting fact a meeting stated between two of its entities (by name): "Priya" leads "Q3 Launch".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct RelationRef {
    pub from: String,
    pub relation: String,
    pub to: String,
}

/// What a meeting was about, from its analysis: its entities and the relations between them.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MeetingKnowledge {
    pub entities: Vec<EntityRef>,
    pub relations: Vec<RelationRef>,
}

/// `text` trimmed, not empty, at most `max` characters; `what` names it in the error.
pub(crate) fn trimmed(text: &str, max: usize, what: &str) -> Result<String, StoreError> {
    let text = text.trim();
    if text.is_empty() {
        return Err(StoreError::from(format!("A {what} can't be empty")));
    }
    if text.chars().count() > max {
        return Err(StoreError::from(format!("A {what} holds at most {max} characters")));
    }
    Ok(text.to_string())
}

fn label_of(entity_type: &str) -> Result<&'static str, StoreError> {
    ENTITY_KINDS
        .iter()
        .find(|(kind, _)| *kind == entity_type)
        .map(|(_, label)| *label)
        .ok_or_else(|| StoreError::from(format!("An entity is one of: {}", ENTITY_KINDS.map(|(kind, _)| kind).join(", "))))
}

/// The entity's name (trimmed) and graph label, when it is a valid one.
fn checked(entity: &EntityRef) -> Result<(String, &'static str), StoreError> {
    Ok((trimmed(&entity.name, MAX_NAME_CHARS, "name")?, label_of(&entity.entity_type)?))
}

/// The entity's id: the one of this kind with this name (any case), or a new one.
pub(crate) fn entity_id(db: &Connection, entity: &EntityRef, now: i64) -> Result<String, StoreError> {
    let (name, label) = checked(entity)?;
    merged(db, &name, label, &entity.entity_type, now)
}

/// The id of the entity `label` + `name` (any case), created when new; `name` and `label` already checked.
fn merged(db: &Connection, name: &str, label: &str, kind: &str, now: i64) -> Result<String, StoreError> {
    let found = graph::ids(
        db,
        &format!(
            "MERGE (e:{label} {{key: $key}})
             ON CREATE SET e.id = $id, e.name = $name, e.kind = $kind, e.created_at = $now
             SET e.updated_at = $now
             RETURN e.id AS id"
        ),
        json!({ "key": name.to_lowercase(), "id": generate_id(), "name": name, "kind": kind, "now": now }),
    )?;
    found.into_iter().next().ok_or_else(|| StoreError::from("Entity not saved"))
}

/// The entities among `among` that nothing links to any more (only those a change touched are looked at).
pub(crate) fn drop_orphans(db: &Connection, among: &[String]) -> Result<(), StoreError> {
    if among.is_empty() {
        return Ok(());
    }
    graph::run(db, "MATCH (e) WHERE e.id IN $ids AND e.kind IS NOT NULL AND NOT (e)--() DELETE e", json!({ "ids": among }))?;
    Ok(())
}

/// Removes a meeting's links (what it discussed, the relations it stated); returns the entities they touched. A relation's
/// ends are always entities the meeting discussed.
fn unlink_meeting(db: &Connection, meeting_id: &str) -> Result<Vec<String>, StoreError> {
    let id = json!({ "id": meeting_id });
    let touched = graph::ids(db, "MATCH (:Meeting {id: $id})-[:DISCUSSED]->(e) RETURN e.id AS id", id.clone())?;
    graph::run(db, "MATCH ()-[r:RELATES {source: $id}]->() DELETE r", id.clone())?;
    graph::run(db, "MATCH (:Meeting {id: $id})-[r:DISCUSSED]->() DELETE r", id)?;
    Ok(touched)
}

/// Removes what a meeting added (its node, its links, its relations) and the entities left without any links.
pub(crate) fn forget_meeting(db: &Connection, meeting_id: &str) -> Result<(), StoreError> {
    let touched = unlink_meeting(db, meeting_id)?;
    graph::run(db, "MATCH (m:Meeting {id: $id}) DETACH DELETE m", json!({ "id": meeting_id }))?;
    drop_orphans(db, &touched)
}

/// Records a meeting's knowledge in the caller's transaction, replacing what it had: the meeting (by id only — its title
/// and time stay in `meetings`), each entity it discussed, and each relation between two of them. Entities that are
/// invalid, and relations naming one the meeting didn't list, are skipped (a model's slip mustn't lose its summary); a
/// failing write is an error, so the summary isn't saved with half its knowledge. An entity the new analysis names again
/// keeps its node (and id); one it no longer names goes if nothing else links to it.
pub(crate) fn record_meeting(db: &Connection, meeting_id: &str, knowledge: &MeetingKnowledge, now: i64) -> Result<(), StoreError> {
    let touched = unlink_meeting(db, meeting_id)?;
    graph::run(db, "MERGE (:Meeting {id: $id})", json!({ "id": meeting_id }))?;
    let mut ids = HashMap::new();
    for entity in knowledge.entities.iter().take(MAX_ENTITIES) {
        let Ok((name, label)) = checked(entity) else { continue };
        let entity_id = merged(db, &name, label, &entity.entity_type, now)?;
        graph::run(db, "MATCH (m:Meeting {id: $m}), (e {id: $e}) MERGE (m)-[:DISCUSSED]->(e)", json!({ "m": meeting_id, "e": entity_id }))?;
        // A name listed twice (two kinds) keeps its first: relations name their ends by name only.
        ids.entry(name.to_lowercase()).or_insert(entity_id);
    }
    for relation in knowledge.relations.iter().take(MAX_RELATIONS) {
        let ends = (ids.get(&relation.from.trim().to_lowercase()), ids.get(&relation.to.trim().to_lowercase()));
        let ((Some(from), Some(to)), Ok(name)) = (ends, trimmed(&relation.relation, MAX_NAME_CHARS, "relation")) else { continue };
        if from == to {
            continue;
        }
        graph::run(
            db,
            "MATCH (a {id: $from}), (b {id: $to}) MERGE (a)-[:RELATES {type: $type, source: $source}]->(b)",
            json!({ "from": from, "to": to, "type": name, "source": meeting_id }),
        )?;
    }
    drop_orphans(db, &touched)
}

// ── Reading ──

/// An entity as find lists it: what it is, and how many meetings discussed it.
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct EntityHit {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub meetings: i64,
}

/// A relation of an entity's, seen from it: `outgoing` when it is the subject ("Priya leads Q3 Launch").
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct EntityRelation {
    pub relation: String,
    pub other: String,
    pub other_type: String,
    pub outgoing: bool,
    /// The meeting that stated it.
    pub meeting_id: String,
}

/// A meeting that discussed an entity, as `meetings` has it now.
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MeetingRef {
    pub id: String,
    pub title: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
}

/// Everything the graph holds about one entity: the user's approved facts, its relations, the meetings that discussed it.
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct EntityDetail {
    pub entity: EntityHit,
    pub facts: Vec<String>,
    pub relations: Vec<EntityRelation>,
    /// Newest first.
    pub meetings: Vec<MeetingRef>,
}

/// Entities whose name contains `query` (any case; all when empty), most discussed first, then the most recent.
pub(crate) fn find_entities(db: &Connection, query: &str, limit: i64) -> Result<Vec<EntityHit>, StoreError> {
    graph::rows(
        db,
        "MATCH (e) WHERE e.kind IS NOT NULL AND e.key CONTAINS $query
         OPTIONAL MATCH (m:Meeting)-[:DISCUSSED]->(e)
         RETURN e.id AS id, e.name AS name, e.kind AS entity_type, count(m) AS meetings, e.updated_at AS updated_at
         ORDER BY meetings DESC, updated_at DESC LIMIT $limit",
        json!({ "query": query.trim().to_lowercase(), "limit": limit.clamp(1, MAX_FOUND) }),
    )
}

/// The meetings with these ids, newest first, read from `meetings` (titles there are current; the graph holds only ids).
fn meetings_by_id(db: &Connection, ids: &[String]) -> Result<Vec<MeetingRef>, StoreError> {
    let ids = serde_json::to_string(ids).map_err(|e| StoreError::from(e.to_string()))?;
    let rows = db
        .prepare("SELECT id, title, created_at FROM meetings WHERE id IN (SELECT value FROM json_each(?1)) ORDER BY created_at DESC")?
        .query_map([ids], |r| Ok(MeetingRef { id: r.get(0)?, title: r.get(1)?, created_at: r.get(2)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Everything about the entity with this id; none when there is no such entity.
pub(crate) fn entity_detail(db: &Connection, id: &str) -> Result<Option<EntityDetail>, StoreError> {
    let params = json!({ "id": id });
    let Some(entity) = graph::rows::<EntityHit>(
        db,
        "MATCH (e {id: $id}) WHERE e.kind IS NOT NULL OPTIONAL MATCH (m:Meeting)-[:DISCUSSED]->(e)
         RETURN e.id AS id, e.name AS name, e.kind AS entity_type, count(m) AS meetings",
        params.clone(),
    )?
    .pop() else {
        return Ok(None);
    };
    #[derive(Deserialize)]
    struct Text {
        text: String,
    }
    let facts = graph::rows::<Text>(db, "MATCH (f:Fact)-[:ABOUT]->({id: $id}) RETURN f.text AS text ORDER BY f.updated_at DESC", params.clone())?;
    let mut relations: Vec<EntityRelation> = graph::rows(
        db,
        "MATCH ({id: $id})-[r:RELATES]->(o) RETURN r.type AS relation, o.name AS other, o.kind AS other_type, true AS outgoing, r.source AS meeting_id",
        params.clone(),
    )?;
    relations.extend(graph::rows::<EntityRelation>(
        db,
        "MATCH ({id: $id})<-[r:RELATES]-(o) RETURN r.type AS relation, o.name AS other, o.kind AS other_type, false AS outgoing, r.source AS meeting_id",
        params.clone(),
    )?);
    let ids = graph::ids(db, "MATCH (m:Meeting)-[:DISCUSSED]->({id: $id}) RETURN m.id AS id", params)?;
    let meetings = meetings_by_id(db, &ids)?;
    Ok(Some(EntityDetail { entity, facts: facts.into_iter().map(|f| f.text).collect(), relations, meetings }))
}

// ── The graph as drawn ──

/// One node: an entity, a meeting (by its current title) or a memory linked to an entity.
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    /// An entity kind, `meeting` or `fact`.
    pub kind: String,
    /// PageRank: how central it is.
    pub rank: f64,
    /// Its Louvain community.
    #[cfg_attr(test, ts(type = "number"))]
    pub group: i64,
}

/// One link: a relation's name, `discussed` (a meeting) or `about` (a memory).
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub relation: String,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct GraphView {
    /// Most central first.
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// A node before ranking: its id, what it shows and what it is.
#[derive(Deserialize)]
struct Drawn {
    id: String,
    label: String,
    kind: String,
}

/// Every drawable node: entities, the memories about them, and meetings by their title in `meetings` now.
fn drawable(db: &Connection) -> Result<Vec<Drawn>, StoreError> {
    let mut nodes: Vec<Drawn> = graph::rows(db, "MATCH (e) WHERE e.kind IS NOT NULL RETURN e.id AS id, e.name AS label, e.kind AS kind", json!({}))?;
    nodes.extend(graph::rows::<Drawn>(db, "MATCH (f:Fact)-[:ABOUT]->() RETURN DISTINCT f.id AS id, f.text AS label, 'fact' AS kind", json!({}))?);
    let ids = graph::ids(db, "MATCH (m:Meeting) RETURN m.id AS id", json!({}))?;
    nodes.extend(meetings_by_id(db, &ids)?.into_iter().map(|m| Drawn { id: m.id, label: m.title, kind: "meeting".into() }));
    Ok(nodes)
}

/// The ids within two links of `focus`, itself included.
fn neighbourhood(db: &Connection, focus: &str) -> Result<HashSet<String>, StoreError> {
    let near = graph::ids(db, "MATCH ({id: $id})-[*1..2]-(n) RETURN DISTINCT n.id AS id", json!({ "id": focus }))?;
    Ok(near.into_iter().chain([focus.to_string()]).collect())
}

/// The graph to draw: around `focus` (two links out) or the most central `limit` nodes, each ranked by PageRank and grouped
/// by Louvain, with the links between them.
pub(crate) fn graph_view(db: &Connection, focus: Option<&str>, limit: i64) -> Result<GraphView, StoreError> {
    #[derive(Deserialize)]
    struct Score {
        user_id: String,
        score: f64,
    }
    #[derive(Deserialize)]
    struct Community {
        user_id: String,
        community: i64,
    }
    let rank: HashMap<String, f64> = graph::algorithm::<Score>(db, PAGERANK)?.into_iter().map(|s| (s.user_id, s.score)).collect();
    let group: HashMap<String, i64> = graph::algorithm::<Community>(db, LOUVAIN)?.into_iter().map(|c| (c.user_id, c.community)).collect();
    let near = focus.map(|id| neighbourhood(db, id)).transpose()?;
    let mut nodes: Vec<GraphNode> = drawable(db)?
        .into_iter()
        .filter(|n| near.as_ref().is_none_or(|near| near.contains(&n.id)))
        .map(|n| GraphNode { rank: rank.get(&n.id).copied().unwrap_or(0.0), group: group.get(&n.id).copied().unwrap_or(0), id: n.id, label: n.label, kind: n.kind })
        .collect();
    nodes.sort_by(|a, b| b.rank.total_cmp(&a.rank));
    nodes.truncate(limit.clamp(1, MAX_DRAWN) as usize);
    let shown: Vec<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
    let edges = graph::rows::<GraphEdge>(
        db,
        "MATCH (a)-[r]->(b) WHERE a.id IN $ids AND b.id IN $ids
         RETURN a.id AS source, b.id AS target, coalesce(r.type, toLower(type(r))) AS relation",
        json!({ "ids": shown }),
    )?;
    Ok(GraphView { nodes, edges })
}

#[tauri::command]
pub async fn knowledge_graph(state: tauri::State<'_, crate::commands::StoreState>, focus: Option<String>, limit: i64) -> Result<GraphView, StoreError> {
    crate::commands::on_db(&state, move |db| graph_view(db, focus.as_deref(), limit)).await
}

#[tauri::command]
pub async fn knowledge_find(state: tauri::State<'_, crate::commands::StoreState>, query: String, limit: i64) -> Result<Vec<EntityHit>, StoreError> {
    crate::commands::on_db(&state, move |db| find_entities(db, &query, limit)).await
}

#[tauri::command]
pub async fn knowledge_entity(state: tauri::State<'_, crate::commands::StoreState>, id: String) -> Result<Option<EntityDetail>, StoreError> {
    crate::commands::on_db(&state, move |db| entity_detail(db, &id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::open_migrated_test_db;

    fn knowledge(entities: &[(&str, &str)], relations: &[(&str, &str, &str)]) -> MeetingKnowledge {
        MeetingKnowledge {
            entities: entities.iter().map(|(name, kind)| EntityRef { name: (*name).into(), entity_type: (*kind).into() }).collect(),
            relations: relations.iter().map(|(from, relation, to)| RelationRef { from: (*from).into(), relation: (*relation).into(), to: (*to).into() }).collect(),
        }
    }

    fn count(db: &Connection, cypher: &str) -> i64 {
        graph::run(db, cypher, json!({})).unwrap()[0]["n"].as_i64().unwrap()
    }

    #[test]
    fn a_meeting_is_recorded_replaced_and_forgotten_without_touching_memory() {
        let db = open_migrated_test_db();
        let memory = crate::memories::MemoryInput { id: None, text: "Prefers Slack".into(), source: "you".into(), about: Some(EntityRef { name: "Priya".into(), entity_type: "person".into() }), pinned: false };
        crate::memories::upsert(&db, &memory, 1).unwrap();

        let first = knowledge(&[("Priya", "person"), ("Q3 Launch", "project"), ("Pricing", "topic"), ("", "person")], &[("priya", "leads", "Q3 Launch"), ("Priya", "leads", "Q3 Launch"), ("Priya", "knows", "Nobody")]);
        record_meeting(&db, "m1", &first, 2).unwrap();
        assert_eq!(count(&db, "MATCH (p:Person) RETURN count(p) AS n"), 1, "the meeting's Priya is memory's Priya; a blank name is skipped");
        assert_eq!(count(&db, "MATCH ()-[r:RELATES]->() RETURN count(r) AS n"), 1, "a repeated relation is kept once; one to an entity not listed is skipped");

        let priya = find_entities(&db, "priya", 10).unwrap();
        assert_eq!((priya.len(), priya[0].meetings), (1, 1));
        let detail = entity_detail(&db, &priya[0].id).unwrap().unwrap();
        assert_eq!((detail.facts.len(), detail.relations.len()), (1, 1), "her approved fact and the meeting's relation");
        assert!(detail.meetings.is_empty(), "m1 isn't in `meetings` here, so no row to show");

        record_meeting(&db, "m1", &first, 3).unwrap();
        assert_eq!(find_entities(&db, "priya", 10).unwrap()[0].id, priya[0].id, "analysed again, an entity keeps its id");
        let view = graph_view(&db, Some(priya[0].id.as_str()), 50).unwrap();
        assert_eq!(view.nodes.len(), 4, "Priya, her memory, Q3 Launch and Pricing (via m1, which has no row in `meetings` to title it)");
        assert_eq!(view.edges.iter().filter(|e| e.relation == "leads").count(), 1);
        assert!(view.nodes.iter().all(|n| n.rank > 0.0), "ranked by PageRank");

        record_meeting(&db, "m1", &knowledge(&[("Pricing", "topic")], &[]), 3).unwrap();
        assert_eq!(count(&db, "MATCH ()-[r:RELATES]->() RETURN count(r) AS n"), 0, "a new analysis replaces the meeting's relations");
        assert_eq!(count(&db, "MATCH (p:Project) RETURN count(p) AS n"), 0, "an entity only the old analysis had goes");

        forget_meeting(&db, "m1").unwrap();
        assert_eq!(count(&db, "MATCH (m:Meeting) RETURN count(m) AS n"), 0);
        assert_eq!(count(&db, "MATCH (t:Topic) RETURN count(t) AS n"), 0);
        assert_eq!(count(&db, "MATCH (f:Fact)-[:ABOUT]->(:Person {key: 'priya'}) RETURN count(f) AS n"), 1, "memory is untouched");
    }
}

