/**
 * Notification templates and configuration
 * Centralized notification messages for consistency
 */

export enum NotificationType {
  RECORDING_STARTED = 'RECORDING_STARTED',
  RECORDING_STOPPED = 'RECORDING_STOPPED',
  TRANSCRIPTION_COMPLETE = 'TRANSCRIPTION_COMPLETE',
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
  FILE_SAVED = 'FILE_SAVED',
  ERROR = 'ERROR',
  RECORDING_TIMEOUT = 'RECORDING_TIMEOUT',
  TODO_REMINDER = 'TODO_REMINDER',
}

export interface NotificationTemplate {
  title: string;
  body: string;
}

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  [NotificationType.RECORDING_STARTED]: {
    title: 'Recording Started',
    body: 'Voice recording is now active',
  },
  [NotificationType.RECORDING_STOPPED]: {
    title: 'Recording Stopped',
    body: 'Processing your recording...',
  },
  [NotificationType.TRANSCRIPTION_COMPLETE]: {
    title: 'Transcription Complete',
    body: 'Your audio has been successfully transcribed',
  },
  [NotificationType.TRANSCRIPTION_FAILED]: {
    title: 'Transcription Failed',
    body: 'An error occurred while transcribing your audio',
  },
  [NotificationType.FILE_SAVED]: {
    title: 'File Saved',
    body: 'Your recording has been saved successfully',
  },
  [NotificationType.ERROR]: {
    title: 'Error',
    body: 'An unexpected error occurred',
  },
  [NotificationType.RECORDING_TIMEOUT]: {
    title: 'Are you still recording?',
    body: 'Recording has been active for 60 minutes. It will stop automatically in 5 minutes.',
  },
  [NotificationType.TODO_REMINDER]: {
    title: 'To-Do Reminder',
    body: 'You have a pending action item',
  },
};

export const NOTIFICATION_CONFIG = {
  defaultIcon: 'icon.png',
  duration: 5000, // 5 seconds
  persistent: false,
} as const;
