import type React from 'react';

/** Enter/Space activation for a non-button acting as a button or radio; keys from nested controls are ignored. */
export const activateOnKey = (activate: () => void) => (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  activate();
};
