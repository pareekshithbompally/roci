import type { ReasoningEffort } from '@shared/types';

/** User-run OpenAI-compatible servers, detected on their standard ports; Roci never starts or installs them. */

/** Provider id prefix for every local server (`local:ollama`, `local:127.0.0.1:9000`). */
export const LOCAL_PROVIDER_PREFIX = 'local:';

/** Placeholder key saved with every local server; servers ignore it unless started with a key. */
export const LOCAL_SERVER_DEFAULT_API_KEY = 'local';

export const LOCAL_SERVER_HOST = '127.0.0.1';

/** OpenAI-compatible API path served by every supported engine. */
export const LOCAL_SERVER_API_PATH = '/v1';

/** Share of a model's load progress for each part after its main weights (draft model, projector). */
export const MODEL_LOAD_PART_SHARE = 0.1;

/** llama-server thinking budget per level, tokens (-1 = unlimited); `none` and `provider-default` send no budget. */
export const LLAMA_THINKING_BUDGET_TOKENS: Partial<Record<ReasoningEffort, number>> = { low: 512, medium: 2048, high: 8192, max: -1 };

/** Prompt reading shows no time left until it has run this long, ms (the first reports are too early to tell). */
export const PROMPT_ETA_MIN_ELAPSED_MS = 500;

/**
 * How llama-server's own web UI (build b12359) tells a chat template thinks: a reasoning variable inside a template
 * expression, a thinking conditional, or a thinking marker pair (`null`: the opening marker alone suffices).
 */
export const LLAMA_THINKING_TEMPLATE = {
  variables: ['enable_thinking', 'reasoning_effort', 'thinking_budget'],
  conditionals: [
    /\{%-?\s*if\s+\(?\s*\w*enable[\s_]+\w*(thinking|think|reasoning)/i,
    /\{%-?\s*if\s+\w*(thinking|reasoning)\s*(is not|==|!=)/i,
    /\{%-?\s*if\s+not\s+\w*enable/i,
    /\{%-?\s*if\s+ns\.enable_thinking/i,
  ],
  markers: [
    ['<think>', '</think>'],
    ['<|channel>thought', '<|channel|>'],
    ['<|think|>', '</|think|>'],
    ['<seed:think|>', '</seed:think|>'],
    ['<think></think>', null],
  ] as ReadonlyArray<readonly [string, string | null]>,
} as const;

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

/** Hint under the Local list when nothing is running. */
export const LOCAL_EMPTY_HINT = 'Nothing running? Start Ollama or LM Studio, then rescan.';

/** "Add URL" starts with the host filled in so Add is live; the user types the port. */
export const LOCAL_URL_DRAFT = 'http://localhost:';
