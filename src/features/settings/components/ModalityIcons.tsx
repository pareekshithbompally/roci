/**
 * ModalityIcons Component
 *
 * Two variants for displaying model capabilities:
 *
 * "expanded" (default) — Individual badge chips for each modality + capability.
 *   Best for settings panels where space is available.
 *
 * "compact" — Three tiny indicators: Wrench, I, O.
 *   Hovering I/O reveals a rich tooltip listing the actual modalities with icons.
 *   Best for model pickers and tight inline contexts.
 */

import React from 'react';
import {
  Type, Image, AudioLines, Video, FileText, Sparkles,
  Wrench, Brain, Braces, type LucideIcon,
} from 'lucide-react';
import { Icon, Surface, Text, Tooltip } from '@shared/ui';
import type { ModelInfo, ModelCapabilities } from '@services/modalities';

interface ModalityIconsProps {
  /** Full model info from modalitiesService.getModelInfo() — preferred */
  modelInfo?: ModelInfo | null;
  /** Legacy: input modalities array (used if modelInfo not provided) */
  input?: string[];
  /** Legacy: output modalities array (used if modelInfo not provided) */
  output?: string[];
  /** Show capability badges (tool call, reasoning, etc). Defaults true. */
  showCapabilities?: boolean;
  /** "expanded" = individual badges, "compact" = I/O/Wrench with hover details */
  variant?: 'expanded' | 'compact';
}

// ── Shared config ───────────────────────────────────────────────

const MODALITY_ICONS: Record<string, LucideIcon> = {
  text: Type,
  image: Image,
  audio: AudioLines,
  video: Video,
  pdf: FileText,
};

const MODALITY_LABELS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  pdf: 'PDF',
};

interface CapabilityDef {
  key: keyof ModelCapabilities;
  icon: LucideIcon;
  label: string;
}

const CAPABILITY_DEFS: CapabilityDef[] = [
  { key: 'toolCall',         icon: Wrench, label: 'Tool calling' },
  { key: 'reasoning',        icon: Brain,  label: 'Reasoning' },
  { key: 'structuredOutput', icon: Braces, label: 'Structured output' },
];

// ── Expanded variant ────────────────────────────────────────────

const ModalityBadge: React.FC<{ icon: LucideIcon; title: string }> = ({ icon, title }) => (
  <Tooltip content={title}>
    <Surface variant="inset" radius="md" aria-label={title} className="inline-flex items-center justify-center w-5 h-5">
      <Icon icon={icon} size="xs" tone="muted" />
    </Surface>
  </Tooltip>
);

const ExpandedVariant: React.FC<{
  input?: string[];
  output?: string[];
  capabilities?: ModelCapabilities;
  showCapabilities: boolean;
}> = ({ input, output, capabilities, showCapabilities }) => {
  const hasInput = input && input.length > 0;
  const hasOutput = output && output.length > 0;
  const activeCapabilities = showCapabilities && capabilities
    ? CAPABILITY_DEFS.filter(def => capabilities[def.key])
    : [];

  if (!hasInput && !hasOutput && activeCapabilities.length === 0) return null;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {hasInput && input!.map((mod) => {
        const k = mod.toLowerCase();
        return (
          <ModalityBadge
            key={`in-${k}`}
            icon={MODALITY_ICONS[k] || Sparkles}
            title={`Supports ${MODALITY_LABELS[k] || mod} input`}
          />
        );
      })}
      {hasInput && hasOutput && <Text variant="caption" tone="faint">→</Text>}
      {hasOutput && output!.map((mod) => {
        const k = mod.toLowerCase();
        return (
          <ModalityBadge
            key={`out-${k}`}
            icon={MODALITY_ICONS[k] || Sparkles}
            title={`Supports ${MODALITY_LABELS[k] || mod} output`}
          />
        );
      })}
      {activeCapabilities.map(def => (
        <ModalityBadge key={def.key} icon={def.icon} title={`Supports ${def.label.toLowerCase()}`} />
      ))}
    </div>
  );
};

// ── Compact variant ─────────────────────────────────────────────

/** Builds the tooltip items list from a modalities array */
function toTooltipItems(mods: string[] | undefined) {
  return (mods || []).map(mod => {
    const k = mod.toLowerCase();
    return { icon: MODALITY_ICONS[k] || Sparkles, label: MODALITY_LABELS[k] || mod };
  });
}

/**
 * A single compact indicator (letter or icon) with a rich hover tooltip.
 * All elements are inline-flex so they sit on the same line.
 */
const CompactIndicator: React.FC<{
  /** Render either a letter label or an icon */
  label?: string;
  icon?: LucideIcon;
  /** Rows shown in the hover tooltip */
  tooltipItems: Array<{ icon: LucideIcon; label: string }>;
}> = ({ label, icon, tooltipItems }) => {
  const indicator = (
    <Text variant="caption" tone="muted" className="inline-flex items-center justify-center w-4 h-4 font-semibold leading-none">
      {icon ? <Icon icon={icon} size="xs" /> : label}
    </Text>
  );
  if (tooltipItems.length === 0) return indicator;
  return (
    <Tooltip
      content={
        <span className="flex flex-col gap-1">
          {tooltipItems.map(({ icon: tipIcon, label: tip }) => (
            <span key={tip} className="flex items-center gap-1.5">
              <Icon icon={tipIcon} size="xs" className="opacity-70" />
              {tip}
            </span>
          ))}
        </span>
      }
    >
      {indicator}
    </Tooltip>
  );
};

const CompactVariant: React.FC<{
  input?: string[];
  output?: string[];
  capabilities?: ModelCapabilities;
  showCapabilities: boolean;
}> = ({ input, output, capabilities, showCapabilities }) => {
  const inputItems = toTooltipItems(input);
  const outputItems = toTooltipItems(output);

  const activeCapabilities = showCapabilities && capabilities
    ? CAPABILITY_DEFS.filter(def => capabilities[def.key])
    : [];

  if (inputItems.length === 0 && outputItems.length === 0 && activeCapabilities.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {activeCapabilities.map(def => (
        <CompactIndicator
          key={def.key}
          icon={def.icon}
          tooltipItems={[{ icon: def.icon, label: def.label }]}
        />
      ))}
      {inputItems.length > 0 && (
        <CompactIndicator label="I" tooltipItems={inputItems} />
      )}
      {outputItems.length > 0 && (
        <CompactIndicator label="O" tooltipItems={outputItems} />
      )}
    </span>
  );
};

// ── Main component ──────────────────────────────────────────────

export const ModalityIcons: React.FC<ModalityIconsProps> = ({
  modelInfo,
  input: legacyInput,
  output: legacyOutput,
  showCapabilities = true,
  variant = 'expanded',
}) => {
  const input = modelInfo?.modalities?.input ?? legacyInput;
  const output = modelInfo?.modalities?.output ?? legacyOutput;
  const capabilities = modelInfo?.capabilities;

  if (variant === 'compact') {
    return (
      <CompactVariant
        input={input}
        output={output}
        capabilities={capabilities}
        showCapabilities={showCapabilities}
      />
    );
  }

  return (
    <ExpandedVariant
      input={input}
      output={output}
      capabilities={capabilities}
      showCapabilities={showCapabilities}
    />
  );
};
