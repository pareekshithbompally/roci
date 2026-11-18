/** One string for one model wherever a setting or menu needs it: `provider::model`; provider ids never contain `::`. */

export interface ModelRef {
  provider: string;
  model: string;
}

const SEPARATOR = '::';

export const modelKey = ({ provider, model }: ModelRef): string => `${provider}${SEPARATOR}${model}`;

/** The model a key names, or null when the string is not a key (a bare model id, `macos`). */
export function parseModelKey(key: string): ModelRef | null {
  const at = key.indexOf(SEPARATOR);
  return at < 0 ? null : { provider: key.slice(0, at), model: key.slice(at + SEPARATOR.length) };
}
