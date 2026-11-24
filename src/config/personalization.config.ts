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
    /** The engine's value where neither the maker nor the user sets one (mlx-swift-lm's GenerateParameters defaults). */
    engine: { temperature: 0.6, topP: 1, topK: 0, minP: 0, repetitionPenalty: 1, presencePenalty: 0, frequencyPenalty: 0, penaltyContext: 20 },
    /** Advanced sliders, in order; the help is the ⓘ popover. */
    knobs: [
      { key: 'temperature', group: 'sampling', label: 'Temperature', min: 0, max: 2, step: 0.05, help: 'How playful the model is with words. Turn it down for steady, predictable answers; turn it up for more variety and ideas, with more slip-ups.' },
      { key: 'topP', group: 'sampling', label: 'Top P', min: 0.05, max: 1, step: 0.05, help: 'How many likely words the model considers before picking one. Lower keeps it on the obvious choices; 1 lets it consider them all.' },
      { key: 'topK', group: 'sampling', label: 'Top K', min: 0, max: 200, step: 1, help: 'A hard cap on how many likely words the model chooses between. Lower keeps it focused; 0 means no cap.' },
      { key: 'minP', group: 'sampling', label: 'Min P', min: 0, max: 0.5, step: 0.01, help: 'Tells the model to ignore words that are a long shot. A little, like 0.05, cuts out odd words; 0 leaves it off.' },
      { key: 'repetitionPenalty', group: 'repeats', label: 'Repeat Penalty', min: 1, max: 1.5, step: 0.01, help: 'Nudges the model away from words it just used, so it doesn’t go in circles. 1 is off; too high and it avoids words it actually needs.' },
      { key: 'presencePenalty', group: 'repeats', label: 'Presence Penalty', min: 0, max: 2, step: 0.05, help: 'Encourages the model to bring up something new instead of circling back to what it already said. 0 is off.' },
      { key: 'frequencyPenalty', group: 'repeats', label: 'Frequency Penalty', min: 0, max: 2, step: 0.05, help: 'Discourages the model from leaning on the same word or phrase again and again; the more it’s used, the stronger the push. 0 is off.' },
      { key: 'penaltyContext', group: 'repeats', label: 'Penalties Look Back', min: 10, max: 500, step: 10, unit: 'tokens', help: 'How far back the three settings above look when spotting repeats, counted in tokens (a token is about ¾ of a word).' },
    ],
    /** Advanced token limits; unset is the model's own. */
    limits: [
      { key: 'maxOutputTokens', label: 'Longest Reply', help: 'The longest a single reply can be, in tokens (about ¾ of a word each). Leave it empty to let the model finish when it’s done.' },
      { key: 'contextTokens', label: 'Context Size', help: 'How much of the conversation the model can remember at once, in tokens. Smaller uses less memory, but older messages get forgotten. Leave it empty to remember as much as the model can.' },
    ],
    /** The simple controls: each sets the values it owns; one matching none of its choices reads Custom. */
    presets: {
      style: {
        label: 'Style',
        help: 'Sets the model’s personality on the page. Precise gives steady, to-the-point answers, the same way each time. Creative mixes things up and offers more ideas, but makes more slip-ups. Balanced is how the model’s maker set it up.',
        options: [
          { value: 'precise', label: 'Precise', tuning: { temperature: 0.2, topP: 0.9 } },
          { value: 'balanced', label: 'Balanced', tuning: {} },
          { value: 'creative', label: 'Creative', tuning: { temperature: 1, topP: 1 } },
        ],
      },
      repeats: {
        label: 'Avoid Repeating',
        help: 'Small models sometimes get stuck saying the same thing over and over. This gently stops that. Strong pushes harder, but may avoid words a reply really needs.',
        options: [
          { value: 'off', label: 'Off', tuning: {} },
          { value: 'light', label: 'Light', tuning: { repetitionPenalty: 1.05 } },
          { value: 'strong', label: 'Strong', tuning: { repetitionPenalty: 1.15 } },
        ],
      },
      length: {
        label: 'Reply Length',
        help: 'How long a chat reply can get. Short keeps answers brief; Full lets the model finish in its own time. Summaries always come out complete.',
        options: [
          { value: 'short', label: 'Short', tuning: { maxOutputTokens: 512 } },
          { value: 'medium', label: 'Medium', tuning: { maxOutputTokens: 2048 } },
          { value: 'full', label: 'Full', tuning: {} },
        ],
      },
      memory: {
        label: 'Memory',
        help: 'How much of the conversation the model remembers, which is also how much memory it uses. Light remembers the last few pages and leaves memory free for other things; Full remembers as much as the model can.',
        options: [
          { value: 'light', label: 'Light', tuning: { contextTokens: 4096, kvBits: 8 } },
          { value: 'balanced', label: 'Balanced', tuning: { contextTokens: 16384 } },
          { value: 'full', label: 'Full', tuning: {} },
        ],
      },
    },
    compression: {
      label: 'KV Cache Management',
      help: 'Compresses the KV cache, the model’s memory of the conversation so far, so it uses less memory. Some halves it with no difference you’d notice; Most saves about three quarters but may lose track of small details in long chats.',
      options: [
        { value: 'off', label: 'Off' },
        { value: '8', label: 'Some' },
        { value: '4', label: 'Most' },
      ],
    },
    copy: {
      title: 'Model Tuning',
      model: 'Model',
      modelHelp: 'Pick the on-device model you want to adjust. Each model remembers its own settings.',
      modelFooter: 'Applies wherever this model writes freely, as in chat; replies in a fixed format, like summaries, keep theirs. Download chat models in Providers › On this device; pick which one Roci uses in Default Models.',
      noModels: 'No On-Device Chat Models',
      loadFailed: 'Couldn’t load on-device models',
      noModelsFooter: 'Download a chat model in Providers › On this device, then tune it here.',
      writing: 'How It Writes',
      writingFooter: 'Balanced and Full are the model maker’s settings.',
      memoryFooter: 'Changing memory starts the model’s next reply fresh.',
      /** The pane's button that opens the sheet of exact values (System Settings' "Advanced…"). */
      advanced: 'Advanced…',
      /** The same, as an iPhone drill-down row. */
      advancedRow: 'Advanced',
      advancedTitle: (model: string) => `Advanced — ${model}`,
      sampling: 'Sampling',
      samplingFooter: 'The exact values behind Style. Changing one here shows Style as Custom.',
      repeats: 'Repeats',
      limits: 'Limits',
      limitsFooter: 'Empty fields use the model’s own limit.',
      done: 'Done',
      custom: 'Custom',
      restore: 'Restore Defaults',
      limitPlaceholder: 'Model’s limit',
      help: (label: string) => `About ${label}`,
    },
  },
} as const;

/** What stores what the model keeps in mind compressed: 8 or 4 bits. */
export type KvBits = 8 | 4;

/** One on-device chat model's tuning: only what the user changed; unset is the maker's value, else the engine's. */
export interface ModelTuning {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  /** How many recent tokens the three penalties count. */
  penaltyContext?: number;
  maxOutputTokens?: number;
  /** The most tokens the model keeps in mind; older ones roll off. */
  contextTokens?: number;
  kvBits?: KvBits;
}

export type TuningKnob = (typeof PERSONALIZATION_CONFIG.modelTuning.knobs)[number]['key'];
export type TuningLimit = (typeof PERSONALIZATION_CONFIG.modelTuning.limits)[number]['key'];
export type TuningPreset = keyof typeof PERSONALIZATION_CONFIG.modelTuning.presets;
