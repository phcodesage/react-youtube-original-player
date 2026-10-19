// @vitest-environment node
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { assertMediaUrl, createOriginalRelay, rewritePlaylist, selectOriginalStreams, type ExtractedVideo, type OriginalRelayOptions } from '../src/relay';

const cdn = 'https://rr1---sn-test.googlevideo.com';
function extraction(): ExtractedVideo {
  return {
    id: '8TT2-kwAss0', title: 'Así es el único país Africano que habla español', duration: 862,
    formats: [
      { format_id: 'dub', url: `${cdn}/dub.m3u8`, protocol: 'm3u8_native', ext: 'mp4', vcodec: 'none', language: 'en', language_preference: 5, format_note: 'English (default) dubbed', tbr: 256 },
      { format_id: 'original', url: `${cdn}/audio.m3u8`, protocol: 'm3u8_native', ext: 'mp4', vcodec: 'none', language: 'es', language_preference: 10, format_note: 'Español - original (original)', tbr: 128 },
      { format_id: '720', url: `${cdn}/video.m3u8`, protocol: 'm3u8_native', ext: 'mp4', vcodec: 'avc1.4D401F', acodec: 'none', height: 720, tbr: 2000 },
      { format_id: '1080', url: `${cdn}/hd.m3u8`, protocol: 'm3u8_native', ext: 'mp4', vcodec: 'avc1.64002A', acodec: 'none', height: 1080, tbr: 5000 },
    ],
  };
}

async function withRelay(options: OriginalRelayOptions, check: (url: string) => Promise<void>) {
  const relay = createOriginalRelay(options);
  const server = createServer((req, res) => {
    void relay.handle(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end(); } });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await check(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

describe('original track selection', () => {
  it('selects explicitly original audio even when a higher bitrate dub is default', () => {
    const selected = selectOriginalStreams(extraction());
    expect(selected.audio.format_id).toBe('original');
    expect(selected.audio.language).toBe('es');
    expect(selected.video.format_id).toBe('720');
  });
  it('fails when only a default track or a language match exists', () => {
    const info = extraction(); info.formats = info.formats.filter((f) => f.format_id !== 'original');
    info.formats[0].language = 'es';
    expect(() => selectOriginalStreams(info)).toThrow('explicitly marked original');
  });
  it('rejects a dub with inconsistent original metadata and non-H.264 video', () => {
    const info = extraction(); info.formats[1].format_note = 'original dubbed';
    expect(() => selectOriginalStreams(info)).toThrow('original');
    const vp9 = extraction(); vp9.formats.forEach((f) => { if (f.acodec === 'none') f.vcodec = 'vp09.00.10.08'; });
    expect(() => selectOriginalStreams(vp9)).toThrow('H.264');
  });
});

it('rewrites segment/map/key URLs and rejects non-CDN or non-HTTPS resources', () => {
  const urls: string[] = [];
  const result = rewritePlaylist('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:5,\nsegment.ts\n', `${cdn}/path/main.m3u8`, (url) => { urls.push(url); return `/local/${urls.length}`; });
  expect(urls).toEqual([`${cdn}/path/init.mp4`, `${cdn}/path/key`, `${cdn}/path/segment.ts`]);
  expect(result).not.toContain('googlevideo');
  for (const url of ['https://googlevideo.com.evil.test/x', 'http://rr1.googlevideo.com/x', 'https://127.0.0.1/x', 'https://user:pass@rr1.googlevideo.com/x']) {
    expect(() => assertMediaUrl(url)).toThrow();
  }
  expect(() => rewritePlaylist('#EXTM3U\nhttp://127.0.0.1/private', `${cdn}/main.m3u8`, (x) => x)).toThrow();
});

it('serves one original rendition, rewrites its segments, and relays byte ranges', async () => {
  const extract = vi.fn().mockResolvedValue(extraction());
  const remoteFetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).endsWith('.m3u8')) return new Response('#EXTM3U\n#EXTINF:5,\nsegment.ts\n#EXT-X-ENDLIST\n');
    return new Response(options?.headers && new Headers(options.headers).has('range') ? '123' : 'segment', {
      status: 206, headers: { 'content-type': 'video/mp2t', 'content-range': 'bytes 1-3/10' },
    });
  });
  await withRelay({ extract, fetch: remoteFetch }, async (origin) => {
    const metadata = await (await fetch(`${origin}/api/original?src=8TT2-kwAss0`)).json();
    expect(metadata.title).toContain('Así es');
    expect(metadata.selection.audioFormatId).toBe('original');
    const master = await (await fetch(origin + metadata.streamUrl)).text();
    expect(master.match(/#EXT-X-MEDIA:/g)).toHaveLength(1);
    expect(master).toContain('LANGUAGE="es"');
    expect(master).not.toContain('dub');
    const audioPath = master.match(/URI="([^"]+)"/)![1];
    const audio = await (await fetch(origin + audioPath)).text();
    expect(audio).not.toContain('googlevideo');
    const segmentPath = audio.split('\n').find((line) => line.startsWith('/'))!;
    const segment = await fetch(origin + segmentPath, { headers: { Range: 'bytes=1-3' } });
    expect(segment.status).toBe(206);
    expect(await segment.text()).toBe('123');
    expect(segment.headers.get('content-range')).toBe('bytes 1-3/10');
    expect(new Headers(remoteFetch.mock.calls.at(-1)![1]?.headers).get('range')).toBe('bytes=1-3');
    await fetch(`${origin}/api/original?src=8TT2-kwAss0`);
    expect(extract).toHaveBeenCalledTimes(1);
    expect((await fetch(origin + segmentPath, { headers: { Range: 'bytes=-' } })).status).toBe(416);
  });
});

it('deduplicates extraction, rejects expired sessions, and validates input before extraction', async () => {
  const extract = vi.fn().mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); return extraction(); });
  const relay = createOriginalRelay({ extract });
  const [a, b] = await Promise.all([relay.resolve('8TT2-kwAss0'), relay.resolve('8TT2-kwAss0')]);
  expect(a.streamUrl).toBe(b.streamUrl); expect(extract).toHaveBeenCalledTimes(1);
  await withRelay({ extract, sessionTtlMs: -1 }, async (origin) => {
    const invalid = await fetch(`${origin}/api/original?src=https://evil.test/video`);
    expect(invalid.status).toBe(400);
    const expired = await fetch(`${origin}/api/original?src=8TT2-kwAss0`);
    expect(expired.status).toBe(502);
    expect((await fetch(`${origin}/api/original/media/${'a'.repeat(48)}/master.m3u8`)).status).toBe(410);
  });
});

it('refuses a redirect away from the media CDN', async () => {
  const remoteFetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } }));
  await withRelay({ extract: async () => extraction(), fetch: remoteFetch }, async (origin) => {
    const metadata = await (await fetch(`${origin}/api/original?src=8TT2-kwAss0`)).json();
    const master = await (await fetch(origin + metadata.streamUrl)).text();
    const response = await fetch(origin + master.match(/URI="([^"]+)"/)![1]);
    expect(response.status).toBe(502); expect(remoteFetch).toHaveBeenCalledTimes(1);
  });
});

it('cancels upstream reads when a player abandons a segment and keeps serving requests', async () => {
  const canceled = vi.fn();
  const remoteFetch = vi.fn(async (input: string | URL | Request) => {
    if (String(input).endsWith('.m3u8')) return new Response('#EXTM3U\n#EXTINF:5,\nsegment.ts\n');
    let timer: ReturnType<typeof setTimeout>;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('first chunk'));
        timer = setTimeout(() => controller.error(new DOMException('Timed out', 'TimeoutError')), 100);
      },
      cancel() { clearTimeout(timer); canceled(); },
    }));
  });
  await withRelay({ extract: async () => extraction(), fetch: remoteFetch }, async (origin) => {
    const metadata = await (await fetch(`${origin}/api/original?src=8TT2-kwAss0`)).json();
    const master = await (await fetch(origin + metadata.streamUrl)).text();
    const playlist = await (await fetch(origin + master.match(/URI="([^"]+)"/)![1])).text();
    const segment = await fetch(origin + playlist.split('\n').find((line) => line.startsWith('/'))!);
    const reader = segment.body!.getReader();
    await reader.read(); await reader.cancel();
    await vi.waitFor(() => expect(canceled).toHaveBeenCalled());
    expect((await fetch(`${origin}/api/original?src=8TT2-kwAss0`)).status).toBe(200);
  });
});
