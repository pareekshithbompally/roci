/**
 * MeetingCitationDrawer
 *
 * Slide-in panel that opens when user clicks a citation card in ChatView.
 * Shows meeting summary and transcript (with excerpt highlighted).
 * Uses CSS transition, not a Radix Dialog — it's a positional overlay within ChatView.
 */

import React, { useState, useCallback } from 'react';
import { X, ExternalLink, FileText, Mic } from 'lucide-react';
import ParsedTranscript from '@/components/ParsedTranscript';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { MeetingCitation, HistoryItem } from '@/types';

interface MeetingCitationDrawerProps {
  citation: MeetingCitation | null;
  meeting: HistoryItem | null;
  onClose: () => void;
  onOpenInMain?: () => void;
}

type DrawerTab = 'summary' | 'transcript';

export const MeetingCitationDrawer: React.FC<MeetingCitationDrawerProps> = ({
  citation,
  meeting,
  onClose,
  onOpenInMain,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('transcript');
  const isOpen = citation !== null;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  return (
    <>
      {/* Backdrop — scrim + click-to-close */}
      <div
        className={`absolute inset-0 z-10 transition-opacity duration-300 ${
          isOpen
            ? `${SURFACE.overlay} pointer-events-auto`
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`absolute right-0 inset-y-0 z-20 w-[420px] flex flex-col border-l ${BORDER.default} ${SURFACE.modal} shadow-xl transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-label="Meeting details"
        aria-modal="true"
      >
        {/* Header */}
        <div className={`shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b ${BORDER.default}`}>
          <div className="flex items-start gap-2.5 min-w-0">
            <Mic className={`w-4 h-4 shrink-0 mt-0.5 ${TEXT.faint}`} />
            <div className="min-w-0">
              <h3 className={`text-sm font-semibold ${TEXT.primary} truncate`}>
                {citation?.meetingTitle ?? ''}
              </h3>
              {citation && (
                <p className={`text-[11px] ${TEXT.faint} mt-0.5`}>
                  {new Date(citation.meetingTimestamp).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`shrink-0 ${COMPONENT.iconButtonSm}`}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className={`shrink-0 flex border-b ${BORDER.default} px-4`}>
          {(['transcript', 'summary'] as DrawerTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 px-3 text-xs font-medium capitalize border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? COMPONENT.tabActive
                  : COMPONENT.tabDefault
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {!meeting ? (
            /* Meeting not found */
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <FileText className={`w-10 h-10 ${TEXT.faint}`} />
              <p className={`text-sm ${TEXT.muted} text-center`}>Meeting not found</p>
            </div>
          ) : activeTab === 'summary' ? (
            /* Summary tab */
            <div className={`text-sm ${TEXT.secondary} leading-relaxed whitespace-pre-wrap`}>
              {meeting.summary || <span className={TEXT.faint}>No summary available.</span>}
            </div>
          ) : (
            /* Transcript tab with highlight */
            <ParsedTranscript
              text={meeting.transcript}
              highlightText={citation?.excerpt}
            />
          )}
        </div>

        {/* Footer */}
        {meeting && onOpenInMain && (
          <div className={`shrink-0 border-t ${BORDER.default} px-4 py-3`}>
            <button
              onClick={onOpenInMain}
              className={`flex items-center gap-2 text-xs ${TEXT.link} hover:underline transition-colors`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View full meeting
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default MeetingCitationDrawer;
