/** Spoken languages as BCP 47 codes: the device's own, matching one to a model's list, and its name for the user. */

/** The device's language, as macOS / iOS hands it to the webview (`en-IN`). */
export const deviceLanguage = (): string => navigator.language;

const base = (code: string): string => code.split('-')[0];

/** `language` in `offered`'s spelling: itself, else its base language or that language's first locale; undefined if none. */
export function matchLanguage(language: string, offered: readonly string[]): string | undefined {
  if (offered.includes(language)) return language;
  const root = base(language);
  return offered.find((code) => code === root || base(code) === root);
}

let names: Intl.DisplayNames | undefined;

/** A language's name in the device's language ("Hindi" on an English Mac, "हिन्दी" on a Hindi one); its code if none. */
export function languageName(code: string): string {
  names ??= new Intl.DisplayNames([deviceLanguage()], { type: 'language' });
  try {
    return names.of(code) ?? code;
  } catch {
    return code; // not a well-formed tag (a model's own spelling)
  }
}
