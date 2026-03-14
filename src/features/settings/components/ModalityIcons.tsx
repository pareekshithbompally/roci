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
  Wrench, Brain, Braces,
} from 'lucide-react';
import { SURFACE, BORDER, TEXT } from '@config/theme.config';
import type { ModelInfo, ModelCapabilities } from '@/services/modalities';

interface ModalityIconsProps {
  /** Full model info from modalitiesService.getModelInfo() — preferred */
  modelInfo?: ModelInfo | null;
  /** Legacy: input modalities array (used if modelInfo not provided) */
  input?: string[];
  /** Legacy: output modalities array (used if modelInfo not provided) */
  output?: string[];
  /** Icon size in px */
  size?: number;
  /** Show capability badges (tool call, reasoning, etc). Defaults true. */
  showCapabilities?: boolean;
  /** "expanded" = individual badges, "compact" = I/O/Wrench with hover details */
  variant?: 'expanded' | 'compact';
}

// ── Shared config ───────────────────────────────────────────────

const MODALITY_ICONS: Record<string, React.FC<{ size: number; className: string }>> = {
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
  icon: React.FC<{ size: number; className: string }>;
  label: string;
}

const CAPABILITY_DEFS: CapabilityDef[] = [
  { key: 'toolCall',         icon: Wrench, label: 'Tool calling' },
  { key: 'reasoning',        icon: Brain,  label: 'Reasoning' },
  { key: 'structuredOutput', icon: Braces, label: 'Structured output' },
];

// ── Expanded variant ────────────────────────────────────────────

const Badge: React.FC<{
  icon: React.FC<{ size: number; className: string }>;
  size: number;
  title: string;
}> = ({ icon: Icon, size, title }) => (
  <span
    title={title}
    className={`inline-flex items-center justify-center w-5 h-5 rounded ${SURFACE.chip} border ${BORDER.default}`}
  >
    <Icon size={size} className={TEXT.muted} />
  </span>
);

const ExpandedVariant: React.FC<{
  input?: string[];
  output?: string[];
  capabilities?: ModelCapabilities;
  showCapabilities: boolean;
  size: number;
}> = ({ input, output, capabilities, showCapabilities, size }) => {
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
          <Badge
            key={`in-${k}`}
            icon={MODALITY_ICONS[k] || Sparkles}
            size={size}
            title={`Supports ${MODALITY_LABELS[k] || mod} input`}
          />
        );
      })}
      {hasInput && hasOutput && (
        <span className={`${TEXT.faint} text-[9px] leading-none`}>→</span>
      )}
      {hasOutput && output!.map((mod) => {
        const k = mod.toLowerCase();
        return (
          <Badge
            key={`out-${k}`}
            icon={MODALITY_ICONS[k] || Sparkles}
            size={size}
            title={`Supports ${MODALITY_LABELS[k] || mod} output`}
          />
        );
      })}
      {activeCapabilities.map(def => (
        <Badge key={def.key} icon={def.icon} size={size} title={`Supports ${def.label.toLowerCase()}`} />
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
  icon?: React.FC<{ size: number; className: string }>;
  /** Rows shown in the hover tooltip */
  tooltipItems: Array<{ icon: React.FC<{ size: number; className: string }>; label: string }>;
}> = ({ label, icon: Icon, tooltipItems }) => (
  <span className="relative group/ind inline-flex items-center justify-center w-4 h-4">
    {Icon
      ? <Icon size={10} className={TEXT.muted} />
      : <span className={`text-[9px] font-semibold leading-none ${TEXT.muted}`}>{label}</span>
    }
    {tooltipItems.length > 0 && (
      <span className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/ind:flex flex-col gap-1 z-30 px-2 py-1.5 ${SURFACE.tooltip} whitespace-nowrap pointer-events-none`}>
        {tooltipItems.map((item) => {
          const TipIcon = item.icon;
          return (
            <span key={item.label} className="flex items-center gap-1.5">
              <TipIcon size={10} className={TEXT.faint} />
              <span className="text-[10px] text-parchment-200 dark:text-night-200">{item.label}</span>
            </span>
          );
        })}
      </span>
    )}
  </span>
);

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
  size = 11,
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
      size={size}
    />
  );
};
