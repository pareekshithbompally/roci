/**
 * LocalInferencePanel Component
 *
 * 4-state progressive disclosure UI for llama.cpp local inference.
 * All data state (binary info, models, server status, config, HF token)
 * is managed by localInferenceStore — survives tab switches.
 *
 * UI-only state (active tab, expanded settings, confirm dialogs) stays local.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Play,
  Square,
  Loader2,
  HardDrive,
  RotateCw,
  Copy,
  Check,
  Lock,
  ChevronDown,
  Trash2,
  Server as ServerIcon,
} from 'lucide-react';
import { useLocalInference, localInferenceStore } from '../stores/localInferenceStore';
import { useActiveDownload } from '@extensions/llamacpp/downloadStore';
import { ServerStatus } from '@extensions/llamacpp/components/ServerStatus';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import type {
  ServerConfig,
} from '@extensions/llamacpp/types';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS, LAYOUT } from '@config/theme.config';
import { SettingsSection, SecretInput } from './shared';
import { ModelManager } from './ModelManager';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui';

/** Smooth continuous rotation for loading icons */
const spin = {
  animate: { rotate: 360 },
  transition: { duration: 0.8, repeat: Infinity, ease: 'linear' as const },
};

export const LocalInferencePanel: React.FC = () => {
  const { providers, updateProvider, saveSettings } = useSettings();
  const { showToast } = useToast();
  const activeDownload = useActiveDownload();

  // All data state from the store (survives unmounts)
  const {
    serverStatus,
    serverConfig,
    serverUrl,
    currentModelId,
    binaryInfo,
    managedModels,
    hfToken: storeHfToken,
    isLoaded,
  } = useLocalInference();

  // UI-only local state
  const [activeTab, setActiveTab] = useState<'server' | 'models'>('server');
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Remove engine confirmation
  const [removeConfirm, setRemoveConfirm] = useState<'idle' | 'confirm' | 'removing'>('idle');
  const removeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server lifecycle auto-config: update provider when server starts/stops.
  // NOTE: This calls saveSettings() to persist the provider URL immediately so
  // the system can use the local server. Changes in other panels should be saved
  // before starting/stopping the server.
  useEffect(() => {
    const llama = providers.find((p) => p.provider === 'llamacpp');
    if (!llama) return;
    if (serverStatus === 'running') {
      const url = localInferenceStore.getSnapshot().serverUrl;
      const apiKey = serverConfig.apiKey || '';
      // Only write (and persist) when the provider config actually differs —
      // otherwise mounting the panel would register a spurious unsaved change.
      if (url && (!llama.active || llama.base_url !== url || (llama.api_key || '') !== apiKey)) {
        updateProvider('llamacpp', { active: true, base_url: url, api_key: apiKey });
        saveSettings();
      }
      setSettingsExpanded(false);
    } else if (serverStatus === 'idle') {
      if (llama.active || llama.base_url || llama.api_key) {
        updateProvider('llamacpp', { active: false, base_url: '', api_key: '' });
        saveSettings();
      }
    }
  }, [serverStatus, serverConfig.apiKey, providers, updateProvider, saveSettings]);

  // Auto-select first model on mount
  useEffect(() => {
    if (!selectedModelId && managedModels.length > 0) {
      setSelectedModelId(managedModels[0].id);
    }
  }, [managedModels, selectedModelId]);

  // Sync model list to provider system — only when it actually differs, so
  // simply opening the panel doesn't register an unsaved change.
  useEffect(() => {
    const llama = providers.find((p) => p.provider === 'llamacpp');
    if (!llama) return;
    const desired = managedModels.map((m) => ({ id: m.id, name: m.name }));
    const current = llama.models ?? [];
    const same =
      current.length === desired.length &&
      desired.every((d, i) => current[i]?.id === d.id && current[i]?.name === d.name);
    if (same) return;
    updateProvider('llamacpp', { models: desired });
    saveSettings();
  }, [managedModels, providers, updateProvider, saveSettings]);

  // Derived
  const isDownloadingBinary =
    activeDownload?.type === 'binary' && activeDownload.status === 'downloading';
  const binaryPhase = activeDownload?.type === 'binary' ? activeDownload.phase : null;
  const isServerBusy = serverStatus === 'starting' || serverStatus === 'stopping';
  const isRunning = serverStatus === 'running';

  // ── 4-State derivation ─────────────────────────────────────────
  const hasEngine = binaryInfo !== null;
  const hasModels = managedModels.length > 0;

  type PanelState = 'no-engine' | 'zero-models' | 'stopped' | 'running';
  const panelState: PanelState = !hasEngine
    ? 'no-engine'
    : !hasModels
      ? 'zero-models'
      : isRunning
        ? 'running'
        : 'stopped';

  const handleDownloadBinary = () => {
    localInferenceStore.startBinaryDownload();
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await localInferenceStore.deleteModel(modelId);
      if (selectedModelId === modelId) {
        setSelectedModelId(null);
      }
      showToast('Model deleted', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const handleStartServer = async () => {
    if (!selectedModelId) {
      showToast('Please select a model first', 'error');
      return;
    }

    try {
      await localInferenceStore.startServer(selectedModelId);
      showToast('Server started', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  /** Run a specific installed model (from the Models tab detail pane). */
  const handleRunModel = useCallback(
    async (modelId: string) => {
      setSelectedModelId(modelId);
      try {
        await localInferenceStore.startServer(modelId);
        showToast('Server started', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'error');
      }
    },
    [showToast],
  );

  const handleStopServer = async () => {
    try {
      await localInferenceStore.stopServer();
      showToast('Server stopped', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const handleCheckForUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const backendMod = await import('@extensions/llamacpp/backend');
      const update = await backendMod.checkForUpdate();
      if (update.hasUpdate) {
        showToast(`Update available: ${update.latestVersion}`, 'info');
      } else {
        showToast('Already on latest', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleRemoveEngine = async () => {
    if (removeConfirm === 'idle') {
      setRemoveConfirm('confirm');
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
      removeTimerRef.current = setTimeout(() => setRemoveConfirm('idle'), 4000);
      return;
    }
    if (removeConfirm === 'confirm') {
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
      setRemoveConfirm('removing');
      try {
        if (isRunning) {
          await localInferenceStore.stopServer();
        }
        const backendMod = await import('@extensions/llamacpp/backend');
        await backendMod.removeEngine();
        await localInferenceStore.refresh();
        showToast('llama-server engine removed', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'error');
      } finally {
        setRemoveConfirm('idle');
      }
    }
  };

  const handleConfigChange = (key: keyof ServerConfig, value: number | string) => {
    localInferenceStore.setServerConfig({ [key]: value });
  };

  const handleCopyUrl = async () => {
    if (!serverUrl) return;
    await navigator.clipboard.writeText(serverUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const selectedModelName = managedModels.find((m) => m.id === selectedModelId)?.name;

  // Summary text for collapsed settings
  const settingsSummary = `Context ${serverConfig.ctxSize} · GPU: ${serverConfig.nGpuLayers === -1 ? 'All' : serverConfig.nGpuLayers} · Threads: ${serverConfig.threads}`;

  return (
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-6`}>
      {/* Header */}
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading} mb-1`}>
          Local Inference
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted}`}>
          Run AI models locally with llama.cpp
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STATE 1: no-engine — Setup card with download CTA          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {panelState === 'no-engine' && (
        <div className={`flex items-center justify-between px-4 py-3 ${SURFACE.card} border ${BORDER.default} ${RADIUS.lg}`}>
          <div className="min-w-0">
            <p className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
              llama-server
            </p>
            <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
              Local inference engine
            </p>
          </div>
          <button
            onClick={handleDownloadBinary}
            disabled={isDownloadingBinary}
            className={`${COMPONENT.settingsButtonPrimary} whitespace-nowrap`}
          >
            {isDownloadingBinary ? (
              <motion.span {...spin}><Loader2 className="w-4 h-4" /></motion.span>
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isDownloadingBinary
              ? (binaryPhase === 'extracting' ? 'Extracting...' :
                 binaryPhase === 'validating' ? 'Validating...' :
                 'Downloading...')
              : 'Download'}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STATE 2: zero-models — Engine bar + hero model acquisition  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {panelState === 'zero-models' && binaryInfo && (
        <>
          <div className={`px-4 py-3 ${SURFACE.card} border ${BORDER.default} ${RADIUS.lg} flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <ServerStatus />
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                llama-server {binaryInfo.version}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCheckForUpdate}
                disabled={isCheckingUpdate}
                className={COMPONENT.settingsMutedLink}
              >
                <motion.span
                  animate={isCheckingUpdate ? { rotate: 360 } : { rotate: 0 }}
                  transition={isCheckingUpdate
                    ? { duration: 0.8, repeat: Infinity, ease: 'linear' }
                    : { duration: 0.3, ease: 'easeOut' }
                  }
                >
                  <RotateCw className="w-3 h-3" />
                </motion.span>
                {isCheckingUpdate ? 'Checking...' : 'Check for updates'}
              </button>
              <button
                onClick={handleRemoveEngine}
                disabled={removeConfirm === 'removing'}
                className={removeConfirm === 'confirm' ? COMPONENT.settingsDestructiveLinkActive : COMPONENT.settingsDestructiveLink}
                title="Remove llama-server engine"
              >
                {removeConfirm === 'removing' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                {removeConfirm === 'confirm' ? 'Click again to confirm' : removeConfirm === 'removing' ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>

          <div className={`px-5 py-5 ${SURFACE.card} border ${BORDER.default} ${RADIUS.lg}`}>
            <ModelManager
              installedModels={managedModels}
              hfToken={storeHfToken}
              runningModelId={currentModelId}
              isRunning={isRunning}
              isServerBusy={isServerBusy}
              onRunModel={handleRunModel}
              onStopServer={handleStopServer}
              onDeleteModel={handleDeleteModel}
            />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STATE 3 & 4: stopped / running — Two-column master-detail */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {(panelState === 'stopped' || panelState === 'running') && binaryInfo && (
        <div className="flex gap-6 items-start">
          {/* ── Left: Nav sidebar ── */}
          <div className="w-48 shrink-0">
            <SettingsSection title="Sections">
              <div className="space-y-1">
                {([
                  { id: 'server' as const, label: 'Local Server', icon: ServerIcon },
                  { id: 'models' as const, label: 'Local Models', icon: HardDrive },
                ] as const).map((tab) => {
                  const isSelected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 ${RADIUS.md} text-left transition-all border ${
                        isSelected
                          ? `${SURFACE.selectedCard} ${BORDER.selectedCard}`
                          : `${SURFACE.card} ${BORDER.default} ${BORDER.cardHover}`
                      }`}
                    >
                      <tab.icon className={`w-4 h-4 ${isSelected ? TEXT.heading : TEXT.faint}`} />
                      <span className={`flex-1 truncate ${TYPOGRAPHY_CLASSES.settingsInputLabel} ${
                        isSelected ? TEXT.heading : TEXT.primary
                      }`}>
                        {tab.label}
                      </span>
                      {tab.id === 'server' && isRunning && (
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      )}
                      {tab.id === 'models' && managedModels.length > 0 && (
                        <span className={`${TYPOGRAPHY_CLASSES.settingsLabel} ${TEXT.faint}`}>
                          {managedModels.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </SettingsSection>
          </div>

          {/* ── Right: Detail panel ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* ═══ Server Tab ═══ */}
            {activeTab === 'server' && (
              <div className={`${SURFACE.card} border ${BORDER.default} ${RADIUS.lg} overflow-hidden`}>

                {/* ── Model row ── */}
                <div className={`px-4 py-3 border-b ${BORDER.default}`}>
                  {isRunning ? (
                    <div className="flex items-center gap-2">
                      <Lock className={`w-3.5 h-3.5 ${TEXT.faint}`} />
                      <span className={`${TYPOGRAPHY_CLASSES.settingsInput} font-medium ${TEXT.heading}`}>
                        {selectedModelName || 'Unknown model'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                        Model
                      </label>
                      <Select
                        value={selectedModelId ?? undefined}
                        onValueChange={(val) => setSelectedModelId(val || null)}
                      >
                        <SelectTrigger className={TYPOGRAPHY_CLASSES.settingsInput}>
                          <SelectValue placeholder="Select a model..." />
                        </SelectTrigger>
                        <SelectContent>
                          {managedModels.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex items-center justify-between w-full gap-2">
                                <span className="truncate">{m.name}</span>
                                <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint} shrink-0`}>
                                  {formatBytes(m.fileSize)}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* ── Settings summary / expanded ── */}
                <div className={`px-4 py-3 border-b ${BORDER.default}`}>
                  {isRunning ? (
                    <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                      {settingsSummary}
                    </p>
                  ) : (
                    <>
                      <button
                        onClick={() => setSettingsExpanded(!settingsExpanded)}
                        className={`flex items-center gap-2 w-full text-left group`}
                      >
                        <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} group-hover:${TEXT.primary}`}>
                          {settingsSummary}
                        </span>
                        <motion.span
                          animate={{ rotate: settingsExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className={`w-3.5 h-3.5 ${TEXT.faint}`} />
                        </motion.span>
                        <span className={`ml-auto ${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.link} opacity-0 group-hover:opacity-100 transition-opacity`}>
                          {settingsExpanded ? 'Collapse' : 'Edit'}
                        </span>
                      </button>

                      {settingsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="pt-3 space-y-3"
                        >
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                                Context Size
                              </label>
                              <input
                                type="number"
                                value={serverConfig.ctxSize}
                                onChange={(e) =>
                                  handleConfigChange('ctxSize', parseInt(e.target.value) || 4096)
                                }
                                min={256}
                                max={131072}
                                step={256}
                                className={`w-full px-3 py-2 ${COMPONENT.settingsInput} ${TYPOGRAPHY_CLASSES.settingsInput}`}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                                GPU Layers
                              </label>
                              <input
                                type="number"
                                value={serverConfig.nGpuLayers}
                                onChange={(e) =>
                                  handleConfigChange('nGpuLayers', parseInt(e.target.value) || -1)
                                }
                                min={-1}
                                max={999}
                                className={`w-full px-3 py-2 ${COMPONENT.settingsInput} ${TYPOGRAPHY_CLASSES.settingsInput}`}
                              />
                              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                                -1 = all
                              </p>
                            </div>

                            <div className="space-y-1">
                              <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                                CPU Threads
                              </label>
                              <input
                                type="number"
                                value={serverConfig.threads}
                                onChange={(e) =>
                                  handleConfigChange('threads', parseInt(e.target.value) || 4)
                                }
                                min={1}
                                max={64}
                                className={`w-full px-3 py-2 ${COMPONENT.settingsInput} ${TYPOGRAPHY_CLASSES.settingsInput}`}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                              API Key (optional)
                            </label>
                            <SecretInput
                              value={serverConfig.apiKey || ''}
                              onChange={(val) => handleConfigChange('apiKey', val)}
                              placeholder="Set a key to protect the local server"
                              showCopy={false}
                            />
                          </div>
                        </motion.div>
                      )}
                    </>
                  )}
                </div>

                {/* ── Status + Server controls ── */}
                <div className={`px-4 py-3 ${isRunning ? `border-b ${BORDER.default}` : ''}`}>
                  <div className="flex items-center justify-between">
                    <ServerStatus />
                    {isRunning ? (
                      <button
                        onClick={handleStopServer}
                        disabled={isServerBusy}
                        className={COMPONENT.settingsButtonDanger}
                      >
                        <Square className="w-3.5 h-3.5" />
                        Stop Server
                      </button>
                    ) : (
                      <button
                        onClick={handleStartServer}
                        disabled={isServerBusy || !selectedModelId}
                        className={COMPONENT.settingsButtonSuccess}
                        title={!selectedModelId ? 'Select a model first' : undefined}
                      >
                        {isServerBusy ? (
                          <motion.span {...spin}><Loader2 className="w-3.5 h-3.5" /></motion.span>
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        Start Server
                      </button>
                    )}
                  </div>
                </div>

                {/* ── URL row (running only) ── */}
                {isRunning && serverUrl && (
                  <div className={`px-4 py-3 border-b ${BORDER.default} flex items-center justify-between`}>
                    <code className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} font-mono`}>
                      {serverUrl}
                    </code>
                    <button
                      onClick={handleCopyUrl}
                      className={`p-1.5 ${COMPONENT.iconButtonSm}`}
                      title="Copy URL"
                    >
                      {copiedUrl ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {/* ── Footer: version + update + remove ── */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                    llama-server {binaryInfo.version}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCheckForUpdate}
                      disabled={isCheckingUpdate}
                      className={COMPONENT.settingsMutedLink}
                    >
                      <motion.span
                        animate={isCheckingUpdate ? { rotate: 360 } : { rotate: 0 }}
                        transition={isCheckingUpdate
                          ? { duration: 0.8, repeat: Infinity, ease: 'linear' }
                          : { duration: 0.3, ease: 'easeOut' }
                        }
                      >
                        <RotateCw className="w-3 h-3" />
                      </motion.span>
                      {isCheckingUpdate ? 'Checking...' : 'Check for updates'}
                    </button>
                    <button
                      onClick={handleRemoveEngine}
                      disabled={removeConfirm === 'removing'}
                      className={removeConfirm === 'confirm' ? COMPONENT.settingsDestructiveLinkActive : COMPONENT.settingsDestructiveLink}
                      title="Remove llama-server engine"
                    >
                      {removeConfirm === 'removing' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      {removeConfirm === 'confirm' ? 'Click again to confirm' : removeConfirm === 'removing' ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>

                {/* Binary download progress */}
                {isDownloadingBinary && (
                  <div className={`px-4 py-3 border-t ${BORDER.default} flex items-center gap-2`}>
                    <motion.span {...spin}><Loader2 className={`w-3.5 h-3.5 ${TEXT.faint}`} /></motion.span>
                    <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                      {binaryPhase === 'extracting'
                        ? 'Extracting archive...'
                        : binaryPhase === 'validating'
                          ? 'Validating binary...'
                          : 'Downloading... (see progress in bottom-right)'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ═══ Models Tab ═══ */}
            {activeTab === 'models' && (
              <ModelManager
                installedModels={managedModels}
                hfToken={storeHfToken}
                runningModelId={currentModelId}
                isRunning={isRunning}
                isServerBusy={isServerBusy}
                onRunModel={handleRunModel}
                onStopServer={handleStopServer}
                onDeleteModel={handleDeleteModel}
              />
            )}

          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default LocalInferencePanel;
