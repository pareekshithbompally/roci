/**
 * NoteEditor Component
 * 
 * Inline editor for creating new notes.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT } from '@config/theme.config';

interface NoteEditorProps {
  onSave: (text: string) => void;
  onCancel: () => void;
  initialText?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const NoteEditor: React.FC<NoteEditorProps> = ({
  onSave,
  onCancel,
  initialText = '',
  placeholder = 'Write your note here...',
  autoFocus = true,
}) => {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSave = () => {
    if (text.trim()) {
      onSave(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const canSave = text.trim().length > 0;

  return (
    <div className={`${SURFACE.card} border ${BORDER.subtle} rounded-xl p-4 space-y-3 animate-fade-in`}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full h-24 p-3 ${COMPONENT.inlineInput} resize-none`}
      />
      <div className="flex items-center justify-between">
        <p className={`text-xs ${TEXT.faint}`}>Press ⌘+Enter to save, Esc to cancel</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${COMPONENT.secondaryButton} transition-colors flex items-center gap-2`}
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${COMPONENT.primaryButton} hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2`}
          >
            <Check className="w-4 h-4" />
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
