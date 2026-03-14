import React from 'react';
import { TEXT, COMPONENT } from '@config/theme.config';

interface SuggestionsListProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

/** Renders suggestion rows with arrow prefix and staggered animation */
const SuggestionsList: React.FC<SuggestionsListProps> = ({ suggestions, onSuggestionClick }) => (
  <>
    {suggestions.map((suggestion, i) => (
      <button
        key={i}
        onClick={() => onSuggestionClick(suggestion)}
        className={COMPONENT.listRow}
        style={{ animationDelay: `${i * 50}ms` }}
      >
        <span className={`${TEXT.faint} shrink-0`}>&#8594;</span>
        <span className="line-clamp-1">{suggestion}</span>
      </button>
    ))}
  </>
);

export default SuggestionsList;
