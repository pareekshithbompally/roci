/**
 * ChatInput Component
 *
 * Chat message input with send button, keyboard shortcuts, @ mention support,
 * file attachments, and web search toggle.
 */

import React, { KeyboardEvent, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Square, Plus, X, FileText, Music, Film, Image as ImageIcon, Camera, Loader2, Mic, Pause, Play } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MeetingMentionPopup } from './MeetingMentionPopup';
import { ContextChips } from './ContextChips';
import { ModelPicker } from './ModelPicker';
import { ToolsPicker } from './tools/ToolsPicker';
import { Icon, IconButton, Input, Popover, PopoverAnchor, Surface, Text, Textarea } from '@shared/ui';
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
import { invoke } from '@tauri-apps/api/core';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { shortcutLabel } from '@features/shortcuts';
import { registerChatComposer } from '@features/chat/stores';
import type { MeetingListItem } from '@services/meetingReferenceService';
import type { ChatPart } from '@shared/types';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import { DotScope } from '@features/chat/components/dot-scope';
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

interface WindowInfo {
  window_id: number;
  app_name: string;
  title: string;
  icon_base64?: string;
}

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
  const [capturableWindows, setCapturableWindows] = useState<WindowInfo[]>([]);
  const [screenshotLoading, setScreenshotLoading] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  // Register this textarea with the store ref so Cmd+L can focus it
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
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
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
      const windows = await invoke<WindowInfo[]>('list_capturable_windows');
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
      const base64 = await invoke<string>('take_screenshot', {
        windowId,
      });
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
      if (!isLoading && (value.trim() || attachments.length > 0)) {
        // Defer send by one frame so macOS autocorrect can commit its replacement first
        requestAnimationFrame(() => onSend());
      }
    }
  };

  const canSend = !isLoading && !disabled && (value.trim().length > 0 || attachments.length > 0);
  const isStarting = speechState === 'starting';
  const isRecording = speechState === 'recording';
  const isPaused = speechState === 'paused';
  const isTranscribing = speechState === 'transcribing';
  const isCapturing = isStarting || isRecording || isPaused || isTranscribing;

  // ── Recording pill geometry & orchestration ───────────────────────────────
  const reduceMotion = useReducedMotion() ?? false;
  const composer = DOT_SCOPE_CONFIG.composer;
  const scopeZoom = composer.plateHeight / DOT_SCOPE_CONFIG.tuning.height;

  // The pill takes over on capture start and holds for a handoff beat after
  // the transcription lands, so the processing state reads before the box
  // returns. Beat length is shared via voiceTransition.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    if (isCapturing) {
      setOverlayOpen(true);
      return;
    }
    const timer = setTimeout(() => setOverlayOpen(false), VOICE_HANDOFF_S * 1000);
    return () => clearTimeout(timer);
  }, [isCapturing]);

  // The pill owns the composer slot from capture start until the handoff beat
  // after the transcription lands, so it is the sole active element throughout.
  // Mirror choreography: forward, the pill rises in (scale 0.55→1, y 14→0)
  // while the box fades flat; on return the pill sinks back down into the box
  // (scale→0.55, y→14) while the box fades flat in. Same beat, opposite sides.
  const voiceActive = isCapturing || overlayOpen;
  const handoff = !isCapturing && overlayOpen;

  // Recording shape from the mic press on — while warming up there is no stream yet,
  // so the traces sit flat at full width (as when paused) and the pill opens at one
  // size. It narrows to the processing shape only once transcription starts.
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

  // Hand the caret back to the textarea once the transcript has landed and
  // the box has expanded back.
  const wasVoiceActive = useRef(false);
  useEffect(() => {
    if (wasVoiceActive.current && !voiceActive) {
      inputRef.current?.focus();
    }
    wasVoiceActive.current = voiceActive;
  }, [voiceActive]);

  // The composer (box, transcript, toolbar, placeholder) returns as one unit;
  // the titles above and buttons below follow as the second beat.
  // Every animation here is a tween — no springs anywhere, so nothing can
  // overshoot the frame or stick on remeasurement.
  const formattedElapsed = `${String(Math.floor(speechElapsed / 60)).padStart(2, '0')}:${String(speechElapsed % 60).padStart(2, '0')}`;

  return (
    <div className={`relative ${LAYOUT.chatColumn} px-4 py-2`}>
      <Popover open={showMentionPopup} onOpenChange={(open) => { if (!open) closeMentionPopup(); }}>
      <PopoverAnchor asChild>
      {/* One stable frame: the composer never unmounts — AnimatePresence
          reverts an exiting branch to full opacity for one frame on unmount,
          and that flash of box chrome is what read as a cut. The composer
          only fades flat in place; the pill is a transparent absolute overlay
          bottom-anchored to the frame, so its controls sit where the toolbar
          was and it can never spill past the window edge. Mounting or
          unmounting it paints no box and moves no layout. */}
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
                palette={DOT_SCOPE_CONFIG.composerTheme}
                margins={{ x: composer.marginX, y: composer.marginY }}
              />
              {/* Reserved control slot: fixed height keeps the pill pinned while
                  the controls swap between recording, paused and transcribing. */}
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
                    {/* The pill itself reads "Transcribing" — the X is the only
                        control, and it is unmissably red. */}
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

        {/* Text input — the composer only mounts while idle; the pill owns
            this slot for the whole capture. */}
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

        {/* Bottom toolbar — the composer only mounts while idle, so the
            Stop/Pause/cancel controls under the pill never compete with it. */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left: Attach + Tools + Model Picker */}
            <div className="flex items-center gap-2">
              <>
                {/* Attachment Dropdown Menu */}
                {onAttach && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton icon={Plus} label="Attach" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" sideOffset={8}>
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

                      {onScreenshot && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger onPointerEnter={handleScreenshotSubOpen}>
                            <Icon icon={Camera} size="sm" />
                            <span>Take Screenshot</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent sideOffset={8}>
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
                                ) : win.icon_base64 ? (
                                  <img
                                    src={`data:image/png;base64,${win.icon_base64}`}
                                    alt={win.app_name}
                                    className="w-4 h-4"
                                  />
                                ) : (
                                  <Text as="div" variant="caption" tone="muted" className="w-4 h-4 flex items-center justify-center font-medium">
                                    {win.app_name.charAt(0)}
                                  </Text>
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

                {/* Tools: web search + meeting tools + MCP servers */}
                <ToolsPicker />

                <ModelPicker compact />
              </>
            </div>

            {/* Right: Mic + send / AI stop */}
            <div className="flex items-center gap-2">
              {/* Mic voice input — only shown when idle and supported */}
              {showSpeechInput && onSpeechStart && !isLoading && (
                <IconButton icon={Mic} label="Voice input" onClick={onSpeechStart} />
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
          className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
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
