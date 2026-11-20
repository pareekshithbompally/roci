/** Idle landing page: main actions and the shared chat composer. */

import React, { useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { RecordPill } from '@features/recording';
import { askInNewChat, canSendDraft, useChatStore } from '@features/chat';
import { useSettings } from '@shared/contexts/SettingsContext';
import { ChatInput } from '@features/chat';
import { LandingGlow } from './LandingGlow';
import { useVoiceCapture } from '@features/chat';
import { useSpeechInputReady } from '@features/settings/hooks/useSpeechModels';
import { useAIReadiness, useOpenAISetup } from '@features/settings';
import { LAYOUT } from '@config/layout.config';
import { ANIMATION_CONFIG } from '@config/animations.config';
import { Button, cn, Icon, Surface, Text, TitlebarSpacer } from '@shared/ui';
import { motion } from 'framer-motion';
import { platform } from '@platform/index';
import { useFormFactor } from '@platform/formFactor';

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
  const [greeting] = useState(() => GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)]);

  const chatInput = useChatStore((s) => s.input);
  const isGenerating = useChatStore((s) => s.replyingSessionId !== null);
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);
  const selectedMeetingRefs = useChatStore((s) => s.selectedMeetingRefs);

  const { settings, providers, isLoading: settingsLoading } = useSettings();

  const setInput = useChatStore((s) => s.setInput);
  const setSelectedMeetingRefs = useChatStore((s) => s.setSelectedMeetingRefs);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const addScreenshotAttachment = useChatStore((s) => s.addScreenshotAttachment);


  const showSpeechInput = useSpeechInputReady();

  // One shared voice owner: pill state, second-beat chrome, transcript insert.
  const appendTranscript = useCallback((text: string) => {
    const currentInput = useChatStore.getState().input;
    setInput(currentInput ? `${currentInput} ${text}` : text);
  }, [setInput]);

  const voice = useVoiceCapture({ settings, providers, appendTranscript });


  const hasConfiguredProviders = useAIReadiness().text;
  const handleSetupProviders = useOpenAISetup();
  // Phone: the greeting fills the screen and the composer sits at the bottom, above the keyboard.
  const phone = useFormFactor() === 'phone';

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
      {/* Chat composer: centred in the remaining space (desktop); pinned to the bottom (phone). */}
      <div className={cn('relative z-20 flex w-full flex-1 flex-col', phone ? 'px-3' : 'items-center justify-center px-2')}>
        <div className={phone ? 'flex flex-1 flex-col gap-4' : `${LAYOUT.chatColumn} space-y-6 overflow-visible`}>
              {/* Stays mounted and only fades, so the column never reflows under the voice pill. */}
              <motion.div
                className={cn('text-center', phone && 'flex flex-1 items-center justify-center')}
                initial={false}
                animate={voice.isVoiceActive ? { opacity: 0, y: -8 } : { opacity: 1, y: 0 }}
                transition={voice.isVoiceActive ? { duration: 0.2 } : voice.chromeEnter}
                aria-hidden={voice.isVoiceActive || undefined}
              >
                <Text as="h1" variant="display">{greeting}</Text>
              </motion.div>
              {/* Shared ChatInput — glides to the bottom of the chat on first send */}
              <motion.div
                className={cn(phone && 'order-last')}
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
                {platform.canRecord && <RecordPill />}
              </motion.div>

              {/* No AI yet (set up later): everything shows, chat waits for a provider. */}
              {!hasConfiguredProviders && (
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={handleSetupProviders}>
                    Set up AI to start
                    <Icon icon={ChevronRight} size="xs" />
                  </Button>
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
