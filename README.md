# React YouTube Original Player

[![CI](https://github.com/phcodesage/react-youtube-original-player/actions/workflows/ci.yml/badge.svg)](https://github.com/phcodesage/react-youtube-original-player/actions/workflows/ci.yml)

Play a YouTube URL with its original title and an audio track explicitly marked original. No extension, separate video upload, or YouTube Data API key is required.

**This solution uses a Node backend.** yt-dlp resolves the original metadata and audio rendition. The backend relays HLS with exactly that audio rendition and H.264 video. ReactPlayer 3 plays the stream outside a YouTube iframe, so viewer-language preferences cannot select a dub.

```text
YouTube URL → Node + yt-dlp → original audio + video
                                      ↓
                     HLS relay with one audio rendition
                                      ↓
                            ReactPlayer → React app
```

If original audio cannot be identified explicitly, the resolver returns an error. It never substitutes a default or dubbed track. Selection follows YouTube's track metadata; this is not independent speech-language recognition.

## Run the workbench

Requires Node 22.12+, Python 3.10+, and yt-dlp with its default dependencies. The relay does not require FFmpeg, transcode media, or download whole videos to disk.

```sh
git clone https://github.com/phcodesage/react-youtube-original-player.git
cd react-youtube-original-player
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U 'yt-dlp[default]'
npm ci
npm run dev
```

The activation command above is for macOS/Linux shells; on Windows PowerShell use `.venv\Scripts\Activate.ps1`.

Open the URL Vite prints. The development server includes the relay. The default tab resolves the Spanish sample automatically; paste another YouTube URL to load it. Comparison tabs retain the ordinary iframe and supplied-source controls fixture. yt-dlp `2026.08.19` was tested locally; update it when YouTube changes extraction behavior. Node is explicitly enabled as its JavaScript challenge runtime.

## Use in React

The package has not been published to npm. Run `npm pack` here and install the generated tarball and ReactPlayer 3 in your app:

```sh
npm install /absolute/path/react-youtube-original-player-0.2.0.tgz react-player@^3.4.0
```

```tsx
import { useRef, useState } from 'react';
import {
  ResolvedYouTubePlayer,
  type OriginalPlayerHandle,
} from 'react-youtube-original-player';

function Video() {
  const player = useRef<OriginalPlayerHandle>(null);
  const [playing, setPlaying] = useState(false);
  return <>
    <ResolvedYouTubePlayer
      ref={player}
      src="https://www.youtube.com/watch?v=8TT2-kwAss0"
      endpoint="/api/original"
      playing={playing}
      playbackSpeed={1.1}
      onTimeUpdate={() => console.log(player.current?.currentTime)}
      onPlay={() => setPlaying(true)}
      onStart={() => console.log('first playback')}
      onPause={() => setPlaying(false)}
      onEnd={() => setPlaying(false)}
      onSeeked={() => console.log('seek finished')}
      onResolveError={(error) => console.error(error.message)}
      onError={(event) => console.error(event.currentTarget.error)}
    />
    <button onClick={() => setPlaying(!playing)}>Play / pause</button>
    <button onClick={() => player.current?.seekTo(120)}>Go to 2:00</button>
  </>;
}
```

Keep `playing` synchronized with play/pause/end events when native controls are enabled. Omit it to leave playback entirely to native controls. Browser autoplay policies still apply.

## Node backend

Mount the relay in a persistent Node service:

```js
import { createServer } from 'node:http';
import { createOriginalRelay } from 'react-youtube-original-player/relay';

const relay = createOriginalRelay({ prefix: '/api/original', maxHeight: 720 });
createServer(async (req, res) => {
  if (!await relay.handle(req, res)) {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(3100, '127.0.0.1');
```

`npm run dev:relay` runs the equivalent standalone backend. Put `/api/original` and all its child media paths behind the same origin as your React app. See [sample migration](docs/migration.md) for Next.js routing.

Sessions are stored in memory, expire no later than their signed YouTube URLs, and are capped at six hours by default. Restarting the service invalidates sessions. Multiple instances need sticky routing or shared sessions; a separate stateless/serverless invocation per segment is insufficient.

Options include `ytDlpPath`, `maxHeight`, `prefix`, `sessionTtlMs`, `maxSessions` (default 20), and `maxConcurrentExtractions` (default 2). The relay validates video IDs, limits extraction duration/output, restricts media origins and redirects to HTTPS Googlevideo hosts, rewrites segments/maps/keys into opaque local paths, forwards single byte ranges, and cancels upstream reads when the player abandons a request. Clients cannot supply arbitrary upstream media URLs.

All media uses backend bandwidth. Mount the handler behind your application's authentication, rate limits, and usage quotas before exposing a public service. Use it for content you are authorized to stream. It does not import browser cookies or bypass private-video access controls.

## API

| API | Behavior |
| --- | --- |
| `src` | One YouTube URL or 11-character video ID. |
| `endpoint` | Resolver URL, default `/api/original`. |
| `playing` | True plays, false pauses; omitted leaves native controls in charge. |
| `playbackSpeed` | Finite continuous value from 0.5 to 1.5 inclusive; default 1. |
| `onTimeUpdate(event)` | Media time changes. Read `ref.current.currentTime`. |
| `onPlay(event)` | Playback begins/resumes. |
| `onStart(event)` | First actual playing event, once per mounted source. |
| `onPause(event)` | Playback pauses. |
| `onEnd(event)` / `onEnded(event)` | Playback ends; both run if both are supplied. |
| `onSeeked(event)` | A seek finishes, including while paused. |
| `onPlaybackSpeedChange(actual)` | Actual accepted rate. |
| `onReady()` | Metadata loads, after applying a queued seek. |
| `onResolved(metadata)` | Title, language, chosen format IDs, stream URL, and expiry. |
| `onResolveError(error)` | Resolution fails; a retry button replaces the player. |
| `onError(event)` | Media error; no iframe fallback. |

Normal video props such as `controls`, `muted`, and `onSeeking` are forwarded. `config` passes to ReactPlayer. `style`, `width`, and `height` target the media; `containerStyle`/`containerClassName` target its outer figure.

The ref exposes `seekTo(seconds)`, writable `currentTime`, read-only `duration`, `paused`, `playbackRate`, and `getMediaElement()`. It becomes available after resolution mounts the player. Seeking rejects negative/non-finite input, queues until metadata, clamps to a known duration, and does not force playback. Set `playing` to true in `onSeeked` only if your app wants every seek to resume playback.

The original title is fetched automatically and displayed above the player with `translate="no"`. There is no translated YouTube overlay because this mode has no iframe. The component renders a loading status during SSR, resolves on the client, ignores canceled/stale resolutions, and recreates its session when the source changes. Next.js App Router usage belongs in a client component.

## Availability

The resolver requires an accessible on-demand video, explicitly marked original HLS audio, and H.264 HLS video at or below the configured height. It rejects inaccessible/restricted videos, live streams, missing originals, and missing compatible formats. It does not promise that every YouTube URL remains extractable forever.

ReactPlayer uses native HLS where supported, otherwise hls.js with Media Source Extensions. Target current Chrome, Firefox, and Safari. See [validation](docs/validation.md) for actual engine/video coverage and untested devices. Expired streams or service restarts require resolving again.

This architecture selects original audio outside the iframe. There is still no supported browser-only switch for an arbitrary YouTube iframe's audio. [Feasibility and evidence](docs/feasibility.md) explain the distinction.

## Other exports

`OriginalYouTubePlayer` supports plain embeds or caller-provided media. Plain embed audio remains explicitly unverified; `originalLanguage` is only an interface hint. `requireOriginalAudio` blocks an embed without a supplied source, and `originalSourceType="hls"` enables ReactPlayer's HLS adapter for a supplied stream.

`getOriginalMetadata` from `/server` is an optional official Data API title helper. Keep its key on your backend. It is separate from, and not required by, the yt-dlp resolver.

## Tests

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browser
npm pack --dry-run
```

Unit/HTTP tests cover original/default selection, missing-track errors, manifest rewriting, ranges, disallowed redirects, cancellation, sessions, and callbacks. Offline browser tests exercise the real relay with generated media; only extraction and CDN reads are substituted. The fixture includes a higher-bitrate default dub that must not be selected.

Live checks require yt-dlp and a running demo and stream the two supplied public videos:

```sh
BASE_URL=http://127.0.0.1:5173 BROWSER=chromium npm run test:live
BASE_URL=http://127.0.0.1:5173 BROWSER=firefox npm run test:live
BASE_URL=http://127.0.0.1:5173 BROWSER=webkit npm run test:live
```

They check opposite viewer locales, original titles/languages, one audio rendition, real playback, 1.1× speed, paused seeking, resume, one start, and end events. Reports/screenshots go to ignored `artifacts/`. These checks depend on live video/network availability.

Committed fixtures are generated test patterns with a tone and no speech. No YouTube media is committed. See [fixture generation](docs/fixtures.md).

## Contributing and license

[Contributing](CONTRIBUTING.md) · [MIT](LICENSE). Dependencies retain their respective licenses. No extension code was copied. This project is not affiliated with YouTube or Google.
