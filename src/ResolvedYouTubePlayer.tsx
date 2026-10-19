"use client";

import { forwardRef, useEffect, useRef, useState } from 'react';
import { OriginalYouTubePlayer, type OriginalPlayerHandle, type OriginalYouTubePlayerProps } from './OriginalYouTubePlayer';
import type { ResolvedOriginalVideo } from './relay';
import { getYouTubeVideoId } from './youtube';

export interface ResolvedYouTubePlayerProps extends Omit<OriginalYouTubePlayerProps,
  'originalTitle' | 'originalLanguage' | 'originalSource' | 'originalSourceType' | 'requireOriginalAudio'> {
  endpoint?: string;
  onResolved?: (video: ResolvedOriginalVideo) => void;
  onResolveError?: (error: Error) => void;
}

/** YouTube URL → backend selection of original audio → single-audio HLS playback. */
export const ResolvedYouTubePlayer = forwardRef<OriginalPlayerHandle, ResolvedYouTubePlayerProps>(
  function ResolvedYouTubePlayer({ src, endpoint = '/api/original', onResolved, onResolveError, ...props }, ref) {
    const videoId = getYouTubeVideoId(src);
    const key = `${endpoint}:${videoId}`;
    const [state, setState] = useState<{ key: string; video?: ResolvedOriginalVideo; error?: Error }>();
    const [retry, setRetry] = useState(0);
    const callbacks = useRef({ onResolved, onResolveError });
    callbacks.current = { onResolved, onResolveError };
    useEffect(() => {
      const controller = new AbortController();
      const url = new URL(endpoint, window.location.href);
      url.searchParams.set('src', videoId);
      setState({ key });
      void (async () => {
        try {
          // React StrictMode may dispose the first effect immediately. Avoid
          // starting a network request for that already-abandoned render.
          await Promise.resolve();
          if (controller.signal.aborted) return;
          const response = await fetch(url, { signal: controller.signal });
          const body = await response.json();
          if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Original stream resolution failed.');
          const video = body as ResolvedOriginalVideo;
          if (video.videoId !== videoId || !video.title || !video.streamUrl || video.selection?.evidence !== 'youtube-original-metadata') {
            throw new Error('The resolver did not return an original-audio selection.');
          }
          if (!controller.signal.aborted) setState({ key, video });
        } catch (error) {
          if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error : new Error('Original stream resolution failed.') });
        }
      })();
      return () => controller.abort();
    }, [endpoint, videoId, key, retry]);

    useEffect(() => {
      if (state?.key !== key) return;
      if (state.video) callbacks.current.onResolved?.(state.video);
      if (state.error) callbacks.current.onResolveError?.(state.error);
    }, [state, key]);

    if (state?.key === key && state.video) return <OriginalYouTubePlayer
      {...props} ref={ref} src={videoId} originalSource={state.video.streamUrl} originalSourceType="hls"
      originalTitle={state.video.title} originalLanguage={state.video.language} requireOriginalAudio
    />;
    if (state?.key === key && state.error) return <div role="alert">
      <p>{state.error.message}</p><button type="button" onClick={() => setRetry((n) => n + 1)}>Retry original stream</button>
    </div>;
    return <div role="status">Resolving the original title and audio track…</div>;
  },
);
