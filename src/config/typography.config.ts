/**
 * Typography — Tailwind class mappings.
 *
 * Single source for type scale. Use these instead of hard-coded values.
 */

export const TYPOGRAPHY_CLASSES = {
  // Sidebar
  sidebarItem: 'text-[13px] font-medium leading-[1.5] tracking-[-0.01em]',
  sidebarMetadata: 'text-[11px] font-normal leading-[1.4]',
  
  // Chat
  chatMessage: 'text-[14px] font-normal leading-[1.75] tracking-[0.005em]',
  chatProvider: 'text-xs font-medium leading-[1.4]',
  chatTimestamp: 'text-xs font-normal leading-[1.4]',
  chatSpacing: 'space-y-4',
  chatContainer: 'px-12 py-4',
  
  // Transcript
  transcriptText: 'text-[14px] font-normal leading-[1.75]',
  transcriptSpeaker: 'text-[13px] font-semibold leading-[1.4]',
  
  // Settings
  settingsTitle: 'text-[15px] font-semibold leading-[1.3]',
  settingsDescription: 'text-[13px] font-normal leading-[1.5]',
  settingsLabel: 'text-xs font-medium leading-[1.4]',
  settingsInputLabel: 'text-[13px] font-medium leading-[1.4]',
  settingsHelper: 'text-[11.5px] font-normal leading-[1.5]',
  settingsInput: 'text-[13px] font-normal leading-[1.5]',
  settingsButton: 'text-[12.5px] font-medium leading-[1.4]',
  settingsSpacing: 'space-y-6',
  
  // Summary
  summaryTitle: 'text-base font-semibold leading-[1.4]',
  summaryBody: 'text-sm font-normal leading-[1.6]',
  
  // Markdown
  markdownParagraph: 'mb-4',
} as const;

