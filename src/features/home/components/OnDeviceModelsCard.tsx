/**
 * OnDeviceModelsCard — zero-state onboarding for local models.
 *
 * Shows only before first setup: two downloadable models, plain names,
 * real model identities, one Hugging Face attribution. A Download press
 * is consent and starts the download; Skip dismisses the card for good
 * (Settings → Capabilities holds the only other copy).
 */

import React, { useState } from 'react';
import { Search, Volume2 } from 'lucide-react';
import { SiHuggingface } from '@icons-pack/react-simple-icons';
import { open } from '@tauri-apps/plugin-shell';
import { ModelDownloadButton } from '@shared/components';
import { useOnDeviceModel } from '@shared/hooks/useOnDeviceModel';
import type { OnDeviceModel } from '@shared/hooks/useOnDeviceModel';
import { Button, Icon, Progress, Separator, Surface, Text } from '@shared/ui';

const DISMISSED_KEY = 'onboarding_models_dismissed';

const RAG_REPO_URL = 'https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX';
const VOICE_REPO_URL = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // localStorage unavailable
  }
}

interface ModelRow {
  key: string;
  icon: typeof Search;
  title: string;
  purpose: string;
  modelName: string;
  modelUrl: string;
  model: OnDeviceModel;
}

export const OnDeviceModelsCard: React.FC = () => {
  const searchModel = useOnDeviceModel('rag');
  const voiceModel = useOnDeviceModel('voice');
  const [dismissed, setDismissedState] = useState(isDismissed);

  // Zero state only, and only until dismissed or done.
  if (dismissed || (searchModel.status === 'ready' && voiceModel.status === 'ready')) return null;

  const dismiss = () => {
    setDismissed();
    setDismissedState(true);
  };

  const rows: ModelRow[] = [
    {
      key: 'search',
      icon: Search,
      title: 'Meeting search',
      purpose: 'Find anything across your meetings',
      modelName: 'EmbeddingGemma 300M',
      modelUrl: RAG_REPO_URL,
      model: searchModel,
    },
    {
      key: 'voice',
      icon: Volume2,
      title: 'Text to speech',
      purpose: 'Listen to any reply',
      modelName: 'Kokoro 82M',
      modelUrl: VOICE_REPO_URL,
      model: voiceModel,
    },
  ];

  const openRepo = (url: string) => () => {
    open(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
  };

  return (
    <Surface variant="card" radius="lg" edge="all" className="w-full p-4">
      <Text as="h2" variant="title">
        On-device models
      </Text>
      <Text as="p" variant="helper" tone="muted" className="mt-0.5">
        Search and voice run privately on your Mac.
      </Text>

      <div className="mt-3">
        {rows.map((row, index) => (
          <React.Fragment key={row.key}>
            {index > 0 && <Separator className="my-3" />}
            <div className="flex items-center gap-3">
              <Surface
                variant="inset"
                radius="md"
                className="flex h-9 w-9 shrink-0 items-center justify-center"
              >
                <Icon icon={row.icon} size="sm" tone="muted" />
              </Surface>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <Text variant="bodyStrong" truncate>
                    {row.title}
                  </Text>
                  <div className="shrink-0">
                    <ModelDownloadButton model={row.model} />
                  </div>
                </div>
                {row.model.status === 'busy' ? (
                  <Progress percent={row.model.percent} tone="success" className="mt-1.5" />
                ) : (
                  <Text variant="helper" tone="muted" truncate className="mt-0.5">
                    {row.purpose} ·{' '}
                    <a
                      href={row.modelUrl}
                      onClick={(e) => {
                        e.preventDefault();
                        openRepo(row.modelUrl)();
                      }}
                      className="underline decoration-dotted underline-offset-2"
                    >
                      {row.modelName}
                    </a>
                  </Text>
                )}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <Separator className="mt-3" />
      <div className="flex items-center justify-between gap-2 pt-3">
        <Text variant="helper" tone="faint" className="flex min-w-0 items-center gap-1.5">
          <SiHuggingface size={14} className="shrink-0" aria-hidden />
          <span className="truncate">Models download live from Hugging Face</span>
        </Text>
        <Button variant="ghost" size="sm" onClick={dismiss} className="shrink-0">
          Skip
        </Button>
      </div>
    </Surface>
  );
};

export default OnDeviceModelsCard;
