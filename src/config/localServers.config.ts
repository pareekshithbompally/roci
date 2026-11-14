/**
 * Local Servers Configuration
 *
 * OpenAI-compatible servers the user runs themselves on this Mac. Kasset never
 * starts, installs, or downloads anything for them — it detects them on their
 * standard ports and connects through the regular openai-compat provider path.
 */

/** Provider id prefix for every local server (`local:ollama`, `local:127.0.0.1:9000`). */
export const LOCAL_PROVIDER_PREFIX = 'local:';

/**
 * Key saved with every local server. Keys stay uniform across all providers;
 * these servers ignore the bearer token unless started with one, in which case
 * the user replaces it.
 */
export const LOCAL_SERVER_DEFAULT_API_KEY = 'local';

export const LOCAL_SERVER_HOST = '127.0.0.1';

/** OpenAI-compatible API path served by every supported engine. */
export const LOCAL_SERVER_API_PATH = '/v1';

/** A port that doesn't answer within this window counts as "not running". */
export const LOCAL_PROBE_TIMEOUT_MS = 600;

export interface LocalServerEntry {
  id: string;
  label: string;
  port: number;
  /** GET path only this engine serves; null when the port alone identifies it. */
  fingerprint: string | null;
  logo: string;
}

const GENERIC_LOGO = '/images/model-provider/local-server.png';

export const LOCAL_SERVERS: readonly LocalServerEntry[] = [
  { id: 'local:ollama', label: 'Ollama', port: 11434, fingerprint: '/api/version', logo: GENERIC_LOGO },
  { id: 'local:lmstudio', label: 'LM Studio', port: 1234, fingerprint: '/api/v0/models', logo: GENERIC_LOGO },
  { id: 'local:vllm', label: 'vLLM', port: 8000, fingerprint: '/version', logo: GENERIC_LOGO },
  { id: 'local:jan', label: 'Jan', port: 1337, fingerprint: null, logo: '/images/model-provider/jan.png' },
];

/** Logo for a server that isn't a known engine (a custom URL, or port 8080 serving MLX/LocalAI). */
export const LOCAL_GENERIC_LOGO = GENERIC_LOGO;

/** Info line shown in the provider detail pane for every local server. */
export const LOCAL_SERVER_INFO = 'Runs on this Mac. Start and stop it in its own app; Kasset connects to it.';

/** Hint under the Local list when nothing is running. */
export const LOCAL_EMPTY_HINT = 'Nothing running? Start Ollama or LM Studio, then rescan.';

/** "Add URL" starts filled with the host, so the field never reads as a
 *  placeholder and Add is live; the user types the port. */
export const LOCAL_URL_DRAFT = 'http://localhost:';
