/**
 * IdleView Component
 * 
 * Landing page when app is idle - shows main action buttons and chat composer.
 * Uses shared ChatInput component for consistent chat experience.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Key, HardDrive, ListTodo, CalendarDays } from 'lucide-react';
import { ImportButton } from '@features/import';
import { useAppActions } from '@shared/stores/appStore';
import { AppStatus } from '@shared/types';
import { useRecordingContext } from '@features/recording';
import { useChatStore } from '@features/chat';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ChatInput } from '@features/chat';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { LandingGlow } from './LandingGlow';
import { RadioCard } from '@features/settings/components/shared';
import { useVoiceCapture } from '@features/chat';
import { useSpeechInputReady } from '@features/settings/hooks/useSpeechModels';
import { LAYOUT } from '@config/layout.config';
import { UI_CONFIG } from '@config/ui.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { Button, Dot, Icon, Surface, Text } from '@shared/ui';
import { motion, AnimatePresence } from 'framer-motion';

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

  const { items: historyItems } = useHistoryData();
  const { settings, providers, isLoading: settingsLoading } = useSettings();

  const sendMessage = useChatStore((s) => s.sendMessage);
  const setInput = useChatStore((s) => s.setInput);
  const newChat = useChatStore((s) => s.newChat);
  const setSelectedMeetingRefs = useChatStore((s) => s.setSelectedMeetingRefs);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const addScreenshotAttachment = useChatStore((s) => s.addScreenshotAttachment);

  // Get available meetings for @ mention
  const availableMeetings = useMemo(() =>
    meetingReferenceService.getRecentMeetings(historyItems, 20),
    [historyItems]
  );

  const showSpeechInput = useSpeechInputReady();

  // One shared voice owner: pill state, second-beat chrome, transcript insert.
  const appendTranscript = useCallback((text: string) => {
    const currentInput = useChatStore.getState().input;
    setInput(currentInput ? `${currentInput} ${text}` : text);
  }, [setInput]);

  const voice = useVoiceCapture({ settings, providers, appendTranscript });


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
    // Full-bleed background: pull up over MainLayout's titlebar safe-area
    // padding and compensate with equal inner padding, so LandingGlow
    // (plain inset-0) paints continuously under the drag strip while flow
    // content stays exactly where the layout intends. Both offsets derive
    // from UI_CONFIG.layout.titlebar.safeArea — no magic numbers here.
    <div
      className="flex-1 w-full flex flex-col animate-fade-in relative"
      style={{
        marginTop: -UI_CONFIG.layout.titlebar.safeArea,
        paddingTop: UI_CONFIG.layout.titlebar.safeArea,
      }}
    >
      <LandingGlow paused={voice.isVoiceActive} />

      {/* Settings load asynchronously over Tauri IPC — until they arrive the
         provider list is empty and we can't tell zero-state from landing.
         Gate the first paint on the same flag SettingsPanel uses, with a
         skeleton mirroring the landing layout so load-in is seamless. */}
      {settingsLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center w-full px-2 relative z-20">
          <div className={`${LAYOUT.chatColumn} space-y-6`}>
            <Surface variant="inset" radius="full" className="mx-auto h-7 w-56 animate-pulse" />
            <Surface variant="inset" radius="xl" className="h-14 w-full animate-pulse" />
            <div className="flex justify-center gap-2">
              <Surface variant="inset" radius="full" className="h-8 w-20 animate-pulse" />
              <Surface variant="inset" radius="full" className="h-8 w-20 animate-pulse" />
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Chat Composer - Centered in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center w-full px-2 relative z-20">
        <div className={`${LAYOUT.chatColumn} space-y-6 overflow-visible`}>
          {hasConfiguredProviders ? (
            <>
              {/* Greeting — fades out while the voice pill owns the view */}
              <AnimatePresence initial={false}>
                {!voice.isVoiceActive && (
                  <motion.div
                    key="greeting"
                    className="text-center"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                    transition={voice.chromeEnter}
                  >
                    <Text as="h1" variant="display">{greeting}</Text>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Shared ChatInput — glides to the bottom of the chat on first send */}
              <motion.div layout="position" layoutId={ANIMATION_CONFIG.chat.composerLayoutId} transition={ANIMATION_CONFIG.chat.composerGlide}>
                <ChatInput
                  value={chatInput}
                  onChange={setInput}
                  onSend={handleSendMessage}
                  isLoading={isGenerating}
                  placeholder="Type @ to add meeting context..."
                  availableMeetings={availableMeetings}
                  selectedMeetings={selectedMeetingRefs}
                  onMeetingSelect={setSelectedMeetingRefs}
                  attachments={pendingAttachments}
                  onAttach={addAttachment}
                  onRemoveAttachment={removeAttachment}
                  onScreenshot={addScreenshotAttachment}
                  showSpeechInput={showSpeechInput}
                  speechState={voice.speech.state}
                  micStream={voice.speech.stream}
                  speechElapsed={voice.speech.elapsed}
                  onSpeechStart={voice.speech.start}
                  onSpeechStop={voice.handleSpeechStop}
                  onSpeechTogglePause={voice.speech.togglePause}
                  onSpeechCancel={voice.speech.cancel}
                />
              </motion.div>

              {/* Action Chips — hidden while the voice pill owns the view */}
              <AnimatePresence initial={false}>
                {!voice.isVoiceActive && (
                  <motion.div
                    key="action-chips"
                    className="flex flex-wrap items-center justify-center gap-2"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
                    transition={voice.chromeEnter}
                  >
                    <Button variant="outline" size="sm" onClick={handleStartRecording} disabled={!recording.canRecord}>
                      <Dot tone="danger" />
                      Record
                    </Button>
                    <ImportButton />
                    {historyItems.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleOpenReminders}>
                        <Icon icon={ListTodo} size="xs" />
                        To-Dos
                      </Button>
                    )}
                    {settings.calendarIntegration?.enabled && (
                      <Button variant="outline" size="sm" onClick={handleOpenCalendar}>
                        <Icon icon={CalendarDays} size="xs" />
                        Upcoming
                      </Button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <>
              {/* Zero-state: Setup guidance */}
              <div className="text-center space-y-2">
                <Text as="h1" variant="display">
                  Welcome to Kasset
                </Text>
                <Text as="p" tone="muted">
                  Set up a provider to start chatting and get AI summaries
                </Text>
              </div>

              {/* Setup cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <RadioCard
                  selected={false}
                  onClick={handleSetupProviders}
                  icon={<Icon icon={Key} size="md" />}
                >
                  <div className="space-y-1">
                    <Text as="p" variant="bodyStrong">Cloud Providers</Text>
                    <Text as="p" variant="helper" tone="muted">
                      Connect OpenAI, Anthropic, Google, and more with an API key
                    </Text>
                  </div>
                </RadioCard>

                <RadioCard
                  selected={false}
                  onClick={handleSetupProviders}
                  icon={<Icon icon={HardDrive} size="md" />}
                >
                  <div className="space-y-1">
                    <Text as="p" variant="bodyStrong">Local Models</Text>
                    <Text as="p" variant="helper" tone="muted">
                      Use Ollama, LM Studio, or another server running on this Mac
                    </Text>
                  </div>
                </RadioCard>
              </div>

              {/* Record button — always available */}
              <div className="flex flex-col items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleStartRecording} disabled={!recording.canRecord}>
                  <Dot tone="danger" />
                  Record
                </Button>
                <Text as="p" variant="helper" tone="faint">
                  Recording works offline. Set up a provider for AI summaries.
                </Text>
              </div>
            </>
          )}
        </div>
      </div>
      </>
      )}

    </div>
  );
};

export default IdleView;
