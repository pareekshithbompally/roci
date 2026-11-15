/** macOS permission plumbing shared by the recording checklist and integrations. */

export const PERMISSIONS_CONFIG = {
  /** While a permission surface is open, re-check this often so a grant in System Settings flips its row. */
  pollIntervalMs: 1000,
} as const;
