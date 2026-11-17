import React from 'react';
import { Row, Text } from '@shared/ui';

interface SuggestionsListProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

/** Suggestion rows, each with an arrow prefix; up to two lines, so a follow-up reads whole on a phone. */
const SuggestionsList: React.FC<SuggestionsListProps> = ({ suggestions, onSuggestionClick }) => (
  <>
    {suggestions.map((suggestion, i) => (
      <Row
        key={i}
        onClick={() => onSuggestionClick(suggestion)}
      >
        <Text tone="faint" className="shrink-0">&#8594;</Text>
        <span className="line-clamp-2">{suggestion}</span>
      </Row>
    ))}
  </>
);

export default SuggestionsList;
