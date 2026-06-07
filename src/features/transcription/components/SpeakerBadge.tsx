import React from 'react';

interface SpeakerBadgeProps {
  speaker: string;
  index: number;
}

const PALETTE = [
  { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700/40' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700/40' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-300 dark:border-violet-700/40' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700/40' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-700/40' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-300 dark:border-cyan-700/40' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-700/40' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-700/40' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/40', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-300 dark:border-fuchsia-700/40' },
  { bg: 'bg-lime-100 dark:bg-lime-900/40', text: 'text-lime-700 dark:text-lime-300', border: 'border-lime-300 dark:border-lime-700/40' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-700/40' },
  { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-300 dark:border-pink-700/40' },
] as const;

const PALETTE_LENGTH = PALETTE.length;

export const SpeakerBadge: React.FC<SpeakerBadgeProps> = ({ speaker, index }) => {
  const color = PALETTE[index % PALETTE_LENGTH];

  return (
    <span
      className={`inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium border ${color.bg} ${color.text} ${color.border}`}
      title={`Speaker: ${speaker}`}
    >
      {speaker}
    </span>
  );
};

export default SpeakerBadge;
