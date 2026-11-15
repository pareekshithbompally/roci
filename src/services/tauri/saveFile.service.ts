/** The app's one "Save as…" for text: native dialog (default ~/Downloads) then fs write; browser fallback. */

import { dialogService } from './dialog.service';
import { fileSystemService } from './fileSystem.service';
import { isTauriEnvironment } from './environment.service';

export interface TextFile {
  /** Suggested name, extension included (`table.csv`). */
  filename: string;
  content: string;
  /** Filter label in the save panel (`CSV`, `Markdown`). */
  kind: string;
  extension: string;
}

async function defaultPathFor(filename: string): Promise<string> {
  if (!isTauriEnvironment()) return filename;
  const { join, downloadDir } = await import('@tauri-apps/api/path');
  return join(await downloadDir(), filename);
}

/** Resolves the saved path, or null if the user cancelled. Rejects if the write fails. */
export async function saveTextFile({ filename, content, kind, extension }: TextFile): Promise<string | null> {
  const path = await dialogService.save({
    title: 'Save File',
    defaultPath: await defaultPathFor(filename),
    filters: [{ name: kind, extensions: [extension] }],
  });
  if (!path) return null;
  await fileSystemService.writeTextFile(path, content);
  return path;
}

/** Select a saved file (or folder) in Finder. */
export async function revealInFinder(path: string): Promise<void> {
  if (!isTauriEnvironment()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('reveal_in_file_manager', { path: path.replace(/[/\\]+$/, '') });
}

/** Payload of `DOWNLOAD_FINISHED_EVENT`: a web download (`<a download>`, blob links) saved natively. */
export interface FinishedDownload {
  /** Where it was saved (~/Downloads), when known. */
  path: string | null;
  success: boolean;
}

