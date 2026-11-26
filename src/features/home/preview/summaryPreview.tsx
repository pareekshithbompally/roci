/** Dev-only: the meeting Summary tab (the real `SummaryPane`) with example meetings, to check the layout in every state and
 *  both appearances without recording one. Not part of the app bundle. */

import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.css';
import { Tabs, Text } from '@shared/ui';
import type { StructuredSummary } from '@shared/types';
import type { MeetingPhase } from '@shared/types/meetingPhase';
import { SummaryPane } from '@features/home/components/SummaryTab';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@shared/query/queryClient';
import { SettingsProvider } from '@shared/contexts/SettingsContext';

const FULL: StructuredSummary = {
  overview: 'The "partial patient" definition now counts enrolled data. Duplicate hospital names (Tata Memorial, TMH) block clean reporting, so Anaya merges the variants before the dashboard is re-run, and Parikshit confirms the definition change by Friday.',
  decisionsMade: ['"Partial patient" is counted from enrolled data from this month on', 'Hospital names are merged into one master list before reporting'],
  actionItems: [
    { id: 'a1', text: 'Confirm the definition change with the medical team', owner: 'Parikshit', dueDate: '2026-11-21', completed: false },
    { id: 'a2', text: 'Merge the 14 name variants of Tata Memorial Hospital', owner: 'Anaya', completed: false },
    { id: 'a3', text: 'Share the cleaned dashboard in the data channel', completed: false },
  ],
  keyDiscussionPoints: [
    'FOC documents go through the K navigators into the CRM (Frappe)',
    'Prescriptions are part of data capture, alongside enrolment forms',
    'The same hospital appears under many names, which splits its numbers',
    'Vishakam is present at the hospital and can verify on site',
  ],
  nextSteps: ['Re-run the Vercel dashboard once the names are merged'],
};

const SPARSE: StructuredSummary = {
  overview: 'The speaker tested the live transcription and AI notes for the fourth time; it ended with frustration over delays in real-time updates.',
  keyDiscussionPoints: ['Live transcription arrives about 10 seconds late', 'AI notes do not update in real time'],
};

const STATES = { full: 'Full', sparse: 'Sparse', writing: 'Writing' } as const;
type State = keyof typeof STATES;
const THEMES = { dark: 'Dark', light: 'Light' } as const;
type Theme = keyof typeof THEMES;

const READY: MeetingPhase = { kind: 'ready' };
const SUMMARIZING: MeetingPhase = { kind: 'summarizing' };

const options = <T extends string>(labels: Record<T, string>) => (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

const Preview: React.FC = () => {
  const [state, setState] = useState<State>('full');
  const [theme, setTheme] = useState<Theme>('dark');
  const pickTheme = (next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.classList.toggle('light', next === 'light');
    setTheme(next);
  };
  const result = state === 'writing' ? { summary: '' } : { summary: '', structuredSummary: state === 'full' ? FULL : SPARSE };
  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-3 px-6 pt-4 pb-3">
        <Text as="h1" variant="pageTitle">Data quality &amp; cleanup — Anaya dashboards</Text>
        <div className="ml-auto flex gap-2">
          <Tabs items={options(STATES)} value={state} onValueChange={setState} />
          <Tabs items={options(THEMES)} value={theme} onValueChange={pickTheme} />
        </div>
      </div>
      <SummaryPane result={result} phase={state === 'writing' ? SUMMARIZING : READY} />
    </div>
  );
};

const root = document.getElementById('root');
// the model logos read the Model Icons setting; outside the app it loads its defaults
if (root) ReactDOM.createRoot(root).render(<QueryClientProvider client={queryClient}><SettingsProvider><Preview /></SettingsProvider></QueryClientProvider>);
