/** The one model menu, for chat and every Settings model picker: a native menu on a Mac (icon, name, grey facts line, checkmark,
 *  provider headers), and the same rows as text for the system's text-only menus elsewhere. */

import { MODEL_MENU_COPY as COPY } from '@config/modelMenu.config';
import { META_SEPARATOR, MENU_GAP_PT } from '@config/ui.config';
import { nativeMenu, type NativeMenuEntry } from '@services/tauri';
import { cachedImage } from '@services/imageCache';
import { getAvatarUrl, modelAvatarOrg } from '@services/modelAvatars';
import { getProviderLogo, getProviderTitle } from '@shared/utils/provider.utils';
import { groupChoices, type ChoiceSetup, type ModelChoice } from '@shared/utils/modelResolver';

export interface ModelMenuOptions {
  /** The chosen value (checked). */
  selected?: string;
  /** A first row that turns the job off (Images › Off). */
  off?: { value: string; label: string };
  /** A local model in memory now (chat). */
  isLoaded?: (choice: ModelChoice) => boolean;
}

function setupText(setup: ChoiceSetup, size: string | null): string {
  if (setup.busy) return COPY.setup.downloading(setup.percent);
  if (setup.kind === 'allow') return COPY.setup.allow;
  return [COPY.setup.download, size].filter(Boolean).join(META_SEPARATOR);
}

/** The grey line under a model: what it takes in and can do, its marks, whether it's loaded; or the step it needs, or why it can't run. */
export function modelSubtitle(choice: ModelChoice, loaded = false): string {
  if (!choice.ready && choice.setup) return setupText(choice.setup, choice.hint);
  if (!choice.ready) return choice.hint ?? '';
  const { info } = choice;
  const { facts } = COPY;
  return [
    info?.modalities?.input.includes('image') && facts.vision,
    info?.modalities?.input.includes('audio') && facts.audio,
    info?.capabilities.toolCall && facts.tools,
    info?.capabilities.reasoning && facts.thinking,
    ...(choice.marks ?? []).map((m) => m.label),
    loaded && facts.loaded,
  ].filter(Boolean).join(META_SEPARATOR);
}

/** The same row as one line of text, for a text-only menu. */
export function modelRowText(choice: ModelChoice): string {
  const subtitle = modelSubtitle(choice);
  return subtitle ? `${choice.label}${COPY.textSeparator}${subtitle}` : choice.label;
}

/** A model's icon as ModelIcon draws it: the maker's avatar when shown and known, else the provider's logo. */
async function modelIconUrl(choice: ModelChoice, showAvatars: boolean): Promise<string | null> {
  const logo = getProviderLogo(choice.provider) ?? null;
  const org = modelAvatarOrg(choice.provider, choice.modelId, showAvatars);
  return org ? cachedImage(getAvatarUrl(org)).catch(() => logo) : logo;
}

/** The native entries: Off first when offered, a header per provider and its models, then the ones that need a step first. */
export function modelMenuEntries(choices: ModelChoice[], options: ModelMenuOptions, iconOf: (c: ModelChoice) => string | null): NativeMenuEntry[] {
  const { groups, needsSetup } = groupChoices(choices);
  const row = (c: ModelChoice): NativeMenuEntry => ({
    kind: 'row', id: c.value, title: c.label, subtitle: modelSubtitle(c, options.isLoaded?.(c) ?? false), icon: iconOf(c),
    checked: c.value === options.selected, enabled: c.ready || !!c.setup,
  });
  const off: NativeMenuEntry[] = options.off
    ? [{ kind: 'row', id: options.off.value, title: options.off.label, checked: options.selected === options.off.value, enabled: true }]
    : [];
  const sections = [
    ...groups.map(([provider, models]): NativeMenuEntry[] => [{ kind: 'header', title: getProviderTitle(provider) }, ...models.map(row)]),
    ...(needsSetup.length > 0 ? [[{ kind: 'header' as const, title: COPY.needsSetup }, ...needsSetup.map(row)]] : []),
  ];
  return [...off, ...sections.flatMap((section, i) => (i > 0 || off.length > 0 ? [{ kind: 'separator' as const }, ...section] : section))];
}

/** Opens the native model menu under `anchor`; resolves the picked value, or null when dismissed. */
export async function openModelMenu(choices: ModelChoice[], options: ModelMenuOptions & { showAvatars: boolean }, anchor: DOMRect): Promise<string | null> {
  const icons = new Map(await Promise.all(choices.map(async (c) => [c.value, await modelIconUrl(c, options.showAvatars)] as const)));
  const entries = modelMenuEntries(choices, options, (c) => icons.get(c.value) ?? null);
  const { chosen } = await nativeMenu(entries, anchor.left, anchor.bottom + MENU_GAP_PT);
  return chosen;
}
