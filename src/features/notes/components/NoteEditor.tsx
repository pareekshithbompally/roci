/**
 * NoteEditor Component
 *
 * Inline editor for creating new notes.
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { Button, Icon, Surface, Text, Textarea } from '@shared/ui';

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
    <Surface variant="card" radius="xl" className="p-4 space-y-3 animate-fade-in">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={true}
        autoCorrect="on"
        autoCapitalize="sentences"
        className="w-full h-24"
      />
      <div className="flex items-center justify-between">
        <Text as="p" variant="caption" tone="faint">Press ⌘+Enter to save, Esc to cancel</Text>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            <Icon icon={X} size="sm" />
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!canSave}>
            <Icon icon={Check} size="sm" />
            Save Note
          </Button>
        </div>
      </div>
    </Surface>
  );
};

export default NoteEditor;
