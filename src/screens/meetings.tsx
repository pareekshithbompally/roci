/** Roci's screen for `find` in agents' apps: the meetings it returned, drawn with the same list chat shows; a find in
 *  chats, to-dos or memories shows its own text, so the screen is never an empty frame. */

import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { MeetingList } from '@shared/components/MeetingList';
import { Text } from '@shared/ui';
import { isRecord } from '@shared/utils/validators';
import { APP_CONFIG } from '@config/app.config';
import type { MeetingRow } from '@extensions/tools/types';
import { useScreenTheme } from './useScreenTheme';
import '@/src/styles/tokens.css';
import './screen.css';

/** The rows a find's `structuredContent` carries; none for a find that wasn't in meetings. */
function meetingsOf(content: unknown): MeetingRow[] {
  return isRecord(content) && Array.isArray(content.meetings) ? (content.meetings as MeetingRow[]) : [];
}

/** A result's text blocks, joined. */
const textOf = (blocks: ReadonlyArray<{ type: string; text?: string }>): string =>
  blocks.flatMap((block) => (block.type === 'text' && block.text ? [block.text] : [])).join('\n');

interface Found {
  rows: MeetingRow[];
  text: string;
}

function MeetingsScreen() {
  const [found, setFound] = useState<Found>({ rows: [], text: '' });
  const { app } = useApp({
    appInfo: { name: APP_CONFIG.name, version: __APP_VERSION__ },
    capabilities: {},
    autoResize: true,
    onAppCreated: (created) => {
      created.ontoolresult = (result) => setFound({ rows: meetingsOf(result.structuredContent), text: textOf(result.content) });
    },
  });
  useScreenTheme(app);
  if (found.rows.length > 0) return <MeetingList rows={found.rows} className="p-2" />;
  if (!found.text) return null;
  return <Text as="p" variant="body" className="whitespace-pre-wrap p-2">{found.text}</Text>;
}

const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<MeetingsScreen />);
