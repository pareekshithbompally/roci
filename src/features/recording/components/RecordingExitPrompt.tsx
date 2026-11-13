/**
 * RecordingExitPrompt
 *
 * Opens when the user quits (Cmd+Q or tray Quit) or closes the window while a
 * recording is capturing. Stop saves the recording to history first, then
 * quits or hides the window; Cancel keeps recording. A quit the app cannot
 * ask about (force quit, crash) is recovered at the next launch instead.
 */

import React, { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { exit } from '@tauri-apps/plugin-process';
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@shared/ui';
import { useAppStore, useRecordingExitPrompt, type RecordingExitPrompt as Prompt } from '@shared/stores/appStore';
import { isTauriEnvironment } from '@services/tauri';
import { windowService } from '@services/window.service';
import { useRecordingSessions } from '@features/recording/context';
import { TEXT, COMPONENT, BORDER } from '@config/theme.config';

/** Backend events that ask, matching `window.rs`. */
const PROMPT_EVENTS: Record<string, Prompt> = {
  'quit-requested': 'quit',
  'close-requested': 'close',
};

const STOP_LABEL: Record<Prompt, string> = {
  quit: 'Stop and Quit',
  close: 'Stop Recording',
};

export const RecordingExitPrompt: React.FC = () => {
  const prompt = useRecordingExitPrompt();
  const setPrompt = useAppStore((s) => s.setRecordingExitPrompt);
  const { activeCaptureSessionId, stopAndSaveRecording } = useRecordingSessions();

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const unlisteners = Object.entries(PROMPT_EVENTS).map(([event, value]) =>
      listen(event, () => setPrompt(value)),
    );
    return () => {
      unlisteners.forEach((pending) => pending.then((unlisten: UnlistenFn) => unlisten()));
    };
  }, [setPrompt]);

  const stop = async (requested: Prompt) => {
    setPrompt(null);
    if (activeCaptureSessionId) {
      await stopAndSaveRecording(activeCaptureSessionId);
    }
    if (requested === 'quit') {
      await exit(0);
    } else {
      await windowService.hide();
    }
  };

  const onStop = () => {
    if (!prompt) return;
    stop(prompt).catch((error: unknown) =>
      console.error('[RecordingExitPrompt] Stop failed:', error),
    );
  };

  return (
    <AlertDialog open={prompt !== null} onOpenChange={(open) => { if (!open) setPrompt(null); }}>
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogContent className="max-w-sm p-5">
          <AlertDialogTitle className="text-base font-semibold mb-1.5">
            Recording in progress
          </AlertDialogTitle>
          <AlertDialogDescription className={`text-sm ${TEXT.secondary} mb-5`}>
            Stop the recording and save it to History first?
          </AlertDialogDescription>
          <div className="flex gap-2.5 justify-end">
            <AlertDialogCancel asChild>
              <button className={`px-3.5 py-2 text-sm font-medium ${TEXT.primary} border ${BORDER.strong} rounded-lg hover:bg-parchment-200/60 dark:hover:bg-night-700/60 transition-colors`}>
                Cancel
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                onClick={onStop}
                className={`px-3.5 py-2 text-sm font-medium ${COMPONENT.dangerButton} rounded-lg`}
              >
                {prompt ? STOP_LABEL[prompt] : ''}
              </button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
};

export default RecordingExitPrompt;
