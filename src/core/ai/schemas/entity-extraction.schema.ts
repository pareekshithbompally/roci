/** JSON Schema for entity/relationship extraction, run after transcription or as a deferred batch. */

export const ENTITY_EXTRACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    entities: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['person', 'topic', 'decision', 'action_item', 'project'],
            description: 'Entity type.',
          },
          name: {
            type: 'string',
            description: 'Entity name. Use full names for people. Use concise noun phrases for topics/projects.',
          },
          properties: {
            type: 'object' as const,
            description: 'Optional type-specific properties.',
            properties: {
              role: { type: 'string', description: 'For person: job title or role if mentioned.' },
              status: { type: 'string', description: 'For decision/action_item: current status if mentioned.' },
              owner: { type: 'string', description: 'For action_item: person responsible.' },
              due_date: { type: 'string', description: 'For action_item: due date if mentioned.' },
            },
          },
        },
        required: ['type', 'name'] as const,
      },
      description: 'All entities mentioned in the meeting.',
    },
    relationships: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          source: {
            type: 'string',
            description: 'Source entity name (must match an entity in the entities array).',
          },
          type: {
            type: 'string',
            enum: [
              'attended', 'discussed', 'produced_decision', 'produced_action',
              'assigned_to', 'affects', 'works_on', 'related_to', 'mentioned_by',
            ],
            description: 'Relationship type.',
          },
          target: {
            type: 'string',
            description: 'Target entity name (must match an entity in the entities array).',
          },
        },
        required: ['source', 'type', 'target'] as const,
      },
      description: 'Relationships between extracted entities.',
    },
  },
  required: ['entities', 'relationships'] as const,
  additionalProperties: false,
} as const;

export interface ExtractionResponse {
  entities: Array<{
    type: string;
    name: string;
    properties?: Record<string, string>;
  }>;
  relationships: Array<{
    source: string;
    type: string;
    target: string;
  }>;
}
