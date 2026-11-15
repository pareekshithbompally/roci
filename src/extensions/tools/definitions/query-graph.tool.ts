/** query_graph: answers relationship questions from the knowledge graph; complements search_meetings. */

import type { ToolDefinition, ToolResult } from '@extensions/tools/types';
import { graphDB } from '@extensions/rag/graph-client';
import type { GraphNode, TraversalResult } from '@extensions/rag/graph-types';
import { errorMessage } from '@shared/utils/errors';

export const queryGraphTool: ToolDefinition = {
  name: 'query_graph',
  description:
    'Query the knowledge graph to find relationships between people, topics, decisions, ' +
    'projects, and meetings. Use for questions about who is involved in what, what decisions ' +
    'affect which projects, how topics connect across meetings, or aggregate questions like ' +
    '"how many meetings discussed X." Returns connected entities with relationship paths.',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['search', 'traverse', 'neighbors'],
        description:
          'Operation type. "search": find entities by name. ' +
          '"traverse": follow relationships from a known entity (multi-hop). ' +
          '"neighbors": get direct connections of an entity.',
      },
      query: {
        type: 'string',
        description: 'Search query (entity name or partial name). Required for "search".',
      },
      node_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['person', 'meeting', 'topic', 'decision', 'action_item', 'project'],
        },
        description: 'Filter results by entity type.',
      },
      start_node_id: {
        type: 'string',
        description: 'Node ID to start traversal from. Required for "traverse" and "neighbors". Get this from a prior "search" result.',
      },
      edge_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'attended', 'discussed', 'produced_decision', 'produced_action',
            'assigned_to', 'affects', 'works_on', 'related_to', 'mentioned_by',
          ],
        },
        description: 'Filter by relationship type.',
      },
      max_depth: {
        type: 'integer',
        description: 'How many relationship hops to follow. 1 = direct connections, 2 = two-hop.',
        default: 2,
        minimum: 1,
        maximum: 4,
      },
      direction: {
        type: 'string',
        enum: ['outgoing', 'incoming', 'both'],
        description: 'Direction to traverse edges.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum results to return.',
        default: 20,
        minimum: 1,
        maximum: 50,
      },
    },
    required: ['operation'],
  },

  async execute(params): Promise<ToolResult> {
    const operation = params.operation as string;
    const limit = (params.limit as number) ?? 20;

    try {
      switch (operation) {
        case 'search': {
          const query = params.query as string;
          if (!query) {
            return errorResult('Missing "query" parameter for search operation.');
          }
          const nodes = await graphDB.search({
            query,
            node_types: params.node_types as string[] | undefined,
            limit,
          });
          return formatSearchResults(nodes);
        }

        case 'traverse': {
          const startNodeId = params.start_node_id as string;
          if (!startNodeId) {
            return errorResult('Missing "start_node_id" for traverse. Use "search" first to find the node ID.');
          }
          const results = await graphDB.traverse({
            start_node_id: startNodeId,
            edge_types: params.edge_types as string[] | undefined,
            target_node_types: params.node_types as string[] | undefined,
            max_depth: (params.max_depth as number) ?? 2,
            direction: (params.direction as 'outgoing' | 'incoming' | 'both') ?? 'both',
            limit,
          });
          return formatTraversalResults(results, startNodeId);
        }

        case 'neighbors': {
          const nodeId = params.start_node_id as string;
          if (!nodeId) {
            return errorResult('Missing "start_node_id" for neighbors.');
          }
          const results = await graphDB.neighbors(
            nodeId,
            params.edge_types as string[] | undefined,
            params.direction as 'outgoing' | 'incoming' | 'both' | undefined,
          );
          return formatTraversalResults(results, nodeId);
        }

        default:
          return errorResult(`Unknown operation "${operation}". Use "search", "traverse", or "neighbors".`);
      }
    } catch (error) {
      console.error('[QueryGraphTool] Failed:', error);
      return errorResult(`Graph query failed: ${errorMessage(error)}`);
    }
  },
};

// ── Formatting helpers ──

function formatSearchResults(nodes: GraphNode[]): ToolResult {
  if (nodes.length === 0) {
    return {
      toolCallId: '',
      content: 'No matching entities found in the knowledge graph.',
      isError: false,
      meta: { toolName: 'query_graph', executionMs: 0, resultCount: 0 },
    };
  }

  const lines = [`Found ${nodes.length} matching entities:\n`];
  for (const node of nodes) {
    lines.push(`- [${node.type}] "${node.name}" (ID: ${node.id})`);
  }
  lines.push('\nUse "traverse" or "neighbors" with a node ID to explore connections.');

  return {
    toolCallId: '',
    content: lines.join('\n'),
    isError: false,
    meta: { toolName: 'query_graph', executionMs: 0, resultCount: nodes.length },
  };
}

function formatTraversalResults(results: TraversalResult[], startNodeId: string): ToolResult {
  if (results.length === 0) {
    return {
      toolCallId: '',
      content: `No connections found from node "${startNodeId}".`,
      isError: false,
      meta: { toolName: 'query_graph', executionMs: 0, resultCount: 0 },
    };
  }

  // Group by relationship type for readable output
  const byEdgeType = new Map<string, TraversalResult[]>();
  for (const r of results) {
    const existing = byEdgeType.get(r.via_edge_type) ?? [];
    existing.push(r);
    byEdgeType.set(r.via_edge_type, existing);
  }

  const lines = [`Connections from "${startNodeId}" (${results.length} results):\n`];
  for (const [edgeType, items] of byEdgeType) {
    lines.push(`${edgeType}:`);
    for (const item of items) {
      const depth = item.path_depth > 1 ? ` (${item.path_depth}-hop)` : '';
      lines.push(`  - [${item.node.type}] "${item.node.name}"${depth}`);
    }
    lines.push('');
  }

  return {
    toolCallId: '',
    content: lines.join('\n'),
    isError: false,
    meta: { toolName: 'query_graph', executionMs: 0, resultCount: results.length },
  };
}

function errorResult(message: string): ToolResult {
  return {
    toolCallId: '',
    content: `Error: ${message}`,
    isError: true,
    meta: { toolName: 'query_graph', executionMs: 0 },
  };
}
