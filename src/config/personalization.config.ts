/** Settings › Personalization: custom vocabulary limits, recognition boost levels and copy. */

/** How readily on-device speech recognition favours a vocabulary term over what it heard. */
import { ENTITY_KINDS, type EntityKind } from '@config/knowledge.config';

const ENTITY_LABELS: Record<EntityKind, string> = {
  person: 'A Person',
  organization: 'An Organization',
  project: 'A Project',
  event: 'An Event',
  topic: 'A Topic',
};

export type RecognitionBoost = 'off' | 'light' | 'normal' | 'strong';
/** How long, in what voice and how laid out chat answers are (Settings › Personalization › Prompts). */
export type ResponseLength = 'brief' | 'balanced' | 'detailed';
export type ResponseTone = 'default' | 'direct' | 'friendly' | 'formal';
export type ResponseFormat = 'prose' | 'auto' | 'structured';
/** The prompt texts the user may rewrite; each has a default in code that Reset restores. */
export type PromptTemplateId = 'chatStyle' | 'chatTitles' | 'summaryRules';

/** Who the user is, as prompts introduce them. */
export interface UserProfile {
  name?: string;
  about?: string;
}

/** How chat answers read; unset = the default. */
export interface ResponsePreferences {
  length?: ResponseLength;
  tone?: ResponseTone;
  format?: ResponseFormat;
}

/** A prompt the user reuses, typed into the chat box from its "/" menu. */
export interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
}

/** The user's rewrites of prompt templates; a template not here uses Roci's text. */
export type PromptTemplates = Partial<Record<PromptTemplateId, string>>;

export const PERSONALIZATION_CONFIG = {
  vocabulary: {
    /** Longest term or "sounds like" spelling, in characters. */
    maxTermChars: 64,
    /** Most terms in the list. */
    maxEntries: 500,
    /** Most "sounds like" spellings per term. */
    maxSoundsLike: 16,
    /** The most of the list a prompt states, in characters (the first terms; a long list mustn't crowd out the task). */
    promptChars: 1000,
  },
  recognitionBoosts: [
    { value: 'off', label: 'Off' },
    { value: 'light', label: 'Light' },
    { value: 'normal', label: 'Normal' },
    { value: 'strong', label: 'Strong' },
  ] as const satisfies ReadonlyArray<{ value: RecognitionBoost; label: string }>,
  defaultRecognitionBoost: 'normal' as RecognitionBoost,
  copy: {
    footer: 'Kept on this device; a model sees it only as part of a request.',
    vocabulary: {
      title: 'Vocabulary',
      section: 'Custom Vocabulary',
      footer: 'Names and terms Roci should spell your way in transcripts, notes, summaries and chat. When the list is long, Roci uses the terms added first.',
      search: 'Search Terms',
      emptyList: 'No terms yet. Click + to add one.',
      add: 'Add Term',
      remove: 'Remove Term',
      edit: 'Edit Term',
      term: 'Term',
      termPlaceholder: 'Context7',
      soundsLike: 'Sounds Like',
      soundsLikePlaceholder: 'contact seven, contact7',
      soundsLikeHelper: 'Optional. Other spellings speech recognition writes for this term, usually noticed in past transcripts. Separate them with commas.',
      delete: 'Delete Term',
      save: 'Save',
      confirmAdd: 'Add',
      cancel: 'Cancel',
      duplicate: (term: string) => `“${term}” is already in your vocabulary.`,
      empty: 'Enter a term.',
      tooLong: (text: string, max: number) => `“${text}” is longer than ${max} characters.`,
      full: (max: number) => `Your vocabulary holds at most ${max} terms.`,
      tooManySpellings: (max: number) => `A term can have at most ${max} “sounds like” spellings.`,
      count: (n: number) => `${n} ${n === 1 ? 'term' : 'terms'}`,
    },
    recognition: {
      section: 'Recognition',
      boost: 'Recognition Boost',
      language: 'Spoken Language',
      /** The menu's first choice: the device's language ("Automatic (English)"). */
      automatic: (name: string) => `Automatic (${name})`,
      writes: (model: string) => `${model} writes your transcripts in this language and its script.`,
      needsChoice: (model: string) => `${model} doesn't take your device's language. Choose the one you speak.`,
      footer: 'How strongly on-device speech recognition favours your terms. Stronger catches more names but can replace words that were said correctly.',
    },
  },
  savedPrompts: {
    limits: { name: 60, prompt: 4000, count: 200 },
    copy: {
      title: 'Saved Prompts',
      section: 'Saved Prompts',
      footer: 'Type / in the chat box to use one. It fills the chat box, ready to edit or send.',
      search: 'Search Prompts',
      empty: 'No saved prompts yet. Click + to add one.',
      add: 'Add Prompt',
      remove: 'Delete Prompt',
      edit: 'Edit Prompt',
      name: 'Name',
      namePlaceholder: 'Weekly status update',
      prompt: 'Prompt',
      promptPlaceholder: 'Write my weekly status update from this week’s meetings and to-dos.',
      save: 'Save',
      cancel: 'Cancel',
      columns: { name: 'Name', prompt: 'Prompt' },
      menuSearch: 'Search saved prompts…',
      menuEmpty: 'No saved prompts. Add them in Settings › Personalization › Saved Prompts.',
      count: (n: number) => `${n} ${n === 1 ? 'prompt' : 'prompts'}`,
    },
  },
  memory: {
    /** The most of the saved memories a chat's system prompt states, in characters (pinned first, then the newest); the
     *  rest are found with find (in memories). */
    promptChars: 2000,
    copy: {
      title: 'Memory',
      use: 'Use Memory',
      useFooter: 'Roci uses what it knows about you in every chat, and may suggest something to remember. Nothing is saved until you approve it.',
      section: 'Saved Memories',
      views: [{ value: 'list', label: 'List' }, { value: 'graph', label: 'Graph' }] as const,
      viewsLabel: 'Show memories as',
      footer: 'Kept on this device. Chat models read them in the system prompt, and coding agents you connect to Roci can look them up.',
      search: 'Search Memories',
      empty: 'No memories yet. Click + to add one.',
      add: 'Add Memory',
      remove: 'Delete Memory',
      edit: 'Edit Memory',
      text: 'Memory',
      placeholder: 'For example: I lead the payments team.',
      pin: 'Pinned',
      about: 'About',
      aboutName: 'Name',
      aboutNamePlaceholder: 'Priya Raman',
      aboutOptions: [{ value: 'you', label: 'You' }, ...ENTITY_KINDS.map((kind) => ({ value: kind, label: ENTITY_LABELS[kind] }))],
      deleteAll: 'Delete All Memories…',
      deleteAllTitle: 'Delete All Memories?',
      deleteAllDescription: 'Roci forgets everything it knows about you. This can’t be undone.',
      deleteAllConfirm: 'Delete All',
      save: 'Save',
      cancel: 'Cancel',
      columns: { text: 'Memory', about: 'About', updated: 'Updated' },
      you: 'You',
      count: (n: number) => `${n} ${n === 1 ? 'memory' : 'memories'}`,
    },
    proposal: {
      toConfirm: (n: number) => `Remember ${n === 1 ? 'this' : `${n} things`}?`,
      saved: 'Saved to memory',
      confirm: 'Save',
      cancel: 'Not Now',
      edit: 'Edit Memory',
      done: 'Done',
      verbs: { update: 'Update', forget: 'Forget' },
    },
  },
  prompts: {
    /** Longest text, in characters, each field holds (a long text crowds out the task, most on small models). */
    limits: { name: 60, about: 1000, customInstructions: 1500, template: 3000 },
    lengths: [
      { value: 'brief', label: 'Brief' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'detailed', label: 'Detailed' },
    ] as const satisfies ReadonlyArray<{ value: ResponseLength; label: string }>,
    tones: [
      { value: 'default', label: 'Default' },
      { value: 'direct', label: 'Direct' },
      { value: 'friendly', label: 'Friendly' },
      { value: 'formal', label: 'Formal' },
    ] as const satisfies ReadonlyArray<{ value: ResponseTone; label: string }>,
    formats: [
      { value: 'prose', label: 'Prose' },
      { value: 'auto', label: 'Automatic' },
      { value: 'structured', label: 'Structured' },
    ] as const satisfies ReadonlyArray<{ value: ResponseFormat; label: string }>,
    defaults: { length: 'balanced' as ResponseLength, tone: 'default' as ResponseTone, format: 'auto' as ResponseFormat },
    templates: [
      { id: 'chatStyle', label: 'Chat Answer Style' },
      { id: 'chatTitles', label: 'Chat Titles' },
      { id: 'summaryRules', label: 'Meeting Summary Rules' },
    ] as const satisfies ReadonlyArray<{ id: PromptTemplateId; label: string }>,
    copy: {
      title: 'Prompts',
      about: {
        section: 'About You',
        name: 'Name',
        namePlaceholder: 'What Roci calls you',
        about: 'Your Work',
        aboutPlaceholder: 'Your role, your team, what you work on',
        footer: 'Roci uses this in chat, summaries and live notes, so it can tell who “You” is and what matters to you.',
      },
      responses: {
        section: 'Responses',
        length: 'Length',
        tone: 'Tone',
        format: 'Formatting',
        footer: 'How chat answers read, with any model.',
        edited: 'Your edited Chat Answer Style is in use.',
      },
      instructions: {
        section: 'Custom Instructions',
        placeholder: 'For example: Use metric units. Explain technical terms briefly.',
        footer: 'Roci follows these in every chat, unless they conflict with its own rules.',
      },
      templates: {
        section: 'Prompt Templates',
        footer: 'Rewrite the instructions Roci gives a model for each task. Reset to Default restores Roci’s text.',
        edited: 'Edited',
        edit: (label: string) => `Edit ${label}`,
        reset: 'Reset to Default',
        save: 'Save',
        cancel: 'Cancel',
        tooLong: (max: number) => `A template holds at most ${max} characters.`,
      },
      preview: {
        open: 'View System Prompt…',
        title: 'System Prompt',
        note: 'Sent to the chat model with every message: Roci’s instructions, with yours added. Shown with your selected tools.',
        close: 'Done',
      },
    },
  },
  modelTuning: {
    /** llama.cpp's own value of each option no preset sets (`common_params_sampling`). */
    engine: {
      temp: 0.8, 'top-p': 0.95, 'top-k': 40, 'min-p': 0.05, 'repeat-penalty': 1, 'presence-penalty': 0, 'frequency-penalty': 0,
      'repeat-last-n': 64, 'dry-multiplier': 0,
    },
    /** The Advanced… sheet: every sampling option Roci tunes, by llama-server's own name, in its group; the hint is the
     *  row's line, the help its ⓘ. */
    options: [
      { key: 'temp', group: 'sampling', label: 'Temperature', min: 0, max: 2, step: 0.05, hint: 'Lower is steadier; higher is more varied.', help: 'How playful the model is with words. Turn it down for steady, predictable answers; turn it up for more variety and ideas, with more slip-ups.' },
      { key: 'top-p', group: 'sampling', label: 'Top P', min: 0.05, max: 1, step: 0.05, hint: 'How many likely words it weighs; 1 weighs them all.', help: 'How many likely words the model considers before picking one. Lower keeps it on the obvious choices; 1 lets it consider them all.' },
      { key: 'top-k', group: 'sampling', label: 'Top K', min: 0, max: 200, step: 1, hint: 'A cap on the words it chooses between; 0 is no cap.', help: 'A hard cap on how many likely words the model chooses between. Lower keeps it focused; 0 means no cap.' },
      { key: 'min-p', group: 'sampling', label: 'Min P', min: 0, max: 0.5, step: 0.01, hint: 'Skips long-shot words; 0 is off.', help: 'Tells the model to ignore words that are a long shot. A little, like 0.05, cuts out odd words; 0 leaves it off.' },
      { key: 'repeat-penalty', group: 'repeats', label: 'Repeat Penalty', min: 1, max: 1.5, step: 0.01, hint: 'Steers away from words just used; 1 is off.', help: 'Nudges the model away from words it just used, so it doesn’t go in circles. 1 is off; too high and it avoids words it actually needs.' },
      { key: 'presence-penalty', group: 'repeats', label: 'Presence Penalty', min: 0, max: 2, step: 0.05, hint: 'Favours bringing up something new; 0 is off.', help: 'Encourages the model to bring up something new instead of circling back to what it already said. 0 is off.' },
      { key: 'frequency-penalty', group: 'repeats', label: 'Frequency Penalty', min: 0, max: 2, step: 0.05, hint: 'Pushes harder the more a word is used; 0 is off.', help: 'Discourages the model from leaning on the same word or phrase again and again; the more it’s used, the stronger the push. 0 is off.' },
      { key: 'dry-multiplier', group: 'repeats', label: 'DRY Multiplier', min: 0, max: 2, step: 0.05, hint: 'Stops whole phrases repeating; 0 is off.', help: 'Stops the model repeating whole runs of words it already wrote ("Don’t Repeat Yourself"). Higher stops them sooner; 0 is off.' },
      { key: 'repeat-last-n', group: 'repeats', label: 'Penalties Look Back', min: 0, max: 512, step: 16, unit: 'tokens', hint: 'How far back repeats are spotted, in tokens.', help: 'How far back the repeat, presence and frequency penalties look when spotting repeats, counted in tokens (a token is about ¾ of a word). 0 turns them off.' },
    ],
    /** Context sizes offered: powers of two from the smallest that holds Roci's chat (its instructions and tools take
     *  about 5,000 tokens before any history) up to the model's own maximum. */
    context: {
      label: 'Context Size',
      help: 'How much of a conversation the model keeps in mind at once, in tokens (about ¾ of a word each). More remembers longer chats and bigger documents but takes more memory; the memory each size takes is llama.cpp’s own estimate for this model’s conversation memory (the model file itself is read from disk as needed).',
      minTokens: 8192,
      /** Tokens in a K, as context sizes are named (16K is 16,384). */
      tokensPerK: 1024,
      /** A choice: its size, then the memory llama.cpp projects for it once measured. */
      choice: (k: number, size?: string) => (size ? `${k}K tokens · ${size}` : `${k}K tokens`),
    },
    replyLength: {
      label: 'Longest Reply',
      help: 'How long a reply can get before the model is stopped. Replies in a fixed format, like meeting summaries, always come out complete.',
      options: [
        { tokens: 512, label: 'About 400 words' },
        { tokens: 2048, label: 'About 1,500 words' },
        { tokens: 8192, label: 'About 6,000 words' },
        { tokens: -1, label: 'No Limit' },
      ],
    },
    thinking: {
      label: 'Thinking Budget',
      help: 'How long the model may think before it answers, when the chat’s thinking level is the model’s default. Longer thinking can help hard questions but takes longer.',
      options: [
        { tokens: 0, label: 'Off' },
        { tokens: 512, label: 'About 400 words' },
        { tokens: 1024, label: 'About 750 words' },
        { tokens: 4096, label: 'About 3,000 words' },
        { tokens: -1, label: 'No Limit' },
      ],
    },
    /** The KV cache type (`cache-type-k` and `cache-type-v`): f16 is llama.cpp's own. */
    memorySaver: {
      label: 'Memory Saver',
      help: 'Compresses the model’s memory of the conversation (its KV cache). Half uses half the memory with no difference you’d notice; Quarter saves more but may lose track of small details in long chats.',
      options: [
        { value: 'f16', label: 'Off' },
        { value: 'q8_0', label: 'Half' },
        { value: 'q4_0', label: 'Quarter' },
      ],
      saves: (label: string, size: string) => `${label} · saves ${size}`,
    },
    speedUp: {
      label: 'Speed-Up',
      help: 'This model comes with a small helper that guesses the next few words for it to check at once, so replies arrive faster with the same words. It takes a little more memory.',
    },
    /** The simple controls: each sets the values it owns; one matching none of its choices reads Custom. An empty choice
     *  is the model maker's setting. */
    presets: {
      style: {
        label: 'Style',
        help: 'Sets the model’s personality on the page. Precise gives steady, to-the-point answers, the same way each time. Creative mixes things up and offers more ideas, but makes more slip-ups. Balanced is how the model’s maker set it up.',
        options: [
          { value: 'precise', label: 'Precise', tuning: { temp: 0.2, 'top-p': 0.9 } },
          { value: 'balanced', label: 'Balanced', tuning: {} },
          { value: 'creative', label: 'Creative', tuning: { temp: 1, 'top-p': 1 } },
        ],
      },
      repeats: {
        label: 'Avoid Repeating',
        help: 'Small models sometimes get stuck saying the same thing over and over. This gently stops that. Strong pushes harder, but may avoid words a reply really needs.',
        options: [
          { value: 'off', label: 'Off', tuning: { 'repeat-penalty': 1 } },
          { value: 'light', label: 'Light', tuning: { 'repeat-penalty': 1.05 } },
          { value: 'strong', label: 'Strong', tuning: { 'repeat-penalty': 1.15 } },
        ],
      },
    },
    /** Where an untouched setting's value comes from, said under it. */
    sources: { maker: 'Model maker’s setting', roci: 'Roci’s default', engine: 'llama.cpp’s default' },
    copy: {
      title: 'Model Tuning',
      model: 'Model',
      modelFooter: 'Each model keeps its own settings. They apply wherever it writes freely, as in chat; replies in a fixed format, like summaries, run to completion. Download chat models in Providers › On this device; pick which one Roci uses in Default Models.',
      noModels: 'No On-Device Chat Models',
      loadFailed: 'Couldn’t load on-device models',
      noModelsFooter: 'Download a chat model in Providers › On this device, then tune it here.',
      contextChip: (k: number) => `${k}K context`,
      speedUpChip: 'Speed-up',
      writing: 'How It Writes',
      memory: 'Memory and Speed',
      memoryFooter: 'Memory figures are llama.cpp’s own estimate for this model: its weights, its memory of the conversation and its working space.',
      /** The pane's button that opens the sheet of exact values (System Settings' "Advanced…"). */
      advanced: 'Advanced…',
      /** The same, as an iPhone drill-down row. */
      advancedRow: 'Advanced',
      advancedTitle: (model: string) => `Advanced — ${model}`,
      sampling: 'Sampling',
      samplingFooter: 'The exact values behind Style. Changing one here shows Style as Custom.',
      repeats: 'Repeats',
      repeatsFooter: 'The exact values behind Avoid Repeating.',
      done: 'Done',
      custom: 'Custom',
      restore: 'Restore Defaults',
    },
  },
} as const;

/** A KV cache type llama-server takes (`cache-type-k` / `cache-type-v`). */
export type KvType = 'f16' | 'q8_0' | 'q4_0';

/** One on-device chat model's settings, by llama-server's own option names as its preset writes them: what the user
 *  changed (saved), or that merged over the maker's and Roci's defaults (resolved). Unset is llama.cpp's own value. */
export interface ModelTuning {
  temp?: number;
  'top-p'?: number;
  'top-k'?: number;
  'min-p'?: number;
  'repeat-penalty'?: number;
  'presence-penalty'?: number;
  'frequency-penalty'?: number;
  'dry-multiplier'?: number;
  /** How many recent tokens the penalties count. */
  'repeat-last-n'?: number;
  /** The longest reply, tokens; -1 is no limit. */
  'n-predict'?: number;
  /** The most tokens of thinking; -1 is no limit, 0 none. */
  'reasoning-budget'?: number;
  /** The most tokens the model keeps in mind. */
  'ctx-size'?: number;
  'cache-type-k'?: KvType;
  'cache-type-v'?: KvType;
  /** `none`: the model drafts no tokens with its own draft model (speculative decoding off). */
  'spec-type'?: 'none';
}

/** Every key a saved tuning may hold; anything else saved is ignored. */
export const TUNING_KEYS = [
  'temp', 'top-p', 'top-k', 'min-p', 'repeat-penalty', 'presence-penalty', 'frequency-penalty', 'dry-multiplier', 'repeat-last-n',
  'n-predict', 'reasoning-budget', 'ctx-size', 'cache-type-k', 'cache-type-v', 'spec-type',
] as const satisfies ReadonlyArray<keyof ModelTuning>;

export type TuningOption = (typeof PERSONALIZATION_CONFIG.modelTuning.options)[number]['key'];
export type TuningPreset = keyof typeof PERSONALIZATION_CONFIG.modelTuning.presets;
export type TuningSource = keyof typeof PERSONALIZATION_CONFIG.modelTuning.sources;
