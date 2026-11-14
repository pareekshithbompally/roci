import React from 'react';
import { Row, Text } from '@shared/ui';

interface SuggestionsListProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

/** Renders suggestion rows with arrow prefix and staggered animation */
const SuggestionsList: React.FC<SuggestionsListProps> = ({ suggestions, onSuggestionClick }) => (
  <>
    {suggestions.map((suggestion, i) => (
      <Row
        key={i}
        onClick={() => onSuggestionClick(suggestion)}
        style={{ animationDelay: `${i * 50}ms` }}
      >
        <Text tone="faint" className="shrink-0">&#8594;</Text>
        <span className="line-clamp-1">{suggestion}</span>
      </Row>
    ))}
  </>
);

export default SuggestionsList;
