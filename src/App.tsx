import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, useCurrentView, useAppStatus, useSelectedHistoryId, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelId } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useToast } from '@shared/contexts/ToastContext';
import { PermissionChecklist, RecordingExitPrompt, recording, useRecordingStore, useRecordingRuntime, useStartRecording } from '@features/recording';
import { MainLayout, SearchOverlay } from '@features/layout';
import { HomeView } from '@features/home';
import { SettingsPanel } from '@features/settings';
import { useAppUpdate, scheduleStartupCheck } from '@features/settings';
import { useMenubarSpeechModels, useMenubarReports, useLocalModelDownloads, freshSpeechSources } from '@features/settings';
import { RemindersView } from '@features/todos';
import { CalendarView } from '@features/calendar';
import { OnboardingView } from '@features/onboarding';
import { ConfirmHost, OnDeviceModelActivity } from '@shared/components';
import { Toaster } from '@shared/ui';
import { useDownloadToasts } from '@shared/hooks';
import { useAppShortcuts } from '@features/shortcuts';
import { focusChatComposer, startNewChat, useChatIndex, useChatRuntime } from '@features/chat';
import { useAppleNotesRuntime, useCalendarRuntime, useHexRuntime, useMcpHostRuntime, useRemindersRuntime, useSpotlightRuntime, useUrlActionsRuntime } from '@features/integrations';
import { useNotificationsRuntime } from '@features/notifications';

// Services
import { isTauriEnvironment } from '@services/tauri';
import {
  initializeStorage,
} from '@services/storage';
import { menubarService, TrayAction, SPEECH_MODEL_ACTION_PREFIX } from '@services/tauri';
import { isSpeechSelectionReady, parseSpeechSelectionKey } from '@services/ai/transcription';
import { windowService } from '@services/window.service';
import { dismissSplash } from '@/src/app/splash';
import { shortcutsService } from '@services/shortcuts.service';
import { searchIndexingService } from '@services/searchIndexing.service';
import { reminderService } from '@services/reminder.service';
import { platform } from '@platform/index';
import { useFormFactor } from '@platform/formFactor';

const App: React.FC = () => {
  console.log('[App] Rendering App component');
  const currentView = useCurrentView();
  const viewBeforeSettings = useAppStore((s) => s.viewBeforeSettings);
  const formFactor = useFormFactor();
  const status = useAppStatus();
  const selectedHistoryId = useSelectedHistoryId();
  const { setCurrentView, leaveSettings, setInitialized, setActiveSettingsPanel } = useAppActions();
  
  const { settings, setSettings, providers, isLoading: settingsLoading } = useSettings();
  const history = useHistory();
  const chatCount = useChatIndex().length;
  const startRecording = useStartRecording();
  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;
  const toast = useToast();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const appUpdate = useAppUpdate();

  const openSearch = useCallback(() => setIsSearchOpen(true), []);

  // In-window shortcuts (APP_SHORTCUTS); leaving for another surface closes search so its focus trap lets go.
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

  // Recording + meeting pipeline: resumes unfinished meetings, mirrors them into the activity tray
  useRecordingRuntime();
  // macOS Calendar integration — polls for upcoming meetings, shows notifications
  useCalendarRuntime();
  useNotificationsRuntime();
  useChatRuntime();
  useDownloadToasts();
  useLocalModelDownloads();
  useRemindersRuntime();
  useHexRuntime();
  useMcpHostRuntime();
  useUrlActionsRuntime();
  useAppleNotesRuntime();
  useSpotlightRuntime();

  // Tray › Speech Model submenu: downloaded Hex models and the current pick
  useMenubarSpeechModels();
  useMenubarReports(appUpdate.status === 'available' ? appUpdate.updateInfo?.version ?? null : null);

  // Index warm-up: FTS first so Cmd+K works at once, then embeddings only if the model is ready and consented.
  const indexingRanRef = useRef(false);

  useEffect(() => {
    if (indexingRanRef.current) return;
    if (history.items.length === 0 && chatCount === 0) return;

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

        // Phase 2: add embeddings if the model is available
        if (controller.signal.aborted) return;
        const shouldEmbed = embeddingService.isReady() || hasConsent();
        if (!shouldEmbed) return;

        await ragIndexer.indexAll(meetingItems, {
          signal: controller.signal,
          includeEmbeddings: true,
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
  }, [history.items.length, chatCount]);

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
      await initializeStorage();
      if (platform.hasNotifications) await reminderService.initialize();
      if (platform.hasWindowChrome) await windowService.initialize();
      if (platform.hasGlobalShortcuts) await initializeShortcuts();
      if (platform.hasMenuBar) await initializeMenubar();
      console.log('Tauri services initialized');
    } catch (error) {
      console.error('Failed to initialize Tauri services:', error);
    }
  };

  /** Applies a tray Speech Model pick (`provider::model`), checked first because the tray menu may be stale. */
  const applySpeechModel = async (key: string) => {
    try {
      const selection = parseSpeechSelectionKey(key);
      if (!isSpeechSelectionReady(selection, providers, await freshSpeechSources())) {
        toast.showToast("That speech model isn't ready. Check Settings › Capabilities.", 'warning');
        return;
      }
      setSettings({ transcriptionProvider: selection.provider, transcriptionModel: selection.model });
    } catch (error) {
      console.error('[App] Failed to switch speech model:', error);
      toast.showToast('Could not switch the speech model', 'error');
    }
  };

  /** What each menu bar action does here (Rust handles the window, next-meeting and recent-meeting rows itself). */
  const menubarActions = (): Record<TrayAction, () => Promise<void>> => {
    const isRecording = () => useRecordingStore.getState().meetingId !== null;
    const openSettings = async (panel?: SettingsPanelId) => {
      if (panel) setActiveSettingsPanel(panel);
      setCurrentView('settings');
      await windowService.show();
    };
    return {
      [TrayAction.SHOW]: () => windowService.show(),
      [TrayAction.START_RECORDING]: async () => { if (!isRecording()) await startRecordingRef.current(); },
      [TrayAction.STOP_RECORDING]: async () => { if (isRecording()) await recording.stop(); },
      [TrayAction.PAUSE_RECORDING]: async () => { if (isRecording()) await recording.pause(); },
      [TrayAction.RESUME_RECORDING]: async () => { if (isRecording()) await recording.resume(); },
      [TrayAction.MANAGE_MODELS]: () => openSettings('capabilities'),
      [TrayAction.MANAGE_AGENTS]: () => openSettings('integrations'),
      [TrayAction.SETTINGS]: () => openSettings(),
      [TrayAction.NEW_CHAT]: async () => {
        await windowService.show();
        startNewChat();
      },
      [TrayAction.SEARCH]: async () => {
        await windowService.show();
        setIsSearchOpen(true);
      },
      [TrayAction.CHECK_UPDATES]: async () => {
        await windowService.show();
        const outcome = await appUpdate.checkNow();
        if (outcome === 'available') toast.showToast('An update is available', 'info');
        else if (outcome === 'current') toast.showToast('Roci is up to date', 'success');
        else toast.showToast('Could not check for updates', 'error');
      },
      [TrayAction.INSTALL_UPDATE]: () => appUpdate.downloadAndInstall(),
      [TrayAction.QUIT]: async () => {
        if (!isRecording()) {
          await menubarService.quit();
          return;
        }
        useAppStore.getState().setRecordingExitPrompt('quit');
        await windowService.show();
      },
    };
  };

  const initializeMenubar = async () => {
    try {
      const actions = menubarActions();
      await menubarService.initialize(async (action) => {
        if (action.startsWith(SPEECH_MODEL_ACTION_PREFIX)) {
          await applySpeechModel(action.slice(SPEECH_MODEL_ACTION_PREFIX.length));
          return;
        }
        const run = actions[action as TrayAction];
        if (run) await run();
        else console.warn('[App] Unknown menu bar action:', action);
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
        const { meetingId, busy } = useRecordingStore.getState();
        if (busy) return;
        if (meetingId) await recording.stop();
        else await startRecordingRef.current();
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
      // Settings and chat sessions load in their own contexts; only history loads here.
      await history.loadHistory();
    } catch (e) {
      console.error('[App] Failed to load data:', e);
    }
  };

  // Phone: Settings is a sheet (PhoneShell) over the screen it was opened from, which stays in the content area.
  const contentView = formFactor === 'phone' && currentView === 'settings' ? viewBeforeSettings : currentView;

  // Determine if IdleView, ChatView, or ResultsView is being shown (needs edge-to-edge layout without padding)
  const hasSelectedMeeting = selectedHistoryId !== null;
  const showIdleView = contentView === 'home' && (
    status === AppStatus.IDLE || 
    status === AppStatus.CHAT
  );
  const showChatView = contentView === 'home' && status === AppStatus.CHAT;
  const showResultsView = contentView === 'home' && hasSelectedMeeting;

  // First launch: permissions, then AI setup, in place of the app; waits for settings so a finished run never flashes.
  if (!settingsLoading && !settings.onboarding?.completed) {
    return (
      <>
        <OnboardingView />
        <Toaster />
        {/* A recording started meanwhile (menu bar, URL action) that macOS refuses still asks here */}
        <PermissionChecklist />
        <ConfirmHost />
      </>
    );
  }

  return (
    <>
      <MainLayout onSearchClick={openSearch}>
        {/* Main Content */}
        <main
          className={`grow shrink min-h-0 flex flex-col custom-scrollbar relative ${
            contentView === 'settings' || contentView === 'reminders' || contentView === 'calendar'
              ? 'p-0 items-stretch overflow-y-auto'
              : (showIdleView || showChatView || showResultsView)
                ? 'p-0 overflow-hidden'
                : 'p-6 md:p-10 overflow-hidden'
          }`}
          // No titlebar padding: each view clears the titlebar itself (`PageScroll` / `TitlebarSpacer`).
        >
          {contentView === 'home' ? <HomeView />
            : contentView === 'reminders' ? <RemindersView />
            : contentView === 'calendar' ? <CalendarView />
            : <SettingsPanel />}
        </main>
      </MainLayout>

      {/* Sonner Toast Container — top-right corner */}
      <Toaster />

      {/* Search Overlay (Cmd+K) */}
      <SearchOverlay open={isSearchOpen} onOpenChange={setIsSearchOpen} />

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
