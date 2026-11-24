import type { ReasoningEffort } from '@shared/types';
import { platform } from '@platform/index';
import type { ModelListStyle } from '@config/modelLists.config';

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

/** A port on this device that doesn't answer within this window counts as "not running". */
export const LOCAL_PROBE_TIMEOUT_MS = 600;
/** A server on another computer (Tailscale, the network) gets this long: a first https connection there takes seconds. */
export const REMOTE_PROBE_TIMEOUT_MS = 10_000;

/** An app that serves models (Ollama, LM Studio, llama.cpp …): what a server is called and shows everywhere. */
export interface ServerApp {
  id: string;
  label: string;
  logo: string;
  /** Bundle id of its Mac app: when it's installed, macOS draws its icon (else `logo`). */
  bundleId?: string;
  /** Takes a JSON schema but some of its models don't hold replies to it: the schema also goes into the instructions
   *  (`schemaInPromptMiddleware`). */
  ignoresSchema?: boolean;
}

const GENERIC_LOGO = '/images/model-provider/local-server.png';
const LLAMA_CPP_LOGO = '/images/model-provider/llama-cpp.png';

/** Every server app a user can name their server as, in picker order. */
export const SERVER_APPS: readonly ServerApp[] = [
  { id: 'llama', label: 'Llama', logo: LLAMA_CPP_LOGO, bundleId: 'app.llama.Llama' },
  { id: 'llamacpp', label: 'llama.cpp', logo: LLAMA_CPP_LOGO },
  // Its cloud and MLX-engine models ignore a schema; its docs advise putting the schema in the prompt too.
  { id: 'ollama', label: 'Ollama', logo: '/images/model-provider/ollama.png', ignoresSchema: true },
  { id: 'lmstudio', label: 'LM Studio', logo: '/images/model-provider/lm-studio.png', bundleId: 'ai.elementlabs.lmstudio' },
  { id: 'vllm', label: 'vLLM', logo: '/images/model-provider/vllm.svg' },
  { id: 'jan', label: 'Jan', logo: '/images/model-provider/jan.png', bundleId: 'jan.ai.app' },
  { id: 'koboldcpp', label: 'KoboldCpp', logo: GENERIC_LOGO },
  { id: 'sglang', label: 'SGLang', logo: '/images/model-provider/sglang.png' },
];

/** The server app a list format proves, so an added server starts named (the user can change it). */
export const SERVER_APP_BY_LIST_STYLE: Partial<Record<ModelListStyle, string>> = {
  ollama: 'ollama',
  lmstudio: 'lmstudio',
  'llama-server': 'llamacpp',
};

/** Settings › a server's detail: which app it is. */
export const SERVER_APP_PICKER = { title: 'Server app', other: 'Other' } as const;

/** A known server app on its default port, scanned on this device. */
export interface LocalServerEntry {
  id: string;
  serverApp: string;
  port: number;
  /** GET path only this engine serves; null when the port alone identifies it, or its own list format already proves it. */
  fingerprint: string | null;
}

// Default ports from each engine's docs: Ollama 11434, LM Studio 1234, vLLM 8000, Jan 1337, llama.cpp's llama-server
// 8080 (also LocalAI and MLX; anything else answering there shows as a generic local server), KoboldCpp 5001.
export const LOCAL_SERVERS: readonly LocalServerEntry[] = [
  { id: 'local:ollama', serverApp: 'ollama', port: 11434, fingerprint: null },
  { id: 'local:lmstudio', serverApp: 'lmstudio', port: 1234, fingerprint: null },
  { id: 'local:vllm', serverApp: 'vllm', port: 8000, fingerprint: '/version' },
  { id: 'local:jan', serverApp: 'jan', port: 1337, fingerprint: null },
  { id: 'local:llamacpp', serverApp: 'llamacpp', port: 8080, fingerprint: '/props' },
  { id: 'local:koboldcpp', serverApp: 'koboldcpp', port: 5001, fingerprint: '/api/extra/version' },
];

/** Logo for a server whose app isn't named (a custom URL, or port 8080 serving MLX/LocalAI). */
export const LOCAL_GENERIC_LOGO = GENERIC_LOGO;

/** The Providers group of servers that speak the OpenAI API, local or hosted (vs models built into this device). */
export const LOCAL_SERVERS_GROUP = 'OpenAI-Compatible';

/** The OpenAI-Compatible group's command row: look again for servers running on this device. */
export const LOCAL_RESCAN = 'Rescan';

/** Under the OpenAI-Compatible list: what belongs in it. */
export const LOCAL_SERVERS_FOOTER = 'OpenAI-compatible servers, local or hosted.';

/** Hint under the OpenAI-Compatible list when there are none: start one here, or add one elsewhere by its address. */
export const LOCAL_EMPTY_HINT = platform.runsLocalServers
  ? 'Nothing running? Start Ollama or LM Studio, then rescan, or add a server by its address.'
  : 'Add a server you run, such as one on your Mac over Tailscale, by its address.';

/** Providers › Add Server: its page's words. */
export const ADD_SERVER = {
  title: 'Add Server',
  address: 'Address',
  footer: 'Roci asks the server for its models before saving it, so a typo or a server that isn’t running is caught here.',
  add: 'Add Server',
  adding: 'Connecting…',
  failed: 'Could not add that server',
} as const;

/** "Add server" starts with the scheme filled in (and this device's host where servers run here). */
export const LOCAL_URL_DRAFT = platform.runsLocalServers ? 'http://localhost:' : 'https://';

/** This device's own addresses: the only ones Roci reaches over plain http (capabilities allow http to them alone). */
export const LOCAL_LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

/** A plain-http address for a server on another computer, which Roci only reaches over https. */
export const LOCAL_NEEDS_HTTPS = 'A server on another computer needs an https:// address, such as the one tailscale serve gives it.';

/** How long a probe of `baseUrl` waits: briefly on this device, longer for another computer. */
export function probeTimeoutMs(baseUrl: string): number {
  return LOCAL_LOOPBACK_HOSTS.includes(new URL(baseUrl).hostname) ? LOCAL_PROBE_TIMEOUT_MS : REMOTE_PROBE_TIMEOUT_MS;
}
