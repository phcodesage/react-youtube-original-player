import { getYouTubeVideoId } from './youtube';

export interface OriginalMetadata {
  videoId: string;
  title: string;
  /** Metadata language and spoken language can differ. Neither is always present. */
  metadataLanguage?: string;
  audioLanguage?: string;
}

export interface MetadataOptions {
  apiKey: string;
  signal?: AbortSignal;
  fetch?: typeof globalThis.fetch;
}

/** Server-only: keep the API key in your backend, and cache results there. */
export async function getOriginalMetadata(
  video: string,
  { apiKey, signal, fetch: fetcher = globalThis.fetch }: MetadataOptions,
): Promise<OriginalMetadata> {
  const videoId = getYouTubeVideoId(video);
  if (!apiKey.trim()) throw new TypeError('A YouTube Data API key is required.');
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', apiKey);
  // No hl: request metadata in the default language. Do not use localized.title.
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`YouTube metadata request failed (HTTP ${response.status}).`);
  const body = await response.json() as {
    items?: { id?: string; snippet?: { title?: string; defaultLanguage?: string; defaultAudioLanguage?: string } }[];
  };
  const snippet = body.items?.find((item) => item.id === videoId)?.snippet;
  if (!snippet?.title) throw new Error('Video metadata is unavailable. The video may be private, removed, or inaccessible.');
  return {
    videoId,
    title: snippet.title,
    metadataLanguage: snippet.defaultLanguage,
    audioLanguage: snippet.defaultAudioLanguage,
  };
}
