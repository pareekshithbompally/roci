/**
 * Tool Approval Store
 *
 * In-flight "may this tool run?" prompts (Jan's useToolApprovalRequests).
 * The MCP tool bridge awaits `requestApproval`; the chat's ToolApprovalBanner
 * renders `pending` and answers with `resolveApproval`. Persisting an
 * "always allow" grant is the caller's job — this store only holds prompts.
 */

import { create } from 'zustand';

/** `allow-always` trusts the tool's whole server (same decision repeated otherwise). */
export type ApprovalDecision = 'allow-once' | 'allow-always' | 'deny';

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  serverName: string;
  argsPreview: string;
}

interface PendingApproval extends ApprovalRequest {
  resolve: (decision: ApprovalDecision) => void;
}

interface ToolApprovalState {
  pending: PendingApproval[];
  /** Ask the user. Resolves `deny` if `signal` aborts first (Stop pressed). */
  requestApproval: (request: ApprovalRequest, signal?: AbortSignal) => Promise<ApprovalDecision>;
  resolveApproval: (toolCallId: string, decision: ApprovalDecision) => void;
}

export const useToolApprovalStore = create<ToolApprovalState>()((set, get) => ({
  pending: [],

  requestApproval: (request, signal) => {
    if (signal?.aborted) return Promise.resolve('deny');
    return new Promise<ApprovalDecision>((resolve) => {
      const onAbort = () => get().resolveApproval(request.toolCallId, 'deny');
      const settle = (decision: ApprovalDecision) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(decision);
      };
      set((s) => ({ pending: [...s.pending, { ...request, resolve: settle }] }));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  },

  resolveApproval: (toolCallId, decision) => {
    const entry = get().pending.find((p) => p.toolCallId === toolCallId);
    if (!entry) return;
    set((s) => ({ pending: s.pending.filter((p) => p.toolCallId !== toolCallId) }));
    entry.resolve(decision);
  },
}));

export const usePendingApprovals = () => useToolApprovalStore((s) => s.pending);
export const useResolveApproval = () => useToolApprovalStore((s) => s.resolveApproval);
