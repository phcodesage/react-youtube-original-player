const VIDEO_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);

/** Parse a single video, deliberately excluding playlists and lookalike hosts. */
export function getYouTubeVideoId(input: string): string {
  if (VIDEO_ID.test(input)) return input;
  let url: URL;
  try { url = new URL(input); } catch { throw new TypeError('Expected a YouTube video URL or 11-character video ID.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('YouTube URLs must use HTTP or HTTPS.');
  }
  let id: string | null | undefined;
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
  }
  if (!id || !VIDEO_ID.test(id)) throw new TypeError('Expected a single valid YouTube video.');
  return id;
}

/** hl is an interface/caption hint, NEVER proof of audio-track selection. */
export function normalizeLanguage(language?: string): string | undefined {
  if (!language) return undefined;
  try { return Intl.getCanonicalLocales(language)[0]; }
  catch { throw new TypeError('originalLanguage must be a valid BCP 47 language tag.'); }
}

export function validatePlaybackSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 1.5) {
    throw new RangeError('playbackSpeed must be a finite number from 0.5 to 1.5.');
  }
  return speed;
}

export function validateOriginalSource(source: string): string {
  // A supplied source is a caller-owned media asset, not another YouTube embed.
  if (source.startsWith('/') && !source.startsWith('//')) return source;
  let url: URL;
  try { url = new URL(source); } catch { throw new TypeError('originalSource must be an absolute media URL or root-relative path.'); }
  if (!['https:', 'http:', 'blob:'].includes(url.protocol)) {
    throw new TypeError('originalSource must use HTTP, HTTPS, or a browser blob URL.');
  }
  if (YOUTUBE_HOSTS.has(url.hostname) || url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be' || url.hostname.endsWith('.youtube.com')) {
    throw new TypeError('originalSource must point to a media asset, not a YouTube page.');
  }
  return source;
}
