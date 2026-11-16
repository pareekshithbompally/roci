/** Chat composer: send, shortcuts, @ mentions, attachments, web search, and voice input. */

import React, { KeyboardEvent, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Square, Plus, X, FileText, Music, Film, Image as ImageIcon, Camera, Loader2, Mic, Pause, Play } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MeetingMentionPopup } from './MeetingMentionPopup';
import { ContextChips } from './ContextChips';
import { ModelPicker } from './ModelPicker';
import { ToolsPicker } from './tools/ToolsPicker';
import { ReasoningPicker } from './ReasoningPicker';
import { ContextRing, Icon, IconButton, Input, Popover, PopoverAnchor, Surface, Text, Textarea, cn } from '@shared/ui';
import type { ContextUsage } from '@shared/hooks/useContextUsage';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@shared/ui';
import { canTakeScreenshots, listCapturableWindows, takeScreenshot } from '@services/tauri';
import type { CapturableWindow } from '@services/tauri';
import { LAYOUT } from '@config/layout.config';
import { UI_CONFIG } from '@config/ui.config';
import { AppImage } from '@shared/components';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { shortcutLabel } from '@features/shortcuts';
import { registerChatComposer } from '@features/chat/stores';
import { canSendDraft } from '@features/chat/utils';
import { COMPOSER_MAX_HEIGHT_PX } from '@config/chat.config';
import type { MeetingListItem } from '@services/meetingReferenceService';
import type { ChatPart } from '@shared/types';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import { DotScope } from '@features/chat/components/dot-scope';
import { LiveTranscript } from '@features/chat/components/voice/LiveTranscript';
import type { LiveText } from '@services/ai/transcription';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';
import {
  voiceTransition,
  voicePillSettled,
  voicePillCollapsed,
  VOICE_HANDOFF_S,
} from './voice/voiceTransition';

const ACCEPTED_FILE_TYPES = 'image/*,audio/*,video/*,.pdf,.txt,.md,.csv,.json,.doc,.docx';

const FILE_ACCEPT_IMAGES = 'image/*';
const FILE_ACCEPT_FILES = '.pdf,.txt,.md,.csv,.json,.doc,.docx';
const FILE_ACCEPT_AUDIO = 'audio/*';

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
  placeholder?: string;
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
  placeholder = 'Ask a question...',
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
  const [hintIndex, setHintIndex] = useState(() => Math.floor(Math.random() * PLACEHOLDER_HINTS.length));
  const [capturableWindows, setCapturableWindows] = useState<CapturableWindow[]>([]);
  const [screenshotLoading, setScreenshotLoading] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  // Register this textarea as the composer ⌘L focuses
  useEffect(() => {
    registerChatComposer(inputRef.current);
    return () => registerChatComposer(null);
  }, []);

  // Cycle through placeholder hints
  useEffect(() => {
    const interval = setInterval(() => {
      setHintIndex(prev => (prev + 1) % PLACEHOLDER_HINTS.length);
    }, ANIMATION_CONFIG.timer.placeholderCycle);
    return () => clearInterval(interval);
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

  // Guard async completion after unmount (menu may close mid-invoke).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load capturable windows when screenshot sub-menu opens
  const handleScreenshotSubOpen = async () => {
    try {
      const windows = await listCapturableWindows();
      if (mountedRef.current) setCapturableWindows(windows);
    } catch (err) {
      console.error('[ChatInput] Failed to list windows:', err);
      if (mountedRef.current) setCapturableWindows([]);
    }
  };

  // Take a screenshot (full screen or specific window)
  const handleTakeScreenshot = async (windowId: number | null, name: string) => {
    if (!onScreenshot) return;
    setScreenshotLoading(name);
    try {
      const base64 = await takeScreenshot(windowId);
      onScreenshot(base64, name);
    } catch (err) {
      console.error('[ChatInput] Screenshot failed:', err);
    } finally {
      if (mountedRef.current) setScreenshotLoading(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // While mention popup is open, don't process sends from the textarea
    if (showMentionPopup) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && canSendDraft(value, attachments)) {
        // Defer send by one frame so macOS autocorrect can commit its replacement first
        requestAnimationFrame(() => onSend());
      }
    }
  };

  const canSend = !isLoading && !disabled && canSendDraft(value, attachments);
  const canScreenshot = !!onScreenshot && canTakeScreenshots();
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

  return (
    <div className={cn('relative px-4 py-2', LAYOUT.chatColumn)}>
      <Popover open={showMentionPopup} onOpenChange={(open) => { if (!open) closeMentionPopup(); }}>
      <PopoverAnchor asChild>
      {/* Composer never unmounts (an exit flashes box chrome); the pill is an overlay that moves no layout. */}
      <Surface
        data-testid="composer-frame"
        variant={voiceActive ? 'plain' : 'field'}
        radius="xl"
        className="relative transition-[background-color,box-shadow] duration-300 ease-out"
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
              {/* Fixed height keeps the pill pinned while its controls swap. */}
              <div className="mt-1 flex h-16 items-start justify-center">
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
              {liveText && <LiveTranscript text={liveText} />}
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

        {/* Text input mounts only while idle; the pill owns this slot during capture. */}
        <Text as="div" variant="reading" className="relative px-3 pt-3 pb-1">
          <Textarea
            variant="bare"
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || isLoading}
            rows={1}
            spellCheck={true}
            autoCorrect="on"
            autoCapitalize="sentences"
            className="min-h-9 max-h-48"
          />
          {/* Rotating placeholder overlay */}
          {!value && (
            <Text
              key={hintIndex}
              variant="reading"
              tone="faint"
              className="absolute top-3 left-3 pointer-events-none animate-placeholder-fade-in"
            >
              {PLACEHOLDER_HINTS[hintIndex]}
            </Text>
          )}
        </Text>

        {/* Toolbar mounts only while idle, so it never competes with the pill's controls. */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left: Attach, model, tools, thinking, context gauge — toolbar-size controls, close together */}
            <div className="flex items-center gap-0.5">
              {/* Attach — files and screenshots only; tools have their own picker */}
              {onAttach && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton icon={Plus} label="Attach" size="toolbar" disabled={disabled} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" sideOffset={UI_CONFIG.picker.sideOffset}>
                    <DropdownMenuItem onSelect={() => openFilePicker(FILE_ACCEPT_IMAGES)}>
                      <Icon icon={ImageIcon} size="sm" />
                      <span>Images</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openFilePicker(FILE_ACCEPT_FILES)}>
                      <Icon icon={FileText} size="sm" />
                      <span>Files</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openFilePicker(FILE_ACCEPT_AUDIO)}>
                      <Icon icon={Music} size="sm" />
                      <span>Audio</span>
                    </DropdownMenuItem>

                    {canScreenshot && <DropdownMenuSeparator />}
                    {canScreenshot && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger onPointerEnter={handleScreenshotSubOpen}>
                          <Icon icon={Camera} size="sm" />
                          <span>Take Screenshot</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent sideOffset={UI_CONFIG.picker.flyoutOffset}>
                          <DropdownMenuItem
                            onSelect={() => handleTakeScreenshot(null, 'Full Screen')}
                            disabled={screenshotLoading !== null}
                          >
                            {screenshotLoading === 'Full Screen' ? (
                              <Icon icon={Loader2} size="sm" className="animate-spin" />
                            ) : (
                              <Icon icon={Camera} size="sm" />
                            )}
                            <span>Full Screen</span>
                          </DropdownMenuItem>
                          {capturableWindows.length > 0 && <DropdownMenuSeparator />}
                          {capturableWindows.map((win) => (
                            <DropdownMenuItem
                              key={win.window_id}
                              onSelect={() => handleTakeScreenshot(win.window_id, win.app_name)}
                              disabled={screenshotLoading !== null}
                            >
                              {screenshotLoading === win.app_name ? (
                                <Icon icon={Loader2} size="sm" className="animate-spin" />
                              ) : (
                                <AppImage src={win.icon_base64 && `data:image/png;base64,${win.icon_base64}`} size="sm" />
                              )}
                              <Text variant="inherit" tone="inherit" truncate className="max-w-40">{win.app_name}</Text>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <ModelPicker compact />
              <ToolsPicker />
              <ReasoningPicker />

              {/* Context-window gauge (hides when the limit is unknown or no usage yet) */}
              <ContextRing usage={contextUsage ?? null} />
            </div>

            {/* Right: Mic + send / AI stop */}
            <div className="flex items-center gap-2">
              {/* Mic voice input — only shown when idle and supported */}
              {showSpeechInput && onSpeechStart && !isLoading && (
                <IconButton icon={Mic} label="Voice input" size="toolbar" onClick={onSpeechStart} disabled={disabled} />
              )}

              {isLoading ? (
                <IconButton icon={Square} label="Stop generation" variant="danger" filled className="shrink-0" onClick={onStop} />
              ) : (
                <IconButton icon={ArrowUp} label="Send message" variant="primary" onClick={onSend} disabled={!canSend} />
              )}
            </div>
          </div>
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
