/**
 * App.tsx - Application Root
 * 
 * Entry point that wraps the app with the new provider architecture.
 * 
 * Architecture:
 * - AppProviders: Composes all context providers
 * - App: The new refactored App component
 */

import React from 'react';
import { AppProviders } from './AppProviders';
// Import the new refactored App component
import AppContent from '@/src/App';

/**
 * App Component
 * 
 * Root application component wrapped with all providers.
 */
const App: React.FC = () => {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
};

export default App;
