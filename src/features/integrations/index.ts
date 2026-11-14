/**
 * Integrations — native macOS apps and Hex, one row style and one permission vocabulary.
 */
export { CalendarIntegration } from './components/CalendarIntegration';
export { RemindersIntegration } from './components/RemindersIntegration';
export { HexIntegration } from './components/HexIntegration';
export { AppleIntelligenceIntegration } from './components/AppleIntelligenceIntegration';
export { useCalendarRuntime } from './hooks/useCalendarRuntime';
export { useRemindersRuntime } from './hooks/useRemindersRuntime';
export { useHexRuntime } from './hooks/useHexRuntime';
export { useIntegrationSpeech } from './hooks/useIntegrationSpeech';
export type { IntegrationAccess, IntegrationControls } from './types';
