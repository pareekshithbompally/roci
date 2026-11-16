import { describe, it, expect, vi } from 'vitest';

vi.mock('@features/chat', () => ({ askInNewChat: vi.fn() }));
vi.mock('@features/history/hooks/useOpenMeeting', () => ({ useOpenMeeting: vi.fn() }));

import { runUrlAction } from '@features/integrations/hooks/useUrlActionsRuntime';
import type { UrlActionHandlers } from '@features/integrations/hooks/useUrlActionsRuntime';
import type { HistoryItem } from '@shared/types';

const MEETING = { id: 'm1', title: 'Pricing' } as HistoryItem;

function handlers(found?: HistoryItem): UrlActionHandlers {
  return {
    show: vi.fn(async () => {}),
    ask: vi.fn(),
    findMeeting: vi.fn(async () => found),
    openMeeting: vi.fn(async () => {}),
    notFound: vi.fn(),
  };
}

describe('runUrlAction', () => {
  it('brings Kasset forward and asks in a new chat', async () => {
    const h = handlers();
    await runUrlAction({ kind: 'ask', value: 'what did we decide?' }, h);
    expect(h.show).toHaveBeenCalled();
    expect(h.ask).toHaveBeenCalledWith('what did we decide?');
  });

  it('opens a meeting it finds', async () => {
    const h = handlers(MEETING);
    await runUrlAction({ kind: 'meeting', value: 'm1' }, h);
    expect(h.findMeeting).toHaveBeenCalledWith('m1');
    expect(h.openMeeting).toHaveBeenCalledWith(MEETING);
  });

  it('says so, without opening the window, when the meeting is not in Kasset', async () => {
    const h = handlers(undefined);
    await runUrlAction({ kind: 'meeting', value: 'gone' }, h);
    expect(h.notFound).toHaveBeenCalled();
    expect(h.show).not.toHaveBeenCalled();
    expect(h.openMeeting).not.toHaveBeenCalled();
  });
});
