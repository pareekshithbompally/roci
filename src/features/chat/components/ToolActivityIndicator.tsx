/**
 * ToolActivityIndicator Component
 *
 * Live tool-call status shown during loading/streaming states.
 * Design matches Jan AI's tool call pattern: no backgrounds, no pills,
 * no color-coded states. Muted text + wrench icon, inline with chat.
 *
 * Transitions: enter fade-up on appear, exit fade-down on dismiss,
 * label crossfade when phase text changes.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Wrench } from 'lucide-react';
import { useChat } from '@shared/contexts/ChatContext';
import { BORDER, TEXT } from '@config/theme.config';

const MIN_PHASE_MS = 400;
const EXIT_DURATION_MS = 150;

function statusText(toolPhase: string, toolName: string, detail?: string): string {
  if (detail) return detail;
  if (toolPhase === 'error') return `${toolName.replace(/_/g, ' ')} failed`;
  if (toolPhase === 'result') return `Used ${toolName.replace(/_/g, ' ')}`;
  switch (toolName) {
    case 'search_meetings':  return 'Searching meetings…';
    case 'get_meeting':      return 'Loading meeting…';
    case 'list_meetings':    return 'Listing meetings…';
    case 'get_action_items': return 'Getting action items…';
    default: return `Running ${toolName.replace(/_/g, ' ')}…`;
  }
}

export const ToolActivityIndicator: React.FC = () => {
  const { aiActivity } = useChat();

  const [displayed, setDisplayed] = useState<typeof aiActivity>(null);
  const [isExiting, setIsExiting] = useState(false);

  const pendingRef = useRef<typeof aiActivity>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhaseTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!aiActivity?.isCallingTool) {
      pendingRef.current = null;
      const elapsed = Date.now() - lastPhaseTimeRef.current;
      const holdDelay = Math.max(0, MIN_PHASE_MS - elapsed);

      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = setTimeout(() => {
        // Start CSS exit animation, then unmount after it completes
        setIsExiting(true);
        exitTimerRef.current = setTimeout(() => {
          setDisplayed(null);
          setIsExiting(false);
        }, EXIT_DURATION_MS);
      }, holdDelay);
      return;
    }

    pendingRef.current = aiActivity;
    const elapsed = Date.now() - lastPhaseTimeRef.current;
    const delay = Math.max(0, MIN_PHASE_MS - elapsed);

    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = setTimeout(() => {
      setDisplayed(pendingRef.current);
      lastPhaseTimeRef.current = Date.now();
    }, delay);
  }, [aiActivity]);

  useEffect(() => () => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  if (!displayed?.isCallingTool && !isExiting) return null;

  const { toolName = 'tool', toolPhase = 'executing', toolDetail } = displayed ?? {};
  const isRunning = toolPhase === 'calling' || toolPhase === 'executing';
  const label = statusText(toolPhase ?? 'executing', toolName ?? 'tool', toolDetail);

  return (
    <div className={`${isExiting ? 'tool-activity-exit' : 'tool-activity-enter'} flex items-center gap-2 py-2 my-1`}>
      {isRunning && (
        <span
          className={`inline-block w-3 h-3 rounded-full border ${BORDER.strong} flex-shrink-0`}
          style={{ borderTopColor: 'transparent', animation: 'tool-dot-spin 700ms linear infinite' }}
        />
      )}
      <Wrench className={`w-3.5 h-3.5 flex-shrink-0 ${TEXT.faint}`} />
      <span
        key={`${toolName}-${toolPhase}`}
        className={`tool-phase-appear text-[13px] ${TEXT.muted} capitalize`}
      >
        {label}
      </span>
    </div>
  );
};

export default ToolActivityIndicator;
