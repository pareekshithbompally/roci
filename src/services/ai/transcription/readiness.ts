/**
 * Whether a transcription engine can run right now, and what to do if not.
 * Single rule used by Settings › Audio, the home screen and chat dictation.
 */

import { getProviderTitle } from '@shared/utils/provider.utils';
import { resolveCred } from './cred';
import { installedHexModels } from './hex';
import type { ModelProvider } from '@shared/types/modelProviders';
import type { TranscriptionEngine } from './engines';
import type { HexStatus } from './hex';

export interface EngineReadiness {
  ready: boolean;
  /** Short next step when not ready (e.g. "Add OpenAI API key", "Open Hex"). */
  hint: string | null;
}

const READY: EngineReadiness = { ready: true, hint: null };

function keyReadiness(providerId: string, providers: ModelProvider[]): EngineReadiness {
  try {
    resolveCred(providerId, providers);
    return READY;
  } catch {
    return { ready: false, hint: `Add ${getProviderTitle(providerId)} API key` };
  }
}

/** Engines without a provider run on this Mac through Hex. */
function hexReadiness(status: HexStatus | undefined): EngineReadiness {
  if (!status?.running) return { ready: false, hint: 'Open Hex' };
  if (installedHexModels(status).length === 0) return { ready: false, hint: 'Download a model in Hex' };
  return READY;
}

export function engineReadiness(
  engine: TranscriptionEngine,
  providers: ModelProvider[],
  hexStatus: HexStatus | undefined,
): EngineReadiness {
  return engine.providerId ? keyReadiness(engine.providerId, providers) : hexReadiness(hexStatus);
}
