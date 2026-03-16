/**
 * App.tsx
 * 
 * Main application component - minimal orchestrator.
 * Uses feature modules and contexts for all functionality.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useApp, AppStatus } from '@shared/contexts/AppContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useHistory } from '@shared/contexts/HistoryContext';
import { useChat } from '@shared/contexts/ChatContext';
import { useToast } from '@shared/contexts/ToastContext';
import { useThemeContext } from '@shared/contexts/ThemeContext';
import { useRecordingContext } from '@features/recording';
import { MainLayout } from '@features/layout';
import { HomeView } from '@features/home';
import { SettingsPanel } from '@features/settings';
import { DeleteConfirmModal } from '@features/history';
// RecordingWidget removed — sessions now render via ActivityTray
import { Toaster } from 'sonner';
import { ModelDownloadModal } from '@shared/components/ModelDownloadModal';
import { SearchOverlay } from '@shared/components/SearchOverlay';
import { ActivityTray } from '@shared/components/ActivityTray';
import { useAppShortcuts } from '@shared/hooks/useAppShortcuts';

// Services
import { isTauriEnvironment } from '@/services/tauri';
import {
  initializeStorage,
  settingsService,
  pathsService,
} from '@/services/storage';
import { runMigrations } from '@/services/migration';
import { notificationService, trayService, TrayAction } from '@/services/tauri';
import { windowService } from '@/services/window.service';
import { shortcutsService } from '@/services/shortcuts.service';
import { ShortcutAction } from '@config/shortcuts.config';
import { unifiedAIService } from '@/services/unifiedAIService';
import { initPlatformFetch } from '@/services/platform-fetch';
import { exit } from '@tauri-apps/plugin-process';

const App: React.FC = () => {
  console.log('[App] Rendering App component');
  const {
    currentView,
    status,
    selectedHistoryId,
    setStatus,
    setCurrentView,
    setInitialized,
    setSelectedHistoryId,
  } = useApp();
  console.log('[App] useApp result:', { currentView, status, selectedHistoryId });
  
  const { setSettings, settings, providers } = useSettings();
  const history = useHistory();
  const chat = useChat();
  const recording = useRecordingContext();
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const toast = useToast();
  const { isDark } = useThemeContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const openSearch = useCallback(() => setIsSearchOpen(true), []);

  // In-app keyboard shortcuts (Cmd+K, Cmd+L)
  useAppShortcuts({
    onToggleSearch: useCallback(() => setIsSearchOpen(prev => !prev), []),
    onFocusChatInput: useCallback(() => {
      // If in chat view, focus the chat input via context ref
      chat.chatInputRef.current?.focus();
    }, [chat.chatInputRef]),
  });

  // Background RAG warm-up: index stale meetings so first search is fast
  useEffect(() => {
    if (history.items.length === 0) return;

    const controller = new AbortController();
    const warmUp = async () => {
      try {
        const { ragIndexer, embeddingService, hasConsent } = await import('@extensions/rag');
        // Only proceed if embedding model is already consented + cached
        // Don't trigger model download on app launch — that's user-initiated
        if (!embeddingService.isReady() && !hasConsent()) return;
        await ragIndexer.indexAll(history.items, {
          signal: controller.signal,
          extractionContext: settings.chatModel ? { settings, providers } : undefined,
        });
      } catch (error) {
        // Non-fatal — indexing will happen on first search instead
        console.log('[App] Background RAG warm-up skipped or failed:', error);
      }
    };
    warmUp();

    return () => controller.abort();
  }, [history.items.length]); // Re-run when history count changes (new meeting recorded)

  // Initialize app on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        if (isTauriEnvironment()) {
          await initializeTauriServices();
        }
        await loadAppData();
        setInitialized(true);
      } catch (e) {
        console.error('[App] Initialization error:', e);
      }
    };

    initializeApp();
  }, []);

  const initializeTauriServices = async () => {
    try {
      try { await initPlatformFetch(); } catch (e) { console.warn('Platform fetch init failed, using native fetch:', e); }
      await initializeStorage();
      await runMigrations();
      await notificationService.initialize();
      await notificationService.requestPermission();
      await windowService.initialize();
      await initializeShortcuts();
      await initializeTray();
      console.log('Tauri services initialized');
    } catch (error) {
      console.error('Failed to initialize Tauri services:', error);
    }
  };

  const initializeTray = async () => {
    try {
      await trayService.initialize(async (action) => {
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
          case TrayAction.QUIT:
            await exit(0);
            break;
        }
      });

      console.log('System tray initialized');
    } catch (error) {
      console.error('Failed to initialize tray:', error);
    }
  };

  const initializeShortcuts = async () => {
    try {
      await shortcutsService.initialize();

      shortcutsService.on(ShortcutAction.TOGGLE_RECORDING, async () => {
        if (status === AppStatus.IDLE) {
          await recording.startRecording();
        } else if (recording.status === 'recording') {
          await recording.stopRecording();
        }
      });

      shortcutsService.on(ShortcutAction.SHOW_WINDOW, async () => {
        await windowService.show();
      });

      shortcutsService.on(ShortcutAction.NEW_CHAT, () => {
        setCurrentView('home');
        setSelectedHistoryId(null);
        chat.setCurrentSessionId(null);
        setStatus(AppStatus.IDLE);
      });

      shortcutsService.on(ShortcutAction.OPEN_SETTINGS, () => {
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

  // File upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast.showToast('Processing document...', 'info');
    try {
      const data = await unifiedAIService.processDocument(file, history.categories, settings, providers);
      data.timestamp = Date.now();

      const newItem = {
        ...data,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        recordingId: crypto.randomUUID(),
      };

      await history.addToHistory(newItem);
      setStatus(AppStatus.RESULTS);
      setSelectedHistoryId(newItem.id);
      toast.showToast('Document processed successfully', 'success');
    } catch (err: any) {
      toast.showToast(err.message || 'Failed to process document', 'error');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Determine if IdleView, ChatView, or ResultsView is being shown (needs edge-to-edge layout without padding)
  const hasSelectedChat = chat.currentSessionId !== null;
  const hasSelectedMeeting = selectedHistoryId !== null;
  const showIdleView = currentView === 'home' && (
    status === AppStatus.IDLE || 
    status === AppStatus.CHAT
  );
  const showChatView = currentView === 'home' && status === AppStatus.CHAT;
  const showResultsView = currentView === 'home' && hasSelectedMeeting;

  return (
    <>
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".txt,.md,.pdf,.vtt"
        onChange={handleFileUpload}
      />

      <MainLayout onSearchClick={openSearch}>
        {/* Main Content */}
        <main
          className={`grow shrink min-h-0 flex flex-col custom-scrollbar relative ${
            currentView === 'settings' 
              ? 'p-0 items-stretch overflow-y-auto' 
              : (showIdleView || showChatView || showResultsView) 
                ? 'p-0 overflow-hidden' 
                : 'p-6 md:p-10 overflow-hidden'
          }`}
        >
          {currentView === 'home' ? <HomeView /> : <SettingsPanel />}
        </main>
      </MainLayout>

      {/* Sonner Toast Container — top-right, below title bar */}
      <Toaster
        position="top-right"
        style={{ top: '76px', right: '16px' }}
        theme={isDark ? 'dark' : 'light'}
        richColors
        closeButton
        duration={5000}
        visibleToasts={4}
        gap={8}
        icons={{ success: ' ', error: ' ', warning: ' ', info: ' ', loading: ' ' }}
      />

      {/* Search Overlay (Cmd+K) */}
      <SearchOverlay open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      {/* Recording sessions now rendered via ActivityTray */}

      {/* Unified Activity Tray — bottom-right, replaces individual widgets */}
      <ActivityTray />

      {/* RAG Model Download Consent Modal */}
      <ModelDownloadModal />

      {/* Delete Confirmation Modal - Meeting */}
      <DeleteConfirmModal
        open={!!history.deleteConfirmId}
        onOpenChange={(open) => { if (!open) history.setDeleteConfirmId(null); }}
        onConfirm={async () => {
          const success = await history.deleteItem(history.deleteConfirmId!);
          if (success) {
            toast.showToast('Session deleted successfully', 'success');
          } else {
            toast.showToast('Failed to delete session', 'error');
          }
        }}
      />

      {/* Delete Confirmation Modal - Chat */}
      <DeleteConfirmModal
        open={!!chat.deleteConfirmId}
        onOpenChange={(open) => { if (!open) chat.setDeleteConfirmId(null); }}
        onConfirm={async () => {
          try {
            await chat.deleteSession(chat.deleteConfirmId!);
            chat.setDeleteConfirmId(null);
            toast.showToast('Chat deleted successfully', 'success');
          } catch (error) {
            console.error('[App] Failed to delete chat:', error);
            toast.showToast('Failed to delete chat', 'error');
          }
        }}
      />
    </>
  );
};

export default App;
