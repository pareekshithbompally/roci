/** The system's file picker, opened from any control (a button, a menu entry): the files chosen go to `onFiles`, and the
 *  same file can be chosen again. One place, so every screen that takes files opens the same picker the same way. */

import React, { useRef } from 'react';

export interface FilePicker {
  /** Opens the picker for files matching `accept` (types and extensions, as an `accept` attribute takes them). */
  open: (accept: string) => void;
  /** The picker itself: render it once, anywhere (it takes no room). */
  element: React.ReactNode;
}

export function useFilePicker(onFiles: (files: File[]) => void): FilePicker {
  const input = useRef<HTMLInputElement>(null);
  const open = (accept: string) => {
    if (!input.current) return;
    input.current.accept = accept;
    input.current.click();
  };
  const element = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      onChange={(event) => {
        onFiles(Array.from(event.target.files ?? []));
        // Cleared so the same file can be chosen again.
        event.target.value = '';
      }}
    />
  );
  return { open, element };
}
