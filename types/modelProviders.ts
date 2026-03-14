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
