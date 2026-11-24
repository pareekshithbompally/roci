/** Settings › Personalization as saved, for code outside React (the settings query owns it). */

import type { LoadedSettings } from '@shared/contexts/SettingsContext';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import type { AppSettings, Personalization } from '@shared/types';
import type { PromptPersonalization } from '@core/ai';
import { deviceLanguage } from '@shared/utils/spokenLanguage';
import { memoriesQuery } from '@shared/query/memories';
import { memoryLines } from '@shared/utils/memories';
import type { MemoryGraph } from '@shared/types/native';

export function savedPersonalization(): Personalization {
  return queryClient.getQueryData<LoadedSettings>(queryKeys.storeSettings())?.settings.personalization ?? {};
}

/** The custom vocabulary's terms, in priority order (speech recognition reads them). */
export function savedTerms(): string[] {
  return (savedPersonalization().vocabulary ?? []).map(({ term }) => term);
}

/** The language speech recognition is told you speak, as saved now: the chosen one, else the device's (BCP 47). */
export function savedSpokenLanguage(): string {
  return savedPersonalization().spokenLanguage ?? deviceLanguage();
}

/** What prompts state from Personalization, as saved now. */
export function promptPersonalization(): PromptPersonalization {
  const { profile, responses, customInstructions, templates } = savedPersonalization();
  return { terms: savedTerms(), profile, responses, customInstructions, templates };
}

/** Memory is on unless the user turned it off. */
export function memoryEnabled(settings: Pick<AppSettings, 'personalization'>): boolean {
  return settings.personalization?.memory?.enabled !== false;
}

/** What a chat's prompt states from Personalization, given the saved memories: they go in while Memory is on. */
export function personalizationWith(settings: Pick<AppSettings, 'personalization'>, graph: MemoryGraph): PromptPersonalization {
  const base = promptPersonalization();
  return memoryEnabled(settings) ? { ...base, memories: memoryLines(graph) } : base;
}

/** `personalizationWith` the memories as saved now (for a chat about to send). */
export async function chatPersonalization(settings: Pick<AppSettings, 'personalization'>): Promise<PromptPersonalization> {
  return personalizationWith(settings, await queryClient.fetchQuery(memoriesQuery));
}

/** Memory is on, as saved now (for code outside React). */
export function memoryOn(): boolean {
  return memoryEnabled({ personalization: savedPersonalization() });
}
