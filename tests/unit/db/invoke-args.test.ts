import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

function callsFor(command: string): unknown[] {
  return mockedInvoke.mock.calls
    .filter(([cmd]) => cmd === `plugin:store|${command}`)
    .map(([, args]) => args);
}

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedInvoke.mockImplementation(async (cmd) => {
    if (typeof cmd === 'string' && cmd.endsWith('settings_get_all')) return [];
    if (typeof cmd === 'string' && (cmd.endsWith('notes_list') || cmd.endsWith('todos_list_for_meeting'))) return [];
    if (typeof cmd === 'string' && cmd.endsWith('initialize')) return undefined;
    return undefined;
  });
});

describe('store invoke arg shapes match Rust command signatures', () => {
  it('settings.set wraps key/value in `input`', async () => {
    const { settings } = await import('@services/db/domains/settings');
    await settings.set('chatModel', '"gemini-3.8-flash"');
    expect(callsFor('settings_set')).toEqual([
      { input: { key: 'chatModel', value: '"gemini-3.8-flash"' } },
    ]);
  });

  it('providers.upsert wraps the row in `input`', async () => {
    const { providers } = await import('@services/db/domains/providers');
    await providers.upsert({
      provider: 'gemini',
      active: true,
      settings: [],
      models: [{ id: 'gemini-3.8-flash', name: 'gemini-3.8-flash' }],
    });
    const [args] = callsFor('providers_upsert') as Array<{ input: Record<string, unknown> }>;
    expect(args.input.provider).toBe('gemini');
    expect(args.input.active).toBe(true);
    expect(typeof args.input.data).toBe('string');
  });

  it('meetings.upsert and saveTranscription wrap payloads in `input`', async () => {
    const { meetings } = await import('@services/db/domains/meetings');
    await meetings.upsert({ id: 'm1', title: 'Standup' });
    await meetings.saveTranscription({
      meetingId: 'm1',
      title: 'Standup',
      transcript: 'hello',
      summaryOverview: 'ov',
      summaryData: '{}',
    });
    expect(callsFor('meetings_upsert')[0]).toMatchObject({ input: { id: 'm1' } });
    expect(callsFor('save_transcription')[0]).toMatchObject({ input: { meeting_id: 'm1' } });
  });

  it('recordings/notes/todos/chats upserts wrap payloads in `input`', async () => {
    const { recordings } = await import('@services/db/domains/recordings');
    const { notes } = await import('@services/db/domains/notes');
    const { todos } = await import('@services/db/domains/todos');
    const { chats } = await import('@services/db/domains/chats');
    await recordings.upsert({ id: 'r1', filename: 'a.wav' });
    await notes.upsert({ id: 'n1', meetingId: 'm1', text: 'note' });
    await todos.upsert({ id: 't1', meetingId: 'm1', text: 'todo' });
    await chats.upsert({ id: 'c1', title: 'Chat', lastMessageAt: 0, messages: [] });
    expect(callsFor('recordings_upsert')[0]).toMatchObject({ input: { id: 'r1' } });
    expect(callsFor('notes_upsert')[0]).toMatchObject({ input: { id: 'n1', meeting_id: 'm1' } });
    expect(callsFor('todos_upsert')[0]).toMatchObject({ input: { id: 't1', meeting_id: 'm1' } });
    expect(callsFor('chats_upsert')[0]).toMatchObject({ input: { id: 'c1' } });
  });

  // Tauri maps camelCase top-level args to snake_case Rust params; sending snake_case fails
  // with "missing required key meetingId". Only nested struct fields (serde) stay snake_case.
  it('list/lookup calls use camelCase top-level arg names', async () => {
    const { notes } = await import('@services/db/domains/notes');
    const { todos } = await import('@services/db/domains/todos');
    const { reminders } = await import('@services/db/domains/reminders');
    await notes.list('m1');
    await todos.listForMeeting('m1');
    await reminders.upsert('t1', 7, 123);
    await reminders.setStatus('t1', 'fired');
    await reminders.prune(1000);
    expect(callsFor('notes_list')).toEqual([{ meetingId: 'm1' }]);
    expect(callsFor('todos_list_for_meeting')).toEqual([{ meetingId: 'm1' }]);
    expect(callsFor('reminders_upsert')).toEqual([{ todoId: 't1', notificationId: 7, fireAt: 123 }]);
    expect(callsFor('reminders_set_status')).toEqual([{ todoId: 't1', status: 'fired' }]);
    expect(callsFor('reminders_prune')).toEqual([{ maxAgeMs: 1000 }]);
  });

  it('graph client uses camelCase top-level args (nested params stay snake_case)', async () => {
    const { graphDB } = await import('@extensions/rag/graph-client');
    await graphDB.upsert({ meeting_id: 'm1', nodes: [], edges: [] });
    await graphDB.traverse({
      start_node_id: 'meeting:m1',
      edge_types: [],
      target_node_types: [],
      max_depth: 1,
      direction: 'outgoing',
      limit: 10,
    });
    await graphDB.neighbors('meeting:m1', ['mentions'], 'outgoing');
    await graphDB.deleteMeeting('m1');
    expect(callsFor('graph_upsert')).toEqual([{ meetingId: 'm1', nodes: [], edges: [] }]);
    expect(callsFor('graph_traverse')[0]).toMatchObject({ params: { start_node_id: 'meeting:m1' } });
    expect(callsFor('graph_neighbors')).toEqual([
      { nodeId: 'meeting:m1', edgeTypes: ['mentions'], direction: 'outgoing' },
    ]);
    expect(callsFor('graph_delete_meeting')).toEqual([{ meetingId: 'm1' }]);
  });
});
