/** GraphView's drawing (loaded only when a graph shows): sigma draws the nodes and links with WebGL from a graphology graph
 *  laid out once by ForceAtlas2, each community starting in its own place so related nodes settle together. Colours are
 *  read from the tokens on mount and on each light/dark change; selection and hover recolour through sigma's reducers, so
 *  React never redraws the canvas. */

import { useEffect, useRef } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { UI_CONFIG } from '@config/ui.config';
import { cssColour, cssToken } from './utils';
import type { GraphViewProps, GraphViewNode, GraphViewEdge } from './graph-view';

const G = UI_CONFIG.graph;

/** Each node's size from its rank (least to most central → min to max px); a memory stays small. */
function sizeOf(nodes: readonly GraphViewNode[], smallKind: string | undefined): (node: GraphViewNode) => number {
  const ranks = nodes.map((n) => n.rank);
  const [low, high] = [Math.min(...ranks), Math.max(...ranks)];
  const span = high - low || 1;
  return (node) => (node.kind === smallKind ? G.factSize : G.nodeSize.min + ((node.rank - low) / span) * (G.nodeSize.max - G.nodeSize.min));
}

/** The graph laid out: communities start on a circle, each node near its community's place; then ForceAtlas2 settles it. */
function laidOut(nodes: readonly GraphViewNode[], edges: readonly GraphViewEdge[], smallKind: string | undefined): Graph {
  const graph = new Graph({ multi: true });
  const groups = [...new Set(nodes.map((n) => n.group))];
  const size = sizeOf(nodes, smallKind);
  nodes.forEach((node, index) => {
    const angle = (2 * Math.PI * groups.indexOf(node.group)) / groups.length;
    const spread = (2 * Math.PI * index) / nodes.length;
    graph.addNode(node.id, {
      x: Math.cos(angle) * groups.length + Math.cos(spread),
      y: Math.sin(angle) * groups.length + Math.sin(spread),
      size: size(node),
      label: node.label,
      kind: node.kind,
    });
  });
  edges.forEach((edge) => graph.addEdge(edge.source, edge.target, { relation: edge.relation }));
  forceAtlas2.assign(graph, { iterations: G.layoutIterations, settings: forceAtlas2.inferSettings(graph) });
  return graph;
}

/** The token colours as they are now (light or dark). */
function colours(kindTokens: Record<string, string>) {
  return {
    kinds: Object.fromEntries(Object.entries(kindTokens).map(([kind, token]) => [kind, cssColour(token)])),
    label: cssColour('--text-primary'),
    edge: cssColour('--border-strong'),
    edgeActive: cssColour('--text-muted'),
    backdrop: cssColour('--bg-grouped-card'),
    font: getComputedStyle(document.body).fontFamily,
    fontSize: parseFloat(cssToken('--fs-subheadline')),
  };
}

/** A link's name as shown, unless it is a structural one (a meeting's "discussed") that would only repeat itself. */
const namedRelation = (relation: string, quiet: readonly string[] | undefined) => (quiet?.includes(relation) ? null : relation);

export default function GraphCanvas({ nodes, edges, kindTokens, smallKind, quietRelations, selected, onSelect, height, label }: GraphViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const sigma = useRef<Sigma | null>(null);
  const { isDark } = useThemeContext();
  // What the reducers read: changed in place, then one refresh — no new instance, no React render.
  const view = useRef({ selected, hovered: null as string | null, colours: colours(kindTokens) });
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!box.current || nodes.length === 0) return;
    const graph = laidOut(nodes, edges, smallKind);
    // The node in focus (hovered, else selected) and its neighbours stay; the rest fade.
    const near = (node: string) => {
      const active = view.current.hovered ?? view.current.selected;
      return !active || !graph.hasNode(active) || node === active || graph.areNeighbors(node, active);
    };
    const nodeReducer = (node: string, data: NodeDisplayData): Partial<NodeDisplayData> => {
      const c = view.current.colours;
      const active = view.current.hovered ?? view.current.selected;
      const shown = near(node);
      return {
        ...data,
        color: c.kinds[graph.getNodeAttribute(node, 'kind') as string] ?? c.label,
        opacity: shown ? 1 : G.dimOpacity,
        labelColor: c.label,
        labelFont: c.font,
        labelSize: c.fontSize,
        backdropColor: c.backdrop,
        labelVisibility: !shown ? 'hidden' : active ? 'visible' : 'auto',
        zIndex: shown ? 1 : 0,
      };
    };
    const edgeReducer = (edge: string, data: EdgeDisplayData): Partial<EdgeDisplayData> => {
      const c = view.current.colours;
      const active = view.current.hovered ?? view.current.selected;
      const touches = !!active && graph.hasNode(active) && graph.extremities(edge).includes(active);
      return {
        ...data,
        color: touches ? c.edgeActive : c.edge,
        opacity: !active || touches ? 1 : G.dimOpacity,
        label: touches ? namedRelation(graph.getEdgeAttribute(edge, 'relation') as string, quietRelations) : null,
        labelColor: c.label,
      };
    };
    const instance = new Sigma(graph, box.current, {
      // Sizes are screen pixels (sigma 4 defaults to layout units, which a small graph blows up).
      settings: { renderEdgeLabels: true, labelRenderedSizeThreshold: G.labelThreshold, itemSizesReference: 'screen' },
      nodeReducer,
      edgeReducer,
    });
    instance.on('clickNode', ({ node }) => select.current(node));
    instance.on('clickStage', () => select.current(null));
    instance.on('enterNode', ({ node }) => {
      view.current.hovered = node;
      instance.refresh();
    });
    instance.on('leaveNode', () => {
      view.current.hovered = null;
      instance.refresh();
    });
    sigma.current = instance;
    return () => {
      instance.kill();
      sigma.current = null;
    };
  }, [nodes, edges, smallKind, quietRelations]);

  useEffect(() => {
    view.current.colours = colours(kindTokens);
    sigma.current?.refresh();
  }, [isDark, kindTokens]);

  useEffect(() => {
    view.current.selected = selected;
    sigma.current?.refresh();
  }, [selected]);

  return (
    <div ref={box} role="img" aria-label={label} className="w-full" style={{ height }} />
  );
}
