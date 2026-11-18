/** A provider's model list, keeping what each entry says about its model (modalities, tools, context) instead of only its id. */

import type { Model, ServedModelInfo } from '@shared/types/modelProviders';

/** One model in a provider's list, with what the list says about it. */
export interface ListedModel {
  id: string;
  info: ServedModelInfo;
}

interface GeminiEntry {
  name?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface OpenAIEntry {
  id?: string;
  context_length?: number;
  context_window?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const field = (data: unknown, key: string): unknown => (data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined);

/** Gemini states only what a model's methods imply: embedding (embedContent) or image (predict); generateContent says nothing. */
function geminiModalities(methods: string[]): ServedModelInfo['modalities'] {
  if (methods.includes('generateContent')) return undefined;
  if (methods.includes('embedContent')) return { input: ['text'], output: ['vector'] };
  if (methods.includes('predict')) return { input: ['text'], output: ['image'] };
  return undefined;
}

function geminiEntry(entry: GeminiEntry): ListedModel {
  const modalities = geminiModalities(entry.supportedGenerationMethods ?? []);
  return {
    id: (entry.name ?? '').replace(/^models\//, ''),
    info: { ...(entry.inputTokenLimit ? { contextTokens: entry.inputTokenLimit } : {}), ...(modalities ? { modalities } : {}) },
  };
}

/** Gemini `/v1beta/models`: `{ models: [{ name: "models/…", inputTokenLimit, supportedGenerationMethods }] }`. */
export function geminiListing(data: unknown): ListedModel[] {
  return asArray<GeminiEntry>(field(data, 'models')).map(geminiEntry).filter((m) => m.id);
}

function openAIInfo(entry: OpenAIEntry): ServedModelInfo {
  const input = entry.architecture?.input_modalities;
  const output = entry.architecture?.output_modalities;
  const contextTokens = entry.context_length ?? entry.context_window;
  return {
    ...(input && output ? { modalities: { input, output } } : {}),
    ...(entry.supported_parameters ? { tools: entry.supported_parameters.includes('tools') } : {}),
    ...(contextTokens ? { contextTokens } : {}),
  };
}

function openAIEntry(entry: string | OpenAIEntry): ListedModel {
  return typeof entry === 'string' ? { id: entry, info: {} } : { id: entry.id ?? '', info: openAIInfo(entry) };
}

/** OpenAI-style `/models`: `{ data: [...] }`, a plain array, or `{ models: [...] }`; OpenRouter adds architecture and parameters. */
export function openAIListing(data: unknown): ListedModel[] {
  const entries = Array.isArray(data) ? data : asArray(field(data, 'data') ?? field(data, 'models'));
  return (entries as Array<string | OpenAIEntry>).filter(Boolean).map(openAIEntry).filter((m) => m.id);
}

/** The list said something about the model (a bare id says nothing). */
export const hasInfo = (info: ServedModelInfo): boolean => Object.keys(info).length > 0;

const sameInfo = (a: ServedModelInfo | undefined, b: ServedModelInfo): boolean => JSON.stringify(a ?? {}) === JSON.stringify(b);

/** Saved models with what the listing says about each; the same array when nothing changed, so callers skip the save. */
export function withListedInfo(models: Model[], listing: ListedModel[]): Model[] {
  const byId = new Map(listing.filter((m) => hasInfo(m.info)).map((m) => [m.id, m.info]));
  const changed = models.some((m) => byId.has(m.id) && !sameInfo(m.listed, byId.get(m.id) ?? {}));
  if (!changed) return models;
  return models.map((m) => (byId.has(m.id) ? { ...m, listed: byId.get(m.id) } : m));
}
