import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { day, defineTool, isPast, localDateTime, ok, text } from '@extensions/tools/contract';

const run = vi.fn(async (input: unknown) => ok(JSON.stringify(input)));
const tool = defineTool({
  name: 'probe',
  description: 'test',
  input: z.object({ text: text('t'), limit: z.coerce.number().int().min(1).max(20).default(5), due_date: day.optional(), reminder_at: localDateTime.optional() }),
  execute: run,
});
const ctx = { approval: 'chat' as const };

describe('defineTool', () => {
  it('shows the model a plain schema: defaults not required, no dialect, no regex noise', () => {
    expect(tool.parameters.required).toEqual(['text']);
    expect(tool.parameters).not.toHaveProperty('$schema');
    expect(tool.parameters.properties.limit).toMatchObject({ type: 'integer', default: 5, minimum: 1, maximum: 20 });
    expect(JSON.stringify(tool.parameters)).not.toContain('pattern');
  });

  it('parses before running: defaults, trimming, numbers sent as text', async () => {
    await tool.execute({ text: '  Ship it ', limit: '7' }, ctx);
    expect(run.mock.calls.at(-1)?.[0]).toEqual({ text: 'Ship it', limit: 7 });
  });

  it('treats null and "" as left out', async () => {
    const result = await tool.execute({ text: 'x', due_date: '', reminder_at: null }, ctx);
    expect(result.isError).toBe(false);
  });

  it('answers a bad call with what to fix, without running', async () => {
    run.mockClear();
    const result = await tool.execute({ limit: 99, due_date: 'Friday' }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/Invalid arguments for probe/);
    expect(result.content).toMatch(/text/);
    expect(result.content).toMatch(/YYYY-MM-DD/);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('dates', () => {
  it('day takes real calendar days only', () => {
    expect(day.safeParse('2026-04-15').success).toBe(true);
    expect(day.safeParse('2026-02-30').success).toBe(false);
    expect(day.safeParse('2026-04-15T09:00').success).toBe(false);
  });

  it('localDateTime takes wall-clock time without a zone', () => {
    expect(localDateTime.safeParse('2026-04-15T09:00').success).toBe(true);
    expect(localDateTime.safeParse('2026-04-15T09:00:30').success).toBe(true);
    expect(localDateTime.safeParse('2026-04-15T09:00Z').success).toBe(false);
    expect(localDateTime.safeParse('2026-04-15').success).toBe(false);
  });

  it('isPast compares in local time', () => {
    expect(isPast('2000-01-01T00:00')).toBe(true);
    expect(isPast('2999-01-01T00:00')).toBe(false);
  });
});
