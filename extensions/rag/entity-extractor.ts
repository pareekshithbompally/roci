/**
 * Entity Extractor
 *
 * Extracts entities and relationships from a processed meeting
 * and upserts them into the knowledge graph.
 *
 * Called after transcriptionService.saveTranscriptionResult() succeeds.
 * Failure is non-fatal — the meeting is already saved.
 */

import type { MeetingSummary, AppSettings } from '@/types';
import type { ModelProvider } from '@/types/modelProviders';
import { resolveModel, getProviderType } from '@shared/utils/modelResolver';
import { getAdapter } from '@/services/adapters';
import { buildEntityExtractionPrompt } from '@core/ai/prompts/entity-extraction.prompt';
import { ENTITY_EXTRACTION_SCHEMA } from '@core/ai/schemas/entity-extraction.schema';
import type { ExtractionResponse } from '@core/ai/schemas/entity-extraction.schema';
import { graphDB } from './graph-client';
import { ENTITY_TYPES } from './graph-types';
import type { GraphNode, GraphEdge } from './graph-types';

/**
 * Extract entities from a meeting and upsert to the knowledge graph.
 * Non-fatal: catches all errors and logs them. Never throws.
 */
export async function extractAndUpsert(
  meetingId: string,
  title: string,
  summary: MeetingSummary,
  transcript: string,
  settings: AppSettings,
  providers: ModelProvider[],
): Promise<boolean> {
  try {
    // 1. Build input text from summary + transcript excerpt
    const input = buildExtractionInput(title, summary, transcript);

    // 2. Call LLM for extraction
    const extracted = await callLLMForExtraction(input, title, settings, providers);
    if (!extracted || (extracted.entities.length === 0 && extracted.relationships.length === 0)) {
      console.log(`[EntityExtractor] No entities found for "${title}"`);
      return false;
    }

    // 3. Normalize and build graph objects
    const { nodes, edges } = buildGraphPayload(meetingId, title, extracted);

    // 4. Upsert to graph
    await graphDB.upsert({ meeting_id: meetingId, nodes, edges });
    console.log(
      `[EntityExtractor] Extracted ${nodes.length} nodes, ${edges.length} edges for "${title}"`
    );
    return true;
  } catch (error) {
    console.error(`[EntityExtractor] Failed for "${title}":`, error);
    return false;
  }
}

/** Build extraction input from meeting content */
function buildExtractionInput(
  title: string,
  summary: MeetingSummary,
  transcript: string,
): string {
  const parts: string[] = [];

  parts.push(`Title: ${title}`);
  parts.push(`Overview: ${summary.overview}`);

  if (summary.keyDiscussionPoints.length > 0) {
    parts.push(`Discussion Points:\n${summary.keyDiscussionPoints.map(p => `- ${p}`).join('\n')}`);
  }
  if (summary.decisionsMade.length > 0) {
    parts.push(`Decisions:\n${summary.decisionsMade.map(d => `- ${d}`).join('\n')}`);
  }
  if (summary.actionItems.length > 0) {
    parts.push(`Action Items:\n${summary.actionItems.map(a => {
      let line = `- ${a.text}`;
      if (a.owner) line += ` (assigned to: ${a.owner})`;
      return line;
    }).join('\n')}`);
  }

  // Include transcript excerpt for speaker attribution (first 3000 chars)
  if (transcript) {
    const excerpt = transcript.slice(0, 3000);
    parts.push(`Transcript excerpt:\n${excerpt}`);
  }

  return parts.join('\n\n');
}

/** Call LLM for structured entity extraction */
async function callLLMForExtraction(
  input: string,
  meetingTitle: string,
  settings: AppSettings,
  providers: ModelProvider[],
): Promise<ExtractionResponse | null> {
  const resolved = resolveModel(settings.chatModel, providers);
  if (!resolved?.apiKey) return null;

  const adapter = getAdapter(getProviderType(resolved.provider));
  const prompt = buildEntityExtractionPrompt(meetingTitle);

  const result = await adapter.chat({
    messages: [{ id: '1', role: 'user', text: input, timestamp: Date.now() }],
    resolved,
    systemPrompt: prompt,
    outputSchema: { name: 'entity_extraction', schema: ENTITY_EXTRACTION_SCHEMA },
  });

  return JSON.parse(result.text) as ExtractionResponse;
}

/** Normalize extraction output and build graph node/edge objects */
function buildGraphPayload(
  meetingId: string,
  meetingTitle: string,
  extracted: ExtractionResponse,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Two maps: nodeMap stores GraphNode objects keyed by node ID,
  // nameIndex resolves entity names to node IDs for relationship resolution.
  const nodeMap = new Map<string, GraphNode>();
  const nameIndex = new Map<string, string>(); // lowercase name → node ID

  // Always create the meeting node
  const meetingNodeId = `meeting:${meetingId}`;
  nodeMap.set(meetingNodeId, {
    id: meetingNodeId,
    type: ENTITY_TYPES.MEETING,
    name: meetingTitle,
    properties: { meeting_id: meetingId },
  });
  nameIndex.set(meetingTitle.toLowerCase(), meetingNodeId);

  // Create nodes from extracted entities
  for (const entity of extracted.entities) {
    if (entity.type === 'meeting') continue; // we already created the meeting node
    const key = entity.name.toLowerCase();
    const nodeId = `${entity.type}:${key}`;

    nodeMap.set(nodeId, {
      id: nodeId,
      type: entity.type as GraphNode['type'],
      name: entity.name,
      properties: entity.properties || {},
    });
    // Entity names take precedence over meeting title in name resolution
    nameIndex.set(key, nodeId);
  }

  // Build edges from extracted relationships
  const edges: GraphEdge[] = [];
  for (const rel of extracted.relationships) {
    const sourceId = nameIndex.get(rel.source.toLowerCase());
    const targetId = nameIndex.get(rel.target.toLowerCase());
    const sourceNode = sourceId ? nodeMap.get(sourceId) : undefined;
    const targetNode = targetId ? nodeMap.get(targetId) : undefined;

    if (!sourceNode || !targetNode) {
      // Relationship references an entity not in the entities list — skip
      continue;
    }

    edges.push({
      id: `${sourceNode.id}-${rel.type}-${targetNode.id}-${meetingId}`,
      source_id: sourceNode.id,
      target_id: targetNode.id,
      type: rel.type as GraphEdge['type'],
      meeting_id: meetingId,
      created_at: Date.now(),
    });
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

export const entityExtractor = {
  extractAndUpsert,
};
