/**
 * ChatInput Component
 *
 * Chat message input with send button, keyboard shortcuts, @ mention support,
 * file attachments, and web search toggle.
 */

import React, { KeyboardEvent, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Square, Globe, Plus, X, FileText, Music, Film, Image as ImageIcon, Camera, Loader2 } from 'lucide-react';
import { MeetingMentionPopup } from './MeetingMentionPopup';
import { ContextChips } from './ContextChips';
import { ModelPicker } from './ModelPicker';
import { Popover, PopoverAnchor } from '@shared/ui';
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
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { formatShortcut } from '@config/shortcuts.config';
import { useChat } from '@shared/contexts/ChatContext';
import type { MeetingListItem } from '@/services/meetingReferenceService';
import type { ChatPart } from '@/types';

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
  /** Whether web search is enabled */
  webSearchEnabled?: boolean;
  /** Callback when web search toggle changes */
  onWebSearchToggle?: () => void;
  /** Whether to show web search toggle (only for Gemini/OpenAI) */
  showWebSearch?: boolean;
  /** Pending file attachments */
  attachments?: ChatPart[];
  /** Callback to add a file attachment */
  onAttach?: (file: File) => void;
  /** Callback to remove a pending attachment by index */
  onRemoveAttachment?: (index: number) => void;
  /** Callback when a screenshot is captured (base64 PNG, display name) */
  onScreenshot?: (base64: string, name: string) => void;
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
  webSearchEnabled = false,
  onWebSearchToggle,
  showWebSearch = false,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  onScreenshot,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [hintIndex, setHintIndex] = useState(() => Math.floor(Math.random() * PLACEHOLDER_HINTS.length));
  const [capturableWindows, setCapturableWindows] = useState<WindowInfo[]>([]);
  const [screenshotLoading, setScreenshotLoading] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const { chatInputRef } = useChat();

  // Register this textarea with the context so Cmd+L can focus it
  useEffect(() => {
    chatInputRef.current = inputRef.current;
    return () => { chatInputRef.current = null; };
  }, [chatInputRef]);

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

  // Close popup and refocus textarea
  const closeMentionPopup = useCallback(() => {
    setShowMentionPopup(false);
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

  // Load capturable windows when screenshot sub-menu opens
  const handleScreenshotSubOpen = async () => {
    try {
      const windows = await invoke<WindowInfo[]>('list_capturable_windows');
      setCapturableWindows(windows);
    } catch (err) {
      console.error('[ChatInput] Failed to list windows:', err);
      setCapturableWindows([]);
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
      setScreenshotLoading(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't send if mention popup is open
    if (showMentionPopup) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionPopup();
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && (value.trim() || attachments.length > 0)) {
        // Defer send by one frame so macOS autocorrect can commit its replacement first
        requestAnimationFrame(() => onSend());
      }
    }
  };

  const canSend = !isLoading && !disabled && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div className="px-12 py-2">
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

        {/* Text Input Area */}
        <div className="relative px-3 pt-3 pb-1">
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || isLoading}
            rows={1}
            spellCheck={true}
            autoCorrect="on"
            autoCapitalize="sentences"
            className={`w-full bg-transparent border-0 text-sm ${TEXT.primary} resize-none outline-none focus:ring-0`}
            style={{ maxHeight: '200px', minHeight: '36px' }}
          />
          {/* Rotating placeholder overlay */}
          {!value && (
            <span
              key={hintIndex}
              className={`absolute top-3 left-3 text-sm ${TEXT.faint} pointer-events-none animate-placeholder-fade-in`}
            >
              {PLACEHOLDER_HINTS[hintIndex]}
            </span>
          )}
        </div>

        {/* Bottom Toolbar with Model Picker and Send Button */}
        <div className="flex items-center justify-between px-3 pb-2">
          {/* Left: Attach + Web Search + Model Picker */}
          <div className="flex items-center gap-2">
            {/* Attachment Dropdown Menu */}
            {onAttach && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={COMPONENT.toolbarButton}
                    title="Attach"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
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

            {/* Web Search Toggle */}
            {showWebSearch && onWebSearchToggle && (
              <button
                onClick={onWebSearchToggle}
                className={webSearchEnabled ? COMPONENT.toolbarButtonActive : COMPONENT.toolbarButton}
                title={webSearchEnabled ? 'Web search enabled' : 'Web search disabled'}
              >
                <Globe className="w-3.5 h-3.5" />
              </button>
            )}

            <ModelPicker compact />
          </div>

          {/* Send/Stop Button - Right */}
          {isLoading ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all bg-red-500 hover:bg-red-600 text-white shadow-lg"
              title="Stop generation"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!canSend}
              className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-all ${
                canSend
                  ? COMPONENT.sendButtonActive
                  : COMPONENT.sendButtonDisabled
              }`}
              title="Send message"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      </PopoverAnchor>

      {/* Meeting Mention Popup (renders as PopoverContent) */}
      <MeetingMentionPopup
        meetings={availableMeetings}
        selectedIds={selectedMeetings.map(m => m.id)}
        onSelect={handleMeetingSelect}
      />
      </Popover>

      {/* Image Quick Look Overlay — portaled to body to escape overflow-hidden ancestors */}
      {previewImage && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setPreviewImage(null); }}
          tabIndex={-1}
          role="dialog"
          ref={(el) => el?.focus()}
        >
          <div
            className="relative max-w-[80vw] max-h-[80vh] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10"
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
