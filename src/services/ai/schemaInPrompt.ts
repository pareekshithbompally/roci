/** For a provider that takes a JSON schema but doesn't hold replies to it (`ServerApp.ignoresSchema`): a call that asks
 *  for JSON also carries the schema in its instructions, and its reply's JSON is read out of any code fences (the AI SDK's
 *  own `extractJsonMiddleware`). Every other call passes through untouched. */

import { extractJsonMiddleware, type LanguageModelMiddleware } from 'ai';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

const extractJson = extractJsonMiddleware();

/** The JSON schema a call asks its reply to match, if any. */
const schemaOf = (params: LanguageModelV4CallOptions) =>
  params.responseFormat?.type === 'json' ? params.responseFormat.schema : undefined;

const shapeInstruction = (schema: object) =>
  `Reply with only a JSON object, no other text, matching this JSON schema:\n${JSON.stringify(schema)}`;

/** The prompt with the schema as one more system message, after the call's own instructions. */
function withSchema(params: LanguageModelV4CallOptions, schema: object): LanguageModelV4CallOptions {
  const firstTurn = params.prompt.findIndex((message) => message.role !== 'system');
  const at = firstTurn === -1 ? params.prompt.length : firstTurn;
  const prompt = [...params.prompt.slice(0, at), { role: 'system' as const, content: shapeInstruction(schema) }, ...params.prompt.slice(at)];
  return { ...params, prompt };
}

export const schemaInPromptMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    const schema = schemaOf(params);
    return schema ? withSchema(params, schema) : params;
  },
  wrapGenerate: (options) => (schemaOf(options.params) && extractJson.wrapGenerate ? extractJson.wrapGenerate(options) : options.doGenerate()),
  wrapStream: (options) => (schemaOf(options.params) && extractJson.wrapStream ? extractJson.wrapStream(options) : options.doStream()),
};
