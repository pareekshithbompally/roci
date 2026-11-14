/**
 * App.tsx
 * 
 * Main application component - minimal orchestrator.
 * Uses feature modules and contexts for all functionality.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, useCurrentView, useAppStatus, useSelectedHistoryId, useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useChat } from '@shared/contexts/ChatContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useRecordingContext, PermissionChecklist, RecordingExitPrompt } from '@features/recording';
import { MainLayout } from '@features/layout';
import { HomeView } from '@features/home';
import { SettingsPanel } from '@features/settings';
import { useAppUpdate, scheduleStartupCheck } from '@features/settings';
import { useMenubarSpeechModels } from '@features/settings';
import { UpdateBanner } from '@features/settings';
import { RemindersView } from '@features/todos';
import { CalendarView } from '@features/calendar';
import { ConfirmHost, OnDeviceModelActivity, SearchOverlay } from '@shared/components';
import { Toaster } from '@shared/ui';
import { useAppShortcuts } from '@features/shortcuts';
import { focusChatComposer, startNewChat } from '@features/chat';
import { useAppleNotesRuntime, useCalendarRuntime, useHexRuntime, useMcpHostRuntime, useRemindersRuntime, useUrlActionsRuntime } from '@features/integrations';
import { useNotificationsRuntime } from '@features/notifications';

// Services
import { isTauriEnvironment } from '@services/tauri';
import {
  initializeStorage,
} from '@services/storage';
import { menubarService, TrayAction, SPEECH_MODEL_ACTION_PREFIX } from '@services/tauri';
import { getHexStatus } from '@services/ai/transcription';
import { windowService } from '@services/window.service';
import { dismissSplash } from '@/src/app/splash';
import { shortcutsService } from '@services/shortcuts.service';
import { initPlatformFetch } from '@services/platform-fetch';
import { searchIndexingService } from '@services/searchIndexing.service';
import { reminderService } from '@services/reminder.service';
import { TRANSCRIPTION_CONFIG } from '@config/transcription.config';
import { UI_CONFIG } from '@config/ui.config';

const App: React.FC = () => {
  console.log('[App] Rendering App component');
  const currentView = useCurrentView();
  const status = useAppStatus();
  const selectedHistoryId = useSelectedHistoryId();
  const { setCurrentView, leaveSettings, setInitialized, setActiveSettingsPanel } = useAppActions();
  
  const { setSettings, settings, providers, isLoading: settingsLoading } = useSettings();
  const history = useHistory();
  const chat = useChat();
  const recording = useRecordingContext();
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const toast = useToast();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const appUpdate = useAppUpdate();

  const openSearch = useCallback(() => setIsSearchOpen(true), []);

  // In-window shortcuts (registry: APP_SHORTCUTS). Leaving for another
  // surface closes search first, so its focus trap can't hold focus.
  useAppShortcuts({
    search: () => setIsSearchOpen((open) => !open),
    focusChat: () => {
      setIsSearchOpen(false);
      focusChatComposer();
    },
    newChat: () => {
      setIsSearchOpen(false);
      startNewChat();
    },
    openSettings: () => {
      setIsSearchOpen(false);
      setCurrentView('settings');
    },
    leaveSettings,
  });

  // macOS Calendar integration — polls for upcoming meetings, shows notifications
  useCalendarRuntime();
  useNotificationsRuntime();
  useRemindersRuntime();
  useHexRuntime();
  useMcpHostRuntime();
  useUrlActionsRuntime();
  useAppleNotesRuntime();

  // Tray › Speech Model submenu: downloaded Hex models and the current pick
  useMenubarSpeechModels();

  // Background search-index warm-up: two phases.
  // Phase 1 (fast): FTS-only — populates spotlight corpus so Cmd+K works immediately.
  // Phase 2 (slow, optional): embeddings + KG extraction — only if model is ready/consented.
  //
  // Multi-phase staleness tracking (embedding_hash, extraction_hash) ensures Phase 1
  // doesn't poison Phase 2: each concern tracks its own completion independently.
  const indexingRanRef = useRef(false);

  useEffect(() => {
    if (indexingRanRef.current) return;
    if (history.items.length === 0 && chat.sessionIndex.length === 0) return;

    indexingRanRef.current = true;
    const controller = new AbortController();
    const warmUp = async () => {
      try {
        const { ragIndexer, chatIndexer, embeddingService, hasConsent } = await import('@extensions/rag');
        const [meetingItems, chatSessions] = await Promise.all([
          searchIndexingService.loadMeetingsForIndexing(),
          searchIndexingService.loadChatsForIndexing(),
        ]);

        // Phase 1: FTS-only indexing (fast — no embedding computation)
        await ragIndexer.indexAll(meetingItems, {
          signal: controller.signal,
          includeEmbeddings: false,
        });

        if (controller.signal.aborted) return;

        await chatIndexer.indexAllSessions(chatSessions, {
          signal: controller.signal,
          includeEmbeddings: false,
        });

        console.log('[App] Phase 1 complete: FTS spotlight corpus populated');

        // Phase 2: add embeddings + KG extraction if model is available
        if (controller.signal.aborted) return;
        const shouldEmbed = embeddingService.isReady() || hasConsent();
        if (!shouldEmbed) return;

        await ragIndexer.indexAll(meetingItems, {
          signal: controller.signal,
          includeEmbeddings: true,
          extractionContext: settings.chatModel ? { settings, providers } : undefined,
        });

        if (controller.signal.aborted) return;

        await chatIndexer.indexAllSessions(chatSessions, {
          signal: controller.signal,
          includeEmbeddings: true,
        });
      } catch (error) {
        console.log('[App] Background search index warm-up skipped or failed:', error);
      }
    };
    warmUp();

    return () => controller.abort();
  }, [history.items.length, chat.sessionIndex.length]);

  // Fade the startup splash once the first screen renders with real settings
  useEffect(() => {
    if (!settingsLoading) dismissSplash();
  }, [settingsLoading]);

  // Repaint compositor on focus — fixes transparent-window rendering glitch (Tauri #8255)
  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    import('@tauri-apps/api/event').then(({ listen }) => {
      if (cancelled) return;
      listen<void>('window-focused', () => {
        const el = document.documentElement;
        el.style.willChange = 'transform';
        requestAnimationFrame(() => {
          el.style.willChange = '';
        });
      }).then(fn => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  // Initialize app on mount (guard completion after unmount)
  useEffect(() => {
    let cancelled = false;
    const initializeApp = async () => {
      try {
        if (isTauriEnvironment()) {
          await initializeTauriServices();
        }
        await loadAppData();
        if (!cancelled) setInitialized(true);
      } catch (e) {
        console.error('[App] Initialization error:', e);
      }
    };

    initializeApp();
    return () => { cancelled = true; };
  }, []);

  // Check for app updates after startup settles
  useEffect(() => {
    return scheduleStartupCheck(async () => { await appUpdate.checkForUpdate({ silent: true }); });
  }, [appUpdate.checkForUpdate]);

  const initializeTauriServices = async () => {
    try {
      try { await initPlatformFetch(); } catch (e) { console.warn('Platform fetch init failed, using native fetch:', e); }
      await initializeStorage();
      await reminderService.initialize();
      await windowService.initialize();
      await initializeShortcuts();
      await initializeMenubar();
      console.log('Tauri services initialized');
    } catch (error) {
      console.error('Failed to initialize Tauri services:', error);
    }
  };

  /**
   * Tray › Speech Model: switch transcription to the picked Hex model.
   * The row only reaches here when Hex listed it, but Hex may have quit or
   * dropped the model since, so the pick is verified before saving.
   */
  const applySpeechModel = async (modelId: string) => {
    try {
      const hexStatus = await getHexStatus();
      const model = hexStatus.models.find((m) => m.id === modelId);
      if (!hexStatus.running || !model?.installed) {
        toast.showToast(
          "That model isn't downloaded in Hex. Open Hex › Models, then retry.",
          'warning',
        );
        return;
      }
      setSettings({ transcriptionProvider: TRANSCRIPTION_CONFIG.hexProvider, transcriptionModel: modelId });
    } catch (error) {
      console.error('[App] Failed to switch speech model:', error);
      toast.showToast('Could not switch the speech model', 'error');
    }
  };

  const initializeMenubar = async () => {
    try {
      await menubarService.initialize(async (action) => {
        const rec = recordingRef.current;
        switch (action) {
          case TrayAction.SHOW:
            await windowService.show();
            break;
          case TrayAction.START_RECORDING:
            if (rec.canRecord) {
              await rec.startRecording();
            }
            break;
          case TrayAction.STOP_RECORDING:
            if (rec.isRecording || rec.status === 'recording') {
              await rec.stopRecording();
            }
            break;
          case TrayAction.SETTINGS:
            setCurrentView('settings');
            await windowService.show();
            break;
          case TrayAction.MANAGE_MODELS:
            setActiveSettingsPanel('capabilities');
            setCurrentView('settings');
            await windowService.show();
            break;
          case TrayAction.CHECK_UPDATES: {
            await windowService.show();
            const outcome = await appUpdate.checkNow();
            if (outcome === 'available') {
              toast.showToast('An update is available', 'info');
            } else if (outcome === 'current') {
              toast.showToast('Kasset is up to date', 'success');
            } else {
              toast.showToast('Could not check for updates', 'error');
            }
            break;
          }
          case TrayAction.QUIT:
            if (rec.status === 'recording' || rec.status === 'paused') {
              useAppStore.getState().setRecordingExitPrompt('quit');
              await windowService.show();
            } else {
              await menubarService.quit();
            }
            break;
          default: {
            if (action.startsWith(SPEECH_MODEL_ACTION_PREFIX)) {
              await applySpeechModel(action.slice(SPEECH_MODEL_ACTION_PREFIX.length));
            }
            break;
          }
        }
      });

      console.log('Menubar initialized');
    } catch (error) {
      console.error('Failed to initialize menubar:', error);
    }
  };

  const initializeShortcuts = async () => {
    try {
      await shortcutsService.initialize();

      // Read live recording state: this handler outlives the render it was made in.
      shortcutsService.on('toggle-recording', async () => {
        const rec = recordingRef.current;
        if (rec.canRecord) await rec.startRecording();
        else if (rec.isRecording) await rec.stopRecording();
      });

      shortcutsService.on('show-window', async () => {
        await windowService.show();
      });

      shortcutsService.on('new-chat', startNewChat);

      shortcutsService.on('open-settings', () => {
        setCurrentView('settings');
      });

      console.log('Keyboard shortcuts initialized');
    } catch (error) {
      console.error('Failed to initialize shortcuts:', error);
    }
  };

  const loadAppData = async () => {
    try {
      // Settings and Chat sessions are now loaded automatically by their respective contexts
      // Just load history
      await history.loadHistory();
    } catch (e) {
      console.error('[App] Failed to load data:', e);
    }
  };

  // Determine if IdleView, ChatView, or ResultsView is being shown (needs edge-to-edge layout without padding)
  const hasSelectedMeeting = selectedHistoryId !== null;
  const showIdleView = currentView === 'home' && (
    status === AppStatus.IDLE || 
    status === AppStatus.CHAT
  );
  const showChatView = currentView === 'home' && status === AppStatus.CHAT;
  const showResultsView = currentView === 'home' && hasSelectedMeeting;

  return (
    <>
      <MainLayout onSearchClick={openSearch}>
        {/* Main Content */}
        <main
          className={`grow shrink min-h-0 flex flex-col custom-scrollbar relative ${
            currentView === 'settings' || currentView === 'reminders' || currentView === 'calendar'
              ? 'p-0 items-stretch overflow-y-auto'
              : (showIdleView || showChatView || showResultsView)
                ? 'p-0 overflow-hidden'
                : 'p-6 md:p-10 overflow-hidden'
          }`}
          // Titlebar clearance lives on the clipping element itself, so a full-bleed
          // view (IdleView's glow) can pull up into this padding without being cut off.
          style={{ paddingTop: UI_CONFIG.layout.titlebar.safeArea }}
        >
          {currentView === 'home' ? <HomeView />
            : currentView === 'reminders' ? <RemindersView />
            : currentView === 'calendar' ? <CalendarView />
            : <SettingsPanel />}
        </main>
      </MainLayout>

      {/* Sonner Toast Container — top-right corner */}
      <Toaster />

      {/* Search Overlay (Cmd+K) */}
      <SearchOverlay open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      {/* App Update Banner */}
      {(appUpdate.status === 'available' || appUpdate.status === 'downloading') && appUpdate.updateInfo && (
        <UpdateBanner
          version={appUpdate.updateInfo.version}
          releaseNotes={appUpdate.updateInfo.body}
          onUpdate={appUpdate.downloadAndInstall}
          onDismiss={appUpdate.dismiss}
          isDownloading={appUpdate.status === 'downloading'}
        />
      )}

      {/* On-device model download + indexing progress → ActivityTray */}
      <OnDeviceModelActivity />

      {/* Opens when a recording start is refused for a missing macOS permission */}
      <PermissionChecklist />
      {/* Asks Stop or Cancel when quitting or closing the window mid-recording */}
      <RecordingExitPrompt />

      {/* The one app-wide confirm() prompt */}
      <ConfirmHost />
    </>
  );
};

export default App;
