/** A meeting's Summary tab: how much it previews and its words. */

export const SUMMARY_CONFIG = {
  /** Action items listed in the summary; the rest are in the To-dos tab. */
  actionPreview: 5,
  copy: {
    overview: 'Overview',
    decisions: 'Decisions',
    actions: 'Action items',
    keyPoints: 'Key points',
    nextSteps: 'Next steps',
    more: (count: number, tab: string) => `${count} more in ${tab}`,
    none: 'No summary yet',
    /** Stands where the opening paragraph will be, shimmering, while the summary is written. */
    writingPlaceholder: 'Reading the transcript and writing the summary…',
    transcribing: 'The summary is written once the transcript is finished.',
    summarizing: 'This usually takes under a minute. You can keep reading the transcript meanwhile.',
  },
} as const;
