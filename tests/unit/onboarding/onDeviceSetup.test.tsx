import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LocalModel } from '@services/localModels.service';

const setSettings = vi.fn();
const finish = vi.fn();
const setStep = vi.fn();
const download = vi.fn();
const models = vi.hoisted(() => ({ list: [] as LocalModel[] }));

const model = (id: string, kind: LocalModel['kind'], bytes: number, installed = false): LocalModel => ({
  id, name: id, maker: 'm', kind, streams: false, bytes, installed, downloading: false, contextTokens: null, tools: null, vision: null,
});

vi.mock('@shared/hooks/useLocalModels', () => ({ useLocalModels: () => ({ data: models.list }) }));
vi.mock('@shared/contexts/SettingsContext', () => ({ useSettings: () => ({ setSettings }) }));
vi.mock('@features/onboarding/hooks/useFinishOnboarding', () => ({ useFinishOnboarding: () => finish }));
vi.mock('@features/onboarding/stores/onboardingStore', () => ({ useSetOnboardingStep: () => setStep }));
vi.mock('@shared/components', () => ({ JOB_GLYPH: { chat: 'c', transcription: 't', readAloud: 'r', summaries: 's' }, ModelDownloadButton: () => null }));
vi.mock('@features/settings', () => ({
  CapabilityRow: ({ job, children }: { job: { title: string }; children: React.ReactNode }) => <div>{job.title}{children}</div>,
  ModelSelect: ({ value }: { value?: string }) => <span>{value}</span>,
  useLocalModelControls: () => Object.fromEntries(models.list.map((m) => [m.id, {
    status: m.installed ? 'ready' : 'idle', percent: null, download: () => download(m.id), cancel: vi.fn(), remove: vi.fn(),
  }])),
}));

// eslint-disable-next-line import/first
import { OnDeviceSetup } from '@features/onboarding/components/OnDeviceSetup';

beforeEach(() => {
  vi.clearAllMocks();
  models.list = [model('chat-a', 'chat', 2e9), model('chat-b', 'chat', 1e9), model('stt', 'speech', 6e8), model('tts', 'voice', 3e8, true)];
});

describe('OnDeviceSetup', () => {
  it('starts each job on its first model, summaries on the chat model', () => {
    render(<OnDeviceSetup />);
    expect(screen.getByText('chat-a')).toBeInTheDocument();
    expect(screen.getByText('stt')).toBeInTheDocument();
    expect(screen.getByText('tts')).toBeInTheDocument();
    expect(screen.getByText('same-as-chat')).toBeInTheDocument();
  });

  it('Start makes the picks the defaults, downloads what is missing, and waits until they are done', () => {
    const { rerender } = render(<OnDeviceSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Download and Start' }));
    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({
      chatModel: 'chat-a', analyzeModel: undefined, transcriptionProvider: 'on-device', transcriptionModel: 'stt', readAloudEngine: 'tts',
    }));
    expect(download.mock.calls.map(([id]) => id)).toEqual(['chat-a', 'stt']);
    expect(finish).not.toHaveBeenCalled();

    models.list = models.list.map((m) => ({ ...m, installed: true }));
    rerender(<OnDeviceSetup />);
    expect(finish).toHaveBeenCalledOnce();
  });

  it('Back leaves the settings as they were', () => {
    render(<OnDeviceSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(setStep).toHaveBeenCalledWith('setup');
    expect(setSettings).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
