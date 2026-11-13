/**
 * NoteEditor Component
 * 
 * Inline editor for creating new notes.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { SURFACE, BORDER, TEXT } from '@config/theme.config';
import { Button, Input } from '@shared/ui';

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
      <Input asChild><textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
        className="w-full h-24"
      /></Input>
      <div className="flex items-center justify-between">
        <p className={`text-xs ${TEXT.faint}`}>Press ⌘+Enter to save, Esc to cancel</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex items-center gap-2" onClick={onCancel}>
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button variant="primary" size="sm" className="flex items-center gap-2" onClick={handleSave}
            disabled={!canSave}>
            <Check className="w-4 h-4" />
            Save Note
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;
