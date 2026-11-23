/** A table `show` drew: the kit data table (sortable headers, figures aligned to the end), its source under it. */

import React, { useMemo } from 'react';
import { DataTable, Section, type DataColumn } from '@shared/ui';
import { RESULT_VIEWS_COPY as COPY } from '@config/resultViews.config';
import type { ResultView } from '@core/ai';
import { SourceLine } from './SourceLine';

type TableViewModel = Extract<ResultView, { kind: 'table' }>;
type Row = { key: string; cells: string[] };

/** A cell with no figure in it ("", "—", "N/A"): it says nothing is there, so it doesn't decide what the column holds. */
const isBlank = (cell: string) => !/\d/.test(cell);

/** A cell's number, read past its currency, percent and grouping marks (a Unicode minus as a minus); null when it isn't one. */
function figureOf(cell: string): number | null {
  const bare = cell.replace(/\u2212/g, '-').replace(/[,%$€£¥\s]/g, '');
  if (bare === '') return null;
  const value = Number(bare);
  return Number.isFinite(value) ? value : null;
}

/** A column whose filled cells are all figures aligns to the end and sorts by value, its blank cells counting as the lowest;
 *  any other sorts by its words. */
function columnOf(header: string, index: number, rows: Row[]): DataColumn<Row> {
  const filled = rows.map((row) => row.cells[index]).filter((cell) => !isBlank(cell));
  const figures = filled.length > 0 && filled.every((cell) => figureOf(cell) !== null);
  return {
    key: `c${index}`,
    header,
    align: figures ? 'end' : 'start',
    cell: (row) => row.cells[index],
    sortValue: (row) => (figures ? (figureOf(row.cells[index]) ?? -Infinity) : row.cells[index]),
  };
}

export const TableView: React.FC<{ view: TableViewModel }> = ({ view }) => {
  const rows = useMemo(() => view.rows.map((cells, i) => ({ key: `r${i}`, cells })), [view.rows]);
  const columns = useMemo(() => view.columns.map((header, i) => columnOf(header, i, rows)), [view.columns, rows]);
  return (
    <Section flush title={view.title} layout="stack" footer={<SourceLine source={view.source} />}>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.key} label={view.title} empty={COPY.emptyTable} />
    </Section>
  );
};
