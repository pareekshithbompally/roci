/** Model capabilities as badge chips (`expanded`), or one fixed row of small marks for pickers (`compact`). */

import React from 'react';
import {
  Type, Image, AudioLines, Video, FileText, Sparkles,
  Wrench, Brain, Braces, type LucideIcon,
} from 'lucide-react';
import { Icon, Surface, Text, Tooltip } from '@shared/ui';
import type { ModelInfo, ModelCapabilities } from '@services/modalities';

interface ModalityIconsProps {
  /** Model info from modalitiesService.getModelInfo(); null renders nothing. */
  modelInfo?: ModelInfo | null;
  /** Show capability badges (tool call, reasoning, etc). Defaults true. */
  showCapabilities?: boolean;
  /** "expanded" = individual badges; "compact" = fixed mark columns that line up across picker rows */
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

/** One mark's box: every compact mark and its empty stand-in share it, so columns line up. */
const MARK_BOX = 'inline-flex items-center justify-center w-4 h-4 shrink-0';

/** One capability as a tiny muted icon with its name on hover (model pickers). */
export const CapabilityMark: React.FC<{ icon: LucideIcon; label: string }> = ({ icon, label }) => (
  <Tooltip content={label}>
    <Text variant="caption" tone="muted" aria-label={label} className={`${MARK_BOX} leading-none`}>
      <Icon icon={icon} size="xs" />
    </Text>
  </Tooltip>
);

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

/**
 * The compact marks, each in its own fixed column (text input is a given, so not shown). A mark a model lacks
 * leaves its column empty, so the same mark sits at the same place on every picker row.
 */
const COMPACT_COLUMNS: ReadonlyArray<{ key: string; icon: LucideIcon; label: string; has: (input: string[], capabilities?: ModelCapabilities) => boolean }> = [
  { key: 'image', icon: Image, label: 'Image input', has: (input) => input.includes('image') },
  { key: 'audio', icon: AudioLines, label: 'Audio input', has: (input) => input.includes('audio') },
  { key: 'video', icon: Video, label: 'Video input', has: (input) => input.includes('video') },
  { key: 'tools', icon: Wrench, label: 'Tool calling', has: (_, capabilities) => !!capabilities?.toolCall },
  { key: 'reasoning', icon: Brain, label: 'Reasoning', has: (_, capabilities) => !!capabilities?.reasoning },
];

const CompactVariant: React.FC<{ input?: string[]; capabilities?: ModelCapabilities }> = ({ input = [], capabilities }) => {
  const kinds = input.map((mod) => mod.toLowerCase());
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {COMPACT_COLUMNS.map(({ key, icon, label, has }) =>
        has(kinds, capabilities) ? <CapabilityMark key={key} icon={icon} label={label} /> : <span key={key} aria-hidden className={MARK_BOX} />,
      )}
    </span>
  );
};

// ── Main component ──────────────────────────────────────────────

export const ModalityIcons: React.FC<ModalityIconsProps> = ({
  modelInfo,
  showCapabilities = true,
  variant = 'expanded',
}) => {
  const input = modelInfo?.modalities?.input;
  const output = modelInfo?.modalities?.output;
  const capabilities = modelInfo?.capabilities;

  if (variant === 'compact') return <CompactVariant input={input} capabilities={showCapabilities ? capabilities : undefined} />;

  return (
    <ExpandedVariant
      input={input}
      output={output}
      capabilities={capabilities}
      showCapabilities={showCapabilities}
    />
  );
};
