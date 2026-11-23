import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Icon, Row } from '@shared/ui';

interface SuggestionsListProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

/** Suggestion rows, secondary lines (callout type) each with an arrow prefix; up to two lines, so a follow-up reads whole on a phone. */
const SuggestionsList: React.FC<SuggestionsListProps> = ({ suggestions, onSuggestionClick }) => (
  <>
    {suggestions.map((suggestion, i) => (
      <Row
        key={i}
        size="sm"
        flush
        onClick={() => onSuggestionClick(suggestion)}
        leading={<Icon icon={ArrowRight} size="xs" tone="faint" />}
      >
        <span className="line-clamp-2">{suggestion}</span>
      </Row>
    ))}
  </>
);

export default SuggestionsList;
