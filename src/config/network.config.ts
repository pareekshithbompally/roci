/** The device's network, as the app words it (network.rs reports it; networkStore holds it). */

export const NETWORK_COPY = {
  /** A request that failed while the device was offline: a chat reply, a summary, speech. */
  offline: 'You’re offline. Connect to the internet, then try again.',
} as const;
