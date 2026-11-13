/**
 * ModelManager — the Local Models experience (panes 2 + 3)
 *
 * A persistent two-pane workspace:
 *   - Master list (left): an Installed ⇄ Discover toggle with a context-aware
 *     search. Installed = your registry, filtered locally. Discover = debounced
 *     HuggingFace GGUF search (via TanStack Query).
 *   - Detail (right): ModelDetailPane, re-pointed when a row is clicked. No back
 *     button — the list stays put and the detail swaps in place.
 *
 * Both lists are bounded, independently-scrolling regions, so neither a large
 * installed registry nor a long result set ever pushes the other off-screen.
 *
 * State: HF reads → TanStack Query (extensions/llamacpp/hooks). Downloads →
 * useDownloadStore. Installed registry → localInferenceStore. Ephemeral UI
 * (mode, query text, selection) → local component state.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Search, FolderOpen, Loader2, Package, Compass, ChevronRight } from 'lucide-react';
import * as models from '@extensions/llamacpp/models';
import type { VariantRow } from '@extensions/llamacpp/models';
import type { ManagedModel } from '@extensions/llamacpp/types';
import { useHfModelSearch, useHfRepoFiles } from '@extensions/llamacpp/hooks';
import { useActiveDownload, useDownloadStore } from '@extensions/llamacpp/downloadStore';
import { localInferenceStore, saveHfToken } from '@features/settings/stores/localInferenceStore';
import { useToast } from '@shared/contexts/ToastContext';
import { useDebounce } from '@shared/hooks';
import { SURFACE, BORDER, TEXT, RADIUS } from '@config/theme.config';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { formatFileSize } from '@shared/utils/formatters';
import { SecretInput, ModelListItem } from './shared';
import { ModelDetailPane, type DetailMetaChip } from './ModelDetailPane';
import { Button, Input } from '@shared/ui';

type Mode = 'installed' | 'discover';

export interface ModelManagerProps {
  installedModels: ManagedModel[];
  hfToken: string;
  runningModelId: string | null;
  isRunning: boolean;
  isServerBusy: boolean;
  onRunModel: (modelId: string) => void;
  onStopServer: () => void;
  onDeleteModel: (modelId: string) => void;
}

/** Compact count, e.g. 1.2M / 348K / 90 */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Build a single variant row from an installed model (local / repo-less). */
function syntheticRow(m: ManagedModel): VariantRow {
  const label = models.getQuantLabel(m.fileName);
  const meta = label ? models.getQuantMetadata(label) : null;
  return {
    fileName: m.fileName,
    quant: label ?? m.fileName,
    size: m.fileSize,
    note: meta?.note ?? null,
    quality: meta?.quality ?? null,
    isRecommended: false,
    installedModelId: m.id,
  };
}

export const ModelManager: React.FC<ModelManagerProps> = ({
  installedModels,
  hfToken,
  runningModelId,
  isRunning,
  isServerBusy,
  onRunModel,
  onStopServer,
  onDeleteModel,
}) => {
  const { showToast } = useToast();
  const activeDownload = useActiveDownload();
  const isDownloading = activeDownload?.status === 'downloading';

  // ── UI state (ephemeral) ──
  const [mode, setMode] = useState<Mode>(installedModels.length > 0 ? 'installed' : 'discover');
  const [query, setQuery] = useState('');
  const [selectedInstalledId, setSelectedInstalledId] = useState<string | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState(hfToken);
  const [isImporting, setIsImporting] = useState(false);

  const debouncedQuery = useDebounce(query, 350);
  const token = hfToken.trim() || undefined;

  useEffect(() => setTokenDraft(hfToken), [hfToken]);

  // ── Installed list (filtered locally) ──
  const filteredInstalled = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? installedModels.filter((m) => m.name.toLowerCase().includes(q)) : installedModels;
  }, [installedModels, query]);

  // Keep a valid installed selection
  useEffect(() => {
    if (mode !== 'installed') return;
    const stillValid = installedModels.some((m) => m.id === selectedInstalledId);
    if (!stillValid) setSelectedInstalledId(installedModels[0]?.id ?? null);
  }, [mode, installedModels, selectedInstalledId]);

  const selectedModel = installedModels.find((m) => m.id === selectedInstalledId) ?? null;

  // ── Discover search (HF, via Query) ──
  const search = useHfModelSearch(mode === 'discover' ? debouncedQuery : '');
  const searchResults = search.data ?? [];

  // ── Detail subject → repo files (via Query) ──
  const installedRepoId = useMemo(() => {
    if (!selectedModel?.sourceUrl) return null;
    return models.parseHuggingFaceUrl(selectedModel.sourceUrl)?.repo ?? null;
  }, [selectedModel]);

  const subjectRepoId = mode === 'installed' ? installedRepoId : selectedRepoId;
  const repoFiles = useHfRepoFiles(subjectRepoId, token);

  const variants = useMemo<VariantRow[]>(() => {
    const files = repoFiles.data ?? [];
    if (files.length > 0) return models.buildVariantRows(files, installedModels);
    if (mode === 'installed' && selectedModel) return [syntheticRow(selectedModel)];
    return [];
  }, [repoFiles.data, installedModels, mode, selectedModel]);

  // ── Handlers ──
  const handleQueryChange = (value: string) => {
    if (mode === 'discover') {
      const parsed = models.parseHuggingFaceUrl(value.trim());
      if (parsed?.fileName && parsed.downloadUrl) {
        useDownloadStore.getState().startUrlDownload(value.trim(), token);
        setQuery('');
        return;
      }
      if (parsed?.repo) {
        setSelectedRepoId(parsed.repo);
        setQuery('');
        return;
      }
    }
    setQuery(value);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const result = await models.importLocalModel();
      if (result) {
        await localInferenceStore.refresh();
        setMode('installed');
        setSelectedInstalledId(result.id);
        showToast(`Imported ${result.name}`, 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleTokenBlur = async () => {
    if (tokenDraft.trim() === hfToken.trim()) return;
    await saveHfToken(tokenDraft.trim());
    if (tokenDraft.trim()) showToast('HuggingFace token saved', 'success');
  };

  const handleGet = (fileName: string) => {
    if (!subjectRepoId || isDownloading) return;
    useDownloadStore.getState().startModelDownload(subjectRepoId, fileName, token);
  };

  // ── Detail props ──
  const isThisRunning = isRunning && !!selectedModel && runningModelId === selectedModel.id;
  const detail = buildDetailProps({
    mode,
    selectedModel,
    installedRepoId,
    selectedRepoId,
    searchResults,
    variantCount: repoFiles.data?.length ?? 0,
  });

  return (
    <div className="flex gap-4 h-[32rem]">
      {/* ── Master list ── */}
      <div className="w-72 shrink-0 flex flex-col min-h-0 gap-3">
        {/* Toggle */}
        <div className={`flex p-1 ${SURFACE.subtle} border ${BORDER.default} ${RADIUS.md}`}>
          {(
            [
              { id: 'installed' as const, label: 'Installed', icon: Package, count: installedModels.length },
              { id: 'discover' as const, label: 'Discover', icon: Compass, count: null },
            ] as const
          ).map((t) => {
            const active = mode === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setMode(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 ${RADIUS.md} ${TYPOGRAPHY_CLASSES.settingsLabel} transition-all ${
                  active ? `${SURFACE.card} ${TEXT.heading}` : `${TEXT.muted}`
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count !== null && <span className={active ? TEXT.muted : TEXT.faint}>{t.count}</span>}
              </button>
            );
          })}
        </div>

        {/* Search + import */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${TEXT.faint}`} />
            <Input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder={mode === 'installed' ? 'Filter your models…' : 'Search Hugging Face or paste a URL…'}
              className="w-full pl-9 pr-8"
            />
            {mode === 'discover' && search.isFetching && (
              <Loader2 className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 ${TEXT.faint} animate-spin`} />
            )}
          </div>
          {mode === 'discover' && (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={handleImport}
              disabled={isImporting}
              title="Import a local .gguf file"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
            </Button>
          )}
        </div>

        {/* HF token (discover only) */}
        {mode === 'discover' && (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <SecretInput
                value={tokenDraft}
                onChange={setTokenDraft}
                onBlur={handleTokenBlur}
                placeholder="hf_… (for gated models)"
                showCopy={false}
              />
            </div>
            <a
              href="https://huggingface.co/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.link} hover:underline shrink-0`}
            >
              Token
            </a>
          </div>
        )}

        {/* List (bounded, independently scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
          {mode === 'installed' ? renderInstalledList() : renderDiscoverList()}
        </div>
      </div>

      {/* ── Detail (persistent) ── */}
      <div className="flex-1 min-w-0 h-full">
        <ModelDetailPane
          {...detail}
          variantsTitle={mode === 'installed' ? 'Variants' : 'Choose a quantization'}
          variantsLoading={repoFiles.isLoading}
          variantsError={repoFiles.isError}
          variants={variants}
          runningModelId={runningModelId}
          onGet={handleGet}
          getDisabled={isDownloading}
          onDeleteVariant={mode === 'installed' ? onDeleteModel : undefined}
          primary={
            mode === 'installed' && selectedModel
              ? {
                  mode: isThisRunning ? 'stop' : 'run',
                  onClick: isThisRunning ? onStopServer : () => onRunModel(selectedModel.id),
                  disabled: isServerBusy,
                }
              : undefined
          }
          onDeleteModel={mode === 'installed' && selectedModel ? () => onDeleteModel(selectedModel.id) : undefined}
          deleteModelDisabled={isThisRunning}
        />
      </div>
    </div>
  );

  // ── List renderers ──

  function renderInstalledList() {
    if (installedModels.length === 0) {
      return (
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} py-3 px-1`}>
          No models yet. Switch to <span className={TEXT.secondary}>Discover</span> to add one.
        </p>
      );
    }
    if (filteredInstalled.length === 0) {
      return (
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} py-3 px-1`}>
          No models match &ldquo;{query}&rdquo;.
        </p>
      );
    }
    return filteredInstalled.map((m) => {
      const quant = models.getQuantLabel(m.fileName);
      return (
        <ModelListItem
          key={m.id}
          name={m.name}
          subtitle={`${formatFileSize(m.fileSize)}${quant ? ` · ${quant}` : ''}`}
          selected={selectedInstalledId === m.id}
          onClick={() => setSelectedInstalledId(m.id)}
          rightSlot={
            isRunning && runningModelId === m.id ? (
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Running" />
            ) : undefined
          }
        />
      );
    });
  }

  function renderDiscoverList() {
    if (!debouncedQuery.trim()) {
      return (
        <>
          <p className={`${TYPOGRAPHY_CLASSES.settingsLabel} ${TEXT.muted} uppercase tracking-wide px-1 pb-1`}>
            Popular picks
          </p>
          {models.POPULAR_PICKS.map((pick) => (
            <ModelListItem
              key={pick.repoId}
              name={pick.label}
              subtitle={`${pick.description} · ${pick.sizeApprox}`}
              selected={selectedRepoId === pick.repoId}
              onClick={() => setSelectedRepoId(pick.repoId)}
              rightSlot={<ChevronRight className={`w-4 h-4 ${TEXT.faint}`} />}
            />
          ))}
        </>
      );
    }
    if (search.isError) {
      return (
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} py-3 px-1`}>
          Search failed. Check your connection and try again.
        </p>
      );
    }
    if (!search.isFetching && searchResults.length === 0) {
      return (
        <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} py-3 px-1`}>
          No GGUF models found for &ldquo;{debouncedQuery}&rdquo;.
        </p>
      );
    }
    return searchResults.map((repo) => (
      <ModelListItem
        key={repo.id}
        name={repo.id}
        subtitle={`↓ ${formatCount(repo.downloads)} · ♥ ${repo.likes}`}
        selected={selectedRepoId === repo.id}
        onClick={() => setSelectedRepoId(repo.id)}
        rightSlot={<ChevronRight className={`w-4 h-4 ${TEXT.faint}`} />}
      />
    ));
  }
};

// ── Detail header construction (pure) ──

function buildDetailProps(args: {
  mode: Mode;
  selectedModel: ManagedModel | null;
  installedRepoId: string | null;
  selectedRepoId: string | null;
  searchResults: { id: string; downloads: number; likes: number }[];
  variantCount: number;
}): { show: boolean; emptyLabel: string; title: string; repoId: string | null; metaChips: DetailMetaChip[] } {
  const { mode, selectedModel, installedRepoId, selectedRepoId, searchResults, variantCount } = args;

  if (mode === 'installed') {
    if (!selectedModel) {
      return { show: false, emptyLabel: 'Select a model to see details & variants.', title: '', repoId: null, metaChips: [] };
    }
    const quant = models.getQuantLabel(selectedModel.fileName);
    const chips: DetailMetaChip[] = [
      { label: 'Size', value: formatFileSize(selectedModel.fileSize) },
      { label: 'Quant', value: quant ?? '—' },
      { label: 'Source', value: selectedModel.source === 'local' ? 'Local file' : 'Hugging Face' },
    ];
    if (selectedModel.ggufVersion != null) chips.push({ label: 'GGUF', value: `v${selectedModel.ggufVersion}` });
    return { show: true, emptyLabel: '', title: selectedModel.name, repoId: installedRepoId, metaChips: chips };
  }

  // discover
  if (!selectedRepoId) {
    return { show: false, emptyLabel: 'Select a model to see its variants.', title: '', repoId: null, metaChips: [] };
  }
  const hit = searchResults.find((r) => r.id === selectedRepoId);
  const chips: DetailMetaChip[] = [];
  if (hit) {
    chips.push({ label: '↓', value: formatCount(hit.downloads) });
    chips.push({ label: '♥', value: String(hit.likes) });
  }
  if (variantCount > 0) chips.push({ label: 'Variants', value: String(variantCount) });
  return { show: true, emptyLabel: '', title: selectedRepoId.split('/').pop() ?? selectedRepoId, repoId: selectedRepoId, metaChips: chips };
}

export default ModelManager;
