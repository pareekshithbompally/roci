import type React from 'react';

/**
 * Enter/Space activation for a non-button element acting as a button or radio
 * (a `Surface` that hosts nested controls). Keys from nested controls are ignored.
 */
export const activateOnKey = (activate: () => void) => (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  activate();
};
