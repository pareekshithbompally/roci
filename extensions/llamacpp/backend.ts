/**
 * Binary Download Manager
 *
 * Downloads llama-server binary from GitHub releases to local disk.
 * Uses Rust-side streaming download + extraction for reliability and
 * memory efficiency. Handles platform detection and version tracking.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appDataDir, join, basename } from '@tauri-apps/api/path';
import { platform, arch } from '@tauri-apps/plugin-os';
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import type {
  GitHubRelease,
  InstalledBinary,
  DownloadProgress,
  BinaryDownloadPhase,
} from './types';

const RELEASES_URL =
  'https://api.github.com/repos/ggml-org/llama.cpp/releases';
const BINARY_INFO_FILE = 'binary-info.json';

/** Detect the platform identifier for release asset matching using Tauri OS API */
async function getPlatformKey(): Promise<string> {
  const os = platform();   // 'macos' | 'windows' | 'linux'
  const cpu = arch();      // 'aarch64' | 'x86_64'

  if (os === 'macos') return cpu === 'aarch64' ? 'macos-arm64' : 'macos-x64';
  if (os === 'windows') return 'win-cpu-x64';
  return 'ubuntu-x64';
}

/** Get the base directory for llama.cpp data */
export async function getBaseDir(): Promise<string> {
  const appData = await appDataDir();
  return await join(appData, 'llamacpp');
}

/** Get the directory where binaries are stored */
async function getBinDir(): Promise<string> {
  const base = await getBaseDir();
  return await join(base, 'bin');
}

/** Ensure a directory exists, creating it recursively */
async function ensureDir(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

/** Parse a build number from a version tag like "b8148" → 8148 */
function parseVersion(tag: string): number {
  const match = tag.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/** Fetch the latest release info from GitHub */
async function fetchLatestRelease(): Promise<GitHubRelease> {
  const resp = await fetch(`${RELEASES_URL}?per_page=5`);
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }
  const releases: GitHubRelease[] = await resp.json();
  const platformKey = await getPlatformKey();

  // Find first release that has a matching bin asset for our platform
  for (const release of releases) {
    const asset = findPlatformAsset(release, platformKey);
    if (asset) return release;
  }

  throw new Error(
    `No compatible release found for platform: ${platformKey}`
  );
}

/** Find the matching binary archive asset for our platform from a release */
function findPlatformAsset(
  release: GitHubRelease,
  platformKey: string,
): { name: string; browser_download_url: string; size: number } | null {
  // Match: llama-{version}-bin-{platform}.tar.gz or .zip
  return (
    release.assets.find(
      (a) =>
        a.name.toLowerCase().includes(platformKey) &&
        a.name.toLowerCase().includes('-bin-')
    ) ?? null
  );
}

/** Read the installed binary info from disk */
export async function getInstalledBinary(): Promise<InstalledBinary | null> {
  try {
    const binDir = await getBinDir();
    const infoPath = await join(binDir, BINARY_INFO_FILE);
    if (!(await exists(infoPath))) return null;
    const raw = await readTextFile(infoPath);
    return JSON.parse(raw) as InstalledBinary;
  } catch {
    return null;
  }
}

/** Check if a newer version is available using numeric comparison */
export async function checkForUpdate(): Promise<{
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string | null;
}> {
  const installed = await getInstalledBinary();
  const latest = await fetchLatestRelease();
  const currentNum = installed ? parseVersion(installed.version) : 0;
  const latestNum = parseVersion(latest.tag_name);
  return {
    hasUpdate: latestNum > currentNum,
    latestVersion: latest.tag_name,
    currentVersion: installed?.version ?? null,
  };
}

/** Remove old version directories after a successful update */
async function cleanupOldVersions(binDir: string, keepVersion: string): Promise<void> {
  try {
    const entries = await readDir(binDir);
    for (const entry of entries) {
      if (entry.isDirectory && entry.name !== keepVersion) {
        await remove(await join(binDir, entry.name), { recursive: true });
      }
    }
  } catch (e) {
    console.warn('[llamacpp] cleanup old versions failed:', e);
  }
}

/**
 * Download and install the llama-server binary.
 *
 * Uses Rust-side streaming download (no memory buffering) and native
 * archive extraction with automatic executable permissions.
 * Scans extracted files for the llama-server binary (handles subdirectory layouts).
 * Removes macOS quarantine attributes and cleans up archives after extraction.
 *
 * @param onProgress - Callback for download progress updates.
 * @param onPhase - Callback for phase transitions (downloading/extracting/validating/done).
 * @returns The installed binary info.
 */
export async function downloadBinary(
  onProgress?: (progress: DownloadProgress) => void,
  onPhase?: (phase: BinaryDownloadPhase) => void,
): Promise<InstalledBinary> {
  const platformKey = await getPlatformKey();
  console.log('[llamacpp] platform key:', platformKey);

  const release = await fetchLatestRelease();
  console.log('[llamacpp] release:', release.tag_name, '— assets:', release.assets.length);

  const asset = findPlatformAsset(release, platformKey);
  if (!asset) {
    throw new Error(
      `No compatible binary found for ${platformKey} in release ${release.tag_name}`
    );
  }
  console.log('[llamacpp] matched asset:', asset.name, '— size:', asset.size);

  const binDir = await getBinDir();
  const versionDir = await join(binDir, release.tag_name);
  await ensureDir(versionDir);

  const archivePath = await join(versionDir, asset.name);

  // ── Phase 1: Download ──
  onPhase?.('downloading');
  console.log('[llamacpp] downloading to:', archivePath);

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

  try {
    await invoke('plugin:llamacpp|download_file', {
      url: asset.browser_download_url,
      destPath: archivePath,
      headers: {},
    });
  } finally {
    unlisten?.();
  }

  // ── Phase 2: Extract ──
  onPhase?.('extracting');
  console.log('[llamacpp] extracting archive...');

  const isArchive =
    asset.name.endsWith('.zip') || asset.name.endsWith('.tar.gz');
  let extractedFiles: string[] = [];

  if (isArchive) {
    extractedFiles = await invoke<string[]>('plugin:llamacpp|extract_archive', {
      archivePath,
      destDir: versionDir,
    });
  }

  // Remove macOS quarantine attribute
  try {
    await invoke('plugin:llamacpp|remove_quarantine', { dirPath: versionDir });
  } catch (e) {
    console.warn('[llamacpp] quarantine removal skipped:', e);
  }

  // Fix versioned dylib symlinks (e.g. libmtmd.0.0.8149.dylib → libmtmd.0.dylib)
  // Archive extraction drops symlinks; the binary needs the short names at runtime.
  try {
    const created = await invoke<string[]>('plugin:llamacpp|fix_lib_symlinks', { dirPath: versionDir });
    if (created.length > 0) {
      console.log('[llamacpp] created lib symlinks:', created);
    }
  } catch (e) {
    console.warn('[llamacpp] symlink fix skipped:', e);
  }

  // Clean up archive file
  try {
    await remove(archivePath);
  } catch {
    // ignore — file might already be gone
  }

  // ── Phase 3: Validate — find the binary ──
  onPhase?.('validating');
  console.log('[llamacpp] extracted files:', extractedFiles.length, extractedFiles.slice(0, 10));

  const isWindows = platformKey.includes('win');
  const binaryName = isWindows ? 'llama-server.exe' : 'llama-server';

  // Scan extracted files for the binary (may be in subdirectory like llama-b8148/)
  let binaryPath = extractedFiles.find(
    (f) => f.endsWith('/' + binaryName) || f.endsWith('\\' + binaryName) || f === binaryName
  );

  // Fallback: check the flat path if extraction returned nothing useful
  if (!binaryPath) {
    const flatPath = await join(versionDir, binaryName);
    if (await exists(flatPath)) {
      binaryPath = flatPath;
    }
  }

  // Fallback: scan subdirectories (archives often nest like llama-b8148-bin-macos-arm64/bin/)
  if (!binaryPath) {
    console.log('[llamacpp] binary not in extracted list, scanning subdirectories...');
    try {
      const entries = await readDir(versionDir);
      for (const entry of entries) {
        if (entry.isDirectory) {
          // Check dir/binaryName
          const nested = await join(versionDir, entry.name, binaryName);
          if (await exists(nested)) {
            binaryPath = nested;
            break;
          }
          // Check dir/bin/binaryName
          const binNested = await join(versionDir, entry.name, 'bin', binaryName);
          if (await exists(binNested)) {
            binaryPath = binNested;
            break;
          }
        }
      }
    } catch (scanErr) {
      console.warn('[llamacpp] subdirectory scan failed:', scanErr);
    }
  }

  if (!binaryPath) {
    throw new Error(
      `llama-server binary not found in archive. Extracted ${extractedFiles.length} files.`
    );
  }
  console.log('[llamacpp] resolved binary path:', binaryPath);

  // ── Prune: keep llama-server + shared libraries, delete everything else ──
  // The binary dynamically links to libs like libmtmd.0.dylib, libllama.dylib, etc.
  const KEEP_EXTENSIONS = ['.dylib', '.so', '.dll', '.metal'];

  function shouldKeepFile(name: string, binaryName: string): boolean {
    if (name === binaryName) return true;
    const lower = name.toLowerCase();
    return KEEP_EXTENSIONS.some(ext => lower.endsWith(ext));
  }

  try {
    const binaryFileName = await basename(binaryPath);

    // Collect all keeper files from the extracted tree (may be nested in subdirs)
    const filesToKeep: { srcPath: string; name: string }[] = [];

    async function scanForKeepers(dir: string) {
      const entries = await readDir(dir);
      for (const entry of entries) {
        const entryPath = await join(dir, entry.name);
        if (entry.isDirectory) {
          await scanForKeepers(entryPath);
        } else if (shouldKeepFile(entry.name, binaryFileName)) {
          filesToKeep.push({ srcPath: entryPath, name: entry.name });
        }
      }
    }

    await scanForKeepers(versionDir);
    console.log('[llamacpp] files to keep:', filesToKeep.map(f => f.name));

    // Move all keepers to versionDir root (if not already there)
    for (const file of filesToKeep) {
      const targetPath = await join(versionDir, file.name);
      if (file.srcPath !== targetPath) {
        try {
          await rename(file.srcPath, targetPath);
        } catch {
          // Already exists or same path — fine
        }
      }
      if (file.name === binaryFileName) {
        binaryPath = targetPath;
      }
    }

    // Delete everything in versionDir that isn't a keeper
    const keepNames = new Set(filesToKeep.map(f => f.name));
    const topEntries = await readDir(versionDir);
    for (const entry of topEntries) {
      if (keepNames.has(entry.name)) continue;
      const entryPath = await join(versionDir, entry.name);
      if (!entryPath.startsWith(versionDir)) continue;
      await remove(entryPath, { recursive: true });
    }
    console.log('[llamacpp] pruned versionDir — kept:', [...keepNames].join(', '));
  } catch (pruneErr) {
    // Non-fatal — binary is already safe
    console.warn('[llamacpp] pruning failed (non-fatal):', pruneErr);
  }

  // Fix symlinks again after pruning moved files to versionDir root
  try {
    const created = await invoke<string[]>('plugin:llamacpp|fix_lib_symlinks', { dirPath: versionDir });
    if (created.length > 0) {
      console.log('[llamacpp] post-prune symlinks:', created);
    }
  } catch (e) {
    console.warn('[llamacpp] post-prune symlink fix skipped:', e);
  }

  // Save binary info
  const info: InstalledBinary = {
    version: release.tag_name,
    path: binaryPath,
    installedAt: Date.now(),
  };

  const infoPath = await join(binDir, BINARY_INFO_FILE);
  await writeTextFile(infoPath, JSON.stringify(info, null, 2));

  // Clean up old versions
  await cleanupOldVersions(binDir, release.tag_name);

  onPhase?.('done');

  return info;
}

/**
 * Remove the llama-server engine entirely.
 *
 * Deletes the bin directory (binary + binary-info.json + all versions).
 * Caller must ensure the server is stopped before calling this.
 */
export async function removeEngine(): Promise<void> {
  const binDir = await getBinDir();
  if (await exists(binDir)) {
    await remove(binDir, { recursive: true });
  }
}

/**
 * Get the path to the installed llama-server binary, or null if not installed.
 */
export async function getBinaryPath(): Promise<string | null> {
  const info = await getInstalledBinary();
  if (!info) return null;

  if (await exists(info.path)) {
    return info.path;
  }

  return null;
}
