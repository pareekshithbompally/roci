/** show: the model draws a chart, a few headline figures or a table in the chat, in Roci's own design. It only presents
 *  figures an earlier tool returned; the view goes to the chat, and the model reads one line saying what was shown. */

import { showInput, toResultView, type ResultView } from '@core/ai';
import { defineTool, ok } from '@extensions/tools/contract';

export const SHOW_TOOL = 'show';

/** The line the model reads back: what is on screen now, so it doesn't repeat the figures. */
function shownLine(view: ResultView): string {
  const what = view.kind === 'chart' ? `a ${view.chartType} chart` : view.kind === 'stats' ? `${view.stats.length} figure(s)` : `a table of ${view.rows.length} row(s)`;
  return `Shown to the user: ${what}, "${view.title}" (source: ${view.source.name}). Don't repeat its figures; add at most one short line.`;
}

export const showTool = defineTool({
  name: SHOW_TOOL,
  description:
    'Show charts, headline figures or tables in the chat (a chart, graph or plot; key figures; a table), drawn in the ' +
    'app’s own design, when numbers read better seen ' +
    'than written: a trend, a comparison, key figures, rows of data. Only figures an earlier tool returned in this ' +
    'conversation, with where they came from in `source`; never invent, estimate or fill in numbers. It appears on its ' +
    'own, so don’t repeat its figures.',
  input: showInput,
  deferLoading: true,
  async execute(input) {
    const view = toResultView(input);
    return ok(shownLine(view), { view });
  },
});
