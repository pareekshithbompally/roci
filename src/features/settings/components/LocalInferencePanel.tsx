/**
 * LocalInferencePanel Component
 *
 * 4-state progressive disclosure UI for llama.cpp local inference:
 *   State 1: no-engine   — Setup card with download CTA only
 *   State 2: zero-models — Engine status bar + hero model acquisition card
 *   State 3: stopped     — Full control deck + models section
 *   State 4: running     — Locked control deck + models section
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Play,
  Square,
  Loader2,
  HardDrive,
  RefreshCw,
  Key,
  RotateCw,
  Copy,
  Check,
  Lock,
  ChevronDown,
  Trash2,
  Server as ServerIcon,
} from 'lucide-react';
import * as backend from '@extensions/llamacpp/backend';
import * as models from '@extensions/llamacpp/models';
import * as server from '@extensions/llamacpp/server';
import { loadHfToken, saveHfToken } from '@extensions/llamacpp/settings';
import { downloadStore, useActiveDownload } from '@extensions/llamacpp/downloadStore';
import { ModelBrowser } from '@extensions/llamacpp/components/ModelBrowser';
import { ServerStatus } from '@extensions/llamacpp/components/ServerStatus';
import { useSettings } from '@shared/contexts/SettingsContext';
import { useToast } from '@shared/contexts/ToastContext';
import type {
  InstalledBinary,
  ManagedModel,
  ServerStatus as ServerStatusType,
  ServerConfig,
} from '@extensions/llamacpp/types';
import { TYPOGRAPHY_CLASSES } from '@config/typography.config';
import { SURFACE, BORDER, TEXT, COMPONENT, RADIUS, LAYOUT } from '@config/theme.config';
import { SettingsSection, SecretInput, ModelListItem } from './shared';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui';

/** Smooth continuous rotation for loading icons */
const spin = {
  animate: { rotate: 360 },
  transition: { duration: 0.8, repeat: Infinity, ease: 'linear' as const },
};

export const LocalInferencePanel: React.FC = () => {
  const { updateProvider, saveSettings } = useSettings();
  const { showToast } = useToast();
  const activeDownload = useActiveDownload();

  // Engine state
  const [binaryInfo, setBinaryInfo] = useState<InstalledBinary | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  // Models state
  const [managedModels, setManagedModels] = useState<ManagedModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Server state
  const [serverStatus, setServerStatus] = useState<ServerStatusType>(server.getStatus());
  const [config, setConfig] = useState<ServerConfig>(server.getServerConfig());

  // UI state
  const [activeTab, setActiveTab] = useState<'server' | 'models'>('server');
  const [showInstalledModels, setShowInstalledModels] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // HF Token
  const [hfToken, setHfToken] = useState('');

  // Remove engine confirmation
  const [removeConfirm, setRemoveConfirm] = useState<'idle' | 'confirm' | 'removing'>('idle');
  const removeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived
  const isDownloadingBinary =
    activeDownload?.type === 'binary' && activeDownload.status === 'downloading';
  const binaryPhase = activeDownload?.type === 'binary' ? activeDownload.phase : null;
  const isServerBusy = serverStatus === 'starting' || serverStatus === 'stopping';
  const isRunning = serverStatus === 'running';
  const serverUrl = server.getServerUrl();

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

  // Load initial data
  useEffect(() => {
    loadBinaryInfo();
    loadModels();
    loadHfToken().then((token) => {
      if (token) setHfToken(token);
    });

    const unsubscribeServer = server.onStatusChange((status) => {
      setServerStatus(status);

      // Auto-provider activation
      if (status === 'running') {
        const url = server.getServerUrl();
        if (url) {
          updateProvider('llamacpp', {
            active: true,
            base_url: url,
            api_key: server.getServerConfig().apiKey || '',
          });
          saveSettings();
        }
        setSettingsExpanded(false);
      } else if (status === 'idle') {
        updateProvider('llamacpp', {
          active: false,
          base_url: '',
          api_key: '',
        });
        saveSettings();
      }
    });

    // Listen for download completions to refresh local state
    const unsubscribeDownload = downloadStore.onComplete((type, result) => {
      if (type === 'model') {
        loadModels();
        showToast(
          `Downloaded ${(result as ManagedModel).name} (${formatBytes((result as ManagedModel).fileSize)})`,
          'success',
        );
      } else if (type === 'binary') {
        setBinaryInfo(result as InstalledBinary);
        setUpdateAvailable(false);
        showToast(`llama-server ${(result as InstalledBinary).version} installed`, 'success');
      }
    });

    return () => {
      unsubscribeServer();
      unsubscribeDownload();
    };
  }, []);

  const loadBinaryInfo = async () => {
    try {
      const info = await backend.getInstalledBinary();
      setBinaryInfo(info);

      const update = await backend.checkForUpdate();
      setUpdateAvailable(update.hasUpdate);
      setLatestVersion(update.latestVersion);
    } catch (e) {
      console.warn('[LocalInferencePanel] Failed to load binary info:', e);
    }
  };

  const loadModels = useCallback(async () => {
    try {
      const list = await models.getModels();
      setManagedModels(list);

      if (!selectedModelId && list.length > 0) {
        setSelectedModelId(list[0].id);
      }

      // Sync model list to provider system
      updateProvider('llamacpp', {
        models: list.map((m) => ({ id: m.id, name: m.name })),
      });
    } catch (e) {
      console.warn('[LocalInferencePanel] Failed to load models:', e);
    }
  }, [selectedModelId, updateProvider]);

  const handleDownloadBinary = () => {
    downloadStore.startBinaryDownload();
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await models.deleteModel(modelId);
      if (selectedModelId === modelId) {
        setSelectedModelId(null);
      }
      await loadModels();
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
      await server.startServer(selectedModelId);
      showToast('Server started', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const handleStopServer = async () => {
    try {
      await server.stopServer();
      showToast('Server stopped', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  const handleCheckForUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const update = await backend.checkForUpdate();
      setUpdateAvailable(update.hasUpdate);
      setLatestVersion(update.latestVersion);
      if (update.hasUpdate) {
        showToast(`Update available: ${update.latestVersion}`, 'info');
      } else {
        showToast(`Already on latest (${update.currentVersion})`, 'success');
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
      // Auto-reset after 4 seconds if user doesn't confirm
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
      removeTimerRef.current = setTimeout(() => setRemoveConfirm('idle'), 4000);
      return;
    }
    if (removeConfirm === 'confirm') {
      if (removeTimerRef.current) clearTimeout(removeTimerRef.current);
      setRemoveConfirm('removing');
      try {
        // Stop server first if running
        if (isRunning) {
          await server.stopServer();
        }
        await backend.removeEngine();
        setBinaryInfo(null);
        setUpdateAvailable(false);
        setLatestVersion(null);
        showToast('llama-server engine removed', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'error');
      } finally {
        setRemoveConfirm('idle');
      }
    }
  };

  const handleConfigChange = (key: keyof ServerConfig, value: number | string) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    server.setServerConfig(newConfig);
  };

  const handleCopyUrl = async () => {
    if (!serverUrl) return;
    await navigator.clipboard.writeText(serverUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleTokenBlur = async () => {
    await saveHfToken(hfToken.trim());
    if (hfToken.trim()) showToast('HuggingFace token saved', 'success');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const selectedModelName = managedModels.find((m) => m.id === selectedModelId)?.name;
  const installedFileNames = React.useMemo(
    () => new Set(managedModels.map((m) => m.fileName)),
    [managedModels],
  );

  // Summary text for collapsed settings
  const settingsSummary = `Context ${config.ctxSize} · GPU: ${config.nGpuLayers === -1 ? 'All' : config.nGpuLayers} · Threads: ${config.threads}`;

  return (
    <div className={`h-full overflow-y-auto custom-scrollbar ${LAYOUT.settingsPadding} py-6`}>
    <div className={`${LAYOUT.settingsMaxWidth} mx-auto space-y-8`}>
      {/* Header */}
      <div>
        <h3 className={`${TYPOGRAPHY_CLASSES.settingsTitle} ${TEXT.heading}`}>
          Local Inference
        </h3>
        <p className={`${TYPOGRAPHY_CLASSES.settingsDescription} ${TEXT.muted} mt-1`}>
          Run AI models locally with llama.cpp
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STATE 1: no-engine — Setup card with download CTA          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {panelState === 'no-engine' && (
        <div className={`flex items-center justify-between px-4 py-3 ${SURFACE.card} border ${BORDER.default} rounded-lg`}>
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
            className={`flex items-center gap-2 px-4 py-2 ${COMPONENT.primaryButton} rounded-lg ${TYPOGRAPHY_CLASSES.settingsButton} disabled:opacity-50 whitespace-nowrap`}
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
          {/* Collapsed engine status bar */}
          <div className={`px-4 py-2.5 ${SURFACE.card} border ${BORDER.default} rounded-lg flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <ServerStatus />
              <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                llama-server {binaryInfo.version}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {updateAvailable && latestVersion ? (
                <button
                  onClick={handleDownloadBinary}
                  disabled={isDownloadingBinary}
                  className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.link} hover:underline disabled:opacity-50 flex items-center gap-1`}
                >
                  <RefreshCw className="w-3 h-3" />
                  Update to {latestVersion}
                </button>
              ) : (
                <button
                  onClick={handleCheckForUpdate}
                  disabled={isCheckingUpdate}
                  className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} hover:${TEXT.primary} disabled:opacity-50 flex items-center gap-1`}
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
              )}
              <button
                onClick={handleRemoveEngine}
                disabled={removeConfirm === 'removing'}
                className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${
                  removeConfirm === 'confirm' ? TEXT.error : `${TEXT.faint} hover:${TEXT.error}`
                } disabled:opacity-50 flex items-center gap-1 transition-colors`}
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

          {/* Hero model acquisition card */}
          <div className={`px-5 py-5 ${SURFACE.card} border ${BORDER.default} rounded-xl space-y-4`}>
            <div>
              <h4 className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading} mb-1`}>
                Add Your First Model
              </h4>
              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                Search HuggingFace, pick a popular model, or import a local .gguf file.
              </p>
            </div>

            <ModelBrowser variant="hero" onModelAdded={loadModels} hfToken={hfToken} installedFileNames={installedFileNames} />

            {/* Compact HF token input */}
            <div className={`pt-2 border-t ${BORDER.default}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <Key className={`w-3 h-3 ${TEXT.faint}`} />
                <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                  Hugging Face Token
                </span>
              </div>
              <SecretInput
                value={hfToken}
                onChange={(val) => setHfToken(val)}
                onBlur={handleTokenBlur}
                placeholder="hf_... (required for gated models)"
                showCopy={false}
              />
            </div>
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
              <div className={`${SURFACE.card} border ${BORDER.default} rounded-xl overflow-hidden`}>

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
                <div className={`px-4 py-2.5 border-b ${BORDER.default}`}>
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
                            {/* Context Size */}
                            <div className="space-y-1">
                              <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                                Context Size
                              </label>
                              <input
                                type="number"
                                value={config.ctxSize}
                                onChange={(e) =>
                                  handleConfigChange('ctxSize', parseInt(e.target.value) || 4096)
                                }
                                min={256}
                                max={131072}
                                step={256}
                                className={`w-full px-3 py-2 ${SURFACE.inputField} border ${BORDER.input} rounded-lg ${TYPOGRAPHY_CLASSES.settingsInput} outline-none ${BORDER.inputFocus} transition-all`}
                              />
                            </div>

                            {/* GPU Layers */}
                            <div className="space-y-1">
                              <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                                GPU Layers
                              </label>
                              <input
                                type="number"
                                value={config.nGpuLayers}
                                onChange={(e) =>
                                  handleConfigChange('nGpuLayers', parseInt(e.target.value) || -1)
                                }
                                min={-1}
                                max={999}
                                className={`w-full px-3 py-2 ${SURFACE.inputField} border ${BORDER.input} rounded-lg ${TYPOGRAPHY_CLASSES.settingsInput} outline-none ${BORDER.inputFocus} transition-all`}
                              />
                              <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                                -1 = all
                              </p>
                            </div>

                            {/* Threads */}
                            <div className="space-y-1">
                              <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                                CPU Threads
                              </label>
                              <input
                                type="number"
                                value={config.threads}
                                onChange={(e) =>
                                  handleConfigChange('threads', parseInt(e.target.value) || 4)
                                }
                                min={1}
                                max={64}
                                className={`w-full px-3 py-2 ${SURFACE.inputField} border ${BORDER.input} rounded-lg ${TYPOGRAPHY_CLASSES.settingsInput} outline-none ${BORDER.inputFocus} transition-all`}
                              />
                            </div>
                          </div>

                          {/* API Key */}
                          <div className="space-y-1">
                            <label className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted}`}>
                              API Key (optional)
                            </label>
                            <SecretInput
                              value={config.apiKey || ''}
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
                        className={`px-3 py-1.5 ${COMPONENT.dangerButton} rounded-lg ${TYPOGRAPHY_CLASSES.settingsButton} disabled:opacity-50 flex items-center gap-1.5`}
                      >
                        <Square className="w-3.5 h-3.5" />
                        Stop Server
                      </button>
                    ) : (
                      <button
                        onClick={handleStartServer}
                        disabled={isServerBusy || !selectedModelId}
                        className={`px-3 py-1.5 ${COMPONENT.successButton} rounded-lg ${TYPOGRAPHY_CLASSES.settingsButton} disabled:opacity-50 flex items-center gap-1.5`}
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
                  <div className={`px-4 py-2.5 border-b ${BORDER.default} flex items-center justify-between`}>
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
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                    llama-server {binaryInfo.version}
                  </span>
                  <div className="flex items-center gap-3">
                    {updateAvailable && latestVersion ? (
                      <button
                        onClick={handleDownloadBinary}
                        disabled={isDownloadingBinary}
                        className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.link} hover:underline disabled:opacity-50 flex items-center gap-1`}
                      >
                        {isDownloadingBinary ? (
                          <motion.span {...spin}><Loader2 className="w-3 h-3" /></motion.span>
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Update to {latestVersion}
                      </button>
                    ) : (
                      <button
                        onClick={handleCheckForUpdate}
                        disabled={isCheckingUpdate}
                        className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} hover:${TEXT.primary} disabled:opacity-50 flex items-center gap-1`}
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
                    )}
                    <button
                      onClick={handleRemoveEngine}
                      disabled={removeConfirm === 'removing'}
                      className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${
                        removeConfirm === 'confirm' ? TEXT.error : `${TEXT.faint} hover:${TEXT.error}`
                      } disabled:opacity-50 flex items-center gap-1 transition-colors`}
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
                  <div className={`px-4 py-2.5 border-t ${BORDER.default} flex items-center gap-2`}>
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
              <div className="space-y-4">
                {/* Header row: title + helper + Installed toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className={`${TYPOGRAPHY_CLASSES.settingsInputLabel} ${TEXT.heading}`}>
                      Local Models
                    </h4>
                    <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} mt-0.5`}>
                      Download a model from Hugging Face to run locally
                    </p>
                  </div>
                  {managedModels.length > 0 && (
                    <button
                      onClick={() => setShowInstalledModels((v) => !v)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 ${RADIUS.md} border transition-all ${TYPOGRAPHY_CLASSES.settingsHelper} font-medium ${
                        showInstalledModels
                          ? `${SURFACE.selectedCard} ${BORDER.selectedCard} ${TEXT.heading}`
                          : `${SURFACE.card} ${BORDER.default} ${TEXT.muted} ${BORDER.cardHover}`
                      }`}
                    >
                      <HardDrive className="w-3 h-3" />
                      Installed ({managedModels.length})
                    </button>
                  )}
                </div>

                {/* Content: Installed list OR Browse (ModelBrowser) */}
                <AnimatePresence mode="wait" initial={false}>
                  {showInstalledModels && managedModels.length > 0 ? (
                    <motion.div
                      key="installed"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <div className={`max-h-80 overflow-y-auto space-y-2`}>
                        {managedModels.map((model) => (
                          <ModelListItem
                            key={model.id}
                            name={model.name}
                            subtitle={`${formatBytes(model.fileSize)} · GGUF v${model.ggufVersion ?? '?'} · ${model.source}`}
                            selected={selectedModelId === model.id}
                            onClick={() => !isRunning && setSelectedModelId(model.id)}
                            onDelete={() => handleDeleteModel(model.id)}
                            deleteDisabled={isRunning && server.getCurrentModelId() === model.id}
                          />
                        ))}
                      </div>
                      <p className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.faint}`}>
                        {managedModels.length} models · {formatBytes(managedModels.reduce((sum, m) => sum + m.fileSize, 0))}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="browse"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      {/* Hugging Face token — compact row pinned above search, never bounces */}
                      <div className="flex items-center gap-2">
                        <Key className={`w-3.5 h-3.5 ${TEXT.faint} shrink-0`} />
                        <span className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.muted} shrink-0`}>
                          Hugging Face Token
                        </span>
                        <div className="flex-1 min-w-0">
                          <SecretInput
                            value={hfToken}
                            onChange={(val) => setHfToken(val)}
                            onBlur={handleTokenBlur}
                            placeholder="hf_... (required for gated models)"
                            showCopy={false}
                          />
                        </div>
                        <a
                          href="https://huggingface.co/settings/tokens"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${TYPOGRAPHY_CLASSES.settingsHelper} ${TEXT.link} hover:underline shrink-0`}
                        >
                          Get a token
                        </a>
                      </div>

                      {/* ModelBrowser — search + results grow below */}
                      <ModelBrowser variant="inline" onModelAdded={loadModels} hfToken={hfToken} installedFileNames={installedFileNames} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
    </div>
  );
};

export default LocalInferencePanel;
