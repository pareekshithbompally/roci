/** To-dos: the one name every screen uses for meeting action items and their list. */

export const TODOS_CONFIG = {
  /** Meetings the to-do form's meeting picker lists (newest, or matching what's typed). */
  meetingPicker: 50,
  /** Sidebar row, page title, meeting tab. */
  title: 'To-dos',
  /** The action that creates one (page and meeting tab). */
  add: 'Add to-do',
  /** To-dos that aren't from a meeting: their group in the list, and their reminder's title. */
  general: 'General',
} as const;
