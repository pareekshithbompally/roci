/** Prompts › what the user set for prompts (About You, Responses, Custom Instructions, Prompt Templates), and its edits. */

import { useCallback } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import type { PromptTemplateId, PromptTemplates, ResponsePreferences, UserProfile } from '@config/personalization.config';
import { usePersonalizationUpdate } from '@features/personalization/hooks/usePersonalization';

const NO_PROFILE: UserProfile = {};
const NO_RESPONSES: ResponsePreferences = {};
const NO_TEMPLATES: PromptTemplates = {};

export interface PromptSettings {
  profile: UserProfile;
  responses: ResponsePreferences;
  customInstructions: string;
  templates: PromptTemplates;
  setProfile: (changes: Partial<UserProfile>) => void;
  setResponses: (changes: Partial<ResponsePreferences>) => void;
  setCustomInstructions: (text: string) => void;
  /** Saves a rewrite of a template; none restores Roci's text. */
  setTemplate: (id: PromptTemplateId, text: string | undefined) => void;
}

export function usePromptSettings(): PromptSettings {
  const personalization = useSettings().settings.personalization;
  const update = usePersonalizationUpdate();
  return {
    profile: personalization?.profile ?? NO_PROFILE,
    responses: personalization?.responses ?? NO_RESPONSES,
    customInstructions: personalization?.customInstructions ?? '',
    templates: personalization?.templates ?? NO_TEMPLATES,
    setProfile: useCallback((changes) => update((current) => ({ profile: { ...current.profile, ...changes } })), [update]),
    setResponses: useCallback((changes) => update((current) => ({ responses: { ...current.responses, ...changes } })), [update]),
    setCustomInstructions: useCallback((customInstructions) => update(() => ({ customInstructions })), [update]),
    setTemplate: useCallback(
      (id, text) =>
        update((current) => {
          const { [id]: _replaced, ...others } = current.templates ?? {};
          return { templates: text === undefined ? others : { ...others, [id]: text } };
        }),
      [update],
    ),
  };
}
