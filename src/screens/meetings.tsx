/** Roci's meetings screen for agents' apps: the meetings a `find` returned, drawn with the same list chat shows. */

import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useApp } from '@modelcontextprotocol/ext-apps/react';
import { MeetingList } from '@shared/components/MeetingList';
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

function MeetingsScreen() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const { app } = useApp({
    appInfo: { name: APP_CONFIG.name, version: __APP_VERSION__ },
    capabilities: {},
    autoResize: true,
    onAppCreated: (created) => {
      created.ontoolresult = (result) => setRows(meetingsOf(result.structuredContent));
    },
  });
  useScreenTheme(app);
  if (rows.length === 0) return null;
  return <MeetingList rows={rows} className="p-2" />;
}

const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<MeetingsScreen />);
