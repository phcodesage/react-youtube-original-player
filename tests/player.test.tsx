import { afterEach, expect, it, vi } from 'vitest';
import { createRef, forwardRef, useState } from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { OriginalYouTubePlayer, ResolvedYouTubePlayer, type OriginalPlayerHandle } from '../src';

vi.mock('react-player', () => ({
  default: forwardRef<HTMLVideoElement, Record<string, unknown>>(function MockPlayer(props, ref) {
    const { config, playing, playbackRate, width, height, ...rest } = props;
    return <video {...rest} ref={ref} data-testid="embed" data-config={JSON.stringify(config)}
      data-playing={String(playing)} data-playback-rate={Number(playbackRate)} />;
  }),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const src = 'https://youtu.be/8TT2-kwAss0';

it('preserves ReactPlayer configuration with v3 language hints and never claims selected audio', () => {
  const onCapabilityChange = vi.fn();
  const view = render(<OriginalYouTubePlayer src={src} originalTitle="Título original" originalLanguage="es"
    playing playbackSpeed={1.25} config={{ youtube: { rel: 0, cc_load_policy: 1 } }} onCapabilityChange={onCapabilityChange} />);
  const embed = view.getByTestId('embed');
  fireEvent.loadedMetadata(embed);
  expect(embed.getAttribute('data-config')).toBe('{"youtube":{"rel":0,"cc_load_policy":1,"hl":"es"}}');
  expect(embed.getAttribute('data-playing')).toBe('true');
  expect(embed.getAttribute('data-playback-rate')).toBe('1.25');
  expect(view.getByText('Título original').getAttribute('translate')).toBe('no');
  expect(view.getByText('Título original').getAttribute('lang')).toBe('es');
  expect(onCapabilityChange).toHaveBeenLastCalledWith({ mode: 'youtube', audio: 'unverified', title: 'provided-title', iframeTitle: 'youtube-controlled' });
});

it('blocks the player when original audio is required without a source', () => {
  const view = render(<OriginalYouTubePlayer src={src} requireOriginalAudio />);
  expect(view.queryByTestId('embed')).toBeNull();
  expect(view.container.querySelector('video')).toBeNull();
  expect(view.getByRole('status').textContent).toContain('Playback blocked');
});

it('emits onStart once per video, forwards events, and resets for a new video', () => {
  const onStart = vi.fn(), onPlay = vi.fn(), onPause = vi.fn(), onEnd = vi.fn(), onSeeked = vi.fn(), onTimeUpdate = vi.fn();
  const callbacks = { onStart, onPlay, onPause, onEnd, onSeeked, onTimeUpdate };
  const view = render(<OriginalYouTubePlayer src={src} {...callbacks} />);
  const embed = view.getByTestId('embed');
  fireEvent.play(embed); fireEvent.playing(embed); fireEvent.timeUpdate(embed);
  fireEvent.pause(embed); fireEvent.seeked(embed); fireEvent.play(embed); fireEvent.playing(embed); fireEvent.ended(embed);
  expect(onStart).toHaveBeenCalledTimes(1);
  expect(onPlay).toHaveBeenCalledTimes(2);
  for (const callback of [onPause, onEnd, onSeeked, onTimeUpdate]) expect(callback).toHaveBeenCalledTimes(1);
  view.rerender(<OriginalYouTubePlayer src="Af6i6ChAVTw" {...callbacks} />);
  fireEvent.playing(view.getByTestId('embed'));
  expect(onStart).toHaveBeenCalledTimes(2);
});

it('queues a seek before metadata and clamps it to duration without starting playback', () => {
  const ref = createRef<OriginalPlayerHandle>();
  const view = render(<OriginalYouTubePlayer ref={ref} src={src} />);
  ref.current!.currentTime = 30;
  const embed = view.getByTestId('embed');
  Object.defineProperty(embed, 'duration', { value: 10 });
  fireEvent.loadedMetadata(embed);
  expect(ref.current!.currentTime).toBe(10);
  expect(ref.current!.paused).toBe(true);
  expect(() => ref.current!.seekTo(-1)).toThrow(RangeError);
});

it('reports actual playback rate instead of assuming the request was accepted', () => {
  const onPlaybackSpeedChange = vi.fn();
  const view = render(<OriginalYouTubePlayer src={src} playbackSpeed={1.1} onPlaybackSpeedChange={onPlaybackSpeedChange} />);
  const embed = view.getByTestId('embed') as HTMLVideoElement;
  embed.playbackRate = 1;
  fireEvent.rateChange(embed);
  expect(onPlaybackSpeedChange).toHaveBeenLastCalledWith(1);
});

it('recognizes already-loaded metadata when a provider attaches its event listeners late', async () => {
  const onReady = vi.fn();
  const view = render(<OriginalYouTubePlayer src={src} playing onReady={onReady} />);
  const embed = view.getByTestId('embed');
  Object.defineProperty(embed, 'readyState', { value: 4 });
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  expect(embed.getAttribute('data-playing')).toBe('true');
  fireEvent.loadedMetadata(embed);
  expect(onReady).toHaveBeenCalledTimes(1);
});

it('renders on the server without loading an iframe or video', () => {
  const html = renderToString(<OriginalYouTubePlayer src={src} originalTitle="Título original" />);
  expect(html).toContain('Título original');
  expect(html).not.toContain('<video');
  expect(html).not.toContain('<iframe');
});

it('resolves a YouTube URL into original-title HLS playback without an iframe fallback', async () => {
  const onResolved = vi.fn();
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    videoId: '8TT2-kwAss0', title: 'Título original automático', language: 'es',
    streamUrl: '/api/original/media/test/master.m3u8', selection: { evidence: 'youtube-original-metadata' },
  })));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ResolvedYouTubePlayer src={src} onResolved={onResolved} />);
  await waitFor(() => expect(view.getByText('Título original automático')).toBeTruthy());
  await waitFor(() => expect(view.getByTestId('embed').getAttribute('src')).toBe('/api/original/media/test/master.m3u8'));
  expect(view.container.querySelector('iframe')).toBeNull();
  expect(onResolved).toHaveBeenCalledTimes(1);
  view.rerender(<ResolvedYouTubePlayer src={src} onResolved={(value) => onResolved(value)} />);
  expect(onResolved).toHaveBeenCalledTimes(1);
});

it('shows resolver errors without playing YouTube as a fallback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"No original track"}', { status: 422 })));
  const onResolveError = vi.fn();
  const view = render(<ResolvedYouTubePlayer src={src} onResolveError={onResolveError} />);
  await waitFor(() => expect(view.getByRole('alert').textContent).toContain('No original track'));
  expect(view.queryByTestId('embed')).toBeNull();
  expect(onResolveError).toHaveBeenCalledTimes(1);
});

it('does not replay an ended HLS source when callbacks rerender the parent', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    return Promise.resolve();
  });
  function ControlledPlayer() {
    const [, setTicks] = useState(0);
    return <OriginalYouTubePlayer src={src} originalSource="/original.m3u8" originalSourceType="hls" playing
      onPlaybackError={() => {}}
      onTimeUpdate={() => setTicks((ticks) => ticks + 1)}
      onEnd={() => setTicks((ticks) => ticks + 1)} />;
  }
  const view = render(<ControlledPlayer />);
  const media = view.getByTestId('embed');
  fireEvent.loadedMetadata(media);
  expect(play).toHaveBeenCalledTimes(1);
  fireEvent.timeUpdate(media);
  Object.defineProperty(media, 'paused', { value: true, configurable: true });
  fireEvent.ended(media);
  expect(play).toHaveBeenCalledTimes(1);
  expect((media as HTMLVideoElement).paused).toBe(true);
});
