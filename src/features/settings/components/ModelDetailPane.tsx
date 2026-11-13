/**
 * ModelDetailPane — persistent right-hand detail (pane 3)
 *
 * Renders the currently-selected subject (an installed model or a discovered
 * repo). The same component serves both modes: a header + a unified quant
 * variant table where installed variants are marked and the rest offer "Get".
 *
 * Purely presentational — all data + handlers come from ModelManager. There is
 * no internal navigation (no back button); the parent swaps the subject on
 * selection and this pane re-renders in place.
 */

import React from 'react';
import { Play, Square, Download, Trash2, Loader2, ExternalLink, Check, Star } from 'lucide-react';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS, TIER } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { formatFileSize } from '@shared/utils/formatters';
import type { VariantRow } from '@extensions/llamacpp/models';
import { Badge, Button } from '@shared/ui';

export interface DetailMetaChip {
  label: string;
  value: string;
}

export interface ModelDetailPaneProps {
  /** Whether a subject is selected; when false, an empty prompt shows. */
  show: boolean;
  emptyLabel: string;
  title: string;
  repoId?: string | null;
  metaChips: DetailMetaChip[];
  /** Primary Run/Stop action (installed subject only). */
  primary?: { mode: 'run' | 'stop'; onClick: () => void; disabled?: boolean };
  /** Delete the selected installed model (installed subject only). */
  onDeleteModel?: () => void;
  deleteModelDisabled?: boolean;
  /** Variant table */
  variantsTitle: string;
  variantsLoading: boolean;
  variantsError: boolean;
  variants: VariantRow[];
  runningModelId: string | null;
  onGet: (fileName: string) => void;
  getDisabled: boolean;
  onDeleteVariant?: (modelId: string) => void;
}

const tierFor = (quality: VariantRow['quality']) => (quality ? TIER[quality] : null);

export const ModelDetailPane: React.FC<ModelDetailPaneProps> = ({
  show,
  emptyLabel,
  title,
  repoId,
  metaChips,
  primary,
  onDeleteModel,
  deleteModelDisabled,
  variantsTitle,
  variantsLoading,
  variantsError,
  variants,
  runningModelId,
  onGet,
  getDisabled,
  onDeleteVariant,
}) => {
  if (!show) {
    return (
      <div
        className={`flex items-center justify-center h-full min-h-[18rem] text-center px-6 border border-dashed ${BORDER.default} ${RADIUS.lg}`}
      >
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
     <div className="shrink-0 space-y-4">
      {/* Header */}
      <div>
        <h4 className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading} truncate`}>{title}</h4>
        {repoId && (
          <a
            href={`https://huggingface.co/${repoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 mt-1 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.link} hover:underline font-mono`}
          >
            {repoId}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {metaChips.length > 0 && (
          <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-2 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
            {metaChips.map((chip) => (
              <span key={chip.label}>
                {chip.label} <span className={TEXT.secondary}>{chip.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Primary actions (installed subject) */}
      {(primary || onDeleteModel) && (
        <div className="flex items-center gap-2 flex-wrap">
          {primary?.mode === 'stop' ? (
            <Button variant="danger" size="sm" onClick={primary.onClick} disabled={primary.disabled}>
              <Square className="w-3.5 h-3.5" />
              Stop server
            </Button>
          ) : primary ? (
            <Button variant="success" size="sm" onClick={primary.onClick} disabled={primary.disabled}>
              <Play className="w-3.5 h-3.5" />
              Run this model
            </Button>
          ) : null}
          {onDeleteModel && (
            <Button variant="outline" size="sm" onClick={onDeleteModel}
              disabled={deleteModelDisabled} title={deleteModelDisabled ? 'Stop the server before deleting the running model' : 'Delete this model'}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          )}
        </div>
      )}
     </div>

      {/* Variants */}
      <div className="flex-1 min-h-0 mt-4 flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className={`${TYPOGRAPHY_CLASSES.settingsLabel} ${TEXT.muted} uppercase tracking-wide`}>
            {variantsTitle}
          </span>
          {variantsLoading && <Loader2 className={`w-3.5 h-3.5 ${TEXT.faint} animate-spin`} />}
        </div>

        {variantsError && (
          <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} mb-2 shrink-0`}>
            Couldn&rsquo;t load variants from Hugging Face — showing what you have.
          </p>
        )}

        {variants.length > 0 ? (
          <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar border ${BORDER.input} ${RADIUS.lg}`}>
            {variants.map((v, idx) => {
              const tier = tierFor(v.quality);
              const isInstalled = v.installedModelId !== null;
              const isInUse = isInstalled && v.installedModelId === runningModelId;
              return (
                <div
                  key={v.fileName}
                  className={`flex items-center gap-3 px-3.5 py-3 ${idx > 0 ? `border-t ${BORDER.subtle}` : ''} ${
                    v.isRecommended ? SURFACE.successCallout : isInstalled ? SURFACE.subtle : ''
                  }`}
                >
                  {/* Tier */}
                  <div className="shrink-0 w-14">
                    {tier ? (
                      <span
                        className={`inline-flex items-center justify-center w-full px-1.5 py-0.5 ${RADIUS.md} text-[10px] font-semibold ${tier.bg} ${tier.text}`}
                      >
                        {tier.label}
                      </span>
                    ) : (
                      <span className={`text-[10px] ${TEXT.faint}`}>—</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[13px] font-mono font-semibold ${TEXT.heading}`}>{v.quant}</span>
                      {v.isRecommended && (
                        <Badge variant="success">
                          <Star className="w-2.5 h-2.5" />
                          Recommended
                        </Badge>
                      )}
                      {isInUse ? (
                        <Badge variant="success">
                          <Check className="w-3 h-3" />
                          In use
                        </Badge>
                      ) : isInstalled ? (
                        <Badge variant="success">
                          <Check className="w-3 h-3" />
                          Installed
                        </Badge>
                      ) : null}
                    </div>
                    <div className={`flex items-center gap-1.5 mt-0.5 min-w-0 ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                      <span className={`font-mono ${TEXT.muted} whitespace-nowrap`}>{formatFileSize(v.size)}</span>
                      {v.note && (
                        <>
                          <span className="shrink-0">·</span>
                          <span className="truncate">{v.note}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  {isInstalled ? (
                    onDeleteVariant && (
                      <button
                        onClick={() => onDeleteVariant(v.installedModelId!)}
                        disabled={isInUse}
                        className={`p-1.5 ${RADIUS.md} ${COMPONENT.destructiveHover} transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0`}
                        title={isInUse ? 'Stop the server to delete this variant' : 'Delete this variant'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  ) : (
                    <Button variant={v.isRecommended ? 'success' : 'outline'} size="sm" className="shrink-0" onClick={() => onGet(v.fileName)}
                      disabled={getDisabled} title={getDisabled ? 'A download is already in progress' : `Download ${v.quant}`}>
                      <Download className="w-3.5 h-3.5" />
                      Get
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          !variantsLoading && (
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>No GGUF variants found.</p>
          )
        )}
      </div>
    </div>
  );
};

export default ModelDetailPane;
