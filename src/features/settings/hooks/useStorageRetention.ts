/** Keeps Settings › Storage › Keep in force: applies it at launch and whenever it changes; its timer handles the rest. */

import { useEffect } from 'react';
import { useSettings } from '@shared/contexts/SettingsContext';
import { retentionService } from '@services/storage/retention.service';
import { isTauriEnvironment } from '@services/tauri';
import type { StorageRetention } from '@shared/types';

export function useStorageRetention(): void {
  const { settings, isLoading } = useSettings();
  // The policy by value, so an unrelated settings write doesn't purge again.
  const policy = JSON.stringify(settings.storageRetention ?? {});

  useEffect(() => {
    if (isLoading || !isTauriEnvironment()) return;
    void retentionService.apply(JSON.parse(policy) as StorageRetention);
    return () => retentionService.stop();
  }, [policy, isLoading]);
}
