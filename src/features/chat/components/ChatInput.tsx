/** Chat composer: send, shortcuts, @ mentions, / saved prompts, attachments, web search, and voice input. */

import React, { KeyboardEvent, useRef, useEffect, useState, useCallback } from 'react';
import { ArrowUp, Square, Plus, Mic } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MeetingMentionPopup } from './MeetingMentionPopup';
import { SavedPromptPopup } from './SavedPromptPopup';
import type { SavedPrompt } from '@config/personalization.config';
import { ContextChips } from './ContextChips';
import { ModelPicker } from './ModelPicker';
import { ToolsPicker } from './tools/ToolsPicker';
import { ReasoningPicker } from './ReasoningPicker';
import { ComposerAddSheet } from './ComposerAddSheet';
import { useAttachOptions } from '@features/chat/hooks/useAttachOptions';
import { useToolCatalog } from '@features/chat/hooks';
import { toolsShare } from './tools/toolsShare';
import { ComposerAddMenu } from './ComposerAddMenu';
import { ContextRing, IconButton, Input, Popover, PopoverAnchor, Surface, Text, Textarea, cn } from '@shared/ui';
import type { ContextRingCost } from '@shared/ui';
import type { ContextUsage } from '@shared/hooks/useContextUsage';
import { LAYOUT } from '@config/layout.config';
import { shortcutLabel } from '@features/shortcuts';
import { registerChatComposer } from '@features/chat/stores';
import { canSendDraft } from '@features/chat/utils';
import { COMPOSER_MAX_HEIGHT_PX, DICTATION_COPY } from '@config/chat.config';
import { useRecordingMeetingId } from '@features/recording';
import { platform } from '@platform/index';
import type { MeetingListItem } from '@services/meetingReferenceService';
import type { FileUIPart } from '@shared/types';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import type { LiveText } from '@services/ai/transcription';
import { useFormFactor } from '@platform/formFactor';
import { AttachmentStrip } from './AttachmentStrip';
import { VoicePill } from './voice/VoicePill';
import { useVoicePill } from './voice/useVoicePill';
import { voiceTransition } from './voice/voiceTransition';

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
  /** The chat's cost so far, shown in the context ring's breakdown. */
  chatCost?: ContextRingCost | null;
  disabled?: boolean;
  /** Currently selected meeting references */
  selectedMeetings?: MeetingListItem[];
  /** Callback when meeting selection changes */
  onMeetingSelect?: (meetings: MeetingListItem[]) => void;
  /** Pending file attachments */
  attachments?: FileUIPart[];
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

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isLoading = false,
  contextUsage,
  chatCost,
  disabled = false,
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
  /** Where the "@" or "/" that opened the popup sits in the draft. */
  const triggerAt = useRef(-1);
  // Only what the chat's model takes is offered.
  const attach = useAttachOptions();
  // The composer's one tool catalog: the Tools menu (or the phone's sheet) and the context ring read it.
  const toolCatalog = useToolCatalog();
  /** The one popover over the chat box: "@" meetings or "/" saved prompts. */
  const [popup, setPopup] = useState<'mention' | 'prompt' | null>(null);
  // One hint per composer (picked when it opens): it varies between chats without a timer waking the app.
  const [hintIndex] = useState(() => Math.floor(Math.random() * PLACEHOLDER_HINTS.length));
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

    // "@" after a space or line start picks meetings; "/" at a line start picks a saved prompt.
    const typed = newValue[cursorPos - 1];
    const before = newValue[cursorPos - 2];
    const lineStart = cursorPos === 1 || before === '\n';
    const opens = typed === '@' && (lineStart || before === ' ') ? 'mention' : typed === '/' && lineStart ? 'prompt' : null;
    if (opens) {
      triggerAt.current = cursorPos - 1;
      setPopup(opens);
    }

    onChange(newValue);
  };

  // Handle meeting selection
  const handleMeetingSelect = (meeting: MeetingListItem) => {
    if (!onMeetingSelect) return;

    const isAlreadySelected = selectedMeetings.some(m => m.id === meeting.id);

    if (isAlreadySelected) {
      onMeetingSelect(selectedMeetings.filter(m => m.id !== meeting.id));
    } else {
      onMeetingSelect([...selectedMeetings, meeting]);
    }

    onChange(replaceTrigger('@', ''));
    closeMentionPopup();
  };

  // Close popup (state only — focus is restored by Radix onCloseAutoFocus)
  const closeMentionPopup = useCallback(() => {
    setPopup(null);
  }, []);

  // A saved prompt takes the place of the "/" that opened the menu.
  const handlePromptSelect = (saved: SavedPrompt) => {
    onChange(replaceTrigger('/', saved.prompt));
    closeMentionPopup();
  };

  // The "@" or "/" that opened the popup, replaced by `insert` (appended instead if the draft no longer has it there).
  const replaceTrigger = (trigger: string, insert: string) => {
    const at = triggerAt.current;
    return value[at] === trigger ? value.slice(0, at) + insert + value.slice(at + 1) : value + insert;
  };

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
    if (popup) return;
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
  const reduceMotion = useReducedMotion() ?? false;
  // The pill owns the slot from capture start until the handoff beat after transcription.
  const pill = useVoicePill(speechState, onSpeechCancel);
  const voiceActive = pill.active;

  // Return the caret to the textarea once the box has expanded back.
  const wasVoiceActive = useRef(false);
  useEffect(() => {
    if (wasVoiceActive.current && !voiceActive) {
      inputRef.current?.focus();
    }
    wasVoiceActive.current = voiceActive;
  }, [voiceActive]);

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

  // Mac: the toolbar under the field (attach, model, tools, thinking, context gauge, then send).
  const toolbar = (
    <div className="flex items-center justify-between px-3 pb-2">
      <div className="flex items-center gap-0.5">
        {/* Attach: files and screenshots only; tools have their own picker. */}
        {onAttach && <ComposerAddMenu attachOptions={attach.options} onPickFiles={openFilePicker} disabled={disabled} onScreenshot={attach.images ? onScreenshot : undefined} />}
        <ModelPicker compact />
        <ToolsPicker catalog={toolCatalog} />
        <ReasoningPicker />
        {/* Context-window gauge (hides when the limit is unknown or no usage yet). */}
        <ContextRing usage={contextUsage ?? null} tools={toolsShare(toolCatalog)} cost={chatCost ?? undefined} />
      </div>
      {sendControls}
    </div>
  );

  return (
    <div className={cn('relative px-4 py-2', LAYOUT.chatColumn, phone && 'flex items-end gap-2')}>
      {/* Phone (Messages): the round + stands apart from the capsule field; while dictating the pill has the row alone. */}
      {phone && !voiceActive && <IconButton icon={Plus} label="Add" size="fab" variant="bar" onClick={() => setAddOpen(true)} />}
      <Popover anchored open={popup !== null} onOpenChange={(open) => { if (!open) closeMentionPopup(); }}>
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
                <VoicePill
                  key="voice"
                  pill={pill}
                  speechState={speechState}
                  stream={micStream}
                  liveText={liveText}
                  elapsed={speechElapsed}
                  reduceMotion={reduceMotion}
                  onStop={onSpeechStop}
                  onTogglePause={onSpeechTogglePause}
                  onCancel={onSpeechCancel}
                />
              )}
            </AnimatePresence>
            {/* Composer: always mounted, fades flat while the pill owns the slot. */}
            <motion.div
              data-testid="composer-box"
              initial={false}
              animate={{ opacity: voiceActive ? 0 : 1 }}
              transition={voiceTransition(reduceMotion, voiceActive ? 'composerOut' : 'composerIn')}
              aria-hidden={voiceActive || undefined}
              inert={voiceActive || undefined}
              style={voiceActive ? { pointerEvents: 'none' } : undefined}
            >
              <ContextChips meetings={selectedMeetings} onRemove={handleRemoveMeeting} />
              <AttachmentStrip attachments={attachments} onRemove={onRemoveAttachment} />
              <Input ref={fileInputRef} type="file" multiple accept={attach.accept} onChange={handleFileChange} className="hidden" />
              {phone ? (
                <div className="flex items-end gap-1 p-1 pl-4">
                  {textField}
                  {sendControls}
                </div>
              ) : (
                <>
                  {textField}
                  {toolbar}
                </>
              )}
            </motion.div>
          </Surface>
        </PopoverAnchor>

        {/* "@" meetings or "/" saved prompts (each renders as PopoverContent) */}
        {popup === 'prompt'
          ? <SavedPromptPopup onSelect={handlePromptSelect} onClose={focusInput} />
          : <MeetingMentionPopup selectedIds={selectedMeetings.map((m) => m.id)} onSelect={handleMeetingSelect} onClose={focusInput} />}
      </Popover>

      {phone && (
        <ComposerAddSheet open={addOpen} onOpenChange={setAddOpen} attachOptions={attach.options} onPickFiles={onAttach && !disabled ? openFilePicker : undefined} contextUsage={contextUsage} toolCatalog={toolCatalog} />
      )}
    </div>
  );
};

export default ChatInput;
