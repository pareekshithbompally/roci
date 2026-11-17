import React, { useEffect, useRef } from 'react';
import { useAppStore, useCurrentView, useAppStatus, useSelectedHistoryId, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelId } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useToast } from '@shared/contexts/ToastContext';
import { PermissionChecklist, RecordingExitPrompt, recording, useRecordingStore, useRecordingRuntime, useStartRecording } from '@features/recording';
import { MainLayout } from '@features/layout';
import { endSidebarSearch, startSidebarSearch, toggleSidebarSearch } from '@shared/stores/sidebarSearchStore';
import { HomeView } from '@features/home';
import { SettingsPanel } from '@features/settings';
import { useAppUpdate, scheduleStartupCheck } from '@features/settings';
import { useMenubarSpeechModels, useMenubarReports, useLocalModelDownloads, freshSpeechSources } from '@features/settings';
import { RemindersView } from '@features/todos';
import { CalendarView } from '@features/calendar';
import { OnboardingView } from '@features/onboarding';
import { ConfirmHost, SearchIndexActivity } from '@shared/components';
import { Toaster } from '@shared/ui';
import { useDownloadToasts, useLocalModels } from '@shared/hooks';
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
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
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
  const { openSettings, leaveSettings, setInitialized } = useAppActions();
  
  const { settings, setSettings, providers, setSelectedProviderName, isLoading: settingsLoading } = useSettings();
  const history = useHistory();
  const chatCount = useChatIndex().length;
  const startRecording = useStartRecording();
  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;
  const toast = useToast();
  const appUpdate = useAppUpdate();

  // In-window shortcuts (APP_SHORTCUTS); leaving for another surface ends a sidebar search.
  useAppShortcuts({
    search: toggleSidebarSearch,
    focusChat: () => {
      endSidebarSearch();
      focusChatComposer();
    },
    newChat: () => {
      endSidebarSearch();
      startNewChat();
    },
    openSettings: () => {
      endSidebarSearch();
      openSettings();
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

  // Search index: full-text at launch so Cmd+K works at once; vectors whenever the embedding model is installed
  // (at launch, or as soon as its download finishes).
  const { data: localModels } = useLocalModels();
  const embeddingInstalled = localModels?.some((m) => m.kind === 'embedding' && m.installed) ?? false;
  const hasSearchContent = history.items.length > 0 || chatCount > 0;
  const textIndexRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (textIndexRef.current || !hasSearchContent) return;
    textIndexRef.current = searchIndexingService.indexAll({ includeEmbeddings: false })
      .then(() => console.log('[App] Full-text search index ready'))
      .catch((error: unknown) => console.error('[App] Full-text indexing failed:', error));
  }, [hasSearchContent]);

  useEffect(() => {
    if (!embeddingInstalled || !hasSearchContent) return;
    const controller = new AbortController();
    void (textIndexRef.current ?? Promise.resolve())
      .then(() => searchIndexingService.indexAll({ includeEmbeddings: true, signal: controller.signal }))
      .catch((error: unknown) => console.error('[App] Embedding indexing failed:', error));
    return () => controller.abort();
  }, [embeddingInstalled, hasSearchContent]);

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
        toast.showToast("That speech model isn't ready. Check Settings › Default Models.", 'warning');
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
    const openSettingsWindow = async (panel?: SettingsPanelId) => {
      openSettings(panel);
      await windowService.show();
    };
    return {
      [TrayAction.SHOW]: () => windowService.show(),
      [TrayAction.START_RECORDING]: async () => { if (!isRecording()) await startRecordingRef.current(); },
      [TrayAction.STOP_RECORDING]: async () => { if (isRecording()) await recording.stop(); },
      [TrayAction.PAUSE_RECORDING]: async () => { if (isRecording()) await recording.pause(); },
      [TrayAction.RESUME_RECORDING]: async () => { if (isRecording()) await recording.resume(); },
      [TrayAction.MANAGE_MODELS]: () => {
        setSelectedProviderName(LOCAL_MODELS_CONFIG.provider.id);
        return openSettingsWindow('providers');
      },
      [TrayAction.MANAGE_AGENTS]: () => openSettingsWindow('integrations'),
      [TrayAction.SETTINGS]: () => openSettingsWindow(),
      [TrayAction.NEW_CHAT]: async () => {
        await windowService.show();
        startNewChat();
      },
      [TrayAction.SEARCH]: async () => {
        await windowService.show();
        startSidebarSearch();
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

      shortcutsService.on('open-settings', () => openSettings());

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
      <MainLayout>
        {/* Main Content */}
        <main
          className={`grow shrink min-h-0 flex flex-col custom-scrollbar relative ${
            contentView === 'settings' || contentView === 'reminders' || contentView === 'calendar'
              ? 'p-0 items-stretch overflow-y-auto'
              // The idle view's wash runs up behind the phone's clear top bar; the shell clips at the screen edge.
              : showIdleView
                ? 'p-0'
              : (showChatView || showResultsView)
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

      {/* On-device model download + indexing progress → ActivityTray */}
      <SearchIndexActivity />

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
