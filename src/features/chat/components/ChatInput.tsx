/**
 * ChatInput Component
 *
 * Chat message input with send button, keyboard shortcuts, @ mention support,
 * file attachments, and web search toggle.
 */

import React, { KeyboardEvent, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Square, Plus, X, FileText, Music, Film, Image as ImageIcon, Camera, Loader2, Mic } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MeetingMentionPopup } from './MeetingMentionPopup';
import { ContextChips } from './ContextChips';
import { ModelPicker } from './ModelPicker';
import { ToolsPicker } from './tools/ToolsPicker';
import { Button, Popover, PopoverAnchor } from '@shared/ui';
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
import { SURFACE, BORDER, TEXT, COMPONENT, LAYOUT } from '@config/theme.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { formatShortcut } from '@config/shortcuts.config';
import { chatInputRef } from '@features/chat/stores';
import type { MeetingListItem } from '@services/meetingReferenceService';
import type { ChatPart } from '@shared/types';
import type { SpeechState } from '@features/chat/hooks/useSpeechInput';
import { DotScope, buildBand, bandPillWidth } from '@shared/components/dot-scope';
import type { BandGeometry } from '@shared/components/dot-scope';
import { DOT_SCOPE_CONFIG } from '@config/dotScope.config';

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
  `Press ${formatShortcut('CommandOrControl+L')} to jump here`,
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
    case 'image': return <ImageIcon className="w-3.5 h-3.5" />;
    case 'audio': return <Music className="w-3.5 h-3.5" />;
    case 'video': return <Film className="w-3.5 h-3.5" />;
    case 'document': return <FileText className="w-3.5 h-3.5" />;
    default: return <FileText className="w-3.5 h-3.5" />;
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
    chatInputRef.current = inputRef.current;
    return () => { chatInputRef.current = null; };
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
  const isRecording = speechState === 'recording';
  const isTranscribing = speechState === 'transcribing';
  const isCapturing = isRecording || isTranscribing;

  // Takeover-lite band geometry, frozen at the rising edge of a capture so
  // nothing resizes mid-take (derived during render so the band mounts on the
  // very first capturing frame, with no collapse flash).
  const slotRef = useRef<HTMLDivElement>(null);
  const [band, setBand] = useState<BandGeometry | null>(null);
  const [prevCapturing, setPrevCapturing] = useState(false);
  if (isCapturing !== prevCapturing) {
    setPrevCapturing(isCapturing);
    if (isCapturing) {
      const rect = slotRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) setBand(buildBand(rect.width));
    }
  }

  // The textarea returns as the done wipe clears: it stays hidden through the
  // capture and for the wipe's hold, then fades back in over the slot.
  const reduceMotion = useReducedMotion() ?? false;
  const [textShown, setTextShown] = useState(true);
  useEffect(() => {
    if (isCapturing) {
      setTextShown(false);
      return;
    }
    const timer = setTimeout(
      () => setTextShown(true),
      DOT_SCOPE_CONFIG.composerBand.handoff * 1000,
    );
    return () => clearTimeout(timer);
  }, [isCapturing]);

  const formattedElapsed = `${String(Math.floor(speechElapsed / 60)).padStart(2, '0')}:${String(speechElapsed % 60).padStart(2, '0')}`;

  return (
    <div className={`${LAYOUT.chatColumn} px-4 py-2`}>
      <Popover open={showMentionPopup} onOpenChange={(open) => { if (!open) closeMentionPopup(); }}>
      <PopoverAnchor asChild>
      <div className={`relative ${SURFACE.input} border ${BORDER.default} rounded-2xl shadow-sm hover:shadow-md transition-shadow`}>
        {/* Context Chips */}
        <ContextChips
          meetings={selectedMeetings}
          onRemove={handleRemoveMeeting}
        />

        {/* Attachment Preview Strip */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2">
            {attachments.map((part, index) => (
              <div
                key={index}
                className={`flex items-center gap-1.5 px-2 py-1 ${SURFACE.chip} rounded-lg text-xs ${TEXT.secondary} group`}
              >
                {part.type === 'image' && part.source.kind === 'data' ? (() => {
                  const imgSrc = `data:${part.mimeType};base64,${part.source.base64}`;
                  const imgAlt = part.alt || 'attachment';
                  return (
                    <img
                      src={imgSrc}
                      alt={imgAlt}
                      className={`w-8 h-8 rounded object-cover cursor-pointer hover:ring-2 ${BORDER.inputFocus} transition-all`}
                      onClick={() => setPreviewImage({ src: imgSrc, alt: imgAlt })}
                    />
                  );
                })() : (
                  <AttachmentIcon type={part.type} />
                )}
                <span className="max-w-[120px] truncate">{getAttachmentName(part)}</span>
                {onRemoveAttachment && (
                  <button
                    onClick={() => onRemoveAttachment(index)}
                    className={`p-0.5 rounded-full ${COMPONENT.menuButtonHover} transition-colors`}
                    title="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Text input slot — always mounted so the composer never changes height.
            While capturing voice, the slot breathes to the band's height and the
            text area hides in place while Hex's dot scope stretches across the
            slot as a full-width band; while transcribing the row crops down to
            the processing pill. On stop the done wipe clears the field, then the
            text area fades back in and the transcript lands in it. */}
        <motion.div
          ref={slotRef}
          className="relative px-3 pt-3 pb-1"
          animate={{ height: isCapturing && band ? band.height : 'auto' }}
          transition={reduceMotion
            ? { duration: DOT_SCOPE_CONFIG.reducedFade.duration }
            : ANIMATION_CONFIG.chat.composerGlide}
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || isLoading || isCapturing}
            aria-hidden={isCapturing}
            rows={1}
            spellCheck={true}
            autoCorrect="on"
            autoCapitalize="sentences"
            className={`w-full bg-transparent border-0 text-sm ${TEXT.primary} resize-none outline-none focus:ring-0 transition-opacity duration-200 ${isCapturing ? 'invisible' : ''} ${!textShown ? 'opacity-0' : ''}`}
            style={{ maxHeight: '200px', minHeight: '36px' }}
          />
          {/* Rotating placeholder overlay */}
          {!value && textShown && (
            <span
              key={hintIndex}
              className={`absolute top-3 left-3 text-sm ${TEXT.faint} pointer-events-none animate-placeholder-fade-in`}
            >
              {PLACEHOLDER_HINTS[hintIndex]}
            </span>
          )}
          <AnimatePresence>
            {isCapturing && band && (
              <motion.div
                key="dot-scope-band"
                className="absolute top-0 bottom-0 left-0 flex justify-center overflow-hidden pointer-events-none"
                initial={false}
                animate={{ width: isRecording ? band.width : bandPillWidth(band.zoom) }}
                transition={reduceMotion
                  ? { duration: DOT_SCOPE_CONFIG.reducedFade.duration }
                  : ANIMATION_CONFIG.chat.composerGlide}
              >
                <DotScope
                  stage={isRecording ? 'recording' : 'processing'}
                  stream={micStream}
                  label={isRecording ? 'Recording' : 'Transcribing'}
                  zoom={band.zoom}
                  tuning={band.tuning}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Bottom Toolbar with Model Picker and Send Button */}
        <div className="flex items-center justify-between px-3 pb-2">
          {/* Left: Cancel (recording) OR Attach + Tools + Model Picker (idle) */}
          <div className="flex items-center gap-2">
            {isCapturing ? (
              /* Cancel recording */
              <Button variant="ghost" size="icon" onClick={onSpeechCancel} title="Cancel recording">
                <X className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <>
                {/* Attachment Dropdown Menu */}
                {onAttach && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" title="Attach">
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" sideOffset={8}>
                      <DropdownMenuItem onSelect={() => openFilePicker(FILE_ACCEPT_IMAGES)}>
                        <ImageIcon className="w-4 h-4" />
                        <span>Images</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openFilePicker(FILE_ACCEPT_FILES)}>
                        <FileText className="w-4 h-4" />
                        <span>Files</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => openFilePicker(FILE_ACCEPT_AUDIO)}>
                        <Music className="w-4 h-4" />
                        <span>Audio</span>
                      </DropdownMenuItem>

                      {onScreenshot && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger onPointerEnter={handleScreenshotSubOpen}>
                            <Camera className="w-4 h-4" />
                            <span>Take Screenshot</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent sideOffset={8}>
                            <DropdownMenuItem
                              onSelect={() => handleTakeScreenshot(null, 'Full Screen')}
                              disabled={screenshotLoading !== null}
                            >
                              {screenshotLoading === 'Full Screen' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Camera className="w-4 h-4" />
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
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : win.icon_base64 ? (
                                  <img
                                    src={`data:image/png;base64,${win.icon_base64}`}
                                    alt={win.app_name}
                                    className="w-4 h-4 rounded-sm"
                                  />
                                ) : (
                                  <div className={`w-4 h-4 flex items-center justify-center text-[10px] font-medium ${TEXT.muted}`}>
                                    {win.app_name.charAt(0)}
                                  </div>
                                )}
                                <span className="truncate max-w-[160px]">{win.app_name}</span>
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
            )}
          </div>

          {/* Right: Mic + Stop pill / send button */}
          <div className="flex items-center gap-2">
            {/* Mic voice input — only shown when idle and supported */}
            {showSpeechInput && onSpeechStart && !isCapturing && !isLoading && (
              <Button variant="ghost" size="icon" onClick={onSpeechStart} title="Voice input">
                <Mic className="w-3.5 h-3.5" />
              </Button>
            )}

          {/* Stop pill (recording) OR AI stop/send button (idle) */}
          {isRecording ? (
            /* Hex capsule grammar: the one contrast action — plate-inked pill,
               white stop square and the clock. Red is for failures only. */
            <button
              onClick={onSpeechStop}
              className="flex items-center gap-2 h-8 px-3.5 rounded-full bg-paper-900 dark:bg-night-100 text-white dark:text-night-900 hover:bg-paper-800 dark:hover:bg-night-200 text-xs font-medium shadow-lg transition-colors"
              title="Stop recording"
            >
              <span className="w-2.5 h-2.5 rounded-[3px] bg-current" aria-hidden />
              <span className="tabular-nums">{formattedElapsed}</span>
            </button>
          ) : isTranscribing ? (
            <button
              disabled
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-paper-600 dark:text-night-500 cursor-not-allowed"
              title="Transcribing"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
            </button>
          ) : isLoading ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all bg-red-500 hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-400 text-white shadow-lg"
              title="Stop generation"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <Button
              variant="primary"
              size="icon"
              onClick={onSend}
              disabled={!canSend}
              title="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          )}
          </div>
        </div>
      </div>
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
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center ${SURFACE.overlay} backdrop-blur-sm animate-fade-in`}
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setPreviewImage(null); }}
          tabIndex={-1}
          role="dialog"
          ref={(el) => el?.focus()}
        >
          <div
            className="relative max-w-[80vw] max-h-[80vh] rounded-xl overflow-hidden shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage.src}
              alt={previewImage.alt}
              className="max-w-[80vw] max-h-[80vh] object-contain"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/50 to-transparent">
              <span className="text-xs text-white/70">{previewImage.alt}</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ChatInput;
