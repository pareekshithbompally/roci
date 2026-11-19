// Components
export { UnifiedSidebarItem, UnifiedList } from './components';

// Hooks
export { useHistory, useDeleteSession, useUnifiedSidebar, useOpenMeeting } from './hooks';

// Re-export context for provider usage
export { HistoryProvider, useHistory as useHistoryContext } from '@shared/contexts/HistoryContext';
