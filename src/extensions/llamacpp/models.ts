/**
 * Model Manager
 *
 * Manages GGUF model files: download from HuggingFace, import local files,
 * search HuggingFace for models, and maintain a persistent registry.
 *
 * Downloads use the Rust-side streaming download command for memory efficiency
 * (multi-GB GGUF files stream directly to disk, never buffered in JS).
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { join } from '@tauri-apps/api/path';
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  remove,
  copyFile,
} from '@tauri-apps/plugin-fs';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import { getBaseDir } from './backend';
import type {
  ManagedModel,
  ModelRegistry,
  DownloadProgress,
  GgufMetadata,
  HfModelResult,
  HfModelFile,
} from './types';

const REGISTRY_FILE = 'registry.json';

// ── Popular Picks ────────────────────────────────────────────────

export interface PopularModel {
  repoId: string;
  label: string;
  description: string;
  defaultFile: string;
  sizeApprox: string;
}

export const POPULAR_PICKS: PopularModel[] = [
  {
    repoId: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    label: 'Llama 3.2 3B',
    description: 'Great all-around, fast on most hardware',
    defaultFile: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeApprox: '~2.0 GB',
  },
  {
    repoId: 'bartowski/Phi-3.5-mini-instruct-GGUF',
    label: 'Phi 3.5 Mini',
    description: 'Compact & capable, Microsoft research model',
    defaultFile: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
    sizeApprox: '~2.3 GB',
  },
  {
    repoId: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
    label: 'Qwen 2.5 7B',
    description: 'Strong reasoning, multilingual',
    defaultFile: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    sizeApprox: '~4.7 GB',
  },
];

// ── Quantization Metadata ────────────────────────────────────────

export interface QuantInfo {
  quality: 'low' | 'medium' | 'high' | 'very-high' | 'lossless';
  note: string;
  recommended?: boolean;
}

const QUANT_METADATA: Record<string, QuantInfo> = {
  // Standard K-quants
  'Q2_K':      { quality: 'low',       note: 'Very small, significant quality loss' },
  'Q3_K_S':    { quality: 'low',       note: 'Small, noticeable quality loss' },
  'Q3_K_M':    { quality: 'medium',    note: 'Compact, moderate quality' },
  'Q3_K_L':    { quality: 'medium',    note: 'Compact, decent quality' },
  'Q3_K_XL':   { quality: 'medium',    note: 'Compact, decent quality' },
  'Q4_0':      { quality: 'medium',    note: 'Fast, moderate quality' },
  'Q4_K_S':    { quality: 'medium',    note: 'Good balance, slightly smaller' },
  'Q4_K_M':    { quality: 'high',      note: 'Best balance of quality & speed', recommended: true },
  'Q4_K_L':    { quality: 'high',      note: 'Good quality, moderate size' },
  'Q4_K_XL':   { quality: 'high',      note: 'Good quality, moderate size' },
  'Q5_0':      { quality: 'high',      note: 'High quality, moderate size' },
  'Q5_K_S':    { quality: 'high',      note: 'High quality, moderate size' },
  'Q5_K_M':    { quality: 'high',      note: 'High quality, slightly larger' },
  'Q5_K_L':    { quality: 'very-high', note: 'High quality, larger file' },
  'Q6_K':      { quality: 'very-high', note: 'Near-lossless, large file' },
  'Q6_K_L':    { quality: 'very-high', note: 'Near-lossless, large file' },
  'Q8_0':      { quality: 'very-high', note: 'Near-lossless, very large' },
  // Block quants (Q4_0_4_4, Q4_0_8_8, etc.)
  'Q4_0_4_4':  { quality: 'medium',    note: 'ARM-optimized, fast inference' },
  'Q4_0_4_8':  { quality: 'medium',    note: 'ARM-optimized, fast inference' },
  'Q4_0_8_8':  { quality: 'medium',    note: 'AVX2/AVX512 optimized' },
  // Full precision
  'F16':       { quality: 'lossless',  note: 'Full 16-bit, very large' },
  'F32':       { quality: 'lossless',  note: 'Full 32-bit, enormous' },
  'BF16':      { quality: 'lossless',  note: 'bfloat16, very large' },
  // Importance-matrix quants
  'IQ1_S':     { quality: 'low',       note: 'Extreme compression, poor quality' },
  'IQ1_M':     { quality: 'low',       note: 'Extreme compression, poor quality' },
  'IQ2_S':     { quality: 'low',       note: 'Very small, significant quality loss' },
  'IQ2_M':     { quality: 'low',       note: 'Very small, significant quality loss' },
  'IQ2_XXS':   { quality: 'low',       note: 'Very small, significant quality loss' },
  'IQ2_XS':    { quality: 'low',       note: 'Very small, significant quality loss' },
  'IQ3_S':     { quality: 'low',       note: 'Small but noticeable quality loss' },
  'IQ3_M':     { quality: 'medium',    note: 'Compact, decent quality' },
  'IQ3_XXS':   { quality: 'low',       note: 'Small but noticeable quality loss' },
  'IQ3_XS':    { quality: 'low',       note: 'Small but noticeable quality loss' },
  'IQ4_XS':    { quality: 'medium',    note: 'Good compression, some quality loss' },
  'IQ4_NL':    { quality: 'medium',    note: 'Good compression, some quality loss' },
};

/** Extract quantization label from filename (e.g. "Q4_K_M" from "model-Q4_K_M.gguf") */
export function getQuantLabel(filename: string): string | null {
  // Strip UD- prefix (Unsloth dynamic quants)
  const cleaned = filename.replace(/UD-/gi, '');
  const match = cleaned.match(/[.-](Q\d[_A-Z0-9]*|F16|F32|BF16|IQ\d[_A-Z0-9]*)/i);
  return match ? match[1].toUpperCase() : null;
}

/** Get metadata for a quantization label */
export function getQuantMetadata(label: string): QuantInfo | null {
  return QUANT_METADATA[label.toUpperCase()] ?? null;
}

/** Quality tier sort order (higher = better) */
const QUALITY_ORDER: Record<string, number> = {
  'lossless': 5, 'very-high': 4, 'high': 3, 'medium': 2, 'low': 1,
};

/** Find the recommended file from a list of GGUF files */
export function getRecommendedFile(files: HfModelFile[]): string | null {
  const preferred = ['Q4_K_M', 'Q4_K_S', 'Q5_K_M', 'Q5_K_S', 'Q6_K'];
  for (const quant of preferred) {
    const match = files.find((f) => {
      const label = getQuantLabel(f.name);
      return label === quant;
    });
    if (match) return match.name;
  }
  return null;
}

/** Sort files: recommended first, then by quality descending, then by size ascending */
export function sortFilesByQuant(files: HfModelFile[]): HfModelFile[] {
  return [...files].sort((a, b) => {
    const labelA = getQuantLabel(a.name);
    const labelB = getQuantLabel(b.name);
    const metaA = labelA ? getQuantMetadata(labelA) : null;
    const metaB = labelB ? getQuantMetadata(labelB) : null;

    // Recommended first
    if (metaA?.recommended && !metaB?.recommended) return -1;
    if (!metaA?.recommended && metaB?.recommended) return 1;

    // By quality descending
    const orderA = metaA ? (QUALITY_ORDER[metaA.quality] ?? 0) : 0;
    const orderB = metaB ? (QUALITY_ORDER[metaB.quality] ?? 0) : 0;
    if (orderA !== orderB) return orderB - orderA;

    // By size ascending
    return a.size - b.size;
  });
}

/** A quant variant of a repo, merged with local install state (view model) */
export interface VariantRow {
  /** Full repo-relative path used for download (e.g. "model-Q4_K_M.gguf") */
  fileName: string;
  /** Quant label (e.g. "Q4_K_M") or basename fallback */
  quant: string;
  size: number;
  note: string | null;
  quality: QuantInfo['quality'] | null;
  isRecommended: boolean;
  /** Managed-model id if this variant is already installed, else null */
  installedModelId: string | null;
}

/**
 * Merge a repo's GGUF files with the locally-installed registry into sorted
 * variant rows. Installed variants carry their managed-model id (for delete /
 * "in use" state). Pure — safe to memoize in components.
 */
export function buildVariantRows(
  files: HfModelFile[],
  installed: ManagedModel[],
): VariantRow[] {
  const installedByFile = new Map(installed.map((m) => [m.fileName, m.id]));
  return sortFilesByQuant(files).map((f) => {
    const baseName = f.name.split('/').pop() ?? f.name;
    const label = getQuantLabel(f.name);
    const meta = label ? getQuantMetadata(label) : null;
    return {
      fileName: f.name,
      quant: label ?? baseName,
      size: f.size,
      note: meta?.note ?? null,
      quality: meta?.quality ?? null,
      isRecommended: !!meta?.recommended,
      installedModelId: installedByFile.get(baseName) ?? null,
    };
  });
}

/** Get the models directory path */
async function getModelsDir(): Promise<string> {
  const base = await getBaseDir();
  return await join(base, 'models');
}

/** Ensure models directory exists */
async function ensureModelsDir(): Promise<string> {
  const dir = await getModelsDir();
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/** Load the model registry from disk */
export async function loadRegistry(): Promise<ModelRegistry> {
  try {
    const modelsDir = await getModelsDir();
    const registryPath = await join(modelsDir, REGISTRY_FILE);
    if (!(await exists(registryPath))) {
      return { models: [] };
    }
    const raw = await readTextFile(registryPath);
    return JSON.parse(raw) as ModelRegistry;
  } catch {
    return { models: [] };
  }
}

/** Save the model registry to disk */
async function saveRegistry(registry: ModelRegistry): Promise<void> {
  const modelsDir = await ensureModelsDir();
  const registryPath = await join(modelsDir, REGISTRY_FILE);
  await writeTextFile(registryPath, JSON.stringify(registry, null, 2));
}

/** Generate a filesystem-safe ID from a model name */
function generateModelId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Parse a HuggingFace URL to extract repo and filename.
 *
 * Supports formats:
 * - https://huggingface.co/{user}/{repo}/resolve/main/{file}.gguf
 * - https://huggingface.co/{user}/{repo}/blob/main/{file}.gguf
 * - https://huggingface.co/{user}/{repo} (repo-only → returns null fileName)
 */
export function parseHuggingFaceUrl(url: string): {
  repo: string;
  fileName: string | null;
  downloadUrl: string | null;
} | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('huggingface.co')) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;

    const repo = `${parts[0]}/${parts[1]}`;

    // Repo-only URL (e.g. https://huggingface.co/TheBloke/Llama-2-7B-GGUF)
    if (parts.length < 5) {
      return { repo, fileName: null, downloadUrl: null };
    }

    // Full file URL
    const fileName = parts.slice(4).join('/');
    const downloadUrl = `https://huggingface.co/${repo}/resolve/${parts[3]}/${fileName}`;
    return { repo, fileName, downloadUrl };
  } catch {
    return null;
  }
}

// ── HuggingFace API ──

/** Search HuggingFace for GGUF models */
export async function searchHfModels(query: string): Promise<HfModelResult[]> {
  const resp = await fetch(
    `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&direction=-1&limit=15`
  );
  if (!resp.ok) throw new Error(`HF search failed: ${resp.status}`);
  const data = await resp.json();
  return data.map((m: any) => ({
    id: m.id,
    author: m.author ?? m.id.split('/')[0] ?? '',
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    tags: m.tags ?? [],
  }));
}

/** List GGUF files in a HuggingFace repo with sizes */
export async function listHfRepoFiles(repoId: string, hfToken?: string): Promise<HfModelFile[]> {
  const headers: Record<string, string> = {};
  if (hfToken) headers['Authorization'] = `Bearer ${hfToken}`;

  const resp = await fetch(
    `https://huggingface.co/api/models/${repoId}/tree/main`,
    { headers }
  );
  if (!resp.ok) throw new Error(`HF repo fetch failed: ${resp.status}`);
  const files = await resp.json();
  return files
    .filter((f: any) => f.type === 'file')
    .map((f: any) => ({
      name: f.path,
      size: f.lfs?.size ?? f.size ?? 0,
      isGguf: f.path.endsWith('.gguf'),
    }))
    .filter((f: HfModelFile) => f.isGguf);
}

/**
 * Download a GGUF model from HuggingFace.
 *
 * Uses Rust-side streaming download — multi-GB files stream directly to disk,
 * never buffered in WebView memory.
 *
 * @param url - The HuggingFace URL for the GGUF file.
 * @param onProgress - Callback for download progress.
 * @param hfToken - Optional HuggingFace auth token for gated models.
 * @returns The added model entry.
 */
export async function downloadModel(
  url: string,
  onProgress?: (progress: DownloadProgress) => void,
  hfToken?: string,
): Promise<ManagedModel> {
  const parsed = parseHuggingFaceUrl(url);
  if (!parsed || !parsed.fileName || !parsed.downloadUrl) {
    throw new Error(
      'Invalid HuggingFace URL. Expected format: https://huggingface.co/{user}/{repo}/resolve/main/{file}.gguf'
    );
  }

  if (!parsed.fileName.endsWith('.gguf')) {
    throw new Error('URL must point to a .gguf file');
  }

  const modelsDir = await ensureModelsDir();
  const modelId = generateModelId(
    parsed.fileName.replace('.gguf', '')
  );
  const modelDir = await join(modelsDir, modelId);

  if (!(await exists(modelDir))) {
    await mkdir(modelDir, { recursive: true });
  }

  const fileName = parsed.fileName.split('/').pop()!;
  const destPath = await join(modelDir, fileName);

  // Listen for download progress events from Rust
  let unlisten: (() => void) | undefined;
  if (onProgress) {
    unlisten = await listen<{ bytes_downloaded: number; total_bytes: number; percent: number }>(
      'llamacpp://download-progress',
      (event) => {
        onProgress({
          bytesDownloaded: event.payload.bytes_downloaded,
          totalBytes: event.payload.total_bytes,
          percent: event.payload.percent,
        });
      }
    );
  }

  let downloadSize: number;
  try {
    // Build headers — include HF token if provided
    const headers: Record<string, string> = {};
    if (hfToken) {
      headers['Authorization'] = `Bearer ${hfToken}`;
    }

    // Download via Rust (streams directly to disk)
    const result = await invoke<{ path: string; size: number }>(
      'plugin:llamacpp|download_file',
      {
        url: parsed.downloadUrl,
        destPath,
        headers,
      }
    );
    downloadSize = result.size;
  } finally {
    unlisten?.();
  }

  // Read GGUF metadata
  let ggufVersion: number | undefined;
  try {
    const metadata: GgufMetadata = await invoke(
      'plugin:llamacpp|read_gguf_metadata',
      { path: destPath }
    );
    ggufVersion = metadata.version;
  } catch (e) {
    console.warn('[llamacpp] Failed to read GGUF metadata:', e);
  }

  const model: ManagedModel = {
    id: modelId,
    name: fileName.replace('.gguf', ''),
    fileName,
    filePath: destPath,
    fileSize: downloadSize,
    source: 'huggingface',
    sourceUrl: url,
    ggufVersion,
    addedAt: Date.now(),
  };

  // Update registry
  const registry = await loadRegistry();
  registry.models = registry.models.filter((m) => m.id !== modelId);
  registry.models.push(model);
  await saveRegistry(registry);

  return model;
}

/** Download a GGUF file by repo ID + filename (from the model browser) */
export async function downloadModelFromRepo(
  repoId: string,
  fileName: string,
  onProgress?: (progress: DownloadProgress) => void,
  hfToken?: string,
): Promise<ManagedModel> {
  const url = `https://huggingface.co/${repoId}/resolve/main/${fileName}`;
  return downloadModel(url, onProgress, hfToken);
}

/**
 * Import a local GGUF file.
 *
 * Opens a native file picker, copies the selected file into the managed
 * models directory, and reads its metadata.
 *
 * @returns The added model entry, or null if user cancelled.
 */
export async function importLocalModel(): Promise<ManagedModel | null> {
  const selected = await dialogOpen({
    multiple: false,
    filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
  });

  if (!selected) return null;

  const sourcePath = typeof selected === 'string' ? selected : (selected as any).path;
  if (!sourcePath) return null;

  const fileName = sourcePath.split('/').pop() ?? sourcePath.split('\\').pop() ?? 'model.gguf';
  const modelId = generateModelId(fileName.replace('.gguf', ''));

  const modelsDir = await ensureModelsDir();
  const modelDir = await join(modelsDir, modelId);

  if (!(await exists(modelDir))) {
    await mkdir(modelDir, { recursive: true });
  }

  const destPath = await join(modelDir, fileName);

  // Copy file to managed directory
  await copyFile(sourcePath, destPath);

  // Read metadata
  let fileSize = 0;
  let ggufVersion: number | undefined;
  try {
    const metadata: GgufMetadata = await invoke(
      'plugin:llamacpp|read_gguf_metadata',
      { path: destPath }
    );
    fileSize = metadata.file_size;
    ggufVersion = metadata.version;
  } catch (e) {
    console.warn('[llamacpp] Failed to read GGUF metadata:', e);
  }

  const model: ManagedModel = {
    id: modelId,
    name: fileName.replace('.gguf', ''),
    fileName,
    filePath: destPath,
    fileSize,
    source: 'local',
    ggufVersion,
    addedAt: Date.now(),
  };

  // Update registry
  const registry = await loadRegistry();
  registry.models = registry.models.filter((m) => m.id !== modelId);
  registry.models.push(model);
  await saveRegistry(registry);

  return model;
}

/**
 * Delete a model from the registry and disk.
 */
export async function deleteModel(modelId: string): Promise<void> {
  const registry = await loadRegistry();
  const model = registry.models.find((m) => m.id === modelId);

  if (model) {
    // Remove model directory
    const modelsDir = await getModelsDir();
    const modelDir = await join(modelsDir, modelId);
    try {
      await remove(modelDir, { recursive: true });
    } catch (e) {
      console.warn('[llamacpp] Failed to remove model directory:', e);
    }
  }

  // Update registry
  registry.models = registry.models.filter((m) => m.id !== modelId);
  await saveRegistry(registry);
}

/**
 * Get all managed models.
 */
export async function getModels(): Promise<ManagedModel[]> {
  const registry = await loadRegistry();
  return registry.models;
}
