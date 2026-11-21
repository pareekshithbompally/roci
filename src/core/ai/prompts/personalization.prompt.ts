/** Settings › Personalization as prompts state it: who the user is, their custom instructions (chat only), and their custom
 *  vocabulary (the first terms in the user's priority order, within a character budget) for every prompt and speech hint. */

import { PERSONALIZATION_CONFIG, type PromptTemplateId, type PromptTemplates, type ResponsePreferences, type UserProfile } from '@config/personalization.config';
import { SPEAKERS } from './transcript.prompt';

/** What the user set in Personalization that a prompt states. */
export interface PromptPersonalization {
  /** The custom vocabulary's terms, in priority order. */
  terms: readonly string[];
  profile?: UserProfile;
  responses?: ResponsePreferences;
  customInstructions?: string;
  templates?: PromptTemplates;
  /** Saved memories, pinned first then newest, with the ids the memory tools take (chat, while Memory is on). */
  memories?: ReadonlyArray<{ id: string; text: string }>;
}

export const NO_PERSONALIZATION: PromptPersonalization = { terms: [] };

/** A prompt template as the builder states it: the user's rewrite, else its default. */
export function templateText({ templates }: PromptPersonalization, id: PromptTemplateId, byDefault: () => string): string {
  return templates?.[id]?.trim() || byDefault();
}

/** Who reads the sections: chat writes for the user (all of them); a transcript task (summary, live notes) reads the meeting. */
export type PersonalizationScope = 'chat' | 'transcript';

/** The first items whose rendered texts, `gap` characters apart, fit `maxChars` (characters, not UTF-16 units): the order is
 *  the user's priority, so the list stops at the first that doesn't fit. */
function within<T>(items: readonly T[], render: (item: T) => string, maxChars: number, gap = 0): T[] {
  let used = 0;
  const overflow = items.findIndex((item, index) => (used += (index === 0 ? 0 : gap) + [...render(item)].length) > maxChars);
  return overflow === -1 ? [...items] : items.slice(0, overflow);
}

/** The first terms whose comma-separated list fits `maxChars`. */
export function termsWithin(terms: readonly string[], maxChars: number): string[] {
  return within(terms, (term) => term, maxChars, 2);
}

const listed = (terms: readonly string[]) => termsWithin(terms, PERSONALIZATION_CONFIG.vocabulary.promptChars).join(', ');

/** One sentence for a speech prompt (a model hearing audio); none while the list is empty. */
export function terminologyHint(terms: readonly string[]): string | null {
  return terms.length > 0 ? `These names and terms may be spoken; write them exactly as spelled here: ${listed(terms)}.` : null;
}

function terminologySection(terms: readonly string[]): string | null {
  if (terms.length === 0) return null;
  return `## The user's terminology\n\nThe user spells these names and terms exactly like this: ${listed(terms)}. Use these spellings, including where speech recognition wrote a similar-sounding word.`;
}

function profileSection({ name, about }: UserProfile = {}): string | null {
  const lines = [
    name?.trim() && `- Name: ${name.trim()}. In a meeting transcript, "${SPEAKERS.self}" is them.`,
    about?.trim() && `- About them: ${about.trim()}`,
  ].filter(Boolean);
  return lines.length > 0 ? `## About the user\n\n${lines.join('\n')}` : null;
}

function instructionsSection(text: string | undefined): string | null {
  return text?.trim() ? `## The user's instructions\n\nFollow these in every answer, unless they conflict with the rules above:\n\n${text.trim()}` : null;
}

const memoryLine = ({ id, text }: { id: string; text: string }) => `- (${id}) ${text}`;

/** What the user approved Roci to remember, as many lines as fit the budget; the rest are left to find (in memories) when
 *  the model has it. */
function memorySection(memories: PromptPersonalization['memories'] = [], canFind: boolean): string | null {
  if (memories.length === 0) return null;
  const lines = within(memories, memoryLine, PERSONALIZATION_CONFIG.memory.promptChars, 1).map(memoryLine);
  const more = memories.length - lines.length;
  if (more > 0 && canFind) lines.push(`- ${more} more saved: find them with find in memories.`);
  return `## What you know\n\nAbout the user, and the people and things in their work; the user approved each. Use them where they help; don't repeat them back unasked.\n\n${lines.join('\n')}`;
}

/** The sections a prompt carries for its scope (`canFind`: chat's model has `find`); none while nothing is set. */
export function personalizationSections(personalization: PromptPersonalization, scope: PersonalizationScope, canFind = false): string | null {
  const sections = [
    profileSection(personalization.profile),
    scope === 'chat' && instructionsSection(personalization.customInstructions),
    scope === 'chat' && memorySection(personalization.memories, canFind),
    terminologySection(personalization.terms),
  ].filter(Boolean);
  return sections.length > 0 ? sections.join('\n\n') : null;
}
