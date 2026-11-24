/** When the agent loop must stop calling tools and answer: once the turn's tool calls reach the limit, or the model repeats one. */

import type { ModelMessage, PrepareStepResult, ToolSet } from 'ai';
import { FINAL_ANSWER_PROMPT } from '@core/ai/prompts';

export type FinalStepReason = 'call-limit' | 'repeated-call';

/** The part of a finished step the guard reads. */
interface StepCalls {
  toolCalls: ReadonlyArray<{ toolName: string; input: unknown }>;
}

/** JSON.stringify replacer that sorts object keys, so `{a,b}` and `{b,a}` give the same text. */
function sortKeys(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function callKey(call: StepCalls['toolCalls'][number]): string {
  return `${call.toolName}:${JSON.stringify(call.input, sortKeys)}`;
}

/** Same tool with the same input twice: a repeat returns nothing new. */
function hasRepeatedCall(steps: readonly StepCalls[]): boolean {
  const keys = steps.flatMap((step) => step.toolCalls.map(callKey));
  return new Set(keys).size < keys.length;
}

/** Why the next step must answer without tools, given the steps already run; null while tools stay on.
 *  Calls a model makes at once in one step all run, so a turn can pass the limit by that step's extra calls. */
export function finalStepReason(steps: readonly StepCalls[], maxToolCalls: number): FinalStepReason | null {
  const calls = steps.reduce((count, step) => count + step.toolCalls.length, 0);
  if (calls >= maxToolCalls) return 'call-limit';
  return hasRepeatedCall(steps) ? 'repeated-call' : null;
}

/**
 * `prepareStep` for a turn of at most `maxToolCalls`: on the final step, tools are off (all but `kept`, the reply's own
 * finishReply) and the model is told to answer. The note is appended as a user message so the cached prompt prefix is kept.
 */
export function finalStepGuard(maxToolCalls: number, kept: string[] = []) {
  return ({ steps, messages }: { steps: readonly StepCalls[]; messages: ModelMessage[] }): PrepareStepResult<ToolSet> | undefined => {
    const reason = finalStepReason(steps, maxToolCalls);
    if (!reason) return undefined;
    console.info('[Orchestrator] Final step, tools off:', reason);
    const toolsOff = kept.length > 0 ? { activeTools: kept } : { toolChoice: 'none' as const };
    return { ...toolsOff, messages: [...messages, { role: 'user', content: FINAL_ANSWER_PROMPT }] };
  };
}
