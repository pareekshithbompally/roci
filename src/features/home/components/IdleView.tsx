/** Idle landing page: main actions and the shared chat composer. */

import React, { useMemo, useState, useCallback } from 'react';
import { ListTodo, CalendarDays } from 'lucide-react';
import { ImportButton } from '@features/import';
import { useAppActions } from '@shared/stores/appStore';
import { useRecordingBusy, useRecordingMeetingId, useStartRecording } from '@features/recording';
import { isTauriEnvironment } from '@services/tauri';
import { askInNewChat, canSendDraft, useChatStore } from '@features/chat';
import { useHistoryData } from '@shared/contexts/HistoryContext';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ChatInput } from '@features/chat';
import { meetingReferenceService } from '@services/meetingReferenceService';
import { LandingGlow } from './LandingGlow';
import { useVoiceCapture } from '@features/chat';
import { useSpeechInputReady } from '@features/settings/hooks/useSpeechModels';
import { useAIReadiness, useOpenAISetup } from '@features/settings';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { Button, Dot, Icon, Surface, Text, TitlebarSpacer } from '@shared/ui';
import { motion } from 'framer-motion';
import { platform } from '@platform/index';
import { isIntegrationEnabled } from '@shared/utils/integrations';

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
  const { setCurrentView } = useAppActions();
  const [greeting] = useState(() => GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)]);
  const startRecording = useStartRecording();
  const recordingMeetingId = useRecordingMeetingId();
  const recordingBusy = useRecordingBusy();
  const canRecord = isTauriEnvironment() && !recordingMeetingId && !recordingBusy;

  const chatInput = useChatStore((s) => s.input);
  const isGenerating = useChatStore((s) => s.replyingSessionId !== null);
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);
  const selectedMeetingRefs = useChatStore((s) => s.selectedMeetingRefs);

  const { items: historyItems } = useHistoryData();
  const { settings, providers, isLoading: settingsLoading } = useSettings();

  const setInput = useChatStore((s) => s.setInput);
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


  const hasConfiguredProviders = useAIReadiness().text;
  const handleSetupProviders = useOpenAISetup();

  const handleOpenReminders = () => {
    setCurrentView('reminders');
  };

  const handleOpenCalendar = () => {
    setCurrentView('calendar');
  };

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      console.error('[IdleView] Failed to start recording:', error);
    }
  };

  const handleSendMessage = () => {
    if (!canSendDraft(chatInput, pendingAttachments) || isGenerating) return;
    askInNewChat();
  };

  return (
    // Full-bleed so LandingGlow paints under the titlebar; the spacer keeps content below it.
    <div className="flex-1 w-full flex flex-col animate-fade-in relative">
      <LandingGlow paused={voice.isVoiceActive} />
      <TitlebarSpacer />

      {/* Settings load async; until then show a skeleton so an empty provider list is not read as zero-state. */}
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
              {/* Stays mounted and only fades, so the column never reflows under the voice pill. */}
              <motion.div
                className="text-center"
                initial={false}
                animate={voice.isVoiceActive ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
                transition={voice.isVoiceActive ? { duration: 0.2 } : voice.chromeEnter}
                aria-hidden={voice.isVoiceActive || undefined}
              >
                <Text as="h1" variant="display">{greeting}</Text>
              </motion.div>
              {/* Shared ChatInput — glides to the bottom of the chat on first send */}
              <motion.div
                layout="position"
                layoutId={ANIMATION_CONFIG.chat.composerLayoutId}
                layoutDependency={ANIMATION_CONFIG.chat.composerLayoutDependency.idle}
                transition={ANIMATION_CONFIG.chat.composerGlide}
              >
                <ChatInput
                  value={chatInput}
                  onChange={setInput}
                  onSend={handleSendMessage}
                  isLoading={isGenerating}
                  disabled={!hasConfiguredProviders}
                  placeholder={hasConfiguredProviders ? 'Type @ to add meeting context...' : 'Set up AI to start chatting'}
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
                  liveText={voice.speech.liveText}
                  speechElapsed={voice.speech.elapsed}
                  onSpeechStart={voice.speech.start}
                  onSpeechStop={voice.handleSpeechStop}
                  onSpeechTogglePause={voice.speech.togglePause}
                  onSpeechCancel={voice.speech.cancel}
                />
              </motion.div>

              {/* Action Chips — fade in place while the voice pill owns the view (same reason) */}
              <motion.div
                className="flex flex-wrap items-center justify-center gap-2"
                initial={false}
                animate={voice.isVoiceActive ? { opacity: 0, y: 8 } : { opacity: 1, y: 0 }}
                transition={voice.isVoiceActive ? { duration: 0.2 } : voice.chromeEnter}
                aria-hidden={voice.isVoiceActive || undefined}
                inert={voice.isVoiceActive || undefined}
              >
                {platform.canRecord && (
                  <Button variant="outline" size="sm" onClick={handleStartRecording} disabled={!canRecord}>
                    <Dot tone="danger" />
                    Record
                  </Button>
                )}
                <ImportButton />
                {historyItems.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handleOpenReminders}>
                    <Icon icon={ListTodo} size="xs" />
                    To-Dos
                  </Button>
                )}
                {isIntegrationEnabled(settings, 'calendar') && (
                  <Button variant="outline" size="sm" onClick={handleOpenCalendar}>
                    <Icon icon={CalendarDays} size="xs" />
                    Upcoming
                  </Button>
                )}
              </motion.div>

              {/* No AI yet (set up later): everything shows, chat waits for a provider. */}
              {!hasConfiguredProviders && (
                <div className="flex items-center justify-center gap-2">
                  <Text as="p" variant="helper" tone="faint">Chat, transcripts and summaries need an AI.</Text>
                  <Button variant="ghost" size="sm" onClick={handleSetupProviders}>Set up AI</Button>
                </div>
              )}
        </div>
      </div>
      </>
      )}

    </div>
  );
};

export default IdleView;
