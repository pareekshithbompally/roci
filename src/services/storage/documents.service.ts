/** Knowledge documents: files you add to the library, each a `file` asset kept there (`kept`), never a chat's or a meeting's.
 *  PDFs and text files (Markdown included); the Knowledge screen reads the rows. */

import { store } from '@services/db';
import { attachmentInput, attachmentMediaType } from '@shared/utils/chatParts';
import type { FileMeta } from '@shared/types';
import type { AssetRow } from '@shared/types/native';
import { assetsService } from './assets.service';

/** How a document is read: a PDF's pages, or a text file's words. */
export type DocumentFormat = 'pdf' | 'text';

/** One document in the library. */
export interface KnowledgeDocument {
  id: string;
  appPath: string;
  name: string;
  mediaType: string;
  format: DocumentFormat;
  /** Absent for files written out of older chats. */
  bytes?: number;
  /** Epoch ms. */
  createdAt: number;
}

/** How a file with this type and name is read, or null when Knowledge can't read it (an image, a Word file). */
export function documentFormat(mediaType: string, name: string): DocumentFormat | null {
  const input = attachmentInput(mediaType, name);
  return input === 'pdf' || input === 'text' ? input : null;
}

function metaOf(row: AssetRow): Partial<FileMeta> {
  try {
    return row.meta ? (JSON.parse(row.meta) as FileMeta) : {};
  } catch {
    return {};
  }
}

function toDocument(row: AssetRow): KnowledgeDocument {
  const meta = metaOf(row);
  const name = meta.name ?? row.path.slice(row.path.lastIndexOf('/') + 1);
  const mediaType = meta.mediaType ?? '';
  return {
    id: row.id,
    appPath: row.path,
    name,
    mediaType,
    format: documentFormat(mediaType, name) ?? 'text',
    bytes: meta.bytes,
    createdAt: row.created_at,
  };
}

export const documentsService = {
  /** The library's documents, newest first (the first `limit`). */
  async list(limit: number): Promise<KnowledgeDocument[]> {
    return (await store.assets.page('file', true, null, limit)).map(toDocument);
  },

  /** Keeps `file` in the library; throws when Knowledge can't read its kind, it is past the size limit, or it can't be
   *  written. */
  async add(file: File): Promise<void> {
    const mediaType = attachmentMediaType(file.type, file.name);
    if (!documentFormat(mediaType, file.name)) throw new Error(`Not a document Knowledge reads: ${file.name} (${mediaType})`);
    await assetsService.saveFile(file, mediaType, true);
  },

  /** Deletes a document with its file, passages and index state. */
  async remove(id: string): Promise<void> {
    await store.assets.remove(id);
  },
};
