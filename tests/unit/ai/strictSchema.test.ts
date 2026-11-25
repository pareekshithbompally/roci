/** Every schema Roci sends as structured output is strict (OpenAI rejects an optional property: "'required' … must include
 *  every key in properties"), and a null sent back for an optional field reads as absent. */

import { describe, it, expect } from 'vitest';
import { chatExtrasSchema, jsonSchemaOf, meetingSummarySchema, readReply } from '@core/ai';

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Paths of objects whose `required` doesn't list every property. */
function looseObjects(node: unknown, path = '$'): string[] {
  if (!isNode(node)) return [];
  const own = isNode(node.properties)
    && JSON.stringify([...(node.required as string[] ?? [])].sort()) !== JSON.stringify(Object.keys(node.properties).sort())
    ? [path] : [];
  const children = Object.entries(node).flatMap(([key, value]) =>
    Array.isArray(value) ? value.flatMap((item, i) => looseObjects(item, `${path}.${key}[${i}]`)) : looseObjects(value, `${path}.${key}`));
  return [...own, ...children];
}

const SENT = {
  'summary': meetingSummarySchema(false),
  'summary with notes': meetingSummarySchema(true),
  'title and follow-ups': chatExtrasSchema({ title: true, suggestions: true }),
};

describe('structured output schemas are strict', () => {
  it.each(Object.entries(SENT))('%s lists every property as required, at every depth', (_name, schema) => {
    expect(looseObjects(jsonSchemaOf(schema))).toEqual([]);
  });

  it('an optional field is sent as its value or null, keeping its description', () => {
    const json = jsonSchemaOf(meetingSummarySchema(false)) as Node;
    const item = ((json.properties as Node).actionItems as Node).items as Node;
    const owner = (item.properties as Node).owner as Node;
    expect(owner.anyOf).toEqual([expect.objectContaining({ type: 'string' }), { type: 'null' }]);
    expect(owner.description).toMatch(/Who will do it/);
  });
});

describe('a null for an optional field reads as absent', () => {
  it('an action item with no owner or date', () => {
    const reply = readReply(meetingSummarySchema(false), {
      overview: 'We planned the launch.', keyDiscussionPoints: [], decisionsMade: [], nextSteps: [],
      actionItems: [{ text: 'Send the report', owner: null, dueDate: null }],
    });
    expect(reply.actionItems).toEqual([{ text: 'Send the report' }]);
  });
});
