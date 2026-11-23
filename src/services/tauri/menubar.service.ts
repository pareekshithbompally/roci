/** Frontend sync for the Rust-owned tray: menu actions in; what only the webview knows out (recording, models, jobs, recent meetings). */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauriEnvironment } from './environment.service';
import { platform } from '@platform/index';
import type { TrayAction } from './types';

export const MENUBAR_ACTION_EVENT = 'menubar-action';

/** A background job as its menu row reads: label, and percent when known. */
export interface MenubarActivity {
  label: string;
  percent: number | null;
}

/** A recent meeting's menu row. */
export interface MenubarRecentMeeting {
  id: string;
  title: string;
}

/** One row of the tray's Speech Model submenu (a downloaded Hex model). */
export interface MenubarSpeechModel {
  id: string;
  name: string;
  /** The model transcription currently uses; the tray checks it. */
  selected: boolean;
}

/** Menu ids are fixed actions or `speech_model:<id>`, so the payload is a plain string. */
type MenubarAction = TrayAction | string;
type MenubarEventCallback = (action: MenubarAction) => void;

class MenubarService {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private markListening: () => void = () => {};
  private readonly listening = new Promise<void>((resolve) => { this.markListening = resolve; });

  /** Resolves once the `menubar-action` listener is attached (URL actions wait for it). */
  whenListening(): Promise<void> {
    return this.listening;
  }

  /** Attaches the listener once; concurrent calls share the attempt, and a failure resets so a later call can retry. */
  initialize(onEvent: MenubarEventCallback): Promise<void> {
    if (!isTauriEnvironment()) return Promise.resolve();
    if (this.initialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    this.initPromise = listen<string>(MENUBAR_ACTION_EVENT, (event) => {
      onEvent(event.payload);
    }).then(() => {
      this.initialized = true;
      this.markListening();
    }).catch((error) => {
      console.error('[Menubar] Failed to attach menubar listener:', error);
      this.initPromise = null;
    });

    return this.initPromise;
  }

  /** Report a recording transition. Backend owns the icon and clock. */
  async setRecordingState(active: boolean, paused = false): Promise<void> {
    await this.report('menubar_set_recording_state', { active, paused }, 'recording state');
  }

  /** Replaces the Speech Model submenu; an empty list shows the disabled "No downloaded models" row. */
  async setSpeechModels(models: MenubarSpeechModel[]): Promise<void> {
    await this.report('menubar_set_speech_models', { models }, 'speech models');
  }

  /** The background jobs running now, one menu row each. */
  async setActivity(items: MenubarActivity[]): Promise<void> {
    await this.report('menubar_set_activity', { items }, 'activity');
  }

  /** The most recent meetings, newest first, for the Recent Meetings submenu. */
  async setRecentMeetings(meetings: MenubarRecentMeeting[]): Promise<void> {
    await this.report('menubar_set_recent_meetings', { meetings }, 'recent meetings');
  }

  /** One report to the Rust-owned menu; a failure is logged (the menu keeps its last state). */
  private async report(command: string, args: Record<string, unknown>, what: string): Promise<void> {
    if (!platform.hasMenuBar || !isTauriEnvironment()) return;
    try {
      await invoke(command, args);
    } catch (error: unknown) {
      console.error(`[Menubar] Failed to report ${what}:`, error);
    }
  }

  /** Quits through the single backend exit path, which runs its guard and cleanup. */
  async quit(): Promise<void> {
    if (!isTauriEnvironment()) return;
    try {
      await invoke('menubar_quit');
    } catch (error) {
      console.error('[Menubar] Failed to quit:', error);
    }
  }
}

export const menubarService = new MenubarService();
