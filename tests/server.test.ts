import { describe, expect, it, vi } from 'vitest';
import { getOriginalMetadata } from '../src/server';

describe('original metadata', () => {
  it('requests default snippet metadata without hl, ignoring localized titles', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: '8TT2-kwAss0', snippet: {
      title: 'Título original', defaultLanguage: 'es', defaultAudioLanguage: 'es-MX',
      localized: { title: 'Translated title' },
    } }] })));
    const controller = new AbortController();
    const result = await getOriginalMetadata('https://youtu.be/8TT2-kwAss0', {
      apiKey: 'test-key', fetch: fetcher, signal: controller.signal,
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
    expect(url.searchParams.get('part')).toBe('snippet');
    expect(url.searchParams.has('hl')).toBe(false);
    expect(options.signal).toBe(controller.signal);
    expect(result).toEqual({ videoId: '8TT2-kwAss0', title: 'Título original', metadataLanguage: 'es', audioLanguage: 'es-MX' });
  });

  it('does not invent a missing audio language', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ id: '8TT2-kwAss0', snippet: { title: 'Original' } }] })));
    expect((await getOriginalMetadata('8TT2-kwAss0', { apiKey: 'key', fetch: fetcher })).audioLanguage).toBeUndefined();
  });

  it('reports quota/authorization errors without echoing the API key or response body', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('secret-key', { status: 403 }));
    await expect(getOriginalMetadata('8TT2-kwAss0', { apiKey: 'secret-key', fetch: fetcher })).rejects.toThrow('HTTP 403');
  });

  it('handles absent video metadata and invalid input', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"items":[]}'));
    await expect(getOriginalMetadata('8TT2-kwAss0', { apiKey: 'key', fetch: fetcher })).rejects.toThrow('unavailable');
    fetcher.mockClear();
    await expect(getOriginalMetadata('8TT2-kwAss0', { apiKey: '', fetch: fetcher })).rejects.toThrow('key is required');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
