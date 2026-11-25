/** suggest_memory: save a lasting fact (about the user, or about a person, organization, project or event in their work),
 *  correct one, or forget one. The user approves it on a card above the chat box; nothing is written until they do. Chat
 *  only: memory is never written from outside Roci. */

import { z } from 'zod';
import type { ToolContext, ToolResult } from '@extensions/tools/types';
import { defineTool, fail, idFrom, ok, text } from '@extensions/tools/contract';
import { memoryProposalStore, sameMemory, type MemoryProposal } from '@features/chat';
import { queryClient } from '@shared/query/queryClient';
import { memoriesQuery } from '@shared/query/memories';
import type { MemoryRow } from '@shared/types/native';
import { ENTITY_KINDS, KNOWLEDGE_LIMITS } from '@config/knowledge.config';

const FROM = 'the memories in your instructions';

const input = z.object({
  action: z.enum(['save', 'forget']).describe('save a fact (new, or a correction with replaces), or forget one.'),
  text: text('save: the fact, one short sentence, e.g. "Leads the Q3 launch".').max(KNOWLEDGE_LIMITS.memory).optional(),
  about: z
    .object({ name: text('Their name, e.g. "Priya Raman".').max(KNOWLEDGE_LIMITS.name), type: z.enum(ENTITY_KINDS) })
    .optional()
    .describe('save: who or what the fact is about; leave out for a fact about the user.'),
  replaces: idFrom(FROM, 'save: the memory this corrects, if any.').optional(),
  memory_id: idFrom(FROM, 'forget: the memory to forget.').optional(),
});
type Input = z.output<typeof input>;

const saved = async (): Promise<MemoryRow[]> => (await queryClient.fetchQuery(memoriesQuery)).memories;

/** Why a fact can't be suggested now: one waits already, the user declined it, or it is saved. */
async function refusal(fact: string, context: ToolContext): Promise<ToolResult | null> {
  const waiting = memoryProposalStore.pendingIn(context.sessionId ?? null);
  if (waiting) return fail(`The user is still deciding on "${waiting.text}". Suggest at most one memory per reply.`);
  if (memoryProposalStore.wasDismissed(fact)) return fail("The user declined this memory already. Don't suggest it again.");
  if ((await saved()).some((m) => sameMemory(m.text, fact))) return fail('This is already saved. Nothing to do.');
  return null;
}

/** The saved memory with this id, or the error the model can act on. */
async function memoryById(id: string): Promise<MemoryRow | ToolResult> {
  return (await saved()).find((m) => m.id === id) ?? fail(`No memory has id ${id}. Copy one from ${FROM}.`);
}
const isMemory = (found: MemoryRow | ToolResult): found is MemoryRow => 'text' in found;

function suggest(change: Omit<MemoryProposal, 'id' | 'status' | 'chatId'>, context: ToolContext): ToolResult {
  memoryProposalStore.propose({ ...change, chatId: context.sessionId ?? null });
  return ok(`Suggested: ${change.action} "${change.text}". The user decides on the card; it is not saved until they approve.`);
}

async function save({ text: fact, about, replaces }: Input, context: ToolContext): Promise<ToolResult> {
  if (!fact) return fail('save needs text: the fact.');
  const refused = await refusal(fact, context);
  if (refused) return refused;
  const entity = about ? { name: about.name, entity_type: about.type } : null;
  if (!replaces) return suggest({ action: 'create', memoryId: null, originalText: null, text: fact, about: entity }, context);
  const memory = await memoryById(replaces);
  if (!isMemory(memory)) return memory;
  return suggest({ action: 'update', memoryId: memory.id, originalText: memory.text, text: fact, about: entity }, context);
}

async function forget({ memory_id }: Input, context: ToolContext): Promise<ToolResult> {
  if (!memory_id) return fail('forget needs memory_id.');
  const memory = await memoryById(memory_id);
  if (!isMemory(memory)) return memory;
  return suggest({ action: 'forget', memoryId: memory.id, originalText: memory.text, text: memory.text, about: null }, context);
}

export const suggestMemoryTool = defineTool({
  name: 'suggest_memory',
  description:
    'Suggest saving or forgetting one memory: only what the user asks you to remember, or a lasting fact about them or ' +
    'the people, organizations and projects in their work (facts about the user go here, not to another tool). Never ' +
    'one-off, secret, health or financial details; at most one per reply; never one already saved. `about` names someone ' +
    'else; `replaces` corrects a saved memory. The user approves it on a card: say you suggested it, never that it is saved.',
  input,
  deferLoading: true,
  execute: (args, context) => (args.action === 'save' ? save(args, context) : forget(args, context)),
});
