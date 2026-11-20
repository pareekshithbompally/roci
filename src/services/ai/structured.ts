/** One structured AI call — the way every job that wants fields back asks a model: the schema it is given and its reply
 *  read against come from one zod definition, and every provider holds the reply to that schema (cloud APIs natively, local
 *  servers and on-device models through their schema-constrained decoding); the usage of every reply received is recorded
 *  here (a call that failed reports none); failures become `AiError`s; and a prompt that didn't fit gets one shorter try. */

import { generateText, jsonSchema, Output } from 'ai';
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

async function ask<S extends z.ZodObject>(call: StructuredCall<S>, prompt: string) {
  return generateText({
    model: createModel(call.model),
    instructions: call.instructions,
    prompt,
    output: Output.object({ schema: jsonSchema(jsonSchemaOf(call.schema)) }),
    abortSignal: call.signal,
  });
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
