/**
 * RecordingExitPrompt
 *
 * Asks (via the app-wide confirm()) when the user quits (Cmd+Q or tray Quit) or closes the window while a
 * recording is capturing. Stop saves the recording to history first, then
 * quits or hides the window; Cancel keeps recording. A quit the app cannot
 * ask about (force quit, crash) is recovered at the next launch instead.
 */

import React, { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { exit } from '@tauri-apps/plugin-process';
import { confirm } from '@shared/stores/confirmStore';
import { useAppStore, useRecordingExitPrompt, type ExitPromptKind } from '@shared/stores/appStore';
import { isTauriEnvironment } from '@services/tauri';
import { windowService } from '@services/window.service';
import { RECORDING_EVENTS } from '@config/audio.config';
import { useRecordingSessions } from '@features/recording/context';

/** The backend events that ask, and which prompt each opens. */
const PROMPT_EVENTS: Array<[string, ExitPromptKind]> = [
  [RECORDING_EVENTS.quitRequested, 'quit'],
  [RECORDING_EVENTS.closeRequested, 'close'],
];

const STOP_LABEL: Record<ExitPromptKind, string> = {
  quit: 'Stop and Quit',
  close: 'Stop Recording',
};

export const RecordingExitPrompt: React.FC = () => {
  const prompt = useRecordingExitPrompt();
  const setPrompt = useAppStore((s) => s.setRecordingExitPrompt);
  const { activeCaptureSessionId, stopAndSaveRecording } = useRecordingSessions();

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    const unlisteners = PROMPT_EVENTS.map(([event, kind]) => listen(event, () => setPrompt(kind)));
    return () => {
      unlisteners.forEach((pending) => pending.then((unlisten: UnlistenFn) => unlisten()));
    };
  }, [setPrompt]);

  const stop = async (requested: ExitPromptKind) => {
    if (activeCaptureSessionId) {
      await stopAndSaveRecording(activeCaptureSessionId);
    }
    if (requested === 'quit') {
      await exit(0);
    } else {
      await windowService.hide();
    }
  };

  // A request (backend event or tray Quit) lands in the store; ask once, then clear it.
  useEffect(() => {
    if (!prompt) return;
    setPrompt(null);
    confirm({
      title: 'Recording in progress',
      description: 'Stop the recording and save it to History first?',
      confirmLabel: STOP_LABEL[prompt],
    })
      .then((confirmed) => (confirmed ? stop(prompt) : undefined))
      .catch((error: unknown) => console.error('[RecordingExitPrompt] Stop failed:', error));
  }, [prompt, setPrompt, stop]);

  return null;
};

export default RecordingExitPrompt;
