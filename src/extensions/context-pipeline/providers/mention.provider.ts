/** The question's attached meetings (@ mentions, or the meeting a meeting chat is about); runs first with confidence 1.0 and short-circuits the pipeline. */

import type { ContextInput, ContextOutput, ContextProvider } from '@extensions/context-pipeline/types';
import { meetingReferenceService } from '@services/meetingReferenceService';

export class MentionProvider implements ContextProvider {
  readonly name = 'mention';
  readonly priority = 10;

  shouldRun(input: ContextInput): boolean {
    return input.meetingIds.length > 0;
  }

  async resolve(input: ContextInput): Promise<ContextOutput> {
    // Skip the full transcript so large strings aren't held in memory during context assembly.
    const references = await meetingReferenceService.loadSelectiveContext(input.meetingIds, ['summary', 'notes', 'actionItems']);
    if (references.length === 0) {
      return { text: '', provider: this.name, confidence: 0, durationMs: 0 };
    }
    const text = meetingReferenceService.formatForLLM(references);

    if (!text) {
      return { text: '', provider: this.name, confidence: 0, durationMs: 0 };
    }

    return {
      text,
      provider: this.name,
      confidence: 1.0,
      durationMs: 0,
      meta: { mentionedMeetingIds: references.map((ref) => ref.id) },
    };
  }
}
