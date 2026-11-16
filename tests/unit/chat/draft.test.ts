import { describe, it, expect } from 'vitest';
import { canSendDraft, draftTitle } from '@features/chat/utils';
import { CHAT_DRAFT_COPY, CHAT_TITLE_MAX_CHARS } from '@config/chat.config';
import type { ChatPart } from '@shared/types';

const pdf: ChatPart = { type: 'document', mimeType: 'application/pdf', source: { kind: 'data', base64: '' }, fileName: 'plan.pdf' };
const clip: ChatPart = { type: 'audio', mimeType: 'audio/wav', source: { kind: 'data', base64: '' } };

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
