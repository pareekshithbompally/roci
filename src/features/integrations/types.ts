import type { PermissionState } from '@services/permissions.service';

/** macOS access for an integration; `unknown` until macOS answers, `unavailable` when this Mac can't run it. */
export type IntegrationAccess = PermissionState | 'unknown' | 'unavailable';

/** What every integration hook returns; `IntegrationRow` renders exactly this. */
export interface IntegrationControls {
  access: IntegrationAccess;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** Ask macOS (it prompts only while undecided). Absent for integrations without a macOS permission. */
  request?: () => void;
  /** Open the System Settings pane where only the user can change access. */
  openSettings?: () => void;
  /** Why it can't run on this Mac, when `access` is `unavailable`. */
  unavailableReason?: string;
}
