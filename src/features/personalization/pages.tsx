/** The pages Personalization's landing list drills into, in list order; a page is listed only once it exists. */

import React from 'react';
import { Brain, MessageSquareText, SlidersHorizontal, SquareSlash, WholeWord } from 'lucide-react';
import { Text, type TileGlyph } from '@shared/ui';
import { PERSONALIZATION_CONFIG } from '@config/personalization.config';
import { usePersonalization } from '@features/personalization/hooks/usePersonalization';
import { VocabularyPage } from '@features/personalization/components/VocabularyPage';
import { PromptsPage } from '@features/personalization/components/PromptsPage';
import { MemoryPage } from '@features/personalization/components/MemoryPage';
import { SavedPromptsPage } from '@features/personalization/components/SavedPromptsPage';
import { ModelTuningPage } from '@features/personalization/components/ModelTuningPage';

export interface PersonalizationPage {
  id: string;
  label: string;
  icon: TileGlyph;
  /** The page; `onBack` on Mac and iPad, where it replaces the landing list in the pane. */
  Page: React.FC<{ onBack?: () => void }>;
  /** The page's state on its row (a count), when it has one. */
  Status?: React.FC;
}

const VocabularyCount: React.FC = () => {
  const { length } = usePersonalization().vocabulary;
  return length > 0 ? <Text tone="muted">{PERSONALIZATION_CONFIG.copy.vocabulary.count(length)}</Text> : null;
};

export const PERSONALIZATION_PAGES: PersonalizationPage[] = [
  { id: 'prompts', label: PERSONALIZATION_CONFIG.prompts.copy.title, icon: MessageSquareText, Page: PromptsPage },
  { id: 'saved-prompts', label: PERSONALIZATION_CONFIG.savedPrompts.copy.title, icon: SquareSlash, Page: SavedPromptsPage },
  { id: 'memory', label: PERSONALIZATION_CONFIG.memory.copy.title, icon: Brain, Page: MemoryPage },
  { id: 'vocabulary', label: PERSONALIZATION_CONFIG.copy.vocabulary.title, icon: WholeWord, Page: VocabularyPage, Status: VocabularyCount },
  { id: 'model-tuning', label: PERSONALIZATION_CONFIG.modelTuning.copy.title, icon: SlidersHorizontal, Page: ModelTuningPage },
];
