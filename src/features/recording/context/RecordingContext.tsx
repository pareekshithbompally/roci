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
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment, trayService, notificationService } from '../../../../services/tauri';
import { coreAudioService } from '../../../../services/coreAudio.service';
import { recordingsService } from '../../../../services/storage';
import { transcriptionService } from '../../../../services/transcription.service';
import { StorageConfig, generateRecordingFilename, getRecordingIdFromFilename } from '../../../../src/config/storage.config';
import { unifiedAIService } from '../../../../services/unifiedAIService';
import { activityStore } from '../../../shared/stores/activityStore';
import type { ActivityAction } from '../../../shared/stores/activityStore';
import { resolveModel } from '@shared/utils/modelResolver';
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
  const lastLevelTimestampRef = useRef<number>(0);

  // 60-min timeout alert refs (per-session, no React state needed)
  const lastAlertElapsedRefs = useRef<Map<string, number>>(new Map());
  const pendingAlertRefs = useRef<Map<string, boolean>>(new Map());
  const timeoutAutoStopRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const alertedSessionRef = useRef<string | null>(null);
  // Stable ref to stopAndSaveSession so mount-only effects can call it without stale closures
  const stopAndSaveRef = useRef<(sessionId: string) => Promise<void>>(async () => {});

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
    // Clear 60-min timeout alert state for this session
    const autoStop = timeoutAutoStopRefs.current.get(sessionId);
    if (autoStop !== undefined) { clearTimeout(autoStop); timeoutAutoStopRefs.current.delete(sessionId); }
    lastAlertElapsedRefs.current.delete(sessionId);
    pendingAlertRefs.current.delete(sessionId);
    if (alertedSessionRef.current === sessionId) alertedSessionRef.current = null;
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

  // Track audio level events to detect stalled capture
  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: UnlistenFn | null = null;

    listen('coreaudio-level', () => {
      lastLevelTimestampRef.current = Date.now();
    }).then(fn => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
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
        stalled: false,
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

          // 60-min timeout alert: fire when elapsed crosses each 60-min boundary
          const lastAlertElapsed = lastAlertElapsedRefs.current.get(sessionId) ?? 0;
          const alertPending = pendingAlertRefs.current.get(sessionId) ?? false;
          if (elapsed >= lastAlertElapsed + 3600 && !alertPending) {
            pendingAlertRefs.current.set(sessionId, true);
            lastAlertElapsedRefs.current.set(sessionId, elapsed);
            alertedSessionRef.current = sessionId;

            const minutesElapsed = Math.floor(elapsed / 60);
            notificationService.notifyWithActions({
              title: 'Are you still recording?',
              body: `Recording has been active for ${minutesElapsed} minutes. It will stop automatically in 5 minutes.`,
              actionTypeId: 'recording_timeout',
            });

            const autoStop = setTimeout(() => {
              alertedSessionRef.current = null;
              pendingAlertRefs.current.delete(sessionId);
              stopAndSaveRef.current(sessionId);
            }, 5 * 60 * 1000);
            timeoutAutoStopRefs.current.set(sessionId, autoStop);
          }
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
        // Normal path: Rust returned the file
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
        // Timeout or no active capture — attempt WAV recovery
        console.warn('[RecordingContext] stopCapture returned null, attempting WAV recovery');
        try {
          const { appDataDir } = await import('@tauri-apps/api/path');
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const dir = await appDataDir();
          const recoveryPath = `${dir}${StorageConfig.directories.recordings}/${session.recordingFilename}`;
          const data = await readFile(recoveryPath);
          const blob = new Blob([data], { type: 'audio/wav' });

          cleanupSessionAudioUrl(sessionId);
          const url = URL.createObjectURL(blob);
          audioUrlRefs.current.set(sessionId, url);

          updateSession(sessionId, {
            status: 'review',
            isPaused: false,
            recordedBlob: blob,
            recordedFilePath: recoveryPath,
            audioUrl: url,
            stalled: false,
          });

          showToast('Recording recovered — audio may be incomplete', 'warning');
        } catch (recoveryError) {
          console.error('[RecordingContext] WAV recovery failed:', recoveryError);
          // Set status to 'review' so the session leaves 'recording' state and
          // doesn't get stuck in an infinite retry loop when Stop is clicked again.
          updateSession(sessionId, {
            status: 'review',
            error: 'Recording stopped but audio file could not be recovered. The file may be at: recordings/' + session.recordingFilename,
          });
        }
      }

      setActiveCaptureSessionId(null);

      if (isTauriEnvironment() && trayService.isInitialized) {
        trayService.stopRecordingAppearance().catch(e =>
          console.error('[RecordingContext] Failed to stop tray recording appearance:', e)
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
      updateSession(sessionId, { error: errorMessage });
      throw error;
    }
  }, [sessions, cleanupSessionTimer, cleanupSessionAudioUrl, updateSession, showToast]);

  // Stop + immediately save to history sidebar.
  // Used by stall stop and 60-min auto-stop — avoids two-step stop→saveLater flow
  // and the stale-closure problem of chaining those calls.
  const stopAndSaveSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) return;

    // Immediate visual feedback — activity tray switches to "Stopping..." with no buttons
    updateSession(sessionId, { stopping: true });

    let blob: Blob | null = null;

    try {
      const result = await coreAudioService.stopCapture();
      cleanupSessionTimer(sessionId);

      if (result) {
        blob = result.blob;
        cleanupSessionAudioUrl(sessionId);
      } else {
        // WAV recovery — same path as stopRecordingSession
        try {
          const { appDataDir } = await import('@tauri-apps/api/path');
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const dir = await appDataDir();
          const recoveryPath = `${dir}${StorageConfig.directories.recordings}/${session.recordingFilename}`;
          const data = await readFile(recoveryPath);
          blob = new Blob([data], { type: 'audio/wav' });
        } catch {
          // No audio file — will show warning toast below
        }
      }
    } catch (error) {
      console.error('[RecordingContext] stopAndSaveSession stopCapture error:', error);
    } finally {
      setActiveCaptureSessionId(null);
      if (isTauriEnvironment() && trayService.isInitialized) {
        trayService.stopRecordingAppearance().catch(() => {});
      }
    }

    // Save to history sidebar with blob in hand (no stale React state read)
    if (blob) {
      try {
        if (isTauriEnvironment()) {
          await recordingsService.registerRecording(
            session.recordingFilename,
            {
              id: session.recordingId,
              duration: session.elapsedTime,
              size: blob.size,
              inputSource: session.audioSource,
            }
          );
        }
        const addToHistory = historyContext?.addToHistory;
        if (addToHistory) {
          await addToHistory({
            id: session.recordingId,
            timestamp: Date.now(),
            title: `Recording ${new Date().toLocaleString()}`,
            transcript: '',
            summary: '',
            categories: [],
            recordingId: session.recordingId,
            recordingFileName: session.recordingFilename,
            inputSource: session.audioSource,
            pendingTranscription: true,
          });
        }
        showToast('Recording saved', 'success');
      } catch (saveError) {
        console.error('[RecordingContext] stopAndSaveSession save error:', saveError);
        showToast('Recording stopped but could not be saved', 'warning');
      }
    } else {
      showToast('Recording stopped — no audio data captured', 'warning');
    }

    cleanupSessionRefs(sessionId);
    removeSession(sessionId);
  }, [sessions, cleanupSessionTimer, cleanupSessionAudioUrl, cleanupSessionRefs,
      removeSession, updateSession, showToast, historyContext]);

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

          // 60-min timeout alert: fire when elapsed crosses each 60-min boundary
          const lastAlertElapsed = lastAlertElapsedRefs.current.get(sessionId) ?? 0;
          const alertPending = pendingAlertRefs.current.get(sessionId) ?? false;
          if (elapsed >= lastAlertElapsed + 3600 && !alertPending) {
            pendingAlertRefs.current.set(sessionId, true);
            lastAlertElapsedRefs.current.set(sessionId, elapsed);
            alertedSessionRef.current = sessionId;

            const minutesElapsed = Math.floor(elapsed / 60);
            notificationService.notifyWithActions({
              title: 'Are you still recording?',
              body: `Recording has been active for ${minutesElapsed} minutes. It will stop automatically in 5 minutes.`,
              actionTypeId: 'recording_timeout',
            });

            const autoStop = setTimeout(() => {
              alertedSessionRef.current = null;
              pendingAlertRefs.current.delete(sessionId);
              stopAndSaveRef.current(sessionId);
            }, 5 * 60 * 1000);
            timeoutAutoStopRefs.current.set(sessionId, autoStop);
          }
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

      // Immediately surface processing state so the tray switches to the processing row
      updateSession(sessionId, { status: 'processing', error: null });

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

      const { result: data } = await Promise.race([
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
          actionItems: (data.structuredSummary?.actionItems || []).map((a: any) => ({
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
          extractionContext: { settings, providers },
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

      // Note: transcriptionService.saveTranscriptionResult() already adds to the meeting index.
      // Do NOT call addToHistory here — it would create a duplicate index entry.
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
        updateSession(sessionId, { status: 'review', error: null });
        showToast('Processing cancelled', 'info');
        return;
      }

      const errorMessage = error.message || 'Failed to process recording';
      updateSession(sessionId, { status: 'review', error: errorMessage });
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

  // === ActivityTray bridge ===
  // Sync recording sessions → activityStore so the unified tray renders them.
  // Format time as MM:SS for the tray detail field.
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
          label: 'Processing recording...',
          status: 'active' as const,
          percent: null,
          step: null,
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
        // Review sessions: show compact row with process/later/discard.
        // Only include Summarize if a model is configured — otherwise clicking
        // would fail silently since there's nothing to route the request to.
        const hasModel = !!resolveModel(
          settingsContext?.settings?.chatModel || '',
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

    // Remove activity items for sessions that no longer exist.
    // Only touch items with recording/processing type and UUID-format IDs
    // (to avoid removing non-recording items like 'rag-model', 'llamacpp-download').
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

  // Prevent system idle sleep while OS audio capture is active.
  // Acquire when activeCaptureSessionId becomes non-null, release on cleanup.
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

  // Handle notification action callbacks (Keep Recording / Stop Now).
  // Mount-only — uses refs to avoid stale closures on frequently changing functions.
  useEffect(() => {
    const unsubscribe = notificationService.onActionType('recording_timeout', (actionId) => {
      const sessionId = alertedSessionRef.current;
      if (!sessionId) return;

      // Cancel the 5-min auto-stop timer
      const autoStop = timeoutAutoStopRefs.current.get(sessionId);
      if (autoStop !== undefined) {
        clearTimeout(autoStop);
        timeoutAutoStopRefs.current.delete(sessionId);
      }

      if (actionId === 'keep_recording') {
        // Allow the alert to re-fire after another 60 minutes
        pendingAlertRefs.current.set(sessionId, false);
        alertedSessionRef.current = null;
      } else if (actionId === 'stop_now') {
        alertedSessionRef.current = null;
        stopAndSaveRef.current(sessionId);
      }
    });
    return unsubscribe;
  }, []); // mount only

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
