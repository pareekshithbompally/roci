/**
 * History Feature Module
 * 
 * Complete history management functionality.
 */

// Components
export { HistoryItem, HistoryList, UnifiedSidebarItem, UnifiedList } from './components';

// Hooks
export { useHistory, useDeleteSession } from './hooks';

// Re-export context for provider usage
export { HistoryProvider, useHistory as useHistoryContext } from '@shared/contexts/HistoryContext';
