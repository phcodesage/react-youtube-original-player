import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { OriginalRelayOptions } from '../../src/relay';

/** Offline end-to-end fixture. Enabled only in the Playwright server process. */
export const fixtureRelayOptions: OriginalRelayOptions = {
  extract: async (id) => ({
    id, title: 'Título original de prueba', duration: 8,
    formats: [
      { format_id: 'dub', url: 'https://fixture.googlevideo.com/dub.m3u8', ext: 'mp4', protocol: 'm3u8_native', vcodec: 'none', language: 'en', language_preference: 5, format_note: 'English dubbed default', tbr: 256 },
      { format_id: 'original', url: 'https://fixture.googlevideo.com/audio.m3u8', ext: 'mp4', protocol: 'm3u8_native', vcodec: 'none', language: 'es', language_preference: 10, format_note: 'Spanish original', tbr: 128 },
      { format_id: 'picture', url: 'https://fixture.googlevideo.com/video.m3u8', ext: 'mp4', protocol: 'm3u8_native', vcodec: 'avc1.4D401F', acodec: 'none', height: 360, tbr: 500 },
    ],
  }),
  fetch: async (input) => {
    const url = new URL(String(input));
    if (url.hostname !== 'fixture.googlevideo.com' || !/^\/(?:audio|video)(?:-\d+\.ts|\.m3u8)$/.test(url.pathname)) {
      return new Response('Unexpected fixture resource', { status: 404 });
    }
    const path = fileURLToPath(new URL(`../../demo/public/hls${url.pathname}`, import.meta.url));
    return new Response(await readFile(path), { headers: { 'content-type': path.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' } });
  },
};
