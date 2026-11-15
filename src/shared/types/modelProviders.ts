export type ControllerProps = {
  value?: string | boolean | number
  placeholder?: string
  type?: string
  options?: Array<{ value: number | string; name: string }>
  input_actions?: string[]
  recommended?: string
}

export type ProviderSetting = {
  key: string
  title: string
  description: string
  controller_type: 'input' | 'checkbox' | 'dropdown' | 'slider' | string
  controller_props: ControllerProps
}

/** What a model's own server reports about it (llama-server `/models`); hosted models get this from models.dev instead. */
export type ServedModelInfo = {
  /** Kinds of input and output it takes and gives (text, image, audio, video). */
  modalities?: { input: string[]; output: string[] }
  /** The context window the server runs it with, in tokens. */
  contextTokens?: number
  /** The server takes a thinking level for it (llama-server). */
  thinking?: boolean
}

export type Model = {
  id: string
  model?: string
  name?: string
  displayName?: string
  version?: number | string
  description?: string
  format?: string
  capabilities?: string[]
  settings?: Record<string, ProviderSetting>
  /** Per-model toggle for LLM tool calling. Defaults false for local, true for remote. */
  toolsEnabled?: boolean
  /** Per-model override: accepts audio input (transcribes via prompt). Unset → models.dev. */
  audioInput?: boolean
  /** Read from its server on detection; never edited by the user. */
  served?: ServedModelInfo
}

export type ProviderCustomHeader = {
  header: string
  value: string
}

export type ModelProvider = {
  active: boolean
  provider: string
  explore_models_url?: string
  api_key?: string
  base_url?: string
  settings: ProviderSetting[]
  models: Model[]
  persist?: boolean
  custom_header?: ProviderCustomHeader[] | null
}
