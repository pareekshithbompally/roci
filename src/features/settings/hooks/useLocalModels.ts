/** Local models for every surface: list query, per-model download/delete controls, picker step, download events. */

import { useEffect, useMemo, useRef } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { isTauriEnvironment } from '@services/tauri';
import { platform } from '@platform/index';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { activityStore, useActivityItems, type ActivityItem } from '@shared/stores/activityStore';
import { notifyAppEvent } from '@shared/utils/appEvents';
import { failureLogger } from '@shared/utils/errors';
import { formatFileSize } from '@shared/utils/formatters';
import { useTauriEvent } from '@shared/hooks/useTauriEvent';
import { useLocalModels } from '@shared/hooks/useLocalModels';
import { modelKey } from '@services/ai/models';
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import {
  cancelLocalModelDownload,
  downloadLocalModel,
  downloadPercent,
  removeLocalModel,
  setLocalModelIdle,
} from '@services/localModels.service';
import type { LocalModel, LocalModelDownload } from '@services/localModels.service';
import { confirmModelDelete, type OnDeviceModel } from '@shared/utils/onDeviceModel';
import type { AppSettings } from '@shared/types';
import type { ChoiceSetup } from '@shared/utils/modelResolver';

const report = failureLogger('useLocalModels');
const { activityId } = LOCAL_MODELS_CONFIG;
const modelsKey = queryKeys.localModels();
const ON_DEVICE = LOCAL_MODELS_CONFIG.provider.id;
const onDeviceKey = (model: string): string => modelKey({ provider: ON_DEVICE, model });

function nameOf(id: string): string {
  return queryClient.getQueryData<LocalModel[]>(modelsKey)?.find((m) => m.id === id)?.name ?? id;
}

const cancelAction = (id: string) => ({
  icon: 'x', label: 'Cancel', onClick: () => void cancelLocalModelDownload(id).catch(report('cancel')),
});

/** The activity tray row for a download (once per download). */
function showActivity(id: string): void {
  if (activityStore.get(activityId(id))) return;
  activityStore.add({
    id: activityId(id),
    type: 'download',
    label: `Downloading ${nameOf(id)}`,
    status: 'active',
    percent: 0,
    step: null,
    detail: null,
    error: null,
    actions: [cancelAction(id)],
  });
}

/** One label, Cancel and continuous progress for the whole download, whichever file is in flight. */
function showDownloading(download: LocalModelDownload): void {
  showActivity(download.id); // also after a webview reload mid-download
  activityStore.update(activityId(download.id), {
    label: `Downloading ${nameOf(download.id)}`,
    percent: downloadPercent(download),
    detail: `${formatFileSize(download.received)} of ${formatFileSize(download.total)}`,
    actions: [cancelAction(download.id)],
  });
}

function startDownload(id: string): void {
  showActivity(id);
  downloadLocalModel(id).catch((error: unknown) => {
    activityStore.remove(activityId(id));
    report('download')(error);
  });
}

function useRemoveLocalModel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: removeLocalModel,
    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: modelsKey });
      const previous = client.getQueryData<LocalModel[]>(modelsKey);
      client.setQueryData<LocalModel[]>(modelsKey, previous?.map((m) => (m.id === id ? { ...m, installed: false } : m)));
      return { previous };
    },
    onError: (error: unknown, _id, context) => {
      client.setQueryData(modelsKey, context?.previous);
      report('delete')(error);
    },
    onSettled: () => client.invalidateQueries({ queryKey: modelsKey }),
  });
}

function controlOf(model: LocalModel, activity: ActivityItem | undefined, remove: (id: string) => void): OnDeviceModel {
  const busy = model.downloading || !!activity;
  const status = model.installed ? 'ready' : busy ? 'busy' : 'idle';
  return {
    status,
    percent: busy ? (activity?.percent ?? null) : null,
    download: () => startDownload(model.id),
    cancel: () => void cancelLocalModelDownload(model.id).catch(report('cancel')),
    remove: () => remove(model.id),
  };
}

/** Every local model's control, by id. */
export function useLocalModelControls(): Record<string, OnDeviceModel> {
  const { data: models = [] } = useLocalModels();
  const activities = useActivityItems();
  const { mutate } = useRemoveLocalModel();
  return useMemo(() => {
    const remove = (id: string) => {
      const model = models.find((m) => m.id === id);
      if (!model) return;
      void confirmModelDelete(model.name, formatFileSize(model.bytes)).then((confirmed) => confirmed && mutate(id));
    };
    return Object.fromEntries(models.map((m) => [m.id, controlOf(m, activities.find((a) => a.id === activityId(m.id)), remove)]));
  }, [models, activities, mutate]);
}

/** The step a picker row shows until its model is downloaded. */
export function downloadSetup(control: OnDeviceModel | undefined): ChoiceSetup | undefined {
  if (!control || control.status === 'ready') return undefined;
  return { kind: 'download', busy: control.status === 'busy', percent: control.percent, run: control.download };
}

function applyDownload(download: LocalModelDownload): void {
  const id = activityId(download.id);
  switch (download.state) {
    case 'downloading':
      showDownloading(download);
      return;
    case 'verifying':
      // A model of several files is checked file by file: it stays "Downloading" (with Cancel) until the last one.
      if (download.received < download.total) return showDownloading(download);
      activityStore.update(id, { label: `Checking ${nameOf(download.id)}`, percent: 100, detail: 'Verifying the download', actions: [] });
      return;
    case 'done':
      notifyAppEvent({ id, kind: 'modelDownloads', tone: 'success', inFront: 'toast', title: `${nameOf(download.id)} is ready`, body: 'Download finished.' });
      break;
    case 'failed':
      notifyAppEvent({ id, kind: 'modelDownloads', tone: 'error', inFront: 'toast', title: `${nameOf(download.id)} didn't download`, body: download.error ?? 'Try again.' });
      break;
    case 'cancelled':
      break;
  }
  activityStore.remove(id);
  void queryClient.invalidateQueries({ queryKey: modelsKey });
}

export function useLocalModelDownloads(): void {
  useTauriEvent<LocalModelDownload>(LOCAL_MODELS_CONFIG.downloadEvent, applyDownload);
}

/** Keeps the engines' idle time in step with Settings (sent at launch and on every change). */
export function useLocalModelIdle(): void {
  const minutes = useSettings().settings.modelIdleMinutes ?? LOCAL_MODELS_CONFIG.idle.defaultMinutes;
  useEffect(() => {
    if (!platform.hasLocalModels || !isTauriEnvironment()) return;
    setLocalModelIdle(minutes).catch(report('idle'));
  }, [minutes]);
}

/** The settings that name an on-device model, as each stores it. */
function selectedOnDevice(settings: AppSettings): Set<string | undefined> {
  const speech = settings.transcriptionProvider === ON_DEVICE ? settings.transcriptionModel : undefined;
  return new Set([settings.chatModel, settings.analyzeModel, speech && onDeviceKey(speech)]);
}

/** Once per launch: a selected model whose download was interrupted (Roci quit) carries on where it stopped. */
export function useLocalModelResume(): void {
  const { settings, isLoading } = useSettings();
  const { data: models } = useLocalModels();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || isLoading || !models) return;
    checked.current = true;
    const selected = selectedOnDevice(settings);
    models
      .filter((m) => m.partial && !m.downloading && selected.has(onDeviceKey(m.id)))
      .forEach((m) => startDownload(m.id));
  }, [isLoading, models, settings]);
}

export interface ChatModelDownload {
  name: string;
  percent: number | null;
  /** Stopped before it finished: `retry` carries on. */
  stopped: boolean;
  retry: () => void;
}

/** The chat model on this device until it is ready, for home to say chat is on its way or offer to carry on; null once it
 *  is ready, or when chat isn't an on-device model. */
export function useChatModelDownload(): ChatModelDownload | null {
  const { settings } = useSettings();
  const { data: models = [] } = useLocalModels();
  const controls = useLocalModelControls();
  const model = models.find((m) => m.kind === 'chat' && onDeviceKey(m.id) === settings.chatModel);
  const control = model && controls[model.id];
  if (!model || !control || control.status === 'ready') return null;
  return { name: model.name, percent: control.percent, stopped: control.status === 'idle', retry: control.download };
}
