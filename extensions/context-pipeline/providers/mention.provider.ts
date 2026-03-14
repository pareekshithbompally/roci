/**
 * Mention Provider (priority: 10)
 *
 * Handles manually selected @ mentions. When the user explicitly picks meetings,
 * this fires first with confidence 1.0, short-circuiting the pipeline.
 */

import type { ContextInput, ContextOutput, ContextProvider } from '../types';
import { meetingReferenceService } from '@/services/meetingReferenceService';

export class MentionProvider implements ContextProvider {
  readonly name = 'mention';
  readonly priority = 10;

  shouldRun(input: ContextInput): boolean {
    return input.manualMeetingRefs.length > 0;
  }

  async resolve(input: ContextInput): Promise<ContextOutput> {
    const referencedItems = input.historyItems.filter(item =>
      input.manualMeetingRefs.some(ref => ref.id === item.id)
    );

    if (referencedItems.length === 0) {
      return { text: '', provider: this.name, confidence: 0, durationMs: 0 };
    }

    const references = await meetingReferenceService.loadMeetingsContext(referencedItems);
    const text = meetingReferenceService.formatForLLM(references);

    if (!text) {
      return { text: '', provider: this.name, confidence: 0, durationMs: 0 };
    }

    return {
      text: `You have access to the following meeting information for context:\n\n${text}\n\nUse this information to provide accurate, specific answers when relevant.`,
      provider: this.name,
      confidence: 1.0,
      durationMs: 0,
    };
  }
}
