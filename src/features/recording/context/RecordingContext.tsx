/**
 * Recording Context
 *
 * Session-based recording engine supporting multiple concurrent recording sessions.
 * Only one session can own OS audio capture at a time (recording/paused).
 * Multiple sessions can be in review/processing simultaneously.
 *
 * Provides both:
 * - Legacy RecordingContextValue (backward compat for existing consumers)
 * - RecordingSessionsContextValue (new session-based API)
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '../../../shared/contexts/ToastContext';
import type { AudioCaptureSource } from '../../../../src/config/audio.config';
import { isTauriEnvironment, trayService } from '../../../../services/tauri';
import { coreAudioService } from '../../../../services/coreAudio.service';
import { recordingsService, transcriptionsService, summariesService } from '../../../../services/storage';
import { StorageConfig, generateRecordingFilename, getRecordingIdFromFilename } from '../../../../src/config/storage.config';
import { unifiedAIService } from '../../../../services/unifiedAIService';
import type {
  RecordingContextValue,
  RecordingState,
  RecordingSession,
  RecordingSessionsContextValue,
} from '../types';

const initialState: RecordingState = {
  status: 'idle',
  elapsedTime: 0,
  isPaused: false,
  audioSource: 'systemAndMicrophone',
  recordingId: null,
  recordingFilename: null,
  recordedFilePath: null,
  recordedBlob: null,
  audioUrl: null,
  error: null,
};

// Legacy context (backward compat)
const RecordingContext = createContext<RecordingContextValue | null>(null);

// New session-based context
const RecordingSessionsContext = createContext<RecordingSessionsContextValue | null>(null);

export const useRecordingContext = (): RecordingContextValue => {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error('useRecordingContext must be used within a RecordingProvider');
  }
  return context;
};

export const useRecordingSessions = (): RecordingSessionsContextValue => {
  const context = useContext(RecordingSessionsContext);
  if (!context) {
    throw new Error('useRecordingSessions must be used within a RecordingProvider');
  }
  return context;
};

interface RecordingProviderProps {
  children: React.ReactNode;
  settingsContext?: any;
  historyContext?: any;
  appContext?: any;
}

export const RecordingProvider: React.FC<RecordingProviderProps> = ({
  children,
  settingsContext,
  historyContext,
  appContext,
}) => {
  const { showToast } = useToast();

  // === SESSION-BASED STATE ===
  const [sessions, setSessions] = useState<Map<string, RecordingSession>>(new Map());
  const [activeCaptureSessionId, setActiveCaptureSessionId] = useState<string | null>(null);
  const [audioSource, setAudioSourceState] = useState<AudioCaptureSource>('systemAndMicrophone');

  // Per-session refs
  const timerRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const startTimeRefs = useRef<Map<string, number>>(new Map());
  const pausedTimeRefs = useRef<Map<string, number>>(new Map());
  const audioUrlRefs = useRef<Map<string, string>>(new Map());
  const abortControllerRefs = useRef<Map<string, AbortController>>(new Map());

  // Helper: update a single session
  const updateSession = useCallback((sessionId: string, updates: Partial<RecordingSession>) => {
    setSessions(prev => {
      const newMap = new Map(prev);
      const session = newMap.get(sessionId);
      if (session) {
        newMap.set(sessionId, { ...session, ...updates });
      }
      return newMap;
    });
  }, []);

  // Helper: remove a session
  const removeSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const newMap = new Map(prev);
      newMap.delete(sessionId);
      return newMap;
    });
  }, []);

  // Cleanup timer for a session
  const cleanupSessionTimer = useCallback((sessionId: string) => {
    const timer = timerRefs.current.get(sessionId);
    if (timer) {
      clearInterval(timer);
      timerRefs.current.delete(sessionId);
    }
  }, []);

  // Cleanup audio URL for a session
  const cleanupSessionAudioUrl = useCallback((sessionId: string) => {
    const url = audioUrlRefs.current.get(sessionId);
    if (url) {
      URL.revokeObjectURL(url);
      audioUrlRefs.current.delete(sessionId);
    }
  }, []);

  // Cleanup all refs for a session
  const cleanupSessionRefs = useCallback((sessionId: string) => {
    cleanupSessionTimer(sessionId);
    cleanupSessionAudioUrl(sessionId);
    startTimeRefs.current.delete(sessionId);
    pausedTimeRefs.current.delete(sessionId);
    abortControllerRefs.current.delete(sessionId);
  }, [cleanupSessionTimer, cleanupSessionAudioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timer) => clearInterval(timer));
      audioUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));

      // Revert tray to idle on unmount (safety net)
      if (isTauriEnvironment() && trayService.isInitialized) {
        trayService.stopRecordingAppearance().catch(() => {});
      }
    };
  }, []);

  // Note: tray menu item enable/disable is handled by
  // startRecordingAppearance/stopRecordingAppearance calls at each lifecycle point.

  // === SESSION-SCOPED ACTIONS ===

  // Start recording → creates new session, returns sessionId
  const startRecordingSession = useCallback(async (): Promise<string> => {
    if (!isTauriEnvironment()) {
      throw new Error('Native recording is available in the desktop app only.');
    }

    if (activeCaptureSessionId !== null) {
      throw new Error('Another recording is already capturing audio.');
    }

    try {
      const source = settingsContext?.settings?.defaultAudioSource || audioSource;
      const filename = generateRecordingFilename();
      const recordingId = getRecordingIdFromFilename(filename);
      const sessionId = crypto.randomUUID();

      // Create new session
      const newSession: RecordingSession = {
        sessionId,
        status: 'recording',
        elapsedTime: 0,
        isPaused: false,
        audioSource: source,
        recordingId,
        recordingFilename: filename,
        recordedFilePath: null,
        recordedBlob: null,
        audioUrl: null,
        error: null,
        createdAt: Date.now(),
      };

      setSessions(prev => {
        const newMap = new Map(prev);
        newMap.set(sessionId, newSession);
        return newMap;
      });
      setActiveCaptureSessionId(sessionId);

      // Set up timing refs
      startTimeRefs.current.set(sessionId, Date.now());
      pausedTimeRefs.current.set(sessionId, 0);

      await coreAudioService.startCapture({
        source,
        fileName: filename,
        recordingsDir: StorageConfig.directories.recordings,
      });

      // Start timer
      const timer = setInterval(() => {
        const startTime = startTimeRefs.current.get(sessionId);
        const pausedTime = pausedTimeRefs.current.get(sessionId) || 0;
        if (startTime !== undefined) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000) - pausedTime;
          updateSession(sessionId, { elapsedTime: Math.max(0, elapsed) });
        }
      }, 100);
      timerRefs.current.set(sessionId, timer);

      // Swap tray to recording appearance (red icon + timer)
      if (isTauriEnvironment() && trayService.isInitialized) {
        trayService.startRecordingAppearance().catch(e =>
          console.error('[RecordingContext] Failed to start tray recording appearance:', e)
        );
      }

      return sessionId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      showToast(errorMessage, 'error');
      throw error;
    }
  }, [activeCaptureSessionId, audioSource, settingsContext, updateSession, showToast]);

  // Stop recording
  const stopRecordingSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    try {
      const result = await coreAudioService.stopCapture();
      cleanupSessionTimer(sessionId);

      if (result) {
        const startTime = startTimeRefs.current.get(sessionId);
        const pausedTime = pausedTimeRefs.current.get(sessionId) || 0;
        const finalElapsedTime = startTime !== undefined
          ? Math.floor((Date.now() - startTime) / 1000) - pausedTime
          : session.elapsedTime;

        // Create audio URL
        cleanupSessionAudioUrl(sessionId);
        const url = URL.createObjectURL(result.blob);
        audioUrlRefs.current.set(sessionId, url);

        updateSession(sessionId, {
          status: 'review',
          isPaused: false,
          recordedBlob: result.blob,
          recordedFilePath: result.path,
          audioUrl: url,
          elapsedTime: Math.max(0, finalElapsedTime),
        });

        setActiveCaptureSessionId(null);

        // Revert tray to idle appearance
        if (isTauriEnvironment() && trayService.isInitialized) {
          trayService.stopRecordingAppearance().catch(e =>
            console.error('[RecordingContext] Failed to stop tray recording appearance:', e)
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      updateSession(sessionId, { error: errorMessage });
      throw error;
    }
  }, [sessions, cleanupSessionTimer, cleanupSessionAudioUrl, updateSession]);

  // Pause recording
  const pauseRecordingSession = useCallback(async (sessionId: string) => {
    try {
      await coreAudioService.pauseCapture();
      cleanupSessionTimer(sessionId);

      const pauseStartTime = Date.now();
      const startTime = startTimeRefs.current.get(sessionId);
      const pausedTime = pausedTimeRefs.current.get(sessionId) || 0;

      if (startTime !== undefined) {
        const currentElapsed = Math.floor((pauseStartTime - startTime) / 1000) - pausedTime;
        updateSession(sessionId, {
          isPaused: true,
          elapsedTime: Math.max(0, currentElapsed),
        });
      } else {
        updateSession(sessionId, { isPaused: true });
      }

      // Freeze tray timer with pause indicator
      if (isTauriEnvironment() && trayService.isInitialized) {
        trayService.pauseRecordingAppearance().catch(e =>
          console.error('[RecordingContext] Failed to pause tray recording appearance:', e)
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to pause recording';
      updateSession(sessionId, { error: errorMessage });
      throw error;
    }
  }, [cleanupSessionTimer, updateSession]);

  // Resume recording
  const resumeRecordingSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    try {
      const resumeTime = Date.now();
      await coreAudioService.resumeCapture();

      const startTime = startTimeRefs.current.get(sessionId);
      if (startTime !== undefined) {
        const elapsedBeforePause = session.elapsedTime;
        const pauseDuration = Math.floor((resumeTime - startTime) / 1000) - elapsedBeforePause;
        const currentPaused = pausedTimeRefs.current.get(sessionId) || 0;
        pausedTimeRefs.current.set(sessionId, currentPaused + Math.max(0, pauseDuration));
      }

      updateSession(sessionId, { isPaused: false });

      // Restart timer
      cleanupSessionTimer(sessionId);
      const timer = setInterval(() => {
        const st = startTimeRefs.current.get(sessionId);
        const pt = pausedTimeRefs.current.get(sessionId) || 0;
        if (st !== undefined) {
          const elapsed = Math.floor((Date.now() - st) / 1000) - pt;
          updateSession(sessionId, { elapsedTime: Math.max(0, elapsed) });
        }
      }, 100);
      timerRefs.current.set(sessionId, timer);

      // Resume tray timer
      if (isTauriEnvironment() && trayService.isInitialized) {
        trayService.resumeRecordingAppearance().catch(e =>
          console.error('[RecordingContext] Failed to resume tray recording appearance:', e)
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to resume recording';
      updateSession(sessionId, { error: errorMessage });
      throw error;
    }
  }, [sessions, cleanupSessionTimer, updateSession]);

  // Discard recording
  const discardRecordingSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    try {
      if (isTauriEnvironment() && session.recordingFilename) {
        await recordingsService.deleteRecording(session.recordingFilename);
      }

      // If this was the active capture, clear it and revert tray
      if (activeCaptureSessionId === sessionId) {
        setActiveCaptureSessionId(null);

        if (isTauriEnvironment() && trayService.isInitialized) {
          trayService.stopRecordingAppearance().catch(e =>
            console.error('[RecordingContext] Failed to stop tray recording appearance on discard:', e)
          );
        }
      }

      cleanupSessionRefs(sessionId);
      removeSession(sessionId);

      showToast('Recording deleted', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to discard recording';
      updateSession(sessionId, { error: errorMessage });
      showToast(errorMessage, 'error');
      throw error;
    }
  }, [sessions, activeCaptureSessionId, cleanupSessionRefs, removeSession, updateSession, showToast]);

  // Save Later - creates history item with pendingTranscription, removes session from widget
  const saveLater = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session || !session.recordedBlob) return;

    try {
      const recordingId = session.recordingId;
      const recordingFileName = session.recordingFilename;

      if (isTauriEnvironment()) {
        // Register recording in storage
        await recordingsService.registerRecording(
          recordingFileName,
          {
            id: recordingId,
            duration: session.elapsedTime,
            size: session.recordedBlob.size,
            inputSource: session.audioSource,
          }
        );
      }

      // Create history item with pending transcription
      const addToHistory = historyContext?.addToHistory;
      if (addToHistory) {
        await addToHistory({
          id: recordingId,
          timestamp: Date.now(),
          title: `Recording ${new Date().toLocaleString()}`,
          transcript: '',
          summary: '',
          categories: [],
          recordingId,
          recordingFileName,
          inputSource: session.audioSource,
          pendingTranscription: true,
        });
      }

      // Cleanup and remove session
      cleanupSessionRefs(sessionId);
      removeSession(sessionId);

      showToast('Recording saved for later', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save recording';
      updateSession(sessionId, { error: errorMessage });
      showToast(errorMessage, 'error');
      throw error;
    }
  }, [sessions, historyContext, cleanupSessionRefs, removeSession, updateSession, showToast]);

  // Process recording (transcribe and summarize)
  const processRecordingSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session || !session.recordedBlob) {
      throw new Error('No recording to process');
    }

    try {
      const abortController = new AbortController();
      abortControllerRefs.current.set(sessionId, abortController);

      const settings = settingsContext?.settings || { transcriptionModel: '', chatModel: '' };
      const providers = settingsContext?.providers || [];
      const categories = historyContext?.categories || [];
      const addToHistory = historyContext?.addToHistory;
      const setResult = appContext?.setResult;
      const setSelectedHistoryId = appContext?.setSelectedHistoryId;
      const setStatus = appContext?.setStatus;

      const processingPromise = unifiedAIService.processAudio(
        session.recordedBlob,
        categories,
        settings,
        providers
      );

      const data = await Promise.race([
        processingPromise,
        new Promise((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('Processing aborted by user'));
          });
        })
      ]) as any;

      if (abortController.signal.aborted) {
        throw new Error('Processing aborted by user');
      }

      data.timestamp = Date.now();
      const recordingId = session.recordingId;
      const recordingFileName = session.recordingFilename;
      let transcriptionId: string | undefined;
      let summaryId: string | undefined;

      if (isTauriEnvironment()) {
        const recordingRegistration = await recordingsService.registerRecording(
          recordingFileName,
          {
            id: recordingId,
            duration: session.elapsedTime,
            size: session.recordedBlob.size,
            inputSource: session.audioSource,
          }
        );

        if (!recordingRegistration.success) {
          console.warn('[RecordingContext] Failed to register recording:', recordingRegistration.error);
        }

        const transcriptionResult = await transcriptionsService.saveTranscription(
          recordingId,
          data.transcript,
          { model: settings.transcriptionModel }
        );
        transcriptionId = transcriptionResult.data?.id;

        const summaryResult = await summariesService.saveSummary(
          recordingId,
          transcriptionId || recordingId,
          data.summary,
          data.categories,
          {
            model: settings.transcriptionModel,
            categories: data.categories,
          }
        );
        summaryId = summaryResult.data?.id;

        if (recordingRegistration.success) {
          await recordingsService.updateRecordingMetadata(recordingFileName, {
            transcriptionId,
            summaryId,
            inputSource: session.audioSource,
          });
        }
      }

      const newItem = {
        ...data,
        id: recordingId,
        timestamp: Date.now(),
        recordingId,
        recordingFileName,
        transcriptionId,
        summaryId,
        inputSource: session.audioSource,
      };

      if (addToHistory) await addToHistory(newItem);
      if (setResult) setResult(data);
      if (setSelectedHistoryId) setSelectedHistoryId(newItem.id);
      if (setStatus) setStatus('RESULTS' as any);
      showToast('Recording processed successfully', 'success');

      // Cleanup and remove session
      cleanupSessionRefs(sessionId);
      abortControllerRefs.current.delete(sessionId);
      removeSession(sessionId);

    } catch (error: any) {
      abortControllerRefs.current.delete(sessionId);

      if (error.message === 'Processing aborted by user') {
        updateSession(sessionId, { error: null });
        showToast('Processing cancelled', 'info');
        return;
      }

      const errorMessage = error.message || 'Failed to process recording';
      updateSession(sessionId, { error: errorMessage });
      showToast(errorMessage, 'error');
      throw error;
    }
  }, [
    sessions,
    settingsContext,
    historyContext,
    appContext,
    cleanupSessionRefs,
    removeSession,
    updateSession,
    showToast,
  ]);

  // Abort processing for a session
  const abortProcessingSession = useCallback((sessionId: string) => {
    const controller = abortControllerRefs.current.get(sessionId);
    if (controller) {
      controller.abort();
      abortControllerRefs.current.delete(sessionId);
    }
  }, []);

  // Set audio source
  const setAudioSource = useCallback((source: AudioCaptureSource) => {
    setAudioSourceState(source);
  }, []);

  // Computed
  const canStartNewCapture = isTauriEnvironment() && activeCaptureSessionId === null;

  const permissionMessage = audioSource === 'microphone'
    ? 'Microphone permission is required to start recording.'
    : audioSource === 'systemAndMicrophone'
      ? 'Screen Recording and Microphone permissions are required the first time you start capture.'
      : 'Screen Recording permission is required the first time you start capture.';

  // === LEGACY COMPAT: Derive single-session state from sessions Map ===
  // Find the "active" session for legacy consumers (active capture or most recent review)
  const activeSession = activeCaptureSessionId
    ? sessions.get(activeCaptureSessionId)
    : Array.from(sessions.values())
        .filter(s => s.status === 'review')
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null;

  const legacyState: RecordingState = activeSession ? {
    status: activeSession.status === 'recording' ? 'recording'
      : activeSession.status === 'paused' ? 'paused'
      : activeSession.status === 'review' ? 'review'
      : activeSession.status === 'processing' ? 'processing'
      : 'idle',
    elapsedTime: activeSession.elapsedTime,
    isPaused: activeSession.isPaused,
    audioSource: activeSession.audioSource,
    recordingId: activeSession.recordingId,
    recordingFilename: activeSession.recordingFilename,
    recordedFilePath: activeSession.recordedFilePath,
    recordedBlob: activeSession.recordedBlob,
    audioUrl: activeSession.audioUrl,
    error: activeSession.error,
  } : initialState;

  // Legacy actions that delegate to session-based actions
  const legacyStartRecording = useCallback(async () => {
    await startRecordingSession();
  }, [startRecordingSession]);

  const legacyStopRecording = useCallback(async () => {
    if (activeCaptureSessionId) {
      await stopRecordingSession(activeCaptureSessionId);
    }
  }, [activeCaptureSessionId, stopRecordingSession]);

  const legacyPauseRecording = useCallback(async () => {
    if (activeCaptureSessionId) {
      await pauseRecordingSession(activeCaptureSessionId);
    }
  }, [activeCaptureSessionId, pauseRecordingSession]);

  const legacyResumeRecording = useCallback(async () => {
    if (activeCaptureSessionId) {
      await resumeRecordingSession(activeCaptureSessionId);
    }
  }, [activeCaptureSessionId, resumeRecordingSession]);

  const legacyDiscardRecording = useCallback(async () => {
    if (activeSession) {
      await discardRecordingSession(activeSession.sessionId);
    }
  }, [activeSession, discardRecordingSession]);

  const legacyProcessRecording = useCallback(async () => {
    if (activeSession) {
      await processRecordingSession(activeSession.sessionId);
    }
  }, [activeSession, processRecordingSession]);

  const legacyAbortProcessing = useCallback(() => {
    if (activeSession) {
      abortProcessingSession(activeSession.sessionId);
    }
  }, [activeSession, abortProcessingSession]);

  const legacyResetRecording = useCallback(() => {
    if (activeSession) {
      cleanupSessionRefs(activeSession.sessionId);
      removeSession(activeSession.sessionId);
      if (activeCaptureSessionId === activeSession.sessionId) {
        setActiveCaptureSessionId(null);
      }
    }
  }, [activeSession, activeCaptureSessionId, cleanupSessionRefs, removeSession]);

  const legacyValue: RecordingContextValue = {
    ...legacyState,
    startRecording: legacyStartRecording,
    stopRecording: legacyStopRecording,
    pauseRecording: legacyPauseRecording,
    resumeRecording: legacyResumeRecording,
    discardRecording: legacyDiscardRecording,
    processRecording: legacyProcessRecording,
    abortProcessing: legacyAbortProcessing,
    setAudioSource,
    resetRecording: legacyResetRecording,
    isRecording: legacyState.status === 'recording',
    canRecord: canStartNewCapture,
    permissionMessage,
  };

  // Session-based context value
  const sessionsValue: RecordingSessionsContextValue = {
    sessions,
    activeCaptureSessionId,
    canStartNewCapture,
    audioSource,
    permissionMessage,
    startRecording: startRecordingSession,
    stopRecording: stopRecordingSession,
    pauseRecording: pauseRecordingSession,
    resumeRecording: resumeRecordingSession,
    discardRecording: discardRecordingSession,
    processRecording: processRecordingSession,
    saveLater,
    abortProcessing: abortProcessingSession,
    setAudioSource,
  };

  return (
    <RecordingContext.Provider value={legacyValue}>
      <RecordingSessionsContext.Provider value={sessionsValue}>
        {children}
      </RecordingSessionsContext.Provider>
    </RecordingContext.Provider>
  );
};

export default RecordingContext;
