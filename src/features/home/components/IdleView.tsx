/**
 * IdleView Component
 * 
 * Landing page when app is idle - shows main action buttons and chat composer.
 * Uses shared ChatInput component for consistent chat experience.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { AudioWaveform, Key, HardDrive, ListTodo, CalendarDays } from 'lucide-react';
import { ImportButton } from '@features/import';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useRecordingContext } from '@features/recording';
import { useChatStore } from '@features/chat/stores';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ChatInput } from '@features/chat';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { RadioCard } from '@features/settings/components/shared';
import { supportsWebSearch } from '@shared/utils/modelResolver';
import { useSpeechInput } from '@features/chat/hooks/useSpeechInput';
import { useEngineReady } from '@features/settings/hooks/useEngineReadiness';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, TEXT, BORDER, COMPONENT } from '@config/theme.config';

interface IdleViewProps {}

const GREETING_POOL = [
  'Ready to explore some new ideas?',
  'What\u2019s on your mind today?',
  'Let\u2019s dive into something new!',
  'What shall we discover right now?',
  'Tell me what you\u2019re seeking',
  'Where would you like to start?',
  'I\u2019m listening, go ahead!',
  'Ready when you are!',
  'How can I help?',
];

export const IdleView: React.FC<IdleViewProps> = () => {
  const { setStatus, setCurrentView, setActiveSettingsPanel } = useAppActions();
  const [greeting] = useState(() => GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)]);
  const recording = useRecordingContext();

  const chatInput = useChatStore((s) => s.input);
  const isGenerating = useChatStore((s) => s.isLoading);
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);
  const selectedMeetingRefs = useChatStore((s) => s.selectedMeetingRefs);
  const webSearchEnabled = useChatStore((s) => s.webSearchEnabled);

  const { items: historyItems } = useHistoryData();
  const { settings, providers } = useSettings();

  const sendMessage = useChatStore((s) => s.sendMessage);
  const setInput = useChatStore((s) => s.setInput);
  const newChat = useChatStore((s) => s.newChat);
  const toggleWebSearch = useChatStore((s) => s.toggleWebSearch);
  const setSelectedMeetingRefs = useChatStore((s) => s.setSelectedMeetingRefs);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const addScreenshotAttachment = useChatStore((s) => s.addScreenshotAttachment);

  // Get available meetings for @ mention
  const availableMeetings = useMemo(() =>
    meetingReferenceService.getRecentMeetings(historyItems, 20),
    [historyItems]
  );

  const showSpeechInput = useEngineReady(settings.transcriptionModel);

  const speech = useSpeechInput(settings, providers);

  const handleSpeechStop = useCallback(async () => {
    const text = await speech.stop();
    if (text) {
      const currentInput = useChatStore.getState().input;
      setInput(currentInput ? `${currentInput} ${text}` : text);
    }
  }, [speech, setInput]);

  // Check if current model supports web search
  const showWebSearch = useMemo(() => {
    for (const provider of providers) {
      if (!provider.active) continue;
      const model = provider.models?.find(m => m.id === settings.chatModel);
      if (model) {
        return supportsWebSearch(provider.provider);
      }
    }
    return false;
  }, [settings.chatModel, providers]);

  // Check if any provider is configured with models
  const hasConfiguredProviders = useMemo(() => {
    return providers.some(p => p.active && p.models && p.models.length > 0);
  }, [providers]);

  const handleSetupProviders = () => {
    setActiveSettingsPanel('providers');
    setCurrentView('settings');
  };

  const handleOpenReminders = () => {
    setCurrentView('reminders');
  };

  const handleOpenCalendar = () => {
    setCurrentView('calendar');
  };

  const handleStartRecording = async () => {
    try {
      await recording.startRecording();
    } catch (error) {
      console.error('[IdleView] Failed to start recording:', error);
    }
  };

  const handleSendMessage = () => {
    if (!chatInput.trim() || isGenerating) return;

    // Capture input before clearing
    const messageText = chatInput;

    // Clear any existing session to start fresh
    newChat();

    // Switch to CHAT view immediately
    setStatus(AppStatus.CHAT);

    // Send the message — store handles session creation atomically
    sendMessage(messageText);
  };

  return (
    <div className="flex-1 w-full flex flex-col animate-fade-in relative">
      
      {/* Chat Composer - Centered in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-2 relative z-20">
        <div className="w-full max-w-3xl space-y-6 overflow-visible">
          {hasConfiguredProviders ? (
            <>
              {/* Greeting */}
              <h1 className={`text-2xl md:text-3xl font-medium text-center ${TEXT.heading}`}>
                {greeting}
              </h1>
              {/* Shared ChatInput component */}
              <ChatInput
                value={chatInput}
                onChange={setInput}
                onSend={handleSendMessage}
                isLoading={isGenerating}
                placeholder="Type @ to add meeting context..."
                availableMeetings={availableMeetings}
                selectedMeetings={selectedMeetingRefs}
                onMeetingSelect={setSelectedMeetingRefs}
                webSearchEnabled={webSearchEnabled}
                onWebSearchToggle={toggleWebSearch}
                showWebSearch={showWebSearch}
                attachments={pendingAttachments}
                onAttach={addAttachment}
                onRemoveAttachment={removeAttachment}
                onScreenshot={addScreenshotAttachment}
                showSpeechInput={showSpeechInput}
                speechState={speech.state}
                micStream={speech.stream}
                speechElapsed={speech.elapsed}
                onSpeechStart={speech.start}
                onSpeechStop={handleSpeechStop}
                onSpeechCancel={speech.cancel}
              />

              {/* Action Chips */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={handleStartRecording}
                  disabled={!recording.canRecord}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 border border-red-600/50 dark:border-red-700/50 rounded-full text-sm font-medium text-white hover:shadow-lg hover:shadow-red-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AudioWaveform className="w-4 h-4" />
                  <span>Record</span>
                </button>
                <ImportButton />
                {historyItems.length > 0 && (
                  <button
                    onClick={handleOpenReminders}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 ${SURFACE.card} border ${BORDER.strong} rounded-full text-sm font-medium ${TEXT.secondary} hover:${TEXT.heading} transition-all`}
                  >
                    <ListTodo className="w-4 h-4" />
                    <span>To-Dos</span>
                  </button>
                )}
                {settings.calendarIntegration?.enabled && (
                  <button
                    onClick={handleOpenCalendar}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 ${SURFACE.card} border ${BORDER.strong} rounded-full text-sm font-medium ${TEXT.secondary} hover:${TEXT.heading} transition-all`}
                  >
                    <CalendarDays className="w-4 h-4" />
                    <span>Upcoming</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Zero-state: Setup guidance */}
              <div className="text-center space-y-2">
                <h1 className={`text-2xl md:text-3xl font-medium ${TEXT.heading}`}>
                  Welcome to Kasset
                </h1>
                <p className={`${TYPOGRAPHY_CLASSES.settingsInput} ${TEXT.muted}`}>
                  Set up a provider to start chatting and get AI summaries
                </p>
              </div>

              {/* Setup cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <RadioCard
                  selected={false}
                  onClick={handleSetupProviders}
                  icon={<Key className="w-5 h-5" />}
                >
                  <div className="space-y-1">
                    <p className={`text-sm font-medium ${TEXT.heading}`}>Cloud Providers</p>
                    <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                      Connect OpenAI, Anthropic, Google, and more with an API key
                    </p>
                  </div>
                </RadioCard>

                <RadioCard
                  selected={false}
                  onClick={handleSetupProviders}
                  icon={<HardDrive className="w-5 h-5" />}
                >
                  <div className="space-y-1">
                    <p className={`text-sm font-medium ${TEXT.heading}`}>Local Models</p>
                    <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                      Use Ollama, LM Studio, or another server running on this Mac
                    </p>
                  </div>
                </RadioCard>
              </div>

              {/* Record button — always available */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={handleStartRecording}
                  disabled={!recording.canRecord}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 border border-red-600/50 dark:border-red-700/50 rounded-full text-sm font-medium text-white hover:shadow-lg hover:shadow-red-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AudioWaveform className="w-4 h-4" />
                  <span>Record</span>
                </button>
                <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                  Recording works offline. Set up a provider for AI summaries.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
};

export default IdleView;
