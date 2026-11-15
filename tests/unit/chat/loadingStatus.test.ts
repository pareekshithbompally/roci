import { describe, it, expect } from 'vitest';
import { loadingStatusOf } from '@features/chat/components/message/loadingStatus';
import { CHAT_LOADING_COPY, CHAT_LOADING_DETAIL } from '@config/chat.config';

describe('loadingStatusOf', () => {
  it('shows the server-reported stage with its percent', () => {
    expect(loadingStatusOf({ progress: { stage: 'loading-draft', percent: 95 } }))
      .toEqual({ label: CHAT_LOADING_COPY['loading-draft'], percent: 95, detail: null });
  });

  it('shows the time left while reading the prompt', () => {
    expect(loadingStatusOf({ progress: { stage: 'reading-prompt', percent: 56, secondsLeft: 3 } }).detail)
      .toBe(CHAT_LOADING_DETAIL.secondsLeft(3));
  });

  it('says it is searching only for web search', () => {
    expect(loadingStatusOf({ isSearching: true }).label).toBe(CHAT_LOADING_COPY.searching);
  });

  it('falls back to working when nothing is reported', () => {
    expect(loadingStatusOf(null)).toEqual({ label: CHAT_LOADING_COPY.working, percent: null, detail: null });
  });
});
