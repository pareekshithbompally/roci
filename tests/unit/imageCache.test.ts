import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
const cacheGet = vi.fn();
const cacheSet = vi.fn();
vi.mock('@services/platform-fetch', () => ({ getPlatformFetch: () => fetchMock }));
vi.mock('@services/storage/cache.service', () => ({ cacheService: { get: cacheGet, set: cacheSet } }));

const { cachedImage } = await import('@services/imageCache');
const AVATAR = 'https://huggingface.co/api/avatars/nvidia';

describe('cachedImage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    cacheGet.mockReset();
    cacheSet.mockReset();
  });

  it('passes an inline image straight through', async () => {
    expect(await cachedImage('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves a cached image without touching the network', async () => {
    cacheGet.mockResolvedValue({ success: true, data: 'data:image/png;base64,CACHED' });
    expect(await cachedImage(AVATAR)).toBe('data:image/png;base64,CACHED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a new image once, keeps its type, and stores it on disk', async () => {
    cacheGet.mockResolvedValue({ success: false });
    fetchMock.mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }));
    const src = await cachedImage(AVATAR);
    expect(src.startsWith('data:image/png;base64,')).toBe(true);
    expect(cacheSet).toHaveBeenCalledWith(`image:${AVATAR}`, src, undefined, 'api');
  });

  it('throws when the image cannot be loaded, so the caller shows its fallback', async () => {
    cacheGet.mockResolvedValue({ success: false });
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(cachedImage(AVATAR)).rejects.toThrow('404');
    expect(cacheSet).not.toHaveBeenCalled();
  });
});
