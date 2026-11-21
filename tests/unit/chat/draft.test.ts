import { describe, it, expect } from 'vitest';
import { canSendDraft, draftTitle } from '@features/chat/utils';
import { CHAT_DRAFT_COPY, CHAT_TITLE_MAX_CHARS } from '@config/chat.config';
import type { FileUIPart } from '@shared/types';

const pdf: FileUIPart = { type: 'file', mediaType: 'application/pdf', url: 'data:application/pdf;base64,', filename: 'plan.pdf' };
const clip: FileUIPart = { type: 'file', mediaType: 'audio/wav', url: 'data:audio/wav;base64,' };

describe('chat draft', () => {
  it('can be sent with words, an attachment, or both, but not empty', () => {
    expect(canSendDraft('hi', [])).toBe(true);
    expect(canSendDraft('  ', [pdf])).toBe(true);
    expect(canSendDraft(' \n ', [])).toBe(false);
  });

  it('titles a new chat from its words, else its first attachment', () => {
    expect(draftTitle('x'.repeat(CHAT_TITLE_MAX_CHARS + 5), [])).toHaveLength(CHAT_TITLE_MAX_CHARS);
    expect(draftTitle('', [pdf])).toBe('plan.pdf');
    expect(draftTitle('', [clip])).toBe(CHAT_DRAFT_COPY.untitledAttachment);
  });
});
