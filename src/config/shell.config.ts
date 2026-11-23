/** The app shell's words: the sidebar (column on a Mac, sheet on iPhone) and the iPhone top bar. */

export const SHELL_COPY = {
  openSidebar: 'Open sidebar',
  collapseSidebar: 'Collapse sidebar',
  expandSidebar: 'Expand sidebar',
  newChat: 'New chat',
  /** The app's row at the top of a Mac's sidebar, read out: it starts a new chat. */
  appNewChat: (app: string) => `${app}: new chat`,
  search: 'Search',
  settings: 'Settings',
  recents: 'Recents',
  backToApp: 'Back to App',
} as const;
