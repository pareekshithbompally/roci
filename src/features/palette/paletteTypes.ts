/** The ⌘K palette's one row shape (after frappe/helpdesk's command palette): a command either acts (`perform`) or drills
 *  into a sub-list (`children`); everything on screen is a ranked list of these, grouped. */

import type { ReactNode } from 'react';
import type { TileGlyph } from '@shared/ui';

export interface PaletteCommand {
  id: string;
  /** Plain text: what is scored, shown and read out. */
  title: string;
  group: string;
  icon?: TileGlyph;
  /** Muted text at the row's end. */
  subtitle?: string;
  /** A second line under the title (a meeting's date and where it matched). */
  detail?: ReactNode;
  /** A trailing mark before the keys (a meeting's status pill). */
  badge?: ReactNode;
  /** Found by these too, at a penalty against the title. */
  keywords?: string;
  /** The shortcut that does the same outside the palette, one entry per keycap. */
  keys?: string[];
  /** Multiplies the fuzzy score: below 1 sinks a row once something is typed. */
  weight?: number;
  /** A fixed score that bypasses the scorer (search index hits keep the index's order). */
  rank?: number;
  /** A flat shortcut to a drill-down's row (a Settings section at the root): hidden until something is typed. */
  hideWhenEmpty?: boolean;
  /** The query words to embolden in the title. */
  highlight?: string;
  /** Drills in: the sub-list this row opens. */
  children?: () => PaletteCommand[];
  /** The breadcrumb once drilled in, when not the row's own title ("Show all 7" opens "Chats"). */
  levelTitle?: string;
  perform?: () => void;
}

export interface PaletteGroup {
  title: string;
  items: PaletteCommand[];
}

/** A drill-down level: its name (the breadcrumb) and its rows. */
export interface PaletteLevel {
  title: string;
  commands: PaletteCommand[];
}
