import { describe, expect, it } from 'vitest';
import { showTool } from '@extensions/tools/definitions/show.tool';

const ctx = { approval: 'chat' as const };
const base = { title: 'YTD returns', source: 'Exa web search', source_url: 'https://example.com/nvda' };

describe('show', () => {
  it('draws a chart, telling the model what is on screen and handing the view to the chat only', async () => {
    const out = await showTool.execute(
      { ...base, kind: 'chart', chart_type: 'bar', labels: ['NVDA', 'AMD'], series: [{ name: 'YTD', values: [-32.5, 12.1] }], unit: '%' },
      ctx,
    );
    expect(out.isError).toBe(false);
    expect(out.content).toContain('Shown to the user: a bar chart, "YTD returns" (source: Exa web search)');
    expect(out.meta?.view).toEqual({
      kind: 'chart', title: 'YTD returns', source: { name: 'Exa web search', url: 'https://example.com/nvda' },
      chartType: 'bar', labels: ['NVDA', 'AMD'], series: [{ name: 'YTD', values: [-32.5, 12.1] }], unit: '%',
    });
  });

  it('defaults a chart to a line', async () => {
    const out = await showTool.execute({ ...base, kind: 'chart', labels: ['Jan', 'Feb'], series: [{ name: 'NVDA', values: [1, 2] }] }, ctx);
    expect(out.meta?.view).toMatchObject({ kind: 'chart', chartType: 'line' });
  });

  it('answers a malformed call with what to fix, and shows nothing', async () => {
    const short = await showTool.execute({ ...base, kind: 'chart', labels: ['Jan', 'Feb'], series: [{ name: 'NVDA', values: [1] }] }, ctx);
    expect(short.isError).toBe(true);
    expect(short.content).toContain('Series "NVDA" has 1 values for 2 labels.');
    const ragged = await showTool.execute({ ...base, kind: 'table', columns: ['Ticker', 'YTD'], rows: [['NVDA']] }, ctx);
    expect(ragged.content).toContain('Row 1 has 1 cells for 2 columns.');
    const empty = await showTool.execute({ ...base, kind: 'stats' }, ctx);
    expect(empty.content).toContain('Stats need at least one entry');
    const unsourced = await showTool.execute({ kind: 'stats', title: 'x', stats: [{ label: 'a', value: '1' }] }, ctx);
    expect(unsourced.isError).toBe(true);
    expect([short, ragged, empty, unsourced].every((r) => r.meta?.view === undefined)).toBe(true);
  });

  it('shows figures and tables as they were sent', async () => {
    const stats = await showTool.execute({ ...base, kind: 'stats', stats: [{ label: 'NVDA', value: '-32.5%', change: '-1.2% today' }], as_of: 'Nov 20, 2026' }, ctx);
    expect(stats.meta?.view).toMatchObject({ kind: 'stats', asOf: 'Nov 20, 2026', stats: [{ label: 'NVDA', value: '-32.5%', change: '-1.2% today' }] });
    const table = await showTool.execute({ ...base, kind: 'table', columns: ['Ticker', 'YTD'], rows: [['NVDA', '-32.5%']] }, ctx);
    expect(table.meta?.view).toMatchObject({ kind: 'table', columns: ['Ticker', 'YTD'], rows: [['NVDA', '-32.5%']] });
  });
});
