/**
 * Markdown Buffer Utility
 * 
 * Handles partial markdown syntax to prevent flickering during streaming.
 * Uses look-ahead buffering to hide incomplete syntax until safe to render.
 */

import { STREAMING_CONFIG } from '@config/streaming.config';

/**
 * Process markdown text to buffer incomplete syntax
 * Returns only "safe" markdown that won't flicker
 */
export function bufferPartialMarkdown(text: string): string {
  if (!text) return '';

  let result = text;

  // Check for incomplete code blocks first (higher priority)
  if (hasIncompleteCodeBlock(result)) {
    const lastComplete = findLastCompleteCodeBlock(result);
    result = lastComplete || '';
  }

  // Check for incomplete bold/italic at the end
  if (hasTrailingIncompleteMarker(result)) {
    result = removeTrailingIncompleteMarkers(result);
  }

  return result;
}

/**
 * Check if text has incomplete code block
 */
function hasIncompleteCodeBlock(text: string): boolean {
  const codeBlockMatches = text.match(/```/g);
  if (!codeBlockMatches) return false;
  
  // Odd number of ``` means incomplete
  return codeBlockMatches.length % 2 !== 0;
}

/**
 * Find the last complete code block position
 */
function findLastCompleteCodeBlock(text: string): string | null {
  const parts = text.split('```');
  
  // Need at least 3 parts for a complete block (before, content, after)
  if (parts.length < 3) return null;
  
  // Odd number of parts means we have complete pairs
  // e.g., "text```code```more" splits to ["text", "code", "more"] (3 parts, 2 ```)
  // We want to keep complete pairs only
  if (parts.length % 2 === 0) {
    // Even parts means odd ``` (incomplete)
    // Return up to the last complete pair
    const completeParts = parts.slice(0, -1);
    return completeParts.join('```') + '```';
  }
  
  return text;
}

/**
 * Check if text has trailing incomplete bold/italic markers
 * Only considers markers that don't have matching closing markers
 */
function hasTrailingIncompleteMarker(text: string): boolean {
  // Count ** pairs in full text - if odd, last one is incomplete
  const boldMatches = text.match(/\*\*/g);
  if (boldMatches && boldMatches.length % 2 !== 0) return true;
  
  // Replace ** to check single * pairs
  const withoutDouble = text.replace(/\*\*/g, '');
  const singleStarMatches = withoutDouble.match(/\*/g);
  if (singleStarMatches && singleStarMatches.length % 2 !== 0) return true;
  
  // Check for _ pairs
  const underscoreMatches = text.match(/_/g);
  if (underscoreMatches && underscoreMatches.length % 2 !== 0) return true;
  
  return false;
}

/**
 * Remove trailing incomplete markers
 */
function removeTrailingIncompleteMarkers(text: string): string {
  let result = text;
  
  // Find position of last unpaired ** and remove from there
  const lastDoubleStar = result.lastIndexOf('**');
  if (lastDoubleStar !== -1) {
    const afterLast = result.slice(lastDoubleStar + 2);
    // If no ** after this one, it's unpaired
    if (!afterLast.includes('**')) {
      result = result.slice(0, lastDoubleStar);
    }
  }
  
  // Find position of last unpaired single * (not part of **)
  // This is tricky - we need to find truly unpaired single *
  const withoutDouble = result.replace(/\*\*/g, '##');
  const lastSingleStar = withoutDouble.lastIndexOf('*');
  if (lastSingleStar !== -1) {
    const afterLast = withoutDouble.slice(lastSingleStar + 1);
    if (!afterLast.includes('*')) {
      result = result.slice(0, lastSingleStar);
    }
  }
  
  // Find position of last unpaired _
  const lastUnderscore = result.lastIndexOf('_');
  if (lastUnderscore !== -1) {
    const afterLast = result.slice(lastUnderscore + 1);
    if (!afterLast.includes('_')) {
      result = result.slice(0, lastUnderscore);
    }
  }
  
  return result;
}

/**
 * Check if markdown is safe to render (no incomplete syntax)
 */
export function isMarkdownSafe(text: string): boolean {
  return !hasIncompleteCodeBlock(text) && !hasTrailingIncompleteMarker(text);
}
