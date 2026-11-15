/** Session-based recording; one session owns OS capture at a time, many can be in review or processing. */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '@shared/contexts/ToastContext';
import type { AppSettings, HistoryItem, ProcessedResult } from '@shared/types';
import { AppStatus } from '@shared/types';
import type { ModelProvider } from '@shared/types/modelProviders';
import { defaultSettings } from '@shared/contexts/SettingsContext';
import type { AudioCaptureSource } from '@config/audio.config';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment, menubarService } from '@services/tauri';
import { onNotificationResponse, postNotice, removeNotices } from '@services/notifications';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { NOTIFICATIONS_CONFIG } from '@config/notifications.config';
import { coreAudioService, isPermissionRefusal, captureErrorMessage } from '@services/coreAudio.service';
import { useAppStore } from '@shared/stores/appStore';
import { recordingsService } from '@services/storage';
import { transcriptionService } from '@services/transcription.service';
import { StorageConfig, generateRecordingFilename, getRecordingIdFromFilename } from '@config/storage.config';
import { unifiedAIService } from '@services/unifiedAIService';
import { activityStore } from '@shared/stores/activityStore';
import type { ActivityAction } from '@shared/stores/activityStore';
import { resolveChatModel } from '@shared/utils/modelResolver';
import { consumePendingCalendarMeta } from '@services/calendar/recording-bridge';
import { RECORDING_EVENTS } from '@config/audio.config';
import { useRecordingRecovery } from '@features/recording/hooks/useRecordingRecovery';
import type {
  HistoryEntry,
  RecordingContextValue,
  RecordingState,
  RecordingSession,
  RecordingSessionsContextValue,
} from '@features/recording/types';
import { errorMessage } from '@shared/utils/errors';

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
  settingsContext?: { settings: AppSettings; providers: ModelProvider[] };
  historyContext?: {
    addToHistory: (item: HistoryItem) => Promise<void>;
    categories: string[];
  };
  appContext?: {
    setResult: (result: ProcessedResult | null) => void;
    setSelectedHistoryId: (id: string | null) => void;
    setStatus: (status: AppStatus) => void;
  };
}

export const RecordingProvider: React.FC<RecordingProviderProps> = ({
  children,
  settingsContext,
  historyContext,
  appContext,
}) => {
  const { showToast } = useToast();
  const setPermissionChecklistOpen = useAppStore((s) => s.setPermissionChecklistOpen);

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
  const lastLevelTimestampRef = useRef<number>(0);

  // Per-session elapsed seconds at the last "Still recording?" ask, and at the ask awaiting an answer.
  const lastAlertElapsedRefs = useRef<Map<string, number>>(new Map());
  const pendingAskRefs = useRef<Map<string, number>>(new Map());
  // Stable ref to stopAndSaveSession so mount-only effects can call it without stale closures
  const stopAndSaveRef = useRef<(sessionId: string) => Promise<void>>(async () => {});

  /** Per tick: ask "Still recording?" hourly, and stop (saving) when an ask goes unanswered. */
  const checkRecordingTimeout = useCallback((sessionId: string, elapsed: number) => {
    const ask = NOTIFICATIONS_CONFIG.recording;
    const id = `${ask.idPrefix}${sessionId}`;
    const askedAt = pendingAskRefs.current.get(sessionId);
    if (askedAt !== undefined) {
      if (elapsed < askedAt + ask.autoStopAfterSeconds) return;
      pendingAskRefs.current.delete(sessionId);
      void postNotice({ id, title: 'Recording stopped', body: `No answer after ${Math.floor(elapsed / 60)} minutes, so Kasset stopped and saved it.` });
      void stopAndSaveRef.current(sessionId);
      return;
    }
    if (elapsed < (lastAlertElapsedRefs.current.get(sessionId) ?? 0) + ask.askEverySeconds) return;
    lastAlertElapsedRefs.current.set(sessionId, elapsed);
    pendingAskRefs.current.set(sessionId, elapsed);
    void postNotice({
      id,
      title: 'Are you still recording?',
      body: `Recording for ${Math.floor(elapsed / 60)} minutes. It stops in ${ask.autoStopAfterSeconds / 60} minutes unless you keep it going.`,
      category: ask.category,
      userInfo: { sessionId },
    });
  }, []);

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
    // Withdraw a "Still recording?" left on screen
    void removeNotices([`${NOTIFICATIONS_CONFIG.recording.idPrefix}${sessionId}`]);
    lastAlertElapsedRefs.current.delete(sessionId);
    pendingAskRefs.current.delete(sessionId);
  }, [cleanupSessionTimer, cleanupSessionAudioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timer) => clearInterval(timer));
      audioUrlRefs.current.forEach((url) => URL.revokeObjectURL(url));

      // Revert menubar to idle on unmount (safety net)
      void menubarService.setRecordingState(false, false).catch((error: unknown) =>
        console.error('[RecordingContext] Failed to reset menubar state:', error)
      );
    };
  }, []);

  // Track audio level events to detect stalled capture
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    listen(RECORDING_EVENTS.level, () => {
      lastLevelTimestampRef.current = Date.now();
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((error: unknown) =>
        console.error('[RecordingContext] Failed to subscribe to level events:', error)
      );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Menubar state is pushed via menubarService.setRecordingState; the backend owns icon, menu, and clock.

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
      // Taken with this start, so a refused start never hands it to a later recording.
      const calendarMeta = consumePendingCalendarMeta();

      // Capture first: a refused start must not leave a session behind.
      await coreAudioService.startCapture({
        source,
        fileName: filename,
        recordingsDir: StorageConfig.directories.recordings,
      });

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
        stalled: false,
        calendarMeta,
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

      // Start timer
      const timer = setInterval(() => {
        const startTime = startTimeRefs.current.get(sessionId);
        const pausedTime = pausedTimeRefs.current.get(sessionId) || 0;
        if (startTime !== undefined) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000) - pausedTime;
          const updates: Partial<RecordingSession> = { elapsedTime: Math.max(0, elapsed) };

          // Stalled: no levels for 5s, or none ever received 5s after session start.
          const lastLevel = lastLevelTimestampRef.current;
          const timeSinceLevel = lastLevel > 0
            ? Date.now() - lastLevel
            : (startTime > 0 ? Date.now() - startTime : 0);
          if (timeSinceLevel > 5000) {
            updates.stalled = true;
          } else {
            updates.stalled = false;
          }

          updateSession(sessionId, updates);

          checkRecordingTimeout(sessionId, elapsed);
        }
      }, 1000);
      timerRefs.current.set(sessionId, timer);

      // Report recording start; backend swaps the icon and starts its clock
      void menubarService.setRecordingState(true, false).catch((error: unknown) =>
        console.error('[RecordingContext] Menubar sync failed:', error)
      );

      return sessionId;
    } catch (error) {
      if (isPermissionRefusal(error)) {
        setPermissionChecklistOpen(true);
      } else {
        showToast(captureErrorMessage(error, 'Failed to start recording'), 'error');
      }
      throw error;
    }
  }, [activeCaptureSessionId, audioSource, settingsContext, updateSession, showToast, setPermissionChecklistOpen]);

  // A second stop request (e.g. Quit during a Stop) shares the running stop's result.
  const stopInFlightRef = useRef<ReturnType<typeof coreAudioService.stopCapture> | null>(null);
  const stopCaptureOnce = useCallback(() => {
    stopInFlightRef.current ??= coreAudioService.stopCapture().finally(() => {
      stopInFlightRef.current = null;
    });
    return stopInFlightRef.current;
  }, []);

  // Stop recording
  const stopRecordingSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    try {
      const result = await stopCaptureOnce();
      cleanupSessionTimer(sessionId);

      if (result) {
        const startTime = startTimeRefs.current.get(sessionId);
        const pausedTime = pausedTimeRefs.current.get(sessionId) || 0;
        const finalElapsedTime = startTime !== undefined
          ? Math.floor((Date.now() - startTime) / 1000) - pausedTime
          : session.elapsedTime;

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
          stalled: false,
        });
      } else {
        // Already stopped is benign; no error, since the review row shows any error as a stall badge.
        updateSession(sessionId, { status: 'review', isPaused: false, stalled: false });
      }

      setActiveCaptureSessionId(null);
      void menubarService.setRecordingState(false, false).catch((error: unknown) =>
        console.error('[RecordingContext] Menubar sync failed:', error)
      );
    } catch (error) {
      // The backend released capture anyway; its tracks are recovered at the next launch.
      cleanupSessionTimer(sessionId);
      setActiveCaptureSessionId(null);
      void menubarService.setRecordingState(false, false).catch((error: unknown) =>
        console.error('[RecordingContext] Menubar sync failed:', error)
      );
      updateSession(sessionId, { status: 'review', isPaused: false, error: captureErrorMessage(error, 'Failed to stop recording') });
      throw error;
    }
  }, [sessions, stopCaptureOnce, cleanupSessionTimer, cleanupSessionAudioUrl, updateSession, showToast]);

  // Register a finished recording and add it to history as pending transcription.
  const saveToHistory = useCallback(async (entry: HistoryEntry) => {
    if (isTauriEnvironment()) {
      await recordingsService.registerRecording(entry.filename, {
        id: entry.recordingId,
        duration: entry.duration,
        size: entry.size,
        inputSource: entry.source,
      });
    }
    const addToHistory = historyContext?.addToHistory;
    if (!addToHistory) return;
    const calendarMeta = entry.calendarMeta;
    await addToHistory({
      id: entry.recordingId,
      timestamp: entry.recordedAt,
      title: calendarMeta?.scheduledTitle || `Recording ${new Date(entry.recordedAt).toLocaleString()}`,
      transcript: '',
      summary: '',
      categories: [],
      recordingId: entry.recordingId,
      recordingFileName: entry.filename,
      inputSource: entry.source,
      pendingTranscription: true,
      ...calendarMeta && {
        calendarEventId: calendarMeta.calendarEventId,
        scheduledTitle: calendarMeta.scheduledTitle,
        participants: calendarMeta.participants,
        scheduledStart: calendarMeta.scheduledStart,
        scheduledEnd: calendarMeta.scheduledEnd,
        meetingUrl: calendarMeta.meetingUrl,
      },
    });
  }, [historyContext]);

  useRecordingRecovery(Boolean(historyContext?.addToHistory), saveToHistory, showToast);

  // Stop and save in one step (stall and auto-stop), avoiding a stale closure across chained calls.
  const stopAndSaveSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    // Immediate visual feedback — activity tray switches to "Stopping..." with no buttons
    updateSession(sessionId, { stopping: true });

    let blob: Blob | null = null;
    let stopFailed = false;

    try {
      const result = await stopCaptureOnce();
      cleanupSessionTimer(sessionId);

      if (result) {
        blob = result.blob;
        cleanupSessionAudioUrl(sessionId);
      }
    } catch (error) {
      stopFailed = true;
      console.error('[RecordingContext] stopAndSaveSession stopCapture error:', error);
    } finally {
      setActiveCaptureSessionId(null);
      void menubarService.setRecordingState(false, false).catch((error: unknown) =>
        console.error('[RecordingContext] Menubar sync failed:', error)
      );
    }

    // Save to history sidebar with blob in hand (no stale React state read)
    if (blob) {
      try {
        await saveToHistory({
          recordingId: session.recordingId,
          filename: session.recordingFilename,
          duration: session.elapsedTime,
          size: blob.size,
          source: session.audioSource,
          recordedAt: session.createdAt,
          calendarMeta: session.calendarMeta,
        });
      } catch (saveError) {
        console.error('[RecordingContext] stopAndSaveSession save error:', saveError);
        showToast('Recording stopped but could not be saved', 'warning');
      }
    } else {
      showToast(
        stopFailed
          ? 'Recording could not be finished — it will be recovered on next launch'
          : 'Recording stopped — no audio data captured',
        'warning',
      );
    }

    cleanupSessionRefs(sessionId);
    removeSession(sessionId);
  }, [sessions, stopCaptureOnce, cleanupSessionTimer, cleanupSessionAudioUrl, cleanupSessionRefs,
      removeSession, updateSession, showToast, saveToHistory]);

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

      // Freeze the backend clock with pause indicator
      void menubarService.setRecordingState(true, true).catch((error: unknown) =>
        console.error('[RecordingContext] Menubar sync failed:', error)
      );
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
          const updates: Partial<RecordingSession> = { elapsedTime: Math.max(0, elapsed) };

          // Stall detection: if no audio levels for 5 seconds while actively recording
          const lastLevel = lastLevelTimestampRef.current;
          const timeSinceLevel = lastLevel > 0 ? Date.now() - lastLevel : 0;
          if (timeSinceLevel > 5000 && lastLevel > 0) {
            updates.stalled = true;
          } else if (timeSinceLevel <= 5000 && lastLevel > 0) {
            updates.stalled = false;
          }

          updateSession(sessionId, updates);

          checkRecordingTimeout(sessionId, elapsed);
        }
      }, 1000);
      timerRefs.current.set(sessionId, timer);

      // Resume the backend clock
      void menubarService.setRecordingState(true, false).catch((error: unknown) =>
        console.error('[RecordingContext] Menubar sync failed:', error)
      );
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

        void menubarService.setRecordingState(false, false).catch((error: unknown) =>
        console.error('[RecordingContext] Menubar sync failed:', error)
      );
      }

      cleanupSessionRefs(sessionId);
      removeSession(sessionId);
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
      await saveToHistory({
        recordingId: session.recordingId,
        filename: session.recordingFilename,
        duration: session.elapsedTime,
        size: session.recordedBlob.size,
        source: session.audioSource,
        recordedAt: session.createdAt,
        calendarMeta: session.calendarMeta,
      });

      // Cleanup and remove session
      cleanupSessionRefs(sessionId);
      removeSession(sessionId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save recording';
      updateSession(sessionId, { error: errorMessage });
      showToast(errorMessage, 'error');
      throw error;
    }
  }, [sessions, saveToHistory, cleanupSessionRefs, removeSession, updateSession, showToast]);

  // Process recording (transcribe and summarize)
  const processRecordingSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session || !session.recordedBlob) {
      throw new Error('No recording to process');
    }

    try {
      const abortController = new AbortController();
      abortControllerRefs.current.set(sessionId, abortController);

      // Immediately surface processing state so the tray switches to the processing row
      updateSession(sessionId, { status: 'processing', error: null, processingStep: null });

      // Read calendar metadata from session (stored at recording start)
      const calendarMeta = session.calendarMeta;

      const settings = settingsContext?.settings ?? defaultSettings;
      const providers = settingsContext?.providers || [];
      const categories = historyContext?.categories || [];
      const setResult = appContext?.setResult;
      const setSelectedHistoryId = appContext?.setSelectedHistoryId;
      const setStatus = appContext?.setStatus;

      // Build meeting context from calendar metadata for LLM speaker attribution
      const meetingContext = calendarMeta?.scheduledStart && calendarMeta?.participants?.length
        ? {
            title: calendarMeta.scheduledTitle || 'Untitled Meeting',
            participants: calendarMeta.participants.map((p: { name?: string; email?: string }) => ({
              name: p.name,
              email: p.email,
            })),
            scheduledStart: calendarMeta.scheduledStart,
          }
        : undefined;

      const processingPromise = unifiedAIService.processAudio(
        session.recordedBlob,
        categories,
        settings,
        providers,
        {
          meetingContext,
          meetingId: session.recordingId,
          signal: abortController.signal,
          onProgress: (processingStep) => updateSession(sessionId, { processingStep }),
        },
      );

      const data = await Promise.race([
        processingPromise,
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('Processing aborted by user'));
          });
        })
      ]);

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

        // Build MeetingSummary from structured result
        const meetingSummary = {
          overview: data.structuredSummary?.overview || data.summary,
          keyDiscussionPoints: data.structuredSummary?.keyDiscussionPoints || [],
          decisionsMade: data.structuredSummary?.decisionsMade || [],
          actionItems: (data.structuredSummary?.actionItems || []).map((a) => ({
            text: a.text,
            owner: a.owner,
            dueDate: a.dueDate,
          })),
          nextSteps: data.structuredSummary?.nextSteps || [],
        };

        // Save via new transcription service (single call)
        await transcriptionService.saveTranscriptionResult({
          meetingId: recordingId,
          title: data.title,
          transcript: data.transcript,
          summary: meetingSummary,
          categories: data.categories,
          recordingFileName,
          inputSource: session.audioSource,
          model: settings.transcriptionModel,
          segments: data.segments,
          ...calendarMeta && {
            calendarMeta: {
              calendarEventId: calendarMeta.calendarEventId,
              scheduledTitle: calendarMeta.scheduledTitle,
              participants: calendarMeta.participants,
              scheduledStart: calendarMeta.scheduledStart,
              scheduledEnd: calendarMeta.scheduledEnd,
              meetingUrl: calendarMeta.meetingUrl,
            },
          },
        });

        if (recordingRegistration.success) {
          await recordingsService.updateRecordingMetadata(recordingFileName, {
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

      // saveTranscriptionResult() already adds the index entry; calling addToHistory would duplicate it.
      if (setResult) setResult(data);
      if (setSelectedHistoryId) setSelectedHistoryId(newItem.id);
      if (setStatus) setStatus(AppStatus.RESULTS);
      notifyAppEvent({ id: `recording-ready:${recordingId}`, kind: 'recordingReady', tone: 'success', inFront: 'quiet', title: data.title, body: 'Transcript and summary are ready.' });

      // Cleanup and remove session
      cleanupSessionRefs(sessionId);
      abortControllerRefs.current.delete(sessionId);
      removeSession(sessionId);

    } catch (error: unknown) {
      abortControllerRefs.current.delete(sessionId);
      const message = errorMessage(error);

      if (message === 'Processing aborted by user') {
        updateSession(sessionId, { status: 'review', error: null });
        return;
      }

      const failure = message || 'Failed to process recording';
      updateSession(sessionId, { status: 'review', error: failure });
      notifyAppEvent({ id: `recording-ready:${sessionId}`, kind: 'recordingReady', tone: 'error', inFront: 'toast', title: 'Recording not processed', body: failure });
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

  // === ActivityTray bridge: mirror recording sessions into activityStore ===
  const formatTimeForTray = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Keep action refs current so activity item callbacks use latest state
  const actionsRef = useRef({
    pause: pauseRecordingSession,
    resume: resumeRecordingSession,
    stop: stopRecordingSession,
    stopAndSave: stopAndSaveSession,
    discard: discardRecordingSession,
    process: processRecordingSession,
    abort: abortProcessingSession,
    saveLater,
  });
  actionsRef.current = {
    pause: pauseRecordingSession,
    resume: resumeRecordingSession,
    stop: stopRecordingSession,
    stopAndSave: stopAndSaveSession,
    discard: discardRecordingSession,
    process: processRecordingSession,
    abort: abortProcessingSession,
    saveLater,
  };

  // Keep stopAndSaveRef current for mount-only effects (notification action handler)
  stopAndSaveRef.current = stopAndSaveSession;

  useEffect(() => {
    // Track which IDs we've pushed to the store so we can clean up removed sessions
    const trackedIds = new Set<string>();

    // Iterate over current sessions and sync to activityStore
    sessions.forEach((session) => {
      const id = session.sessionId;
      trackedIds.add(id);

      if (session.status === 'recording' || session.status === 'paused') {
        // Bug 2a fix: show "Stopping..." immediately while stopCapture() is in-flight
        if (session.stopping) {
          const patch = {
            type: 'recording' as const,
            label: 'Stopping...',
            status: 'active' as const,
            percent: null,
            step: null,
            detail: formatTimeForTray(session.elapsedTime),
            error: null,
            actions: [] as ActivityAction[],
          };
          if (activityStore.get(id)) {
            activityStore.update(id, patch);
          } else {
            activityStore.add({ id, ...patch });
          }
          return;
        }

        const actions: ActivityAction[] = [];
        if (session.isPaused) {
          actions.push({
            icon: 'play',
            label: 'Resume',
            onClick: () => actionsRef.current.resume(id),
          });
        } else {
          actions.push({
            icon: 'pause',
            label: 'Pause',
            onClick: () => actionsRef.current.pause(id),
          });
        }
        // Bug 2c fix: stalled Stop uses stopAndSave to auto-save to sidebar
        actions.push({
          icon: 'square',
          label: 'Stop',
          onClick: () => session.stalled
            ? actionsRef.current.stopAndSave(id)
            : actionsRef.current.stop(id),
        });

        const patch = {
          type: 'recording' as const,
          label: session.isPaused ? 'Paused' : 'Recording',
          status: 'active' as const,
          percent: null,
          step: null,
          detail: formatTimeForTray(session.elapsedTime),
          error: session.stalled ? 'Audio capture may have stopped' : null,
          actions,
        };

        if (activityStore.get(id)) {
          activityStore.update(id, patch);
        } else {
          activityStore.add({ id, ...patch });
        }
      } else if (session.status === 'processing') {
        const patch = {
          type: 'processing' as const,
          label: session.processingStep ? 'Transcribing...' : 'Processing recording...',
          status: 'active' as const,
          percent: null,
          step: session.processingStep ?? null,
          detail: formatTimeForTray(session.elapsedTime),
          error: null,
          actions: [
            {
              icon: 'x',
              label: 'Cancel',
              onClick: () => actionsRef.current.abort(id),
            },
          ],
        };

        if (activityStore.get(id)) {
          activityStore.update(id, patch);
        } else {
          activityStore.add({ id, ...patch });
        }
      } else if (session.status === 'review') {
        // Offer Summarize only when a model is configured, otherwise it has nowhere to route.
        const hasModel = !!settingsContext?.settings && !!resolveChatModel(
          settingsContext.settings,
          settingsContext?.providers || []
        );
        const actions: ActivityAction[] = [];
        if (hasModel) {
          actions.push({
            icon: 'sparkles',
            label: 'Summarize',
            onClick: () => actionsRef.current.process(id),
          });
        }
        actions.push(
          {
            icon: 'timer',
            label: 'Save for later',
            onClick: () => actionsRef.current.saveLater(id),
          },
          {
            icon: 'trash-2',
            label: 'Discard',
            onClick: () => actionsRef.current.discard(id),
          }
        );

        const patch = {
          type: 'recording' as const,
          label: 'Review recording',
          status: 'active' as const,
          percent: null,
          step: null,
          detail: formatTimeForTray(session.elapsedTime),
          error: session.error,
          actions,
        };

        if (activityStore.get(id)) {
          activityStore.update(id, patch);
        } else {
          activityStore.add({ id, ...patch });
        }
      }
    });

    // Drop tray items for gone sessions; only recording/processing items with UUID ids (not e.g. 'rag-model').
    const storeItems = activityStore.getSnapshot();
    for (const item of storeItems) {
      if (
        !trackedIds.has(item.id) &&
        (item.type === 'recording' || item.type === 'processing') &&
        /^[0-9a-f]{8}-/.test(item.id)
      ) {
        activityStore.remove(item.id);
      }
    }
  }, [sessions, activeCaptureSessionId, formatTimeForTray, settingsContext]);

  // Hold a wake lock to prevent idle sleep while OS audio capture is active.
  useEffect(() => {
    if (!isTauriEnvironment() || !activeCaptureSessionId) return;
    invoke('acquire_wake_lock').catch((e: unknown) => {
      console.warn('[RecordingContext] Wake lock acquire failed:', e);
    });
    return () => {
      invoke('release_wake_lock').catch((e: unknown) => {
        console.warn('[RecordingContext] Wake lock release failed:', e);
      });
    };
  }, [activeCaptureSessionId]);

  // "Still recording?" answers (Keep recording / Stop now). Mount-only; refs only.
  useEffect(() => {
    const ask = NOTIFICATIONS_CONFIG.recording;
    return onNotificationResponse(({ id, action, userInfo }) => {
      const sessionId = userInfo.sessionId;
      if (!id.startsWith(ask.idPrefix) || !sessionId) return;
      if (action === ask.actions.keep) pendingAskRefs.current.delete(sessionId);
      if (action === ask.actions.stop) {
        pendingAskRefs.current.delete(sessionId);
        void stopAndSaveRef.current(sessionId);
      }
    });
  }, []); // mount only

  // Single-session view for older consumers: the active capture, else the most recent review.
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
  };

  // Session-based context value
  const sessionsValue: RecordingSessionsContextValue = {
    sessions,
    activeCaptureSessionId,
    canStartNewCapture,
    audioSource,
    startRecording: startRecordingSession,
    stopRecording: stopRecordingSession,
    pauseRecording: pauseRecordingSession,
    resumeRecording: resumeRecordingSession,
    discardRecording: discardRecordingSession,
    processRecording: processRecordingSession,
    saveLater,
    stopAndSaveRecording: stopAndSaveSession,
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
