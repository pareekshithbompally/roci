/** Whether the device is online, as the system reports it (network.rs): advice for what the app shows, never a gate on what
 *  it does — requests still run and fail on their own. Online until the system says otherwise. */

import { create } from 'zustand';

interface NetworkState {
  online: boolean;
}

const useNetworkStore = create<NetworkState>()(() => ({ online: true }));

export const setNetworkOnline = (online: boolean) => useNetworkStore.setState({ online });
/** Online now, outside React (an error being worded). */
export const networkOnline = () => useNetworkStore.getState().online;
export const useNetworkOnline = () => useNetworkStore((s) => s.online);
