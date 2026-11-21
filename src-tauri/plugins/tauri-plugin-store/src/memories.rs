//! Memory (Settings › Personalization › Memory) on the knowledge graph: each memory is a `Fact`, about the user or — through
//! one `ABOUT` relation — about an entity (knowledge.rs: shared with what meetings add). Every write is one the user made or
//! approved, in one transaction; an entity nothing links to any more goes with its last link.

use crate::commands::{generate_id, now_millis, on_db, StoreState};
use crate::error::StoreError;
use crate::graph;
use crate::knowledge::{drop_orphans, entity_id, trimmed, EntityRef};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

/// Longest memory, in characters: one fact, not a document.
const MAX_CHARS: usize = 500;

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MemoryEntityRow {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(test, ts(type = "number"))]
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MemoryRow {
    pub id: String,
    pub text: String,
    pub source: String,
    /// The entity it is about; none = about the user.
    pub entity_id: Option<String>,
    pub pinned: bool,
    #[cfg_attr(test, ts(type = "number"))]
    pub created_at: i64,
    #[cfg_attr(test, ts(type = "number"))]
    pub updated_at: i64,
}

/// Everything saved, in display order: entities by recency, memories pinned first then by recency.
#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MemoryGraph {
    pub entities: Vec<MemoryEntityRow>,
    pub memories: Vec<MemoryRow>,
}

/// A memory to save: a new one (no `id`) or an edit of one; an edit keeps its source and creation time.
#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS), ts(export, export_to = "../../../../src/shared/types/native/"))]
pub struct MemoryInput {
    pub id: Option<String>,
    pub text: String,
    pub source: String,
    /// What it is about; none = the user.
    pub about: Option<EntityRef>,
    pub pinned: bool,
}

/// The facts a delete removes, as `f`.
const ONE_FACT: &str = "MATCH (f:Fact {id: $id})";
const EVERY_FACT: &str = "MATCH (f:Fact)";

const MEMORY_FIELDS: &str = "f.id AS id, f.text AS text, f.source AS source, e.id AS entity_id, f.pinned AS pinned, \
                             f.created_at AS created_at, f.updated_at AS updated_at";

pub(crate) fn graph(db: &Connection) -> Result<MemoryGraph, StoreError> {
    let entities = graph::rows(
        db,
        "MATCH (:Fact)-[:ABOUT]->(e)
         RETURN DISTINCT e.id AS id, e.name AS name, e.kind AS entity_type, e.created_at AS created_at, e.updated_at AS updated_at
         ORDER BY updated_at DESC",
        json!({}),
    )?;
    let memories = graph::rows(
        db,
        &format!("MATCH (f:Fact) OPTIONAL MATCH (f)-[:ABOUT]->(e) RETURN {MEMORY_FIELDS} ORDER BY pinned DESC, updated_at DESC"),
        json!({}),
    )?;
    Ok(MemoryGraph { entities, memories })
}

/// Saves a memory (and its entity) in one transaction; returns it as saved.
pub(crate) fn upsert(db: &Connection, input: &MemoryInput, now: i64) -> Result<MemoryRow, StoreError> {
    let text = trimmed(&input.text, MAX_CHARS, "memory")?;
    if input.source != "you" && input.source != "chat" {
        return Err(StoreError::from("A memory comes from 'you' or 'chat'"));
    }
    let tx = db.unchecked_transaction()?;
    if let Some(id) = &input.id {
        // An edit of a memory deleted meanwhile mustn't bring it back.
        if graph::run(&tx, "MATCH (f:Fact {id: $id}) RETURN f.id AS id", json!({ "id": id }))?.is_empty() {
            return Err(StoreError::from("That memory was deleted"));
        }
    }
    let id = input.id.clone().unwrap_or_else(generate_id);
    let entity = input.about.as_ref().map(|about| entity_id(&tx, about, now)).transpose()?;
    let fact = json!({ "id": id, "text": text, "source": input.source, "pinned": input.pinned, "now": now });
    graph::run(
        &tx,
        "MERGE (f:Fact {id: $id})
         ON CREATE SET f.source = $source, f.created_at = $now
         SET f.text = $text, f.pinned = $pinned, f.updated_at = $now",
        fact,
    )?;
    let was_about = graph::ids(&tx, "MATCH (:Fact {id: $id})-[:ABOUT]->(e) RETURN e.id AS id", json!({ "id": id }))?;
    graph::run(&tx, "MATCH (:Fact {id: $id})-[r:ABOUT]->() DELETE r", json!({ "id": id }))?;
    if let Some(entity) = &entity {
        graph::run(&tx, "MATCH (f:Fact {id: $id}), (e {id: $entity}) WHERE e.kind IS NOT NULL CREATE (f)-[:ABOUT]->(e)", json!({ "id": id, "entity": entity }))?;
    }
    drop_orphans(&tx, &was_about)?;
    let saved = graph::rows(
        &tx,
        &format!("MATCH (f:Fact {{id: $id}}) OPTIONAL MATCH (f)-[:ABOUT]->(e) RETURN {MEMORY_FIELDS}"),
        json!({ "id": id }),
    )?
    .pop()
    .ok_or_else(|| StoreError::from("Memory not saved"))?;
    tx.commit()?;
    Ok(saved)
}

/// Deletes the facts `facts` matches (as `f`: all, or one by `$id`) and the entities left without any, in one transaction.
fn delete(db: &Connection, facts: &str, params: serde_json::Value) -> Result<(), StoreError> {
    let tx = db.unchecked_transaction()?;
    let about = graph::ids(&tx, &format!("{facts}-[:ABOUT]->(e) RETURN DISTINCT e.id AS id"), params.clone())?;
    graph::run(&tx, &format!("{facts} DETACH DELETE f"), params)?;
    drop_orphans(&tx, &about)?;
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub async fn memory_graph(state: State<'_, StoreState>) -> Result<MemoryGraph, StoreError> {
    on_db(&state, graph).await
}

#[tauri::command]
pub async fn memories_upsert(state: State<'_, StoreState>, memory: MemoryInput) -> Result<MemoryRow, StoreError> {
    on_db(&state, move |db| upsert(db, &memory, now_millis())).await
}

#[tauri::command]
pub async fn memories_delete(state: State<'_, StoreState>, id: String) -> Result<(), StoreError> {
    on_db(&state, move |db| delete(db, ONE_FACT, json!({ "id": id }))).await
}

/// Forgets everything: every fact and the entities they were about.
#[tauri::command]
pub async fn memories_delete_all(state: State<'_, StoreState>) -> Result<(), StoreError> {
    on_db(&state, |db| delete(db, EVERY_FACT, json!({}))).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::open_migrated_test_db;

    fn input(text: &str, about: Option<(&str, &str)>) -> MemoryInput {
        let about = about.map(|(name, entity_type)| EntityRef { name: name.into(), entity_type: entity_type.into() });
        MemoryInput { id: None, text: text.into(), source: "you".into(), about, pinned: false }
    }

    #[test]
    fn saves_edits_and_orders_pinned_first() {
        let db = open_migrated_test_db();
        let first = upsert(&db, &input("  Leads the payments team ", None), 1).unwrap();
        assert_eq!(first.text, "Leads the payments team");
        let second = upsert(&db, &input("Prefers metric units", None), 2).unwrap();
        let pinned = MemoryInput { id: Some(first.id.clone()), pinned: true, ..input("Leads payments", None) };
        let edited = upsert(&db, &pinned, 3).unwrap();
        assert_eq!((edited.text.as_str(), edited.created_at, edited.updated_at), ("Leads payments", 1, 3));
        let ids: Vec<_> = graph(&db).unwrap().memories.into_iter().map(|m| m.id).collect();
        assert_eq!(ids, [first.id, second.id]);
    }

    #[test]
    fn memories_about_one_entity_share_it_by_name_in_any_case() {
        let db = open_migrated_test_db();
        let a = upsert(&db, &input("Leads the Q3 launch", Some(("Priya Raman", "person"))), 1).unwrap();
        let b = upsert(&db, &input("Prefers Slack", Some(("priya raman", "person"))), 2).unwrap();
        assert_eq!(a.entity_id, b.entity_id);
        assert_eq!(graph(&db).unwrap().entities.len(), 1);
    }

    #[test]
    fn an_entity_goes_with_its_last_memory() {
        let db = open_migrated_test_db();
        let m = upsert(&db, &input("Works at Acme", Some(("Priya", "person"))), 1).unwrap();
        delete(&db, ONE_FACT, json!({ "id": m.id })).unwrap();
        assert!(graph(&db).unwrap().entities.is_empty());
    }

    #[test]
    fn refuses_empty_long_unknown_sources_and_types() {
        let db = open_migrated_test_db();
        assert!(upsert(&db, &input("   ", None), 1).is_err());
        assert!(upsert(&db, &input(&"x".repeat(MAX_CHARS + 1), None), 1).is_err());
        assert!(upsert(&db, &MemoryInput { source: "web".into(), ..input("A fact", None) }, 1).is_err());
        assert!(upsert(&db, &input("A fact", Some(("Mars", "planet"))), 1).is_err());
        assert!(graph(&db).unwrap().memories.is_empty(), "a refused save writes nothing");
    }
}
