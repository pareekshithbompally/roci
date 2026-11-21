/** A graph: nodes sized by how central they are and coloured by kind (token colours), the links between them; clicking a
 *  node selects it and lights up its neighbours and the names of their links. The drawing (sigma, WebGL) loads on first
 *  use, so screens without a graph never pay for it. */

import { Suspense, lazy, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { UI_CONFIG } from '@config/ui.config';
import { IconButton } from './button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from './dialog';
import { Text } from './text';
import { Swatch } from './swatch';

export interface GraphViewNode {
  id: string;
  label: string;
  /** Picks its colour from `kindTokens`. */
  kind: string;
  /** How central it is (size). */
  rank: number;
  /** Its community: nodes of one start together in the layout. */
  group: number;
}

export interface GraphViewEdge {
  source: string;
  target: string;
  /** Shown on the link while either end is selected or hovered. */
  relation: string;
}

export interface GraphViewProps {
  nodes: readonly GraphViewNode[];
  edges: readonly GraphViewEdge[];
  /** Each kind's colour token (`--viz-1` …). */
  kindTokens: Record<string, string>;
  /** A kind drawn smallest whatever its rank (memories beside the entities they are about). */
  smallKind?: string;
  /** Link names never written on the link (structural ones, like a meeting's "discussed"). */
  quietRelations?: readonly string[];
  selected: string | null;
  /** A node clicked; null when the empty space is. */
  onSelect: (id: string | null) => void;
  /** Plot height in px (from config). */
  height: number;
  /** What it shows, for assistive tech (the page lists the same things in text). */
  label: string;
}

/** What each colour means, under the graph: one swatch and name per kind. */
export interface GraphLegendItem {
  kind: string;
  label: string;
}

function GraphLegend({ items, kindTokens }: { items: readonly GraphLegendItem[]; kindTokens: Record<string, string> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
      {items.map(({ kind, label }) => (
        <li key={kind} className="flex items-center gap-1.5">
          <Swatch token={kindTokens[kind]} />
          <Text variant="caption" tone="muted">{label}</Text>
        </li>
      ))}
    </ul>
  );
}

const GraphCanvas = lazy(() => import('./graph-canvas'));

/** The drawing, loaded on first use. */
function Canvas(props: GraphViewProps & { expanded?: boolean }) {
  return (
    <Suspense fallback={<div style={{ height: props.height }} />}>
      <GraphCanvas {...props} />
    </Suspense>
  );
}

/** The graph in its card, with its legend; ⤢ opens it large in a sheet (same selection), Esc or × closes it. */
export function GraphView({ legend, ...props }: GraphViewProps & { legend?: readonly GraphLegendItem[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div className="relative">
        <Canvas {...props} />
        <div className="absolute right-2 top-2">
          <IconButton icon={Maximize2} label="Expand" size="sm" onClick={() => setExpanded(true)} />
        </div>
      </div>
      {legend && <GraphLegend items={legend} kindTokens={props.kindTokens} />}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent size="full" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{props.label}</DialogTitle>
              <DialogClose asChild>
                <IconButton icon={X} label="Close" size="sm" />
              </DialogClose>
            </DialogHeader>
            {expanded && <Canvas {...props} expanded height={Math.round(window.innerHeight * UI_CONFIG.graph.expandedHeight)} />}
            {legend && <GraphLegend items={legend} kindTokens={props.kindTokens} />}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
