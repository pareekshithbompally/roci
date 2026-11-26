/** Chat composer: send, shortcuts, @ mentions, / saved prompts, attachments, web search, and voice input. */

import React, { KeyboardEvent, useRef, useEffect, useState, useCallback } from 'react';
import { ArrowUp, Circle, Square, Plus, Mic } from 'lucide-react';
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
import { COMPOSER_ADD_COPY, COMPOSER_COPY, COMPOSER_ICON_ONLY_BELOW_PX, COMPOSER_MAX_HEIGHT_PX, DICTATION_COPY } from '@config/chat.config';
import { useElementWidth } from '@shared/hooks/useElementWidth';
import { useRecordingMeetingId } from '@features/recording';
import { platform } from '@platform/index';
import { useKeyboardSettled } from '@shared/hooks/useKeyboardSettled';
import type { MeetingListItem } from '@services/meetingReferenceService';
import type { FileUIPart } from '@shared/types';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import type { VoiceEnding } from '@features/chat/hooks/useVoiceCapture';
import type { LiveText } from '@services/ai/transcription';
import { useFormFactor } from '@platform/formFactor';
import { AttachmentStrip } from './AttachmentStrip';
import { VoicePill } from './voice/VoicePill';
import { useVoicePill } from './voice/useVoicePill';
import { voiceTransition } from './voice/voiceTransition';

/** Phone: one short placeholder (iOS); the rotating hints are a desktop affordance (⌘ shortcuts, @). */
const PLACEHOLDER_HINTS = COMPOSER_COPY.hints(shortcutLabel('focusChat'));

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
  /** How the dictation ended — sets how the pill leaves (settle into the box, lift off as sent, shake on failure) */
  speechEnding?: VoiceEnding;
  /** The live stream dropped mid-dictation: its words stay, the recording is transcribed on stop */
  speechLiveLost?: boolean;
  /** The voice area has finished leaving — a waiting Send goes out now */
  onVoiceGone?: () => void;
  /** The composer sits over a conversation: the voice area gets a backdrop so its words never sit on messages */
  overContent?: boolean;
  /** Live mic stream for waveform visualization */
  micStream?: MediaStream | null;
  /** Dictation's text so far when it's live (shown under the pill); null otherwise. */
  liveText?: LiveText | null;
  /** Elapsed recording seconds */
  speechElapsed?: number;
  onSpeechStart?: () => void;
  onSpeechStop?: () => void;
  /** Dictation's Send: transcribe, then send the draft */
  onSpeechSend?: () => void;
  onSpeechCancel?: () => void;
  /** The field's hint in place of the rotating ones (the meeting chat: "Ask about this meeting…"). */
  placeholder?: string;
  /** The meeting this chat is about (the meeting chat window): attached, but its chip isn't repeated in the box. */
  scopeMeetingId?: string;
  /** Starts a meeting recording (home): a red dot at the bar's end while the draft is empty and nothing records. */
  onRecord?: () => void;
  /** Cards over the bar (a tool's permission, proposals to confirm), inside the composer's own inset so their edges are its. */
  above?: React.ReactNode;
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
  speechEnding = 'box',
  speechLiveLost = false,
  onVoiceGone,
  overContent = false,
  micStream = null,
  liveText = null,
  speechElapsed = 0,
  onSpeechStart,
  onSpeechStop,
  onSpeechSend,
  onSpeechCancel,
  placeholder,
  scopeMeetingId,
  onRecord,
  above,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The composer's own width decides its toolbar: icons only when narrow (the meeting chat window, a narrow window).
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef);
  const iconOnly = width !== null && width < COMPOSER_ICON_ONLY_BELOW_PX;
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
  // Phone (iOS): one bar — + (opens the Add sheet) · the field · its end controls; the top bar owns the model.
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
  const pill = useVoicePill(speechState, speechEnding, onSpeechCancel);
  const voiceActive = pill.active;

  // Return the caret to the textarea once the box is back: after Stop (the words are there to edit), and on a Mac after any
  // ending. A phone keeps its keyboard down otherwise, so a sent message or a cancel never raises it. The caret (and so
  // iPhone's keyboard) comes back only once the voice area has gone, so the two never move at once.
  const wasVoiceActive = useRef(false);
  const refocus = useRef(false);
  const endedInBox = pill.ending === 'box';
  useEffect(() => {
    if (wasVoiceActive.current && !voiceActive) refocus.current = endedInBox || !platform.hasTouchScreen;
    wasVoiceActive.current = voiceActive;
  }, [voiceActive, endedInBox]);
  const keyboardSettled = useKeyboardSettled();
  const voiceGone = () => {
    if (refocus.current) inputRef.current?.focus();
    refocus.current = false;
    onVoiceGone?.();
  };

  // The field and the send controls, arranged by the layout below (Mac: box + toolbar; phone: one row).
  const canDictate = showSpeechInput && !!onSpeechStart && !isLoading;
  // iPhone: a recording holds the one audio session, so the mic is greyed until it stops.
  const micHeld = platform.sharesAudioSession && recordingMeetingId !== null;
  const micLabel = micHeld ? DICTATION_COPY.offWhileRecording : COMPOSER_COPY.voice;
  const canRecord = !!onRecord && recordingMeetingId === null;
  const hasDraft = canSendDraft(value, attachments);

  const textField = (
    <Text as="div" variant="reading" className={phone ? 'min-w-0 flex-1 self-center py-2.5' : 'px-3 pt-3 pb-1'}>
      <Textarea
        variant="bare"
        ref={inputRef}
        aria-label={COMPOSER_COPY.message}
        placeholder={placeholder ?? (phone ? COMPOSER_COPY.placeholder : PLACEHOLDER_HINTS[hintIndex])}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={disabled || isLoading}
        rows={1}
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
        className={phone ? undefined : 'min-h-9'}
      />
    </Text>
  );

  // One rule, Mac and phone (Messages): + and the mic are bare glyphs that never leave; one round button at the end changes
  // in place — stop while a reply is written, record (home) while there is no draft, send once there is one. Only the size
  // differs: a phone's bar holds 44 pt glyphs, a Mac's toolbar the compact size.
  const glyphSize = phone ? 'md' : 'sm';
  const endButton = isLoading
    ? <IconButton morph icon={Square} filled label={COMPOSER_COPY.stop} variant="danger" size="sm" onClick={onStop} />
    : !hasDraft && canRecord
      ? <IconButton morph icon={Circle} filled label={COMPOSER_ADD_COPY.record} variant="record" size="sm" onClick={onRecord} />
      : <IconButton morph icon={ArrowUp} label={COMPOSER_COPY.send} variant="primary" size="sm" onClick={onSend} disabled={!canSend} />;
  const endControls = (
    <div className="flex shrink-0 items-center">
      {canDictate && <IconButton icon={Mic} label={micLabel} variant="glyph" size={glyphSize} onClick={onSpeechStart} disabled={disabled || micHeld} />}
      {/* A glyph's height, so the round button sits on the row's centre line, inset evenly from the box's rounded end. */}
      <div className={cn('flex items-center justify-center', phone ? 'size-control-md' : 'size-control-sm')}>{endButton}</div>
    </div>
  );

  // Mac: the toolbar under the field (attach, model, tools, thinking, context gauge, then send).
  const toolbar = (
    <div className="flex items-center justify-between gap-2 px-3 pb-2">
      {/* Gives way before send does: the send controls never leave the row. */}
      <div className="flex min-w-0 items-center gap-0.5">
        {/* Attach: files and screenshots only; tools have their own picker. */}
        {onAttach && <ComposerAddMenu attachOptions={attach.options} onPickFiles={openFilePicker} disabled={disabled} onScreenshot={attach.images ? onScreenshot : undefined} />}
        <ModelPicker compact iconOnly={iconOnly} />
        <ToolsPicker catalog={toolCatalog} iconOnly={iconOnly} />
        <ReasoningPicker />
        {/* Context-window gauge (hides when the limit is unknown or no usage yet). */}
        <ContextRing usage={contextUsage ?? null} tools={toolsShare(toolCatalog)} cost={chatCost ?? undefined} />
      </div>
      {endControls}
    </div>
  );

  return (
    <div ref={frameRef} className={cn('relative px-4 py-2', LAYOUT.chatColumn)}>
      {above && <div className="mb-2 flex flex-col gap-2 empty:hidden">{above}</div>}
      <Popover anchored open={popup !== null} onOpenChange={(open) => { if (!open) closeMentionPopup(); }}>
        <PopoverAnchor asChild>
          {/* Composer never unmounts (an exit flashes box chrome); the pill is an overlay that moves no layout. */}
          <Surface
            data-testid="composer-frame"
            variant={voiceActive ? 'plain' : 'bar'}
            radius={phone ? 'composer' : 'xl'}
            className="relative transition-[background-color,box-shadow] duration-fade"
          >
            {/* The ending rides on `custom`, so the leaving pill knows which way to go. */}
            <AnimatePresence initial={false} custom={pill.ending} onExitComplete={voiceGone}>
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
                  onSend={onSpeechSend}
                  canSend={!isLoading}
                  liveLost={speechLiveLost}
                  backdrop={overContent}
                  controlSize={glyphSize}
                  stacked={phone}
                  ready={keyboardSettled}
                  onCancel={onSpeechCancel}
                />
              )}
            </AnimatePresence>
            {/* Composer: always mounted, fades flat while the pill owns the slot. */}
            <motion.div
              data-testid="composer-box"
              initial={false}
              // It hands over only once the voice area can come in (iPhone: after the keyboard has gone), so the two cross over
              // in one move and the slot is never empty.
              animate={{ opacity: voiceActive && keyboardSettled ? 0 : 1 }}
              transition={voiceTransition(reduceMotion, voiceActive ? 'composerOut' : 'composerIn')}
              aria-hidden={voiceActive || undefined}
              inert={voiceActive || undefined}
              style={voiceActive ? { pointerEvents: 'none' } : undefined}
            >
              <ContextChips meetings={scopeMeetingId ? selectedMeetings.filter((m) => m.id !== scopeMeetingId) : selectedMeetings} onRemove={handleRemoveMeeting} />
              <AttachmentStrip attachments={attachments} onRemove={onRemoveAttachment} />
              <Input ref={fileInputRef} type="file" multiple accept={attach.accept} onChange={handleFileChange} className="hidden" />
              {phone ? (
                // Phone: one bar — + at its start (the Add sheet), the field, the mic and the round end button.
                <div className="flex items-end gap-1 p-1">
                  <IconButton icon={Plus} label={COMPOSER_ADD_COPY.title} variant="glyph" size="md" onClick={() => setAddOpen(true)} />
                  {textField}
                  {endControls}
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
