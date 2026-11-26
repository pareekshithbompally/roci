import { describe, it, expect, vi, beforeEach } from 'vitest';

const openCopy = vi.fn();
const openFile = vi.fn();
const showToast = vi.fn();
vi.mock('@services/storage', () => ({ cacheService: { openCopy: (...a: unknown[]) => openCopy(...a) } }));
vi.mock('@services/tauri', () => ({ openFile: (...a: unknown[]) => openFile(...a) }));
vi.mock('@shared/ui', () => ({ showToast: (...a: unknown[]) => showToast(...a) }));

import { openAttachment } from '@features/chat/utils/openAttachment';

const pdf = { type: 'file' as const, mediaType: 'application/pdf', url: `data:application/pdf;base64,${btoa('%PDF')}`, filename: 'plan.pdf' };

describe('openAttachment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hands a copy of the file, by its own name, to its default app', async () => {
    openCopy.mockResolvedValue('/cache/open/1-plan.pdf');
    await openAttachment(pdf.filename, pdf.url);
    const [name, bytes] = openCopy.mock.calls[0] as [string, Uint8Array];
    expect([name, new TextDecoder().decode(bytes)]).toEqual(['plan.pdf', '%PDF']);
    expect(openFile).toHaveBeenCalledWith('/cache/open/1-plan.pdf');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('says so when it can not open it', async () => {
    openCopy.mockResolvedValue('/cache/open/1-plan.pdf');
    openFile.mockRejectedValue(new Error('not allowed'));
    await openAttachment(pdf.filename, pdf.url);
    expect(showToast).toHaveBeenCalledWith("Couldn't open plan.pdf", 'error');
  });
});
