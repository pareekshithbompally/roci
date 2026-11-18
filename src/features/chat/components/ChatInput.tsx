/** Chat composer: send, shortcuts, @ mentions, attachments, web search, and voice input. */

import React, { KeyboardEvent, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Square, Plus, X, FileText, Music, Film, Image as ImageIcon, Mic, Pause, Play } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MeetingMentionPopup } from './MeetingMentionPopup';
import { ContextChips } from './ContextChips';
import { ModelPicker } from './ModelPicker';
import { ToolsPicker } from './tools/ToolsPicker';
import { ReasoningPicker } from './ReasoningPicker';
import { ATTACH_OPTIONS, ComposerAddSheet } from './ComposerAddSheet';
import { ComposerAddMenu } from './ComposerAddMenu';
import { ContextRing, Icon, IconButton, Input, Popover, PopoverAnchor, Surface, Text, Textarea, cn } from '@shared/ui';
import type { ContextUsage } from '@shared/hooks/useContextUsage';
import {
} from '@shared/ui';
import { LAYOUT } from '@config/layout.config';
import { shortcutLabel } from '@features/shortcuts';
import { registerChatComposer } from '@features/chat/stores';
import { canSendDraft } from '@features/chat/utils';
import { COMPOSER_MAX_HEIGHT_PX, DICTATION_COPY } from '@config/chat.config';
import { useRecordingMeetingId } from '@features/recording';
import { platform } from '@platform/index';
import type { MeetingListItem } from '@services/meetingReferenceService';
import type { ChatPart } from '@shared/types';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import { DotScope } from '@features/chat/components/dot-scope';
import { LiveTranscript } from '@features/chat/components/voice/LiveTranscript';
import type { LiveText } from '@services/ai/transcription';
import { useFormFactor } from '@platform/formFactor';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import {
  voiceTransition,
  voicePillSettled,
  voicePillCollapsed,
  VOICE_HANDOFF_S,
} from './voice/voiceTransition';

/** Everything + offers, plus video (drop and paste). */
const ACCEPTED_FILE_TYPES = [...ATTACH_OPTIONS.map(({ accept }) => accept), 'video/*'].join(',');

/** Phone: one short placeholder (iOS); the rotating hints are a desktop affordance (⌘ shortcuts, @). */
const PHONE_PLACEHOLDER = 'Ask anything';

const PLACEHOLDER_HINTS = [
  'Ask anything...',
  'Type @ to add meeting context',
  `Press ${shortcutLabel('focusChat')} to jump here`,
  'Ask about your meetings...',
];

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isLoading?: boolean;
  /** Derived context-window usage for the gauge; ring hides when null/undefined. */
  contextUsage?: ContextUsage | null;
  disabled?: boolean;
  /** Available meetings for @ mention */
  availableMeetings?: MeetingListItem[];
  /** Currently selected meeting references */
  selectedMeetings?: MeetingListItem[];
  /** Callback when meeting selection changes */
  onMeetingSelect?: (meetings: MeetingListItem[]) => void;
  /** Pending file attachments */
  attachments?: ChatPart[];
  /** Callback to add a file attachment */
  onAttach?: (file: File) => void;
  /** Callback to remove a pending attachment by index */
  onRemoveAttachment?: (index: number) => void;
  /** Callback when a screenshot is captured (base64 PNG, display name) */
  onScreenshot?: (base64: string, name: string) => void;
  /** Whether to show the mic voice-input button */
  showSpeechInput?: boolean;
  /** Current speech state — drives recording UI */
  speechState?: SpeechState;
  /** Live mic stream for waveform visualization */
  micStream?: MediaStream | null;
  /** Dictation's text so far when it's live (shown under the pill); null otherwise. */
  liveText?: LiveText | null;
  /** Elapsed recording seconds */
  speechElapsed?: number;
  onSpeechStart?: () => void;
  onSpeechStop?: () => void;
  onSpeechTogglePause?: () => void;
  onSpeechCancel?: () => void;
}

/** Get a display name for an attachment part */
function getAttachmentName(part: ChatPart): string {
  switch (part.type) {
    case 'image': return part.alt || 'Image';
    case 'audio': return 'Audio';
    case 'video': return part.alt || 'Video';
    case 'document': return part.fileName;
    default: return 'File';
  }
}

/** Get the icon for an attachment type */
function AttachmentIcon({ type }: { type: ChatPart['type'] }) {
  switch (type) {
    case 'image': return <Icon icon={ImageIcon} size="xs" />;
    case 'audio': return <Icon icon={Music} size="xs" />;
    case 'video': return <Icon icon={Film} size="xs" />;
    default: return <Icon icon={FileText} size="xs" />;
  }
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isLoading = false,
  contextUsage,
  disabled = false,
  availableMeetings = [],
  selectedMeetings = [],
  onMeetingSelect,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  onScreenshot,
  showSpeechInput = false,
  speechState = 'idle',
  micStream = null,
  liveText = null,
  speechElapsed = 0,
  onSpeechStart,
  onSpeechStop,
  onSpeechTogglePause,
  onSpeechCancel,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  // One hint per composer (picked when it opens): it varies between chats without a timer waking the app.
  const [hintIndex] = useState(() => Math.floor(Math.random() * PLACEHOLDER_HINTS.length));
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  // Phone (iOS): one row — + (opens the Add sheet) · the field · mic or send; the top bar owns the model.
  const phone = useFormFactor() === 'phone';
  const recordingMeetingId = useRecordingMeetingId();
  const [addOpen, setAddOpen] = useState(false);
  // Register this textarea as the composer ⌘L focuses
  useEffect(() => {
    registerChatComposer(inputRef.current);
    return () => registerChatComposer(null);
  }, []);

  // Auto-resize textarea (wrapped in rAF to avoid interrupting OS spell checker session)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [value]);

  // Handle @ character detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    // Check if @ was just typed
    if (newValue[cursorPos - 1] === '@' && (cursorPos === 1 || newValue[cursorPos - 2] === ' ' || newValue[cursorPos - 2] === '\n')) {
      setShowMentionPopup(true);
    }

    onChange(newValue);
  };

  // Handle meeting selection
  const handleMeetingSelect = (meetingId: string) => {
    const meeting = availableMeetings.find(m => m.id === meetingId);
    if (!meeting || !onMeetingSelect) return;

    const isAlreadySelected = selectedMeetings.some(m => m.id === meetingId);

    if (isAlreadySelected) {
      onMeetingSelect(selectedMeetings.filter(m => m.id !== meetingId));
    } else {
      onMeetingSelect([...selectedMeetings, meeting]);
    }

    // Remove the @ from input and close popup
    const atIndex = value.lastIndexOf('@');
    if (atIndex !== -1) {
      onChange(value.slice(0, atIndex) + value.slice(atIndex + 1));
    }
    closeMentionPopup();
  };

  // Close popup (state only — focus is restored by Radix onCloseAutoFocus)
  const closeMentionPopup = useCallback(() => {
    setShowMentionPopup(false);
  }, []);

  // Restore focus to the textarea (called by popover close lifecycle)
  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // Remove a meeting from selection
  const handleRemoveMeeting = (meetingId: string) => {
    if (onMeetingSelect) {
      onMeetingSelect(selectedMeetings.filter(m => m.id !== meetingId));
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !onAttach) return;
    for (const file of Array.from(e.target.files)) {
      onAttach(file);
    }
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  // Open file picker with a specific accept filter
  const openFilePicker = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // While mention popup is open, don't process sends from the textarea
    if (showMentionPopup) return;
    // iOS: Return is a new line; the send button sends.
    if (phone) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && canSendDraft(value, attachments)) {
        // Defer send by one frame so macOS autocorrect can commit its replacement first
        requestAnimationFrame(() => onSend());
      }
    }
  };

  const canSend = !isLoading && !disabled && canSendDraft(value, attachments);
  const isStarting = speechState === 'starting';
  const isRecording = speechState === 'recording';
  const isPaused = speechState === 'paused';
  const isTranscribing = speechState === 'transcribing';
  const isCapturing = isStarting || isRecording || isPaused || isTranscribing;

  // ── Recording pill geometry & orchestration ───────────────────────────────
  const reduceMotion = useReducedMotion() ?? false;
  const composer = DOT_SCOPE_CONFIG.composer;
  const scopeZoom = composer.plateHeight / DOT_SCOPE_CONFIG.tuning.height;

  // Pill holds through a handoff beat after transcription so the processing state is seen.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (isCapturing) {
      setOverlayOpen(true);
      return;
    }
    const timer = setTimeout(() => setOverlayOpen(false), VOICE_HANDOFF_S * 1000);
    return () => clearTimeout(timer);
  }, [isCapturing]);

  // Pill owns the slot from capture start until the handoff beat; it rises in and sinks back mirrored.
  const voiceActive = isCapturing || overlayOpen;
  const handoff = !isCapturing && overlayOpen;

  // Recording shape from mic press (flat traces while warming up); processing shape once transcription starts.
  const scopeStage: 'recording' | 'processing' =
    isTranscribing || handoff ? 'processing' : 'recording';
  const scopeLabel = isTranscribing || handoff
    ? 'Transcribing'
    : isStarting ? 'Starting' : isPaused ? 'Paused' : 'Recording';

  // Escape is the master kill switch at every stage of the capture.
  useEffect(() => {
    if (!voiceActive || !onSpeechCancel) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onSpeechCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voiceActive, onSpeechCancel]);

  // Return the caret to the textarea once the box has expanded back.
  const wasVoiceActive = useRef(false);
  useEffect(() => {
    if (wasVoiceActive.current && !voiceActive) {
      inputRef.current?.focus();
    }
    wasVoiceActive.current = voiceActive;
  }, [voiceActive]);

  // Composer returns as one unit, titles and buttons as a second beat; tweens only, never springs.
  const formattedElapsed = `${String(Math.floor(speechElapsed / 60)).padStart(2, '0')}:${String(speechElapsed % 60).padStart(2, '0')}`;

  // The field and the send controls, arranged by the layout below (Mac: box + toolbar; phone: one row).
  const canDictate = showSpeechInput && !!onSpeechStart && !isLoading;
  // iPhone: a recording holds the one audio session, so the mic is greyed until it stops.
  const micHeld = platform.sharesAudioSession && recordingMeetingId !== null;
  const micLabel = micHeld ? DICTATION_COPY.offWhileRecording : 'Voice input';
  // Phone: the mic takes the send button's place while there is nothing to send.
  const micInSendSlot = phone && canDictate && !canSendDraft(value, attachments);

  const textField = (
    <Text as="div" variant="reading" className={phone ? 'min-w-0 flex-1 py-1.5' : 'px-3 pt-3 pb-1'}>
      <Textarea
        variant="bare"
        ref={inputRef}
        aria-label="Message"
        placeholder={phone ? PHONE_PLACEHOLDER : PLACEHOLDER_HINTS[hintIndex]}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={disabled || isLoading}
        rows={1}
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
        className={phone ? 'max-h-32' : 'min-h-9 max-h-48'}
      />
    </Text>
  );

  // Phone: every item in the row is one control height, so +, the text line and send share a centre line (Messages).
  const controlSize = phone ? 'sm' : 'md';
  const sendControls = (
    <div className="flex items-center gap-2">
      {canDictate && !phone && (
        <IconButton icon={Mic} label={micLabel} size="toolbar" onClick={onSpeechStart} disabled={disabled || micHeld} />
      )}
      {isLoading ? (
        <IconButton icon={Square} label="Stop generation" variant="danger" filled size={controlSize} className="shrink-0" onClick={onStop} />
      ) : micInSendSlot ? (
        <IconButton icon={Mic} label={micLabel} size={controlSize} onClick={onSpeechStart} disabled={disabled || micHeld} />
      ) : (
        <IconButton icon={ArrowUp} label="Send message" variant="primary" size={controlSize} onClick={onSend} disabled={!canSend} />
      )}
    </div>
  );

  return (
    <div className={cn('relative px-4 py-2', LAYOUT.chatColumn, phone && 'flex items-end gap-2')}>
      {/* Phone (Messages): the round + stands apart from the capsule field; while dictating the pill has the row alone. */}
      {phone && !voiceActive && <IconButton icon={Plus} label="Add" size="fab" variant="bar" onClick={() => setAddOpen(true)} />}
      <Popover anchored open={showMentionPopup} onOpenChange={(open) => { if (!open) closeMentionPopup(); }}>
      <PopoverAnchor asChild>
      {/* Composer never unmounts (an exit flashes box chrome); the pill is an overlay that moves no layout. */}
      <Surface
        data-testid="composer-frame"
        variant={voiceActive ? 'plain' : 'field'}
        radius={phone ? 'field' : 'xl'}
        className={cn('relative transition-[background-color,box-shadow] duration-300 ease-out', phone && 'min-w-0 flex-1')}
      >
        <AnimatePresence initial={false}>
          {voiceActive && (
            <motion.div
              key="voice"
              data-testid="voice-pill"
              role="region"
              aria-label={scopeLabel}
              className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-4 py-4"
              initial={voicePillCollapsed}
              animate={voicePillSettled}
              exit={{ ...voicePillCollapsed, transition: voiceTransition(reduceMotion, 'pillOut') }}
              transition={voiceTransition(reduceMotion, 'pillIn')}
            >
              <DotScope
                stage={scopeStage}
                stream={isPaused ? null : micStream}
                label={scopeLabel}
                zoom={scopeZoom}
                margins={{ x: composer.marginX, y: composer.marginY }}
              />
              {/* Live words sit right under the pill; the controls go below them, so neither squeezes the other on a phone. */}
              {liveText && <LiveTranscript text={liveText} />}
              {/* Fixed height keeps the pill pinned while its controls swap. */}
              <div className="mt-3 flex h-16 items-start justify-center">
                <AnimatePresence initial={false} mode="wait">
                {(isRecording || isPaused) ? (
                  <motion.div
                    key="controls"
                    className="flex flex-col items-center gap-1.5"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4, transition: voiceTransition(reduceMotion, 'controlOut') }}
                    transition={voiceTransition(reduceMotion, 'controlIn')}
                  >
                    <div className="flex items-center gap-2">
                      {/* Stop — ends capture, transcription takes over */}
                      <IconButton icon={Square} label="Stop recording" variant="danger" filled onClick={onSpeechStop} />
                      {/* Pause / Resume */}
                      <IconButton
                        icon={isPaused ? Play : Pause}
                        filled
                        label={isPaused ? 'Resume recording' : 'Pause recording'}
                        variant="outline"
                        onClick={onSpeechTogglePause}
                      />
                    </div>
                    <Text variant="caption" tone="muted" className="tabular-nums leading-none">
                      {formattedElapsed}
                    </Text>
                  </motion.div>
                ) : isTranscribing ? (
                  <motion.div
                    key="cancel"
                    className="flex flex-col items-center gap-1.5"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4, transition: voiceTransition(reduceMotion, 'controlOut') }}
                    transition={voiceTransition(reduceMotion, 'controlIn')}
                  >
                    {/* The pill already reads "Transcribing", so cancel is the only control. */}
                    <IconButton icon={X} label="Cancel voice input" variant="danger" onClick={onSpeechCancel} />
                  </motion.div>
                ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Composer — always mounted, fades flat while the pill owns the slot. */}
        <motion.div
          data-testid="composer-box"
          initial={false}
          animate={{ opacity: voiceActive ? 0 : 1 }}
          transition={voiceTransition(reduceMotion, voiceActive ? 'composerOut' : 'composerIn')}
          aria-hidden={voiceActive || undefined}
          inert={voiceActive || undefined}
          style={voiceActive ? { pointerEvents: 'none' } : undefined}
        >
        {/* Context Chips */}
        <ContextChips
          meetings={selectedMeetings}
          onRemove={handleRemoveMeeting}
        />

        {/* Attachment Preview Strip */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2">
            {attachments.map((part, index) => (
              <Surface
                key={index}
                variant="inset"
                radius="md"
                className="flex items-center gap-1.5 px-2 py-1"
              >
                {part.type === 'image' && part.source.kind === 'data' ? (() => {
                  const imgSrc = `data:${part.mimeType};base64,${part.source.base64}`;
                  const imgAlt = part.alt || 'attachment';
                  return (
                    <Surface radius="md" className="shrink-0 overflow-hidden">
                      <img
                        src={imgSrc}
                        alt={imgAlt}
                        className="block w-8 h-8 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewImage({ src: imgSrc, alt: imgAlt })}
                      />
                    </Surface>
                  );
                })() : (
                  <AttachmentIcon type={part.type} />
                )}
                <Text variant="helper" tone="muted" truncate className="max-w-32">{getAttachmentName(part)}</Text>
                {onRemoveAttachment && (
                  <IconButton icon={X} label="Remove attachment" size="sm" onClick={() => onRemoveAttachment(index)} />
                )}
              </Surface>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <Input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileChange}
          className="hidden"
        />

        {phone ? (
          <div className="flex items-end gap-1 p-1 pl-4">
            {textField}
            {sendControls}
          </div>
        ) : (
          <>
        {textField}
        {/* Toolbar mounts only while idle, so it never competes with the pill's controls. */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left: Attach, model, tools, thinking, context gauge — toolbar-size controls, close together */}
            <div className="flex items-center gap-0.5">
              {/* Attach — files and screenshots only; tools have their own picker */}
              {onAttach && <ComposerAddMenu onPickFiles={openFilePicker} disabled={disabled} onScreenshot={onScreenshot} />}

              <ModelPicker compact />
              <ToolsPicker />
              <ReasoningPicker />

              {/* Context-window gauge (hides when the limit is unknown or no usage yet) */}
              <ContextRing usage={contextUsage ?? null} />
            </div>

            {sendControls}
          </div>
          </>
        )}
            </motion.div>
      </Surface>
      </PopoverAnchor>

      {/* Meeting Mention Popup (renders as PopoverContent) */}
      <MeetingMentionPopup
        meetings={availableMeetings}
        selectedIds={selectedMeetings.map(m => m.id)}
        onSelect={handleMeetingSelect}
        onClose={focusInput}
      />
      </Popover>

      {phone && (
        <ComposerAddSheet open={addOpen} onOpenChange={setAddOpen} onPickFiles={onAttach && !disabled ? openFilePicker : undefined} contextUsage={contextUsage} />
      )}

      {/* Image Quick Look Overlay — portaled to body to escape overflow-hidden ancestors */}
      {previewImage && createPortal(
        <Surface
          variant="scrim"
          className="fixed inset-0 z-modal flex items-center justify-center animate-fade-in"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setPreviewImage(null); }}
          tabIndex={-1}
          role="dialog"
          ref={(el) => el?.focus()}
        >
          <Surface
            radius="lg"
            className="relative max-w-[80vw] max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.src}
              alt={previewImage.alt}
              className="max-w-[80vw] max-h-[80vh] object-contain"
            />
            <IconButton
              icon={X}
              label="Close preview"
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2"
              onClick={() => setPreviewImage(null)}
            />
            <Surface variant="floating" className="absolute bottom-0 inset-x-0 px-3 py-2">
              <Text variant="helper" tone="muted">{previewImage.alt}</Text>
            </Surface>
          </Surface>
        </Surface>,
        document.body,
      )}
    </div>
  );
};

export default ChatInput;
