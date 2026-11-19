import type { Modality } from '@config/modelSpine.config'

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

/** What one source says about a model; a fact the source doesn't state stays unset. */
export type ModelReport = {
  /** What it takes in (text, image, audio, video). */
  input?: Modality[]
  /** What it gives back (text, audio, image, vector). */
  output?: Modality[]
  /** Takes tool definitions. */
  tools?: boolean
  /** Thinks before answering, so it takes a thinking level. */
  reasoning?: boolean
  /** Its context window in tokens. */
  contextTokens?: number
}

/** The user's corrections from a model's ⋯ menu; each set one wins over every source, the rest come from the sources. */
export type ModelOverrides = {
  vision?: boolean
  audio?: boolean
  tools?: boolean
  reasoning?: boolean
}

export type Model = {
  id: string
  model?: string
  name?: string
  displayName?: string
  version?: number | string
  description?: string
  format?: string
  settings?: Record<string, ProviderSetting>
  /** What its provider's model list reports (a cloud list or a server's), refreshed on Test, Add and each server probe. */
  reported?: ModelReport
  overrides?: ModelOverrides
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
