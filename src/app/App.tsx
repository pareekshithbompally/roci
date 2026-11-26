import React from 'react';
import { AppProviders } from './AppProviders';
import AppContent from '@/src/App';
import { ReaderWindow, readerRequestFromAddress } from '@features/knowledge';

/** A reader window's request, read once from its address (none in the main window). */
const readerRequest = readerRequestFromAddress();

/** Root component: the app wrapped in every provider; a Mac reader window is the reader alone. */
const App: React.FC = () => {
  return (
    <AppProviders>
      {readerRequest ? <ReaderWindow request={readerRequest} /> : <AppContent />}
    </AppProviders>
  );
};

export default App;
