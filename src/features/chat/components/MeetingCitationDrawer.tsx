/**
 * MeetingCitationDrawer
 *
 * Slide-in panel that opens when user clicks a citation card in ChatView.
 * Shows meeting summary and transcript (with excerpt highlighted).
 * Uses CSS transition, not a Radix Dialog — it's a positional overlay within ChatView.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, ExternalLink, FileText, Mic, ArrowLeft, AudioWaveform, Loader2 } from 'lucide-react';
import ParsedTranscript from '@features/transcription/components/ParsedTranscript';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import type { MeetingCitation, HistoryItem } from '@shared/types';

interface MeetingCitationDrawerProps {
  mode: 'list' | 'detail';
  citations: MeetingCitation[] | null;
  activeCitation: MeetingCitation | null;
  meeting: HistoryItem | null;
  isLoading?: boolean;
  onClose: () => void;
  onCitationClick: (citation: MeetingCitation) => void;
  onBack: () => void;
  onOpenInMain?: () => void;
}

type DrawerTab = 'summary' | 'transcript';

export const MeetingCitationDrawer: React.FC<MeetingCitationDrawerProps> = ({
  mode,
  citations,
  activeCitation,
  meeting,
  onClose,
  onCitationClick,
  onBack,
  onOpenInMain,
  isLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('transcript');
  const isOpen = (mode === 'list' && citations !== null && citations.length > 0) || (mode === 'detail' && activeCitation !== null);

  // Reset to transcript tab when we open a new citation
  useEffect(() => {
    if (activeCitation) setActiveTab('transcript');
  }, [activeCitation?.meetingId]);

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
            {mode === 'detail' ? (
              <button
                onClick={onBack}
                className={`w-6 h-6 flex items-center justify-center rounded-md shrink-0 mt-0.5 ${SURFACE.hoverSubtle} transition-colors`}
                title="Back to list"
              >
                <ArrowLeft className={`w-4 h-4 ${TEXT.primary}`} />
              </button>
            ) : (
              <Mic className={`w-4 h-4 shrink-0 mt-0.5 ${TEXT.faint}`} />
            )}
            <div className="min-w-0 mt-[2px]">
              <h3 className={`text-sm font-semibold ${TEXT.primary} truncate`}>
                {mode === 'detail' ? (activeCitation?.meetingTitle ?? '') : 'Meeting Sources'}
              </h3>
              {mode === 'detail' && activeCitation && (
                <p className={`text-[11px] ${TEXT.faint} mt-0.5`}>
                  {new Date(activeCitation.meetingTimestamp).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
              {mode === 'list' && citations && (
                <p className={`text-[11px] ${TEXT.faint} mt-0.5`}>
                  {citations.length} {citations.length === 1 ? 'source' : 'sources'} found
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

        {/* Tabs - Only for detail mode */}
        {mode === 'detail' && (
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
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {mode === 'list' ? (
            /* List Mode */
            <div className="p-2 flex flex-col gap-1">
              {citations?.map((c) => (
                <button
                  key={c.meetingId}
                  onClick={() => onCitationClick(c)}
                  className={`${COMPONENT.listRow} w-full text-left`}
                >
                  <AudioWaveform className={`w-4 h-4 shrink-0 ${TEXT.faint}`} />
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="font-medium text-sm truncate w-full">{c.meetingTitle}</span>
                    <span className={`text-[11px] ${TEXT.faint} shrink-0 mt-0.5`}>
                      {new Date(c.meetingTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : isLoading ? (
            /* Loading State */
            <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
              <Loader2 className={`w-6 h-6 animate-spin ${TEXT.faint}`} />
              <p className={`text-xs ${TEXT.muted}`}>Loading meeting data...</p>
            </div>
          ) : !meeting ? (
            /* Detail Mode: Meeting not found */
            <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
              <FileText className={`w-10 h-10 ${TEXT.faint}`} />
              <p className={`text-sm ${TEXT.muted} text-center`}>Meeting not found</p>
            </div>
          ) : activeTab === 'summary' ? (
            /* Detail Mode: Summary tab */
            <div className={`p-4 text-sm ${TEXT.secondary} leading-relaxed whitespace-pre-wrap`}>
              {meeting.summary || <span className={TEXT.faint}>No summary available.</span>}
            </div>
          ) : (
            /* Detail Mode: Transcript tab with highlight */
            <div className="p-4">
              <ParsedTranscript
                text={meeting.transcript}
                highlightText={activeCitation?.excerpt}
              />
            </div>
          )}
        </div>

        {/* Footer - Only for detail mode */}
        {mode === 'detail' && meeting && onOpenInMain && (
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
