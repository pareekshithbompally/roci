/** Sound and video Roci made and you kept (Gallery's Audio and Video folders): each a kept asset row of its kind, so it
 *  outlives the chat it came from and the folder lists only what you kept. Saved speech is a reply read aloud, as WAV. */

import { store, type ItemCursor } from '@services/db';
import { queryClient } from '@shared/query/queryClient';
import { queryKeys } from '@shared/query/queryKeys';
import { readWavMono } from '@shared/utils/wav.utils';
import type { AssetRow } from '@shared/types/native';
import { assetsService } from './assets.service';

/** A Gallery folder of things played rather than looked at. */
export type MediaKind = 'speech' | 'video';

/** What saved speech records about itself: what was read, and by which voice. */
export interface SpeechMeta {
  text: string;
  engine: string;
  voice?: string;
}

/** One kept sound or video, as its folder lists it. */
export interface GalleryMedia {
  id: string;
  appPath: string;
  url: string;
  createdAt: number;
  durationSeconds: number | null;
  /** What it is of (saved speech: the words read); absent when it records none. */
  text: string | null;
}

function textOf(row: AssetRow): string | null {
  try {
    return row.meta ? ((JSON.parse(row.meta) as Partial<SpeechMeta>).text ?? null) : null;
  } catch {
    return null;
  }
}

async function toMedia(row: AssetRow): Promise<GalleryMedia> {
  return { id: row.id, appPath: row.path, url: await assetsService.fileUrl(row.path), createdAt: row.created_at, durationSeconds: row.duration_seconds, text: textOf(row) };
}

export const mediaService = {
  /** Keeps a reply read aloud (WAV bytes) in Gallery › Audio; throws when it can't be written. */
  async saveSpeech(wav: Uint8Array, meta: SpeechMeta): Promise<void> {
    const audio = readWavMono(wav);
    const durationSeconds = audio ? audio.samples.length / audio.sampleRate : undefined;
    await assetsService.save('speech', { data: wav, extension: 'wav' }, { meta, durationSeconds, kept: true });
    void queryClient.invalidateQueries({ queryKey: queryKeys.gallery() });
  },

  /** One page of a folder's media, newest first, after `before`. */
  async page(kind: MediaKind, before: ItemCursor | null, limit: number): Promise<GalleryMedia[]> {
    return Promise.all((await store.assets.page(kind, true, before, limit)).map(toMedia));
  },

  /** Deletes one kept sound or video with its file. */
  async remove(id: string): Promise<void> {
    await store.assets.remove(id);
  },
};
