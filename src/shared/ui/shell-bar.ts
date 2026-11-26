import { createContext } from 'react';

/** Where a screen's own bar controls go when the app shell has the top bar (iPhone): the shell puts this element at its
 *  bar's trailing end, and the screen's header (kit `TitleBlock`) sends its controls there. Null (a Mac, iPad): they stay
 *  in the header. */
export const ShellBarContext = createContext<HTMLElement | null>(null);
