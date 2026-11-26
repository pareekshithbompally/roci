import { createContext } from 'react';

/** Inside a top bar's ends (kit `TopBar`): every icon button there is a bar button (iOS: round, translucent, 44 pt), whatever
 *  size the screen asked for, so every screen's bar matches home's. */
export const InBarContext = createContext(false);
