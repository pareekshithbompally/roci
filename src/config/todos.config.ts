/** To-dos: the one name every screen uses for meeting action items and their list. */

export const TODOS_CONFIG = {
  /** Meetings the to-do form's meeting picker lists (newest, or matching what's typed). */
  meetingPicker: 50,
  /** Sidebar row, page title, meeting tab. */
  title: 'To-dos',
  /** The action that creates one (the + on To-dos and a meeting). */
  add: 'Add to-do',
  /** The To-dos screen: its search, filters, counts and empty states. */
  page: {
    search: 'Search to-dos',
    closeSearch: 'Close search',
    filters: { all: 'All', pending: 'Pending', completed: 'Completed' },
    counts: (pending: number, done: number) => `${pending} pending · ${done} done`,
    empty: {
      none: { message: 'No to-dos yet', description: 'To-dos from your meetings will appear here' },
      filtered: (filter: string) => ({ message: `No ${filter} to-dos`, description: 'Try a different filter to see more items' }),
      search: { message: 'No matching to-dos', description: 'Try different keywords or clear your search' },
    },
  },
  /** The new to-do form. */
  form: {
    title: 'New To-do',
    submit: 'Add',
    text: 'Title',
    meeting: 'Meeting',
    /** A to-do of its own (the General group). */
    noMeeting: 'None',
    searchMeetings: 'Search meetings',
    date: 'Date',
    time: 'Time',
    /** The time a due date starts at until one is picked. */
    defaultTime: '09:00',
  },
  deleteFailed: 'Couldn’t delete the to-do',
  reminder: {
    denied: 'Notifications are off for Roci',
    openSettings: 'Open Settings',
    failed: 'Couldn’t set the reminder',
    inOneHour: 'In 1 hour',
    inThreeHours: 'In 3 hours',
    tomorrowMorning: 'Tomorrow at 9:00 AM',
    onDueDate: (when: string) => `On due date (${when})`,
    set: 'Set reminder',
    edit: 'Edit reminder',
    title: { set: 'Set Reminder', active: 'Reminder Set' },
    remove: 'Remove',
    at: (when: string) => `Reminder: ${when}`,
  },
  /** To-dos that aren't from a meeting: their group in the list, and their reminder's title. */
  general: 'General',
  /** The card above the chat box for to-dos the AI proposed, and its edit sheet. */
  proposal: {
    toConfirm: (n: number) => `${n} ${n === 1 ? 'to-do' : 'to-dos'} to confirm`,
    saved: (n: number) => `${n} ${n === 1 ? 'to-do' : 'to-dos'} saved`,
    confirm: 'Confirm',
    confirmAll: (n: number) => `Confirm All (${n})`,
    cancel: 'Cancel',
    done: 'Done',
    edit: 'Edit To-do',
    text: 'To-do',
    due: 'Due Date',
    reminder: 'Reminder',
    owner: 'Owner',
    details: 'Details',
    dueShort: 'Due',
    reminderShort: 'Reminder',
    verbs: { delete: 'Delete', done: 'Mark done', reopen: 'Reopen', update: 'Update' },
  },
} as const;
