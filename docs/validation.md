# Validation record

Checked 2026-10-20 on macOS arm64, Node 26.8.1, Playwright 1.64.1, and yt-dlp 2026.08.19.

## Automated checks

- `npm run check`: TypeScript, 35 unit/HTTP tests, ESM library/declarations, and production demo build passed.
- Five offline browser tests passed in each of Chromium 149.0.7827.55, Firefox 157.0, and WebKit 27.2: 15 passing checks across the engines.
- A separate WebKit native-HLS fallback test passed with Media Source Extensions disabled: 16 passing browser checks in total.
- Coverage includes actual local HLS playback through the relay, original-versus-dub selection, time updates, pause/resume, continuous 1.1x rate, paused/playing seeking, one start per source, end events, strict blocking, and a 390px viewport.
- HTTP tests exercise manifest rewriting, byte ranges, session reuse, rejected redirects, cancellation, and fail-closed selection.
- A readiness regression test covers metadata that loads before a provider attaches its event listeners.

## Live YouTube checks

| Engine/path | Spanish sample, English viewer locale | English sample, Spanish viewer locale |
| --- | --- | --- |
| Chromium 149 / hls.js | Passed | Passed |
| Firefox 157 / hls.js | Passed | Passed |
| WebKit 27.2 / hls.js | Passed | Passed |
| WebKit 27.2 / native HLS, MSE disabled | Passed | Passed |

The samples are `8TT2-kwAss0` and `Af6i6ChAVTw`. All eight checks returned the original title and expected original-language metadata (`es` / `en`), served exactly one audio rendition, and demonstrated real time progression, 1.1x speed, paused seeking to 120 seconds, resume beyond 121 seconds, one start callback, and an end event after seeking near the end. No page errors were recorded in the passing runs.

[Recorded results](evidence/live-playback.json) contain chosen original audio/video format IDs and observed playback state. Reports contain no signed CDN URLs or credentials. Local screenshots are in ignored `artifacts/`.

These checks follow YouTube's explicit original-track metadata; they do not use speech recognition or establish recording authorship. Physical iPhones/Android devices, every Safari application release, signed-in YouTube accounts, and every YouTube URL have not been tested. Mobile viewport checks and native HLS fallback checks do not constitute physical-device certification. CI is configured but has not been run remotely.

Native HLS testing exposed a metadata-listener startup race, which was fixed by observing media readiness as well as the metadata event. Request cancellation testing also identified a streaming adapter issue; the relay now reads the Web stream directly, cancels abandoned reads, and has a regression test.

## Reproduce

Run the demo with yt-dlp available, then point `BASE_URL` at it:

```sh
BASE_URL=http://127.0.0.1:5173 BROWSER=chromium npm run test:live
BASE_URL=http://127.0.0.1:5173 BROWSER=firefox npm run test:live
BASE_URL=http://127.0.0.1:5173 BROWSER=webkit npm run test:live
BASE_URL=http://127.0.0.1:5173 BROWSER=webkit NATIVE_HLS=1 npm run test:live
```

An existing Chromium binary can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium`. These local runs used temporary Firefox/WebKit installations under an alternate `PLAYWRIGHT_BROWSERS_PATH`; standard Playwright browser installation works without that variable when disk space permits.
