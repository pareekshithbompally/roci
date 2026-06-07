/**
 * ModelBrowser Component
 *
 * Smart single-input UI for acquiring GGUF models:
 *   - Type text → debounced HuggingFace search
 *   - Paste repo URL → jumps to quant table
 *   - Paste file URL → starts direct download
 *   - [Open] button → native file picker
 *
 * Two variants:
 *   - hero: zero-model state — shows popular picks below input
 *   - inline: has-models state — compact, no popular picks
 *
 * Download progress is handled globally by downloadStore + DownloadBanner.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Search,
  Download,
  FolderOpen,
  Loader2,
  ArrowLeft,
  ChevronRight,
  Heart,
  Star,
  Check,
} from 'lucide-react';
import * as models from '../models';
import { downloadStore, useActiveDownload } from '../downloadStore';
import { useToast } from '@shared/contexts/ToastContext';
import type { HfModelResult, HfModelFile } from '../types';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT, TIER } from '@config/theme.config';

interface ModelBrowserProps {
  onModelAdded: () => void;
  hfToken?: string;
  variant: 'hero' | 'inline';
  /** File names of already-installed models — hides download for duplicates */
  installedFileNames?: Set<string>;
}

export const ModelBrowser: React.FC<ModelBrowserProps> = ({ onModelAdded, hfToken, variant, installedFileNames }) => {
  const { showToast } = useToast();
  const activeDownload = useActiveDownload();
  const isDownloading = activeDownload?.status === 'downloading';

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HfModelResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // File browser state (quant table)
  const [selectedRepo, setSelectedRepo] = useState<HfModelResult | null>(null);
  const [repoFiles, setRepoFiles] = useState<HfModelFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Local import
  const [isImporting, setIsImporting] = useState(false);

  // Debounce ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokenValue = hfToken?.trim() || undefined;

  // ── Smart input handler ────────────────────────────────────────

  const handleInputChange = useCallback((query: string) => {
    setSearchQuery(query);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    // Auto-detect: HuggingFace URL?
    const parsed = models.parseHuggingFaceUrl(query.trim());
    if (parsed) {
      if (parsed.fileName && parsed.downloadUrl) {
        // Full file URL → direct download
        downloadStore.startUrlDownload(query.trim(), tokenValue);
        setSearchQuery('');
        return;
      }
      if (parsed.repo) {
        // Repo URL → open quant table
        handleSelectRepo({
          id: parsed.repo,
          author: parsed.repo.split('/')[0],
          downloads: 0,
          likes: 0,
          tags: [],
        });
        setSearchQuery('');
        return;
      }
    }

    // Text search → debounced HF search
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await models.searchHfModels(query.trim());
        setSearchResults(results);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'error');
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, [showToast, tokenValue]);

  // ── Select repo → load quant table ─────────────────────────────

  const handleSelectRepo = async (repo: HfModelResult) => {
    setSelectedRepo(repo);
    setSearchQuery('');
    setSearchResults([]);
    setIsLoadingFiles(true);

    try {
      const files = await models.listHfRepoFiles(repo.id, tokenValue);
      setRepoFiles(models.sortFilesByQuant(files));
      if (files.length === 0) {
        showToast('No GGUF files found in this repository', 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('401') || msg.includes('403')) {
        showToast(msg + '. This may be a gated model — add your HuggingFace token.', 'error');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // ── Popular pick → load quant table ────────────────────────────

  const handlePickPopular = (pick: models.PopularModel) => {
    handleSelectRepo({
      id: pick.repoId,
      author: pick.repoId.split('/')[0],
      downloads: 0,
      likes: 0,
      tags: [],
    });
  };

  // ── Download a file ────────────────────────────────────────────

  const handleDownloadFile = (file: HfModelFile) => {
    if (!selectedRepo || isDownloading) return;
    downloadStore.startModelDownload(selectedRepo.id, file.name, tokenValue);
  };

  // ── Local import ───────────────────────────────────────────────

  const handleImportLocal = async () => {
    setIsImporting(true);
    try {
      const result = await models.importLocalModel();
      if (result) {
        showToast(`Imported ${result.name}`, 'success');
        onModelAdded();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // ── Back to search ─────────────────────────────────────────────

  const handleBackToSearch = () => {
    setSelectedRepo(null);
    setRepoFiles([]);
  };

  // ── Formatting helpers ─────────────────────────────────────────

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDownloads = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const showSearchView = !selectedRepo;

  // ── Quality badge color ────────────────────────────────────────

  const getTier = (quality: string) =>
    TIER[quality as keyof typeof TIER] ?? null;

  return (
    <div className="space-y-3">
      {/* ── Search View ── */}
      {showSearchView && (
        <>
          {/* Smart input + Open button */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${TEXT.faint}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="Search models or paste HuggingFace URL..."
                className={`w-full pl-10 pr-3 py-2.5 ${SURFACE.inputField} border ${BORDER.input} rounded-lg ${TYPOGRAPHY_CLASSES.settingsInput} outline-none ${BORDER.inputFocus} transition-all`}
              />
              {isSearching && (
                <Loader2 className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${TEXT.faint} animate-spin`} />
              )}
            </div>
            <button
              onClick={handleImportLocal}
              disabled={isImporting}
              className={`px-3 py-2.5 ${SURFACE.inputField} border ${BORDER.input} rounded-lg ${TYPOGRAPHY_CLASSES.settingsButton} ${TEXT.muted} hover:${TEXT.primary} transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0`}
              title="Import local .gguf file"
            >
              {isImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderOpen className="w-4 h-4" />
              )}
              Open
            </button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className={`max-h-64 overflow-y-auto border ${BORDER.input} rounded-lg divide-y divide-parchment-300 dark:divide-night-800`}>
              {searchResults.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => handleSelectRepo(repo)}
                  className={`w-full text-left px-3 py-2.5 ${COMPONENT.dropdownItemHover} transition-colors flex items-center justify-between gap-2`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`${TYPOGRAPHY_CLASSES.settingsInput} font-medium ${TEXT.heading} truncate`}>
                      {repo.id}
                    </div>
                    <div className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} flex items-center gap-3`}>
                      <span className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        {formatDownloads(repo.downloads)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        {repo.likes}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${TEXT.faint} shrink-0`} />
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} text-center py-3`}>
              No GGUF models found for &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {/* ── Popular Picks (hero variant only, when no search active) ── */}
          {variant === 'hero' && !searchQuery.trim() && (
            <div className="space-y-2 pt-1">
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} flex items-center gap-1.5`}>
                <Star className="w-3 h-3" />
                Popular models
              </span>
              <div className="space-y-1.5">
                {models.POPULAR_PICKS.map((pick) => (
                  <button
                    key={pick.repoId}
                    onClick={() => handlePickPopular(pick)}
                    className={`w-full text-left px-3.5 py-3 ${SURFACE.card} border ${BORDER.input} rounded-lg ${COMPONENT.dropdownItemHover} transition-colors flex items-center justify-between gap-3`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`${TYPOGRAPHY_CLASSES.settingsInput} font-medium ${TEXT.heading}`}>
                        {pick.label}
                      </div>
                      <div className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                        {pick.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} font-mono`}>
                        {pick.sizeApprox}
                      </span>
                      <ChevronRight className={`w-4 h-4 ${TEXT.faint}`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Quant Table (repo selected) ── */}
      {selectedRepo && (
        <>
          {/* Back + repo name */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackToSearch}
              className={`p-1.5 rounded-md ${TEXT.faint} hover:${TEXT.secondary} ${COMPONENT.dropdownItemHover} transition-all`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className={`${TYPOGRAPHY_CLASSES.settingsInput} font-medium ${TEXT.heading} truncate`}>
                {selectedRepo.id}
              </div>
              <div className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                Select a quantization variant
              </div>
            </div>
          </div>

          {isLoadingFiles ? (
            <div className={`flex items-center justify-center gap-2 py-6 ${TEXT.faint}`}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={TYPOGRAPHY_CLASSES.settingsHelper}>Loading files...</span>
            </div>
          ) : repoFiles.length > 0 ? (
            <div className={`max-h-80 overflow-y-auto border ${BORDER.input} rounded-lg`}>
              {repoFiles.map((file, idx) => {
                const quant = models.getQuantLabel(file.name);
                const meta = quant ? models.getQuantMetadata(quant) : null;
                const tier = meta ? getTier(meta.quality) : null;
                const isInstalled = installedFileNames?.has(file.name) ?? false;
                const isRecommended = !!meta?.recommended;

                return (
                  <div
                    key={file.name}
                    className={`flex items-center gap-3 px-3.5 py-3 transition-colors ${
                      idx > 0 ? 'border-t border-parchment-300 dark:border-night-800/60' : ''
                    } ${
                      isRecommended
                        ? 'bg-green-50/50 dark:bg-green-900/10 border-l-2 border-l-green-500 dark:border-l-green-400'
                        : isInstalled
                          ? 'opacity-60'
                          : `${COMPONENT.dropdownItemHover}`
                    }`}
                  >
                    {/* Left: tier color bar */}
                    <div className="flex flex-col items-center shrink-0 w-12">
                      {tier ? (
                        <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${tier.bg} ${tier.text} w-full text-center`}>
                          {tier.label}
                        </span>
                      ) : (
                        <span className={`text-[10px] ${TEXT.faint}`}>—</span>
                      )}
                    </div>

                    {/* Middle: quant info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-mono font-semibold ${TEXT.heading}`}>
                          {quant || file.name.split('/').pop()}
                        </span>
                        {isRecommended && (
                          <span className={`${COMPONENT.recommendedBadge} flex items-center gap-1`}>
                            <Star className="w-2.5 h-2.5" />
                            Recommended
                          </span>
                        )}
                        {isInstalled && (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
                            <Check className="w-3 h-3" />
                            Installed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[12px] font-mono font-medium ${TEXT.muted}`}>
                          {formatBytes(file.size)}
                        </span>
                        {meta && (
                          <>
                            <span className={`${TEXT.faint}`}>·</span>
                            <span className={`text-[12px] ${TEXT.faint}`}>
                              {meta.note}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: download or installed indicator */}
                    {!isInstalled ? (
                      <button
                        onClick={() => handleDownloadFile(file)}
                        disabled={isDownloading}
                        className={`px-2.5 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5 shrink-0 transition-colors ${
                          isRecommended
                            ? 'bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-500 text-white disabled:opacity-50'
                            : `${SURFACE.inputField} border ${BORDER.input} ${TEXT.muted} hover:${TEXT.heading} hover:border-parchment-500 dark:hover:border-night-600 disabled:opacity-50`
                        }`}
                        title={`Download ${quant || file.name}`}
                      >
                        <Download className="w-3 h-3" />
                        Get
                      </button>
                    ) : (
                      <div className="w-[60px] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default ModelBrowser;
