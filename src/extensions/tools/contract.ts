/** Built-in tools from one zod schema each: the model sees its JSON Schema, and every call (chat or an MCP agent) is
 *  checked against it before running, so a malformed call returns an error the model can read and correct. */

import { localDayKey } from '@shared/utils/localDate';
import { z } from 'zod';
import { Temporal } from 'temporal-polyfill';
import type { JSONSchema, ToolContext, ToolDefinition, ToolResult, ToolResultMeta } from './types';

type ToolSpec<S extends z.ZodObject> = Omit<ToolDefinition, 'parameters' | 'execute'> & {
  input: S;
  execute: (input: z.output<S>, context: ToolContext) => Promise<ToolResult>;
};

export function defineTool<S extends z.ZodObject>({ input, execute, ...spec }: ToolSpec<S>): ToolDefinition {
  return {
    ...spec,
    parameters: toParameters(input),
    execute: async (args, context) => {
      const parsed = input.safeParse(withoutBlanks(args));
      if (!parsed.success) return fail(`Invalid arguments for ${spec.name}:\n${z.prettifyError(parsed.error)}\nFix them and call ${spec.name} again.`);
      return execute(parsed.data, context);
    },
  };
}

/** The schema as models read it: what they may send (defaults shown, not required). */
function toParameters(input: z.ZodObject): JSONSchema {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(input, { io: 'input', target: 'draft-7' });
  return schema as unknown as JSONSchema;
}

/** Models often send null or "" for an argument they mean to leave out. */
function withoutBlanks(args: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args ?? {}).filter(([, value]) => value !== null && value !== ''));
}

// ── Argument types ──

function parses(parse: () => unknown): boolean {
  try {
    parse();
    return true;
  } catch {
    return false;
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** A calendar day, `2026-04-15`. */
export const day = z
  .string()
  .refine((v) => YMD.test(v) && parses(() => Temporal.PlainDate.from(v, { overflow: 'reject' })), 'Use a date like 2026-04-15 (YYYY-MM-DD).');

/** A wall-clock time on this device, `2026-04-15T09:00`, no time zone. */
export const localDateTime = z
  .string()
  .refine(
    (v) => LOCAL_DATE_TIME.test(v) && parses(() => Temporal.PlainDateTime.from(v, { overflow: 'reject' })),
    'Use a local date and time like 2026-04-15T09:00 (YYYY-MM-DDTHH:MM), without a time zone.',
  );

/** An id the model copies from another tool's result; `what` says which one, when the field name doesn't. */
export const idFrom = (source: string, what?: string) =>
  z.string().trim().min(1).describe([what, `Copy it exactly from ${source}.`].filter(Boolean).join(' '));

/** Free text the model writes. */
export const text = (description: string) => z.string().trim().min(1).describe(description);

/** A page size with its bounds and default. */
export const limit = (fallback: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(fallback).describe(`How many to return (1–${max}).`);

/** Whether a local date and time (as `localDateTime` takes it) is already past here. */
export function isPast(local: string): boolean {
  return Temporal.PlainDateTime.from(local).toZonedDateTime(Temporal.Now.timeZoneId()).epochMilliseconds <= Date.now();
}

// ── Results ──

type ExtraMeta = Omit<ToolResultMeta, 'toolName' | 'executionMs'>;

/** A successful result; the bridge fills in the tool's name and timing. */
export function ok(content: string, meta: ExtraMeta = {}): ToolResult {
  return { toolCallId: '', content, isError: false, meta: { toolName: '', executionMs: 0, ...meta } };
}

/** A failure the model should act on: say what was wrong and what to call instead. */
export function fail(content: string): ToolResult {
  return { toolCallId: '', content, isError: true };
}

// ── Formatting shared by the tools' results ──

/** `Wed, Nov 18, 2026`: unambiguous for models, with the weekday for "last Tuesday". */
export function toolDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** `2026-11-18`, the day `ms` falls on here. */
export function localDay(ms: number): string {
  return localDayKey(new Date(ms));
}

/** `2026-11-18T09:00`, the time `ms` reads here: the same form the tools take. */
export function localDateTimeOf(ms: number): string {
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' });
}
