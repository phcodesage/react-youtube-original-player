import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { getYouTubeVideoId } from './youtube';

export interface ExtractedFormat {
  format_id: string;
  url: string;
  protocol?: string;
  ext?: string;
  acodec?: string | null;
  vcodec?: string | null;
  height?: number;
  width?: number;
  tbr?: number;
  abr?: number;
  language?: string;
  language_preference?: number;
  format_note?: string;
}

export interface ExtractedVideo {
  id: string;
  title: string;
  duration?: number;
  is_live?: boolean;
  formats: ExtractedFormat[];
}

export interface ResolvedOriginalVideo {
  videoId: string;
  title: string;
  language?: string;
  duration?: number;
  streamUrl: string;
  expiresAt: number;
  selection: {
    evidence: 'youtube-original-metadata';
    audioFormatId: string;
    videoFormatId: string;
    audioLabel: string;
  };
}

export class OriginalStreamError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

/** Trust explicit original metadata, never a default track or a viewer language. */
export function selectOriginalStreams(video: ExtractedVideo, maxHeight = 720) {
  if (!video.title || video.is_live || !Array.isArray(video.formats)) {
    throw new OriginalStreamError('Only accessible, titled, on-demand videos are supported.');
  }
  const hls = video.formats.filter((f) => f.protocol?.startsWith('m3u8'));
  const audio = hls.filter((f) => f.vcodec === 'none' && f.ext === 'mp4'
    && f.language_preference === 10
    && /\boriginal\b/i.test(f.format_note ?? '')
    && !/dubbed|descriptive/i.test(f.format_note ?? ''))
    .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];
  const picture = hls.filter((f) => /^avc1[.]/i.test(f.vcodec ?? '') && f.acodec === 'none'
    && (f.height ?? Infinity) <= maxHeight)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0))[0];
  if (!audio) throw new OriginalStreamError('YouTube did not expose an explicitly marked original HLS audio track. No dubbed/default fallback was selected.');
  if (!picture) throw new OriginalStreamError('A compatible H.264 HLS video stream is unavailable.');
  assertMediaUrl(audio.url); assertMediaUrl(picture.url);
  return { audio, video: picture };
}

/** Only URLs obtained from the extractor/manifests can enter the relay. */
export function assertMediaUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.googlevideo.com')
    || url.username || url.password || (url.port && url.port !== '443')) {
    throw new OriginalStreamError('The media origin is not an allowed YouTube CDN.', 502);
  }
  return url;
}

/** Rewrite segments, maps, and keys. No client-controlled upstream URL parameter. */
export function rewritePlaylist(text: string, base: string, register: (url: string) => string) {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new OriginalStreamError('The upstream response is not an HLS playlist.', 502);
  function replace(uri: string) {
    const absolute = new URL(uri, base).href;
    assertMediaUrl(absolute);
    return register(absolute);
  }
  return text.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${replace(uri)}"`);
    return replace(line.trim());
  }).join('\n');
}

const run = promisify(execFile);
export interface OriginalRelayOptions {
  /** URL prefix mounted at your own origin, such as /api/original. */
  prefix?: string;
  ytDlpPath?: string;
  maxHeight?: number;
  sessionTtlMs?: number;
  maxSessions?: number;
  maxConcurrentExtractions?: number;
  /** Adapters make the HTTP/selection contract testable without live YouTube. */
  extract?: (videoId: string) => Promise<ExtractedVideo>;
  fetch?: typeof globalThis.fetch;
}

export function createOriginalRelay(options: OriginalRelayOptions = {}) {
  const prefix = (options.prefix ?? '/api/original').replace(/\/$/, '');
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(prefix)) throw new TypeError('Invalid relay URL prefix.');
  const maxHeight = options.maxHeight ?? 720;
  const maxSessions = options.maxSessions ?? 20;
  const maxConcurrent = options.maxConcurrentExtractions ?? 2;
  if (maxHeight < 144 || maxSessions < 1 || maxConcurrent < 1) throw new TypeError('Relay limits must be positive.');
  const fetcher = options.fetch ?? globalThis.fetch;
  const extract = options.extract ?? (async (id: string): Promise<ExtractedVideo> => {
    try {
      const { stdout } = await run(options.ytDlpPath ?? 'yt-dlp', [
        '--ignore-config', '--no-playlist', '--no-warnings', '--no-update',
        '--socket-timeout', '12', '--retries', '1', '--js-runtimes', `node:${process.execPath}`,
        '--skip-download', '--dump-single-json', '--', `https://www.youtube.com/watch?v=${id}`,
      ], { timeout: 90_000, maxBuffer: 32 * 1024 * 1024 });
      return JSON.parse(stdout) as ExtractedVideo;
    } catch {
      throw new OriginalStreamError('YouTube extraction failed. Check yt-dlp installation/version and server network access.', 502);
    }
  });
  interface Session {
    result: ResolvedOriginalVideo;
    audio: ExtractedFormat;
    video: ExtractedFormat;
    resources: Map<string, string>;
    reverse: Map<string, string>;
    playlists: Map<string, string>;
  }
  const sessions = new Map<string, Session>();
  const inFlight = new Map<string, Promise<ResolvedOriginalVideo>>();
  let extracting = 0;

  function register(session: Session, url: string, playlist = false): string {
    assertMediaUrl(url);
    let id = session.reverse.get(url);
    if (!id) {
      // YouTube VOD segment URLs lack an extension; the two root manifests are explicit.
      id = `${session.resources.size}${playlist || /\.m3u8(?:[?]|$)/i.test(url) ? '.m3u8' : '.bin'}`;
      session.resources.set(id, url); session.reverse.set(url, id);
    }
    const token = session.result.streamUrl.split('/').at(-2)!;
    return `${prefix}/media/${token}/${id}`;
  }

  async function resolve(video: string): Promise<ResolvedOriginalVideo> {
    const id = getYouTubeVideoId(video);
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.result.expiresAt <= now) sessions.delete(token);
      else if (session.result.videoId === id) return session.result;
    }
    if (inFlight.has(id)) return inFlight.get(id)!;
    if (extracting >= maxConcurrent || sessions.size + extracting >= maxSessions) {
      throw new OriginalStreamError('The relay is at capacity. Retry later.', 503);
    }
    const task = (async () => {
      extracting++;
      try {
        const info = await extract(id);
        if (info.id !== id) throw new OriginalStreamError('The extractor returned a different video.', 502);
        const selected = selectOriginalStreams(info, maxHeight);
        const token = randomBytes(24).toString('hex');
        const expirations = [selected.audio.url, selected.video.url].map((url) => {
          const parsed = new URL(url);
          const seconds = Number(parsed.searchParams.get('expire') || parsed.pathname.match(/\/expire\/(\d+)/)?.[1]);
          return seconds > 0 ? seconds * 1000 - 60_000 : Infinity;
        });
        const expiresAt = Math.min(Date.now() + (options.sessionTtlMs ?? 6 * 60 * 60 * 1000), ...expirations);
        if (expiresAt <= Date.now()) throw new OriginalStreamError('YouTube returned expired media URLs.', 502);
        const result: ResolvedOriginalVideo = {
          videoId: id, title: info.title, language: selected.audio.language,
          duration: info.duration, streamUrl: `${prefix}/media/${token}/master.m3u8`, expiresAt,
          selection: { evidence: 'youtube-original-metadata', audioFormatId: selected.audio.format_id,
            videoFormatId: selected.video.format_id, audioLabel: selected.audio.format_note! },
        };
        sessions.set(token, { result, ...selected, resources: new Map(), reverse: new Map(), playlists: new Map() });
        return result;
      } finally { extracting--; }
    })();
    inFlight.set(id, task);
    try { return await task; } finally { inFlight.delete(id); }
  }

  async function upstream(url: string, range?: string): Promise<Response> {
    let current = url;
    for (let redirect = 0; redirect < 4; redirect++) {
      assertMediaUrl(current);
      const response = await fetcher(current, {
        redirect: 'manual', signal: AbortSignal.timeout(30_000),
        headers: { 'accept-encoding': 'identity', ...(range ? { range } : {}) },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        current = new URL(location, current).href;
        continue;
      }
      return response;
    }
    throw new OriginalStreamError('The media CDN returned too many redirects.', 502);
  }

  function send(res: ServerResponse, status: number, content: string, type: string, head = false) {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
    res.end(head ? undefined : content);
  }

  /** Returns false for paths outside this relay, allowing Express/Node composition. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://relay.local');
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return false;
    const head = req.method === 'HEAD';
    try {
      if (req.method !== 'GET' && !head) throw new OriginalStreamError('Use GET or HEAD.', 405);
      if (url.pathname === prefix) {
        const result = await resolve(url.searchParams.get('src') ?? '');
        send(res, 200, JSON.stringify(result), 'application/json', head);
        return true;
      }
      const match = url.pathname.slice(prefix.length).match(/^\/media\/([a-f0-9]{48})\/([\w.-]+)$/);
      const session = match ? sessions.get(match[1]) : undefined;
      if (!session || session.result.expiresAt <= Date.now()) throw new OriginalStreamError('Media session is missing or expired. Resolve the video again.', 410);
      const resource = match![2];
      if (resource === 'master.m3u8') {
        const audio = register(session, session.audio.url, true);
        const picture = register(session, session.video.url, true);
        const language = session.result.language?.replace(/[^a-zA-Z0-9-]/g, '');
        const bandwidth = Math.max(300_000, Math.ceil(((session.video.tbr ?? 1500) + (session.audio.tbr ?? 128)) * 1000));
        const master = '#EXTM3U\n#EXT-X-VERSION:3\n'
          + `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="original",NAME="Original",DEFAULT=YES,AUTOSELECT=YES${language ? `,LANGUAGE="${language}"` : ''},URI="${audio}"\n`
          + `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AUDIO="original"\n${picture}\n`;
        send(res, 200, master, 'application/vnd.apple.mpegurl', head);
        return true;
      }
      const remote = session.resources.get(resource);
      if (!remote) throw new OriginalStreamError('Unknown media resource.', 404);
      const isPlaylist = resource.endsWith('.m3u8');
      if (isPlaylist && session.playlists.has(resource)) {
        send(res, 200, session.playlists.get(resource)!, 'application/vnd.apple.mpegurl', head);
        return true;
      }
      const range = req.headers.range;
      if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new OriginalStreamError('Only one byte range is supported.', 416);
      const response = await upstream(remote, isPlaylist ? undefined : range);
      if (!response.ok) { await response.body?.cancel(); throw new OriginalStreamError(`The media CDN returned HTTP ${response.status}.`, 502); }
      if (isPlaylist) {
        const text = await response.text();
        if (text.length > 2_000_000) throw new OriginalStreamError('The upstream playlist exceeds the size limit.', 502);
        const rewritten = rewritePlaylist(text, remote, (uri) => register(session, uri));
        session.playlists.set(resource, rewritten);
        send(res, 200, rewritten, 'application/vnd.apple.mpegurl', head);
      } else {
        const headers: Record<string, string> = {
          'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
          'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff',
        };
        for (const name of ['content-range', 'accept-ranges']) {
          const value = response.headers.get(name); if (value) headers[name] = value;
        }
        if (!response.headers.has('content-encoding') && response.headers.has('content-length')) headers['content-length'] = response.headers.get('content-length')!;
        res.writeHead(response.status, headers);
        if (head || !response.body) { await response.body?.cancel(); res.end(); }
        else {
          // Read the Web stream directly. In particular, do not leave a Node
          // Readable adapter behind when a paused player cancels a segment.
          const reader = response.body.getReader();
          const stop = () => { void reader.cancel().catch(() => {}); };
          res.on('close', stop); res.on('error', stop);
          try {
            while (!res.destroyed) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!res.write(value)) await new Promise<void>((resolve) => {
                const finish = () => { res.off('drain', finish); res.off('close', finish); resolve(); };
                res.once('drain', finish); res.once('close', finish);
                if (res.destroyed) finish();
              });
            }
            if (!res.destroyed) res.end();
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock(); res.off('close', stop); res.off('error', stop);
          }
        }
      }
    } catch (error) {
      if (res.headersSent) { res.destroy(); return true; }
      const status = error instanceof OriginalStreamError ? error.status : error instanceof TypeError ? 400 : 502;
      const message = error instanceof OriginalStreamError || error instanceof TypeError
        ? error.message : 'The media relay could not complete the request.';
      send(res, status, JSON.stringify({ error: message }), 'application/json', head);
    }
    return true;
  }

  return { resolve, handle, clear: () => sessions.clear() };
}
