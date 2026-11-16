/** When the agent loop must stop calling tools and answer: on its last step, or once the model repeats a tool call. */

import type { ModelMessage, PrepareStepResult, ToolSet } from 'ai';
import { FINAL_ANSWER_PROMPT } from '@core/ai/prompts';
import { AGENT_LOOP_CONFIG } from '@config/chatTools.config';

export type FinalStepReason = 'step-limit' | 'repeated-call';

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

/** Why the next step must answer without tools, given the steps already run; null while tools stay on. */
export function finalStepReason(
  steps: readonly StepCalls[],
  maxSteps: number = AGENT_LOOP_CONFIG.maxSteps,
): FinalStepReason | null {
  if (steps.length >= maxSteps - 1) return 'step-limit';
  return hasRepeatedCall(steps) ? 'repeated-call' : null;
}

/**
 * `prepareStep` for the agent loop: on the final step, tools are off and the model is told to answer.
 * The note is appended as a user message so the cached prompt prefix is kept.
 */
export function prepareFinalStep({
  steps,
  messages,
}: {
  steps: readonly StepCalls[];
  messages: ModelMessage[];
}): PrepareStepResult<ToolSet> | undefined {
  const reason = finalStepReason(steps);
  if (!reason) return undefined;
  console.info('[Orchestrator] Final step, tools off:', reason);
  return { toolChoice: 'none', messages: [...messages, { role: 'user', content: FINAL_ANSWER_PROMPT }] };
}
