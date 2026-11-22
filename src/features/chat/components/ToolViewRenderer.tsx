/** What a tool made, shown right after its row: one renderer per kind. Roci's own views (an image, a chart, figures, a
 *  table) are drawn natively from kit parts; a plugin's screen runs in its sandboxed frame. */

import React from 'react';
import { ChartView, StatsView, TableView } from '@shared/components';
import type { ToolView } from '@extensions/tools/types';
import { MediaPartRenderer } from './MediaPartRenderer';
import { McpAppView } from './McpAppView';

interface RendererProps<V extends ToolView> {
  view: V;
  /** Sends text as the user's next message (a plugin screen's `ui/message`). */
  onSend?: (text: string) => void;
}

type Renderers = { [K in ToolView['kind']]: React.FC<RendererProps<Extract<ToolView, { kind: K }>>> };

const RENDERERS: Renderers = {
  image: ({ view }) => <MediaPartRenderer media={view.image} />,
  app: ({ view, onSend }) => <McpAppView app={view.app} title={view.title} onSend={onSend} />,
  chart: ({ view }) => <div className="my-2"><ChartView view={view} /></div>,
  stats: ({ view }) => <div className="my-2"><StatsView view={view} /></div>,
  table: ({ view }) => <div className="my-2"><TableView view={view} /></div>,
};

export const ToolViewRenderer: React.FC<RendererProps<ToolView>> = ({ view, onSend }) => {
  // Each kind's renderer takes that kind; TypeScript can't follow the pairing through the lookup.
  const Render = RENDERERS[view.kind] as React.FC<RendererProps<ToolView>>;
  return <Render view={view} onSend={onSend} />;
};
