"use client";

import {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState,
  type ComponentPropsWithoutRef, type CSSProperties, type ReactNode,
} from 'react';
import ReactPlayer from 'react-player';
import {
  getYouTubeVideoId, normalizeLanguage, validateOriginalSource, validatePlaybackSpeed,
} from './youtube';

type MediaProps = Omit<ComponentPropsWithoutRef<'video'>, 'src' | 'children' | 'autoPlay'>;
type PlayerConfig = NonNullable<ComponentPropsWithoutRef<typeof ReactPlayer>['config']>;

export interface PlaybackCapability {
  mode: 'youtube' | 'original-source' | 'blocked';
  /** A supplied source is trusted input, not content independently verified here. */
  audio: 'unverified' | 'provided-source' | 'blocked';
  title: 'provided-title' | 'unavailable';
  iframeTitle: 'youtube-controlled' | 'not-applicable';
}

export interface OriginalPlayerHandle {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly playbackRate: number;
  /** Absolute seconds; queued until metadata loads. Does not force playback. */
  seekTo(seconds: number): void;
  getMediaElement(): HTMLVideoElement | null;
}

export interface OriginalYouTubePlayerProps extends MediaProps {
  src: string;
  originalTitle?: string;
  originalLanguage?: string;
  /** A direct, browser-playable asset containing the original audio. No extraction. */
  originalSource?: string;
  originalSourceType?: 'file' | 'hls';
  requireOriginalAudio?: boolean;
  playing?: boolean;
  playbackSpeed?: number;
  config?: PlayerConfig;
  onReady?: () => void;
  onStart?: MediaProps['onPlaying'];
  onEnd?: MediaProps['onEnded'];
  onCapabilityChange?: (capability: PlaybackCapability) => void;
  onPlaybackSpeedChange?: (actualSpeed: number) => void;
  onPlaybackError?: (error: Error) => void;
  renderStatus?: (capability: PlaybackCapability) => ReactNode;
  containerStyle?: CSSProperties;
  containerClassName?: string;
}

function defaultStatus(capability: PlaybackCapability) {
  if (capability.mode === 'blocked') {
    return 'Playback blocked: original audio requires a supplied original media source.';
  }
  if (capability.mode === 'youtube') {
    return 'YouTube chooses the audio track and its in-player title. To change audio, use Settings → Audio track → Original, if available.';
  }
  return null;
}

/** Retains ReactPlayer 3 for embeds and uses native video for supplied media assets. */
export const OriginalYouTubePlayer = forwardRef<OriginalPlayerHandle, OriginalYouTubePlayerProps>(
  function OriginalYouTubePlayer(props, ref) {
    const videoId = getYouTubeVideoId(props.src);
    const language = normalizeLanguage(props.originalLanguage);
    const source = props.originalSource !== undefined ? validateOriginalSource(props.originalSource) : undefined;
    validatePlaybackSpeed(props.playbackSpeed ?? 1);
    return <PlayerSession
      {...props}
      key={`${videoId}:${source ?? ''}:${props.originalSourceType ?? 'file'}:${language ?? ''}:${!!props.requireOriginalAudio}`}
      src={`https://www.youtube.com/watch?v=${videoId}`}
      originalSource={source}
      originalLanguage={language}
      ref={ref}
    />;
  },
);

const PlayerSession = forwardRef<OriginalPlayerHandle, OriginalYouTubePlayerProps>(
  function PlayerSession({
    src, originalTitle, originalLanguage, originalSource, originalSourceType = 'file', requireOriginalAudio = false,
    playing, playbackSpeed = 1, config, onReady, onStart, onEnd, onEnded,
    onCapabilityChange, onPlaybackSpeedChange, onPlaybackError,
    onLoadedMetadata, onPlay, onPlaying, onRateChange,
    renderStatus = defaultStatus, containerStyle, containerClassName,
    controls = true, playsInline = true, style, width = '100%', height = '100%',
    ...mediaProps
  }, forwardedRef) {
    const [mounted, setMounted] = useState(false);
    const [metadataLoaded, setMetadataLoaded] = useState(false);
    const media = useRef<HTMLVideoElement | null>(null);
    const ready = useRef(false);
    const started = useRef(false);
    const pendingSeek = useRef<number | null>(null);
    const blocked = requireOriginalAudio && !originalSource;
    const capability = useMemo<PlaybackCapability>(() => ({
      mode: blocked ? 'blocked' : originalSource ? 'original-source' : 'youtube',
      audio: blocked ? 'blocked' : originalSource ? 'provided-source' : 'unverified',
      title: originalTitle ? 'provided-title' : 'unavailable',
      iframeTitle: !blocked && !originalSource ? 'youtube-controlled' : 'not-applicable',
    }), [blocked, originalSource, originalTitle]);

    useEffect(() => setMounted(true), []);
    useEffect(() => { onCapabilityChange?.(capability); }, [capability, onCapabilityChange]);

    function applySeek(seconds: number) {
      const element = media.current;
      if (!element || !ready.current) { pendingSeek.current = seconds; return; }
      const duration = element.duration;
      element.currentTime = Number.isFinite(duration) && duration > 0 ? Math.min(seconds, duration) : seconds;
    }

    function metadataReady() {
      if (ready.current) return;
      ready.current = true;
      setMetadataLoaded(true);
      if (pendingSeek.current !== null) {
        const seconds = pendingSeek.current;
        pendingSeek.current = null;
        applySeek(seconds);
      }
      onReady?.();
    }

    // Native HLS can finish metadata loading before the provider's React event
    // listeners attach. Observe readiness as well as the event, once per source.
    useEffect(() => {
      if (!mounted || blocked || ready.current) return;
      const timer = window.setInterval(() => {
        if ((media.current?.readyState ?? 0) >= 1) {
          window.clearInterval(timer);
          metadataReady();
        }
      }, 50);
      return () => window.clearInterval(timer);
    }, [mounted, blocked, onReady]);

    useImperativeHandle(forwardedRef, () => ({
      get currentTime() { return media.current?.currentTime ?? 0; },
      set currentTime(seconds: number) { this.seekTo(seconds); },
      get duration() { return media.current?.duration ?? 0; },
      get paused() { return media.current?.paused ?? true; },
      get playbackRate() { return media.current?.playbackRate ?? 1; },
      seekTo(seconds: number) {
        if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Seek time must be finite and non-negative.');
        applySeek(seconds);
      },
      getMediaElement: () => media.current,
    }));

    // ReactPlayer manages embed playback. Native media uses the same public props.
    useEffect(() => {
      if (!originalSource || originalSourceType === 'hls' || !media.current || blocked) return;
      const element = media.current;
      element.playbackRate = playbackSpeed;
      if (playing === true && element.paused) {
        void element.play().catch((error: unknown) => {
          // Source replacement/unmount can abort a pending play request normally.
          if (error instanceof Error && error.name !== 'AbortError') onPlaybackError?.(error);
        });
      } else if (playing === false && !element.paused) element.pause();
    }, [mounted, originalSource, originalSourceType, blocked, playing, playbackSpeed, onPlaybackError]);

    const handlers: MediaProps = {
      ...mediaProps,
      onPlay,
      onLoadedMetadata(event) {
        metadataReady();
        onLoadedMetadata?.(event);
      },
      onPlaying(event) {
        if (!started.current) { started.current = true; onStart?.(event); }
        onPlaying?.(event);
      },
      onEnded(event) { onEnded?.(event); onEnd?.(event); },
      onRateChange(event) {
        onRateChange?.(event);
        // Read actual speed; YouTube may reject or round the requested speed.
        if (media.current) onPlaybackSpeedChange?.(media.current.playbackRate);
      },
    };

    const playerStyle = { display: 'block', width, height, ...style };
    const status = renderStatus(capability);
    return <figure className={containerClassName} style={{ margin: 0, ...containerStyle }}>
      {originalTitle && <figcaption translate="no" lang={originalLanguage} style={{ marginBottom: '0.75rem' }}>
        {originalTitle}
      </figcaption>}
      {!blocked && <div style={{ aspectRatio: '16 / 9', minHeight: 200, background: '#111' }}>
        {mounted && (originalSource && originalSourceType !== 'hls'
          ? <video {...handlers} ref={media} src={originalSource} controls={controls}
              playsInline={playsInline} style={playerStyle} aria-label={originalTitle ?? 'Original source video'} />
          : <ReactPlayer {...handlers} ref={media} src={originalSource ?? src} controls={controls}
              playsInline={playsInline} playing={metadataLoaded || mediaProps.preload === 'none' ? playing : undefined} playbackRate={playbackSpeed}
              width={width} height={height} style={style}
              config={{ ...config, youtube: {
                ...config?.youtube,
                ...(originalLanguage ? { hl: originalLanguage } : {}),
              } }} />)}
      </div>}
      {status && <div role="status" style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>{status}</div>}
    </figure>;
  },
);
