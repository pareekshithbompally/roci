/** Opening a document to read: on a Mac its own window (like Preview: beside your work, several at once, ⌘W closes; one
 *  window per document, brought forward and told the page when it is already open); on iPhone the reader page over
 *  Knowledge. An answer's page pill and Knowledge's ⤢ and ✦ all open it here. */

import { LogicalPosition } from '@tauri-apps/api/dpi';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { platform } from '@platform/index';
import { useAppStore } from '@shared/stores/appStore';
import { useKnowledgeStore } from '@shared/stores/knowledgeStore';
import { READER } from '@config/knowledgeLibrary.config';

/** What to open: the document (its app path), the page to show, and whether its chat opens with it. */
export interface ReaderRequest {
  path: string;
  page?: number;
  asking: boolean;
}

/** A document's window label: one per document (labels take letters, digits, - and _ only). */
const labelOf = (path: string) => `reader-${path.replace(/[^A-Za-z0-9_-]/g, '_')}`;

function addressOf({ path, page, asking }: ReaderRequest): string {
  const params = new URLSearchParams({ [READER.param.path]: path });
  if (page) params.set(READER.param.page, String(page));
  if (asking) params.set(READER.param.ask, '1');
  return `/?${params.toString()}`;
}

/** The request a reader window was opened with, from its address; none in the main window. */
export function readerRequestFromAddress(): ReaderRequest | null {
  const params = new URLSearchParams(window.location.search);
  const path = params.get(READER.param.path);
  if (!path) return null;
  const page = Number(params.get(READER.param.page));
  return { path, page: Number.isFinite(page) && page > 0 ? page : undefined, asking: params.get(READER.param.ask) === '1' };
}

async function openWindow(request: ReaderRequest, title: string): Promise<void> {
  const label = labelOf(request.path);
  const open = await WebviewWindow.getByLabel(label);
  if (open) {
    await open.emit(READER.event, request);
    await open.setFocus();
    return;
  }
  const { width, height, minWidth, minHeight, trafficLights } = READER.window;
  const reader = new WebviewWindow(label, {
    url: addressOf(request),
    title,
    width,
    height,
    minWidth,
    minHeight,
    hiddenTitle: true,
    titleBarStyle: 'overlay',
    trafficLightPosition: new LogicalPosition(trafficLights.x, trafficLights.y),
  });
  reader.once('tauri://error', (event) => console.error('[reader] Window not opened:', request.path, event.payload));
}

/** Opens the document at `request.path` to read (named `title`). */
export function openReader(request: ReaderRequest, title: string): void {
  if (platform.hasWindowChrome) {
    void openWindow(request, title).catch((error: unknown) => console.error('[reader] Window not opened:', request.path, error));
    return;
  }
  useKnowledgeStore.setState({ selected: { kind: 'file', key: request.path }, reading: { key: request.path, page: request.page, asking: request.asking } });
  useAppStore.getState().setCurrentView('knowledge');
}
