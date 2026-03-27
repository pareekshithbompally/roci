/**
 * Typography Configuration
 * 
 * Centralized typography system for Kasset.ai.
 * All font sizes, weights, line heights, and letter spacing defined here.
 * 
 * To change typography across the app, edit values here only.
 */

export const TYPOGRAPHY = {
  /**
   * Font Family
   */
  fontFamily: {
    primary: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
  },

  /**
   * Sidebar Typography
   */
  sidebar: {
    item: {
      fontSize: '13px',
      fontWeight: '500',
      lineHeight: '1.5',
      letterSpacing: '-0.01em',
    },
    metadata: {
      fontSize: '11px',
      fontWeight: '400',
      lineHeight: '1.4',
    },
    icon: {
      size: '14px', // w-3.5 h-3.5
    },
  },

  /**
   * Chat Typography
   */
  chat: {
    message: {
      fontSize: '14px',
      fontWeight: '400',
      lineHeight: '1.75',
      letterSpacing: '0.005em',
    },
    providerHeader: {
      fontSize: '12px',
      fontWeight: '500',
      lineHeight: '1.4',
    },
    timestamp: {
      fontSize: '12px',
      fontWeight: '400',
      lineHeight: '1.4',
    },
    spacing: {
      betweenMessages: '32px', // space-y-8
      containerPadding: '32px', // px-8 py-8
    },
  },

  /**
   * Transcript Typography (same as chat)
   */
  transcript: {
    text: {
      fontSize: '14px',
      fontWeight: '400',
      lineHeight: '1.75',
    },
    speaker: {
      fontSize: '13px',
      fontWeight: '600',
      lineHeight: '1.4',
    },
  },

  /**
   * Settings Panel Typography
   */
  settings: {
    panelTitle: {
      fontSize: '15px',
      fontWeight: '600',
      lineHeight: '1.3',
    },
    panelDescription: {
      fontSize: '13px',
      fontWeight: '400',
      lineHeight: '1.5',
    },
    sectionLabel: {
      fontSize: '12px',
      fontWeight: '500',
      lineHeight: '1.4',
      letterSpacing: '0em',
    },
    inputLabel: {
      fontSize: '13px',
      fontWeight: '500',
      lineHeight: '1.4',
    },
    helperText: {
      fontSize: '11.5px',
      fontWeight: '400',
      lineHeight: '1.5',
    },
    inputText: {
      fontSize: '13px',
      fontWeight: '400',
      lineHeight: '1.5',
    },
    buttonText: {
      fontSize: '12.5px',
      fontWeight: '500',
      lineHeight: '1.4',
    },
    spacing: {
      betweenSections: '24px', // space-y-6
    },
  },

  /**
   * Summary Card Typography
   */
  summary: {
    title: {
      fontSize: '16px',
      fontWeight: '600',
      lineHeight: '1.4',
    },
    body: {
      fontSize: '14px',
      fontWeight: '400',
      lineHeight: '1.6',
    },
  },

  /**
   * Markdown Content Typography
   */
  markdown: {
    paragraph: {
      marginBottom: '16px', // mb-4
    },
  },
} as const;

/**
 * Tailwind Class Mappings
 * 
 * Use these in components instead of hard-coded values.
 * Maps semantic names to Tailwind classes.
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

export default TYPOGRAPHY;
