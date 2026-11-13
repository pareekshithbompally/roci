import { invoke } from '@tauri-apps/api/core'

/** Mirrors the Rust `PermissionKind` (src-tauri/src/permissions/state.rs). */
export type PermissionKind = 'microphone' | 'system-audio'

/** Mirrors the Rust `PermissionState`. */
export type PermissionState = 'ready' | 'needs-request' | 'needs-settings'

export interface PermissionRow {
  kind: PermissionKind
  state: PermissionState
}

class PermissionsService {
  /** Every permission a recording needs, in checklist order. Never prompts. */
  getPermissions(): Promise<PermissionRow[]> {
    return invoke<PermissionRow[]>('get_permissions')
  }

  /** Asks macOS; it shows its prompt only while undecided. */
  request(kind: PermissionKind): Promise<void> {
    return invoke('request_permission', { kind })
  }

  /** Opens the System Settings pane that lists `kind`. */
  openSettings(kind: PermissionKind): Promise<void> {
    return invoke('open_permission_settings', { kind })
  }
}

export const permissionsService = new PermissionsService()
