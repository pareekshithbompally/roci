/** "/" menu content: the user's saved prompts, searchable; choosing one fills the chat box. The parent ChatInput supplies
 *  the Popover (shared with the "@" meeting picker). */

import React, { useState } from 'react';
import { SquareSlash } from 'lucide-react';
import { CommandItem, CommandPopoverContent, Icon, Text } from '@shared/ui';
import { PERSONALIZATION_CONFIG, type SavedPrompt } from '@config/personalization.config';
import { useSavedPrompts } from '@features/personalization';
import { matchesAllWords } from '@shared/utils/textMatch';

const COPY = PERSONALIZATION_CONFIG.savedPrompts.copy;

interface SavedPromptPopupProps {
  onSelect: (prompt: SavedPrompt) => void;
  /** Called when the popover closes — the parent restores focus to the chat box. */
  onClose?: () => void;
}

export const SavedPromptPopup: React.FC<SavedPromptPopupProps> = ({ onSelect, onClose }) => {
  const { savedPrompts } = useSavedPrompts();
  const [query, setQuery] = useState('');
  const shown = query.trim() ? savedPrompts.filter((p) => matchesAllWords(`${p.name} ${p.prompt}`, query)) : savedPrompts;
  return (
    <CommandPopoverContent
      searchPlaceholder={COPY.menuSearch}
      search={query}
      onSearchChange={setQuery}
      filter={false}
      empty={<Text as="p" variant="helper" tone="muted" className="px-3 py-4 text-center">{COPY.menuEmpty}</Text>}
      width="lg"
      onClose={onClose}
    >
      {shown.map((p) => (
        <CommandItem key={p.id} value={p.id} onSelect={() => onSelect(p)}>
          <Icon icon={SquareSlash} size="sm" tone="faint" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate">{p.name}</div>
            <Text as="div" variant="helper" tone="muted" truncate>{p.prompt}</Text>
          </div>
        </CommandItem>
      ))}
    </CommandPopoverContent>
  );
};
