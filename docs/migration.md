# Migrating the supplied sample

The [sample](https://github.com/mjkrco/sample-youtube-issue) uses ReactPlayer 3.4. The new component retains its media callbacks and writable `ref.current.currentTime` interface.

1. Run `npm pack` here and install the `0.2.0` tarball in the sample, retaining ReactPlayer 3.
2. Run `npm run dev:relay` here, or mount `createOriginalRelay` in a persistent Node service.
3. Forward `/api/original` and all child paths from the app origin to that relay.
4. Replace the sample component using [MediaPlayer.tsx](../examples/MediaPlayer.tsx), importing from the installed package.

For a Next.js app alongside the relay, add a rewrite to its existing configuration:

```js
export default {
  async rewrites() {
    return [{
      source: '/api/original/:path*',
      destination: 'http://127.0.0.1:3100/api/original/:path*',
    }];
  },
};
```

Retain existing settings/rewrites and use the relay's actual private address in deployment. The same persistent relay instance must receive metadata and segment requests; separate stateless/serverless invocations are insufficient.

Use `ResolvedYouTubePlayer` instead of `ReactPlayer`, rename `playbackRate` to `playbackSpeed`, and retain `src`, `playing`, callbacks, and the ref. The server resolves the title and source language automatically. Remove YouTube iframe settings and the absolute iframe positioning wrapper. `containerStyle` styles the surrounding figure; `style` targets the player.

`onStart` fires once on first actual playback per source. `onSeeked` is independent of play state. Set `playing` true in that callback only if every seek should resume playback. `onEnd` and `onEnded` are supported.

Seek with `player.current.currentTime = target` or `player.current.seekTo(target)`. The ref becomes available after resolution; use optional chaining before then. Read time with `player.current?.currentTime ?? 0`. Clamp speed buttons to 0.5–1.5.
