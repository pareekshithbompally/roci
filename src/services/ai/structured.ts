/** One structured AI call — the way every job that wants fields back asks a model: the schema it is given and its reply
 *  read against come from one zod definition; the usage of every reply received is recorded here (a call that failed reports
 *  none); failures become `AiError`s; a prompt that didn't fit gets one shorter try; and a reply wrapped in prose or code fences
 *  still has its JSON read. */

import { generateText, jsonSchema, NoObjectGeneratedError, Output } from 'ai';
import type { z } from 'zod';
import { jsonSchemaOf, readReply } from '@core/ai';
import { createModel } from '@services/ai/provider';
import { extractTokenUsage } from '@services/ai/types';
import { recordUsage } from '@extensions/usage';
import type { UsageCategory } from '@extensions/usage';
import type { ResolvedModel } from '@shared/utils/modelResolver';
import { AiError, isContextOverflow, toAiError, type AiJob } from './errors';

export interface StructuredCall<S extends z.ZodObject> {
  job: AiJob;
  model: ResolvedModel;
  instructions: string;
  prompt: string;
  schema: S;
  /** The usage row: its category, and the meeting or chat it belongs to. */
  usage: { category: UsageCategory; sessionId?: string };
  signal?: AbortSignal;
  /** A shorter prompt for one more try when this one didn't fit the model; none (or null) gives up. */
  shorter?: () => string | null;
}

/** The JSON object inside a reply that came with prose or code fences around it: first `{` to last `}`. */
function salvageJson(text: string | undefined): unknown {
  if (!text) return undefined;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

interface Reply {
  output: unknown;
  usage: Parameters<typeof extractTokenUsage>[0];
}

async function ask<S extends z.ZodObject>(call: StructuredCall<S>, prompt: string): Promise<Reply> {
  try {
    const result = await generateText({
      model: createModel(call.model),
      instructions: call.instructions,
      prompt,
      output: Output.object({ schema: jsonSchema(jsonSchemaOf(call.schema)) }),
      abortSignal: call.signal,
    });
    return { output: result.output, usage: result.usage };
  } catch (error: unknown) {
    const salvaged = NoObjectGeneratedError.isInstance(error) ? salvageJson(error.text) : undefined;
    if (salvaged === undefined || !NoObjectGeneratedError.isInstance(error)) throw error;
    return { output: salvaged, usage: error.usage };
  }
}

export async function generateStructured<S extends z.ZodObject>(call: StructuredCall<S>): Promise<z.infer<S>> {
  const fail = (error: unknown): never => {
    throw toAiError(error, call.job, call.model.provider);
  };
  const reply = await ask(call, call.prompt).catch(async (error: unknown) => {
    const retry = isContextOverflow(error) ? call.shorter?.() : null;
    return retry ? ask(call, retry).catch(fail) : fail(error);
  });
  recordUsage(call.usage.category, call.model, extractTokenUsage(reply.usage), call.usage.sessionId);
  if (reply.output === null || typeof reply.output !== 'object') {
    throw new AiError('badReply', 'The model replied without the fields asked for. Try again.');
  }
  return readReply(call.schema, reply.output);
}
