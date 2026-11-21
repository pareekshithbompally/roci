/** Each editable prompt template's default text (what Reset to Default restores); the builders use the user's rewrite when
 *  there is one. Chat Answer Style's default follows the user's response preferences. */

import type { PromptTemplateId, ResponsePreferences } from '@config/personalization.config';
import { answerStyleLines } from './chat.prompt';
import { TITLE_RULES } from './chatExtras.prompt';
import { SUMMARY_RULES } from './transcription.prompt';

export function promptTemplateDefault(id: PromptTemplateId, responses?: ResponsePreferences): string {
  const defaults: Record<PromptTemplateId, () => string> = {
    chatStyle: () => answerStyleLines(responses),
    chatTitles: () => TITLE_RULES,
    summaryRules: () => SUMMARY_RULES,
  };
  return defaults[id]();
}
