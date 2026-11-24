/** The device's network from the native side (network.rs): read once, then kept current on each change. */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauriEnvironment } from './environment.service';
import { setNetworkOnline } from '@shared/stores/networkStore';

const CHANGED_EVENT = 'network://changed';

/** Reads whether the device is online, then follows the system's changes. Browser builds stay online. */
export async function followNetwork(): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    await listen<{ online: boolean }>(CHANGED_EVENT, ({ payload }) => setNetworkOnline(payload.online));
    setNetworkOnline(await invoke<boolean>('network_online'));
  } catch (error: unknown) {
    console.error('[network] Following the device network failed:', error);
  }
}
