/** Local models for every surface: list query, per-model download/delete controls, picker step, download events. */

import { useEffect, useMemo } from 'react';
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
import { LOCAL_MODELS_CONFIG } from '@config/localModels.config';
import {
  cancelLocalModelDownload,
  downloadLocalModel,
  downloadPercent,
  removeLocalModel,
  setLocalModelIdle,
} from '@services/localModels.service';
import type { LocalModel, LocalModelDownload, ModelLoad } from '@services/localModels.service';
import { confirmModelDelete, type OnDeviceModel } from '@shared/utils/onDeviceModel';
import type { ChoiceSetup } from '@shared/utils/modelResolver';

const report = failureLogger('useLocalModels');
const { activityId } = LOCAL_MODELS_CONFIG;
const modelsKey = queryKeys.localModels();

function nameOf(id: string): string {
  return queryClient.getQueryData<LocalModel[]>(modelsKey)?.find((m) => m.id === id)?.name ?? id;
}

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
    actions: [{ icon: 'x', label: 'Cancel', onClick: () => void cancelLocalModelDownload(id).catch(report('cancel')) }],
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
  return { status, percent: busy ? (activity?.percent ?? null) : null, download: () => startDownload(model.id), remove: () => remove(model.id) };
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
      showActivity(download.id); // also after a webview reload mid-download
      activityStore.update(id, {
        percent: downloadPercent(download),
        detail: `${formatFileSize(download.received)} of ${formatFileSize(download.total)}`,
      });
      return;
    case 'verifying':
      activityStore.update(id, { label: `Checking ${nameOf(download.id)}`, percent: null, detail: null, actions: [] });
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

/** An activity row while a model loads (first use, or after it was freed for idling); gone once loaded or failed. */
function applyModelLoad(load: ModelLoad): void {
  const id = LOCAL_MODELS_CONFIG.loadingActivityId(load.role);
  if (load.state !== 'loading') {
    activityStore.remove(id);
    return;
  }
  if (activityStore.get(id)) return;
  activityStore.add({
    id,
    type: 'processing',
    label: `Loading ${load.name}`,
    status: 'active',
    percent: null,
    step: null,
    detail: null,
    error: null,
    actions: [],
  });
}

export function useLocalModelLoading(): void {
  useTauriEvent<ModelLoad>(LOCAL_MODELS_CONFIG.loadEvent, applyModelLoad);
}

/** Keeps the engines' idle time in step with Settings (sent at launch and on every change). */
export function useLocalModelIdle(): void {
  const minutes = useSettings().settings.modelIdleMinutes ?? LOCAL_MODELS_CONFIG.idle.defaultMinutes;
  useEffect(() => {
    if (!platform.hasLocalModels || !isTauriEnvironment()) return;
    setLocalModelIdle(minutes).catch(report('idle'));
  }, [minutes]);
}
