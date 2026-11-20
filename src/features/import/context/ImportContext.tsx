/** React wrapper around ImportService; concurrency follows settings, saves refresh history. */

import React, { createContext, useContext, useRef, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { refreshItems } from '@shared/query/items';
import { ImportService } from '@features/import/import.service';

interface ImportContextValue {
  importAudio: () => Promise<void>;
  importTranscripts: () => Promise<void>;
  cancelJob: (id: string) => void;
  cancelAll: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export const ImportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings } = useSettings();

  const serviceRef = useRef<ImportService | null>(null);

  // Lazily create ImportService
  if (!serviceRef.current) {
    const jp = settings.jobProcessing;
    const concurrency = jp?.mode === 'parallel' ? jp.maxConcurrent : 1;
    serviceRef.current = new ImportService({
      concurrency,
      onMeetingSaved: refreshItems,
    });
  }

  // Keep onMeetingSaved callback fresh
  useEffect(() => {
    serviceRef.current?.setOnMeetingSaved(refreshItems);
  }, []);

  // Update concurrency when settings change
  useEffect(() => {
    serviceRef.current?.updateConcurrency(settings);
  }, [settings.jobProcessing]);

  const importAudio = useCallback(async () => {
    await serviceRef.current?.importAudio();
  }, []);

  const importTranscripts = useCallback(async () => {
    await serviceRef.current?.importTranscripts();
  }, []);

  const cancelJob = useCallback((id: string) => {
    serviceRef.current?.cancelJob(id);
  }, []);

  const cancelAll = useCallback(() => {
    serviceRef.current?.cancelAll();
  }, []);

  const value = useMemo<ImportContextValue>(() => ({
    importAudio,
    importTranscripts,
    cancelJob,
    cancelAll,
  }), [importAudio, importTranscripts, cancelJob, cancelAll]);

  return (
    <ImportContext.Provider value={value}>
      {children}
    </ImportContext.Provider>
  );
};

export const useImport = (): ImportContextValue => {
  const context = useContext(ImportContext);
  if (!context) {
    throw new Error('useImport must be used within an ImportProvider');
  }
  return context;
};
