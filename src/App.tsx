import React, { useEffect, useRef } from 'react';
import { useAppStore, useCurrentView, useAppStatus, useSelectedHistoryId, useAppActions } from '@shared/stores/appStore';
import type { SettingsPanel as SettingsPanelId } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import { PermissionChecklist, RecordingExitPrompt, recording, useRecordingStore, useRecordingRuntime, useStartRecording, useToggleRecording } from '@features/recording';
import { MainLayout } from '@features/layout';
import { endSearch, startSearch, toggleSearch } from '@shared/stores/searchStore';
import { HomeView } from '@features/home';
import { SettingsPanel } from '@features/settings';
import { useAppUpdate, useUpdateRuntime } from '@features/settings';
import { useMenubarSpeechModels, useMenubarReports, useStorageRetention, useLocalModelDownloads, useLocalModelIdle, freshSpeechSources } from '@features/settings';
import { useSpeechVocabulary } from '@features/personalization';
import { RemindersView } from '@features/todos';
import { GalleryView } from '@features/gallery';
import { DictationsView } from '@features/dictations';
import { CalendarView } from '@features/calendar';
import { OnboardingView } from '@features/onboarding';
import { ConfirmHost, SearchIndexActivity } from '@shared/components';
import { Toaster } from '@shared/ui';
import { useDownloadToasts } from '@shared/hooks';
import { useAppShortcuts } from '@features/shortcuts';
import { focusChatComposer, startNewChat, useChatRuntime } from '@features/chat';
import { useAppleNotesRuntime, useCalendarRuntime, useHexRuntime, useMcpHostRuntime, useRemindersRuntime, useSpotlightRuntime, useUrlActionsRuntime } from '@features/integrations';
import { useNotificationsRuntime } from '@features/notifications';

// Services
import { isTauriEnvironment } from '@services/tauri';
import {
  initializeStorage,
} from '@services/storage';
import { menubarService, TrayAction, SPEECH_MODEL_ACTION_PREFIX } from '@services/tauri';
import { isSpeechSelectionReady } from '@services/ai/transcription';
import { parseModelKey } from '@services/ai/models';
import { windowService } from '@services/window.service';
import { dismissSplash } from '@/src/app/splash';
import { shortcutsService } from '@services/shortcuts.service';
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
  
  const { settings, setSettings, providers, isLoading: settingsLoading } = useSettings();
  const startRecording = useStartRecording();
  const startRecordingRef = useRef(startRecording);
  startRecordingRef.current = startRecording;
  // ⌥⇧R and ⌘K share one toggle; the ref keeps the long-lived shortcut handler on the latest one.
  const toggleRecording = useToggleRecording();
  const toggleRecordingRef = useRef(toggleRecording);
  toggleRecordingRef.current = toggleRecording;
  const toast = useToast();
  const appUpdate = useAppUpdate();

  // In-window shortcuts (APP_SHORTCUTS); leaving for another surface ends a sidebar search.
  useAppShortcuts({
    search: toggleSearch,
    focusChat: () => {
      endSearch();
      focusChatComposer();
    },
    newChat: () => {
      endSearch();
      startNewChat();
    },
    openSettings: () => {
      endSearch();
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
  useLocalModelIdle();
  useSpeechVocabulary();
  useStorageRetention();
  useRemindersRuntime();
  useHexRuntime();
  useMcpHostRuntime();
  useUrlActionsRuntime();
  useAppleNotesRuntime();
  useSpotlightRuntime();

  // Tray › Speech Model submenu: downloaded Hex models and the current pick
  useMenubarSpeechModels();
  useMenubarReports();
  // App updates: Rust checks and installs; the tray row follows its state
  useUpdateRuntime();

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
        if (!cancelled) setInitialized(true);
      } catch (e) {
        console.error('[App] Initialization error:', e);
      }
    };

    initializeApp();
    return () => { cancelled = true; };
  }, []);

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
      const selection = parseModelKey(key);
      if (!selection || !isSpeechSelectionReady(selection, providers, await freshSpeechSources())) {
        toast.showToast("That speech model isn't ready. Check Settings › Default Models.", 'warning');
        return;
      }
      setSettings({ transcriptionProvider: selection.provider, transcriptionModel: selection.model });
    } catch (error) {
      console.error('[App] Failed to switch speech model:', error);
      toast.showToast('Could not switch the speech model', 'error');
    }
  };
  // the menu bar's handler is set once at launch; the ref keeps it on this render's providers and settings
  const applySpeechModelRef = useRef(applySpeechModel);
  applySpeechModelRef.current = applySpeechModel;

  /** What each menu bar action does here (Rust handles the window, update, next-meeting and recent-meeting rows itself). */
  const menubarActions = (): Record<TrayAction, () => Promise<void>> => {
    const isRecording = () => useRecordingStore.getState().meetingId !== null;
    const openSettingsWindow = async (panel?: SettingsPanelId, page?: string) => {
      openSettings(panel, page);
      await windowService.show();
    };
    return {
      [TrayAction.SHOW]: () => windowService.show(),
      [TrayAction.START_RECORDING]: async () => { if (!isRecording()) await startRecordingRef.current(); },
      [TrayAction.STOP_RECORDING]: async () => { if (isRecording()) await recording.stop(); },
      [TrayAction.PAUSE_RECORDING]: async () => { if (isRecording()) await recording.pause(); },
      [TrayAction.RESUME_RECORDING]: async () => { if (isRecording()) await recording.resume(); },
      [TrayAction.MANAGE_MODELS]: () => openSettingsWindow('providers', LOCAL_MODELS_CONFIG.provider.id),
      [TrayAction.MANAGE_AGENTS]: () => openSettingsWindow('integrations'),
      [TrayAction.SETTINGS]: () => openSettingsWindow(),
      [TrayAction.NEW_CHAT]: async () => {
        await windowService.show();
        startNewChat();
      },
      [TrayAction.SEARCH]: async () => {
        await windowService.show();
        startSearch();
      },
      [TrayAction.CHECK_UPDATES]: async () => {
        await windowService.show();
        await appUpdate.checkNow();
      },
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
          await applySpeechModelRef.current(action.slice(SPEECH_MODEL_ACTION_PREFIX.length));
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
      shortcutsService.on('toggle-recording', () => toggleRecordingRef.current());

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
            contentView === 'settings' || contentView === 'reminders' || contentView === 'calendar' || contentView === 'gallery' || contentView === 'dictations'
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
            : contentView === 'gallery' ? <GalleryView />
            : contentView === 'dictations' ? <DictationsView />
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
