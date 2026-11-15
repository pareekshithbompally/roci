import React from 'react';
import { AppProviders } from './AppProviders';
// Import the new refactored App component
import AppContent from '@/src/App';

/** Root component: the app wrapped in every provider. */
const App: React.FC = () => {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
};

export default App;
