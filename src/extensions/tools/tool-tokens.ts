/** What a tool adds to every chat request: its name, description and argument schema, as the model is sent them. */

import { TOKEN_ESTIMATE } from '@config/tokens.config';
import type { ToolDefinition } from './types';

/** The part of a tool the model reads. */
export type ToolShape = Pick<ToolDefinition, 'name' | 'description' | 'parameters'>;

/** Tokens `tool` takes in each request, estimated. */
export function toolPromptTokens({ name, description, parameters }: ToolShape): number {
  return Math.ceil((name.length + description.length + JSON.stringify(parameters).length) / TOKEN_ESTIMATE.charsPerToken);
}
