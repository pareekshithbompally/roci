/** Settings panes' own words: row titles, choices and the footers under each group. */

/** Settings › General. */
export const GENERAL_COPY = {
  appearance: 'Appearance',
  theme: 'Theme',
  themes: { light: 'Light', dark: 'Dark', system: 'System' },
  modelIcons: 'Model Icons',
  showModelIcons: 'Show model icons',
  toolActivity: 'Tool Activity',
  showToolActivity: 'Show tool activity',
  appearanceFooter: 'Tool Activity shows the tools used in each answer. Model icons load from huggingface.co.',
  imports: 'Imports',
  audioProcessing: 'Audio Processing',
  importsFooter: 'How many imported audio files Roci processes at the same time.',
  oneAtATime: 'One at a time',
  atOnce: (n: number) => `${n} at once`,
  capture: 'Capture',
  inputSource: 'Input Source',
  transcription: 'Transcription',
  /** When a recording is transcribed: one choice over the two saved settings (live transcript, transcribe after). */
  transcribe: {
    label: 'Transcribe',
    options: [
      { value: 'live', label: 'While Recording' },
      { value: 'after', label: 'After Recording' },
      { value: 'manual', label: 'Only When I Ask' },
    ],
    footer: {
      live: 'The transcript and notes build as you talk; Stop finishes them and writes the summary.',
      after: 'Stop transcribes the recording and writes the summary.',
      manual: 'Recordings are kept; transcribe one from its page when you want it.',
    },
  },
} as const;

/** Settings › Storage. */
export const STORAGE_COPY = {
  space: 'Space',
  database: 'Database',
  cache: 'Cache',
  cacheDetail: 'Temporary audio and downloaded data; rebuilt when needed.',
  clearCache: { title: 'Clear the cache?', description: 'Temporary files are removed and fetched again when needed.' },
  models: 'Downloaded Models',
  total: 'Total',
  catalog: 'Model Catalog',
  catalogFooter: 'Model abilities, context sizes and prices come from models.dev.',
  catalogUpdated: 'Model catalog updated',
  catalogFailed: 'Couldn’t reach models.dev',
  delete: 'Delete',
  deleteFailed: 'Couldn’t delete it. Nothing was removed.',
  keep: (what: string) => `Keep ${what.toLowerCase()}`,
  deleteAll: (what: string, deletes: string) => ({ title: `Delete all ${what.toLowerCase()}?`, description: `This removes ${deletes}. It can’t be undone.` }),
  deleteOlder: (what: string, age: string) => ({
    title: `Delete ${what.toLowerCase()} older than ${age}?`,
    description: 'Older ones are removed now, and from now on as they reach that age. This can’t be undone.',
  }),
} as const;

/** Settings › Storage › Search Index. */
export const SEARCH_INDEX_COPY = {
  title: 'Search Index',
  footer: 'Rebuild All wipes and re-indexes every meeting and chat.',
  meetings: 'Meetings',
  chats: 'Chats',
  failed: { meetings: 'Couldn’t re-index meetings', chats: 'Couldn’t re-index chats', all: 'Couldn’t rebuild the index' },
  counts: (indexed: number, total: number, detail: string) => `${indexed} of ${total} indexed · ${detail}`,
  transcriptPieces: (n: number) => `${n} transcript pieces`,
  chatPieces: (n: number) => `${n} chat pieces`,
  indexing: 'Indexing…',
  reindex: (what: string) => `Re-index ${what}`,
  status: { active: 'Active', empty: 'Empty', synced: 'Synced', stale: 'Stale' },
  rebuild: 'Rebuild All',
  rebuilding: 'Rebuilding…',
  rebuildConfirm: { title: 'Rebuild the search index?', description: 'Clears and re-indexes every meeting and chat. This can take a while.', confirmLabel: 'Rebuild' },
} as const;

/** Settings › About. */
export const ABOUT_COPY = {
  version: 'Version',
  versionNumber: (version: string) => `Version ${version}`,
  checkForUpdates: 'Check for Updates',
  github: 'Roci on GitHub',
  runSetupAgain: 'Run Setup Again',
  setupFooter: 'Run Setup Again shows the first-run steps, including choosing your AI.',
} as const;

/** Settings › Shortcuts. */
export const SHORTCUTS_COPY = {
  inApp: 'In Roci',
  inAppFooter: 'These work while a Roci window is in front.',
  global: 'Anywhere on Your Mac',
  globalFooter: 'These work from any app. Changing shortcuts comes in a later version.',
} as const;

/** Settings › Notifications. */
export const NOTIFICATIONS_COPY = {
  allow: 'Allow notifications',
  system: (systemName: string) => `${systemName} notifications`,
  systemFooter: 'Roci notifies you while it is in the background.',
  notifyAbout: 'Notify me about',
} as const;

/** Settings › Providers: a provider's connection and its models. */
export const PROVIDER_COPY = {
  connection: 'Connection',
  status: 'Status',
  testConnection: 'Test Connection',
  state: { notSetUp: 'Not set up', notTested: 'Not tested', checking: 'Checking…', connected: 'Connected', failed: 'Failed' },
  needsKey: 'Add your API key, then Test.',
  needsUrlAndKey: 'Add the base URL and API key, then Test.',
  modelCount: (n: number) => `${n} ${n === 1 ? 'model' : 'models'}`,
  tested: (when: string) => `tested ${when}`,
  testExplains: (title: string) => `Checks your key by listing ${title}'s models.`,
  notRunning: 'Not running',
  rescanFailed: 'Couldn’t rescan servers',
  models: 'Models',
  modelsFooter: 'Models you add here appear in Roci’s model pickers.',
  addModel: 'Add Model',
  searchModels: 'Search models…',
  browseModels: 'Browse Models',
  notInList: 'Not in the provider’s list',
  addTyped: (name: string) => `Add “${name}”`,
  typeName: 'Type the model’s name, as Browse Models lists it',
  loadingModels: 'Loading models…',
  noModels: 'No models found',
  crashed: {
    title: 'Provider Settings Error',
    description: 'Something went wrong showing the provider settings.',
    details: 'Error details',
    retry: 'Try Again',
  },
  removeConfirm: (name: string) => ({ title: `Remove ${name}?`, description: 'It leaves your model pickers. You can add it again any time.', confirmLabel: 'Remove' }),
} as const;
