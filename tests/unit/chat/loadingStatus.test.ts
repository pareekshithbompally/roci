import { describe, it, expect } from 'vitest';
import { loadingStatusOf } from '@features/chat/components/message';
import { CHAT_LOADING_COPY } from '@config/chat.config';

describe('loadingStatusOf', () => {
  it('shows the server-reported stage with its percent', () => {
    expect(loadingStatusOf({ progress: { stage: 'loading-draft', percent: 95 } }))
      .toEqual({ label: CHAT_LOADING_COPY['loading-draft'], percent: 95 });
  });

  it('says the model is thinking while it reasons', () => {
    expect(loadingStatusOf({ isThinking: true, thinkingContent: 'hmm' }))
      .toEqual({ label: CHAT_LOADING_COPY.thinking, percent: null });
  });

  it('says it is searching only for web search', () => {
    expect(loadingStatusOf({ isSearching: true }).label).toBe(CHAT_LOADING_COPY.searching);
  });

  it('falls back to working when nothing is reported', () => {
    expect(loadingStatusOf(null)).toEqual({ label: CHAT_LOADING_COPY.working, percent: null });
  });
});
