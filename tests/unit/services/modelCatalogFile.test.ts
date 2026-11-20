import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, string>();
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (path: string) => files.has(path),
  readTextFile: async (path: string) => files.get(path) ?? '',
  writeTextFile: async (path: string, text: string) => void files.set(path, text),
  rename: async (from: string, to: string) => {
    files.set(to, files.get(from) ?? '');
    files.delete(from);
  },
}));
vi.mock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/data', join: async (...parts: string[]) => parts.join('/') }));

const PATH = '/data/models-dev.json';
const catalog = (model: string) => ({ openai: { id: 'openai', models: { [model]: { id: model, cost: { input: 1, output: 2 } } } } });
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

async function service() {
  vi.resetModules();
  return (await import('@services/modalities')).modalitiesService;
}

describe('models.dev catalog file', () => {
  beforeEach(() => {
    files.clear();
    fetchMock.mockReset();
  });

  it('uses a fresh saved catalog without fetching', async () => {
    files.set(PATH, JSON.stringify({ fetchedAt: Date.now(), data: catalog('saved') }));
    const modalities = await service();
    await modalities.ensureLoaded();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(modalities.getPricing('openai', 'saved')).not.toBeNull();
  });

  it('serves an old saved catalog at once and replaces it with a fresh one behind', async () => {
    files.set(PATH, JSON.stringify({ fetchedAt: 0, data: catalog('old') }));
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const modalities = await service();
    await modalities.ensureLoaded();
    expect(modalities.getPricing('openai', 'old')).not.toBeNull();
    answer({ ok: true, json: async () => catalog('new') });
    await vi.waitFor(() => expect(JSON.parse(files.get(PATH) ?? '{}').data).toEqual(catalog('new')));
    expect(files.has(`${PATH}.tmp`)).toBe(false);
  });

  it('never replaces a good catalog with an empty or failed download', async () => {
    files.set(PATH, JSON.stringify({ fetchedAt: Date.now(), data: catalog('good') }));
    const modalities = await service();
    await modalities.ensureLoaded();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) }).mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await modalities.fetchAndCache()).toBe(false);
    expect(await modalities.fetchAndCache()).toBe(false);
    expect(modalities.getPricing('openai', 'good')).not.toBeNull();
    expect(JSON.parse(files.get(PATH) ?? '{}').data).toEqual(catalog('good'));
  });
});
