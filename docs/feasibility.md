# Why this solution uses a backend

| Requirement | YouTube iframe | Implemented relay |
| --- | --- | --- |
| Select original audio automatically | No supported public selector | Selects explicitly original audio metadata |
| Fetch original title | Not guaranteed by iframe locale | Original video metadata from yt-dlp |
| Prevent translated title overlay | No supported override | Own original title; no iframe overlay |
| Playback/seek/start/end events | Provider-dependent | ReactPlayer HLS/native events |
| Continuous 0.5–1.5 speed | May round requested rate | Native media rate |
| No extension | Yes, with iframe limits | Yes |
| Browser-only deployment | Yes | No; persistent backend required |

## The implemented path

The supplied videos expose separate HLS video/audio renditions. yt-dlp marks Spanish audio as original for `8TT2-kwAss0` and English for `Af6i6ChAVTw`. The relay selects that audio and video-only H.264, then emits an HLS master with exactly one audio member. All media URLs are relayed through the server. The browser receives no dubbed alternatives.

This is explicit audio selection, rather than a language hint. Original titles come from extraction without requesting a preferred metadata translation language.

The adapter requires `language_preference === 10` and an original label, and rejects dubbed/descriptive labels. This value is yt-dlp's `ORIGINAL_LANG_VALUE`; default audio uses a different preference. See its [YouTube extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube/_video.py). These fields are extractor-specific and need regression checks after upstream changes. The library invokes yt-dlp as a subprocess without copying its implementation.

See upstream [format selection](https://github.com/yt-dlp/yt-dlp#format-selection) and [JavaScript runtime setup](https://github.com/yt-dlp/yt-dlp/wiki/EJS). The backend follows source metadata; it does not independently classify spoken language or recording authorship.

## Why the iframe alone was insufficient

The [public iframe API](https://developers.google.com/youtube/iframe_api_reference) does not document original-audio enumeration/selection. In the sample's parent-frame API, `setAudioTrack` and `getAvailableAudioTracks` were absent and audio options were empty.

[YouTube Anti Translate](https://github.com/zpix1/yt-anti-translate) runs inside YouTube origins with extension permissions. The [same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy) prevents ordinary React code on another origin from accessing those internal player objects. Test-runner frame access does not grant production code that capability.

[`hl`](https://developers.google.com/youtube/player_parameters#hl) controls interface/caption preferences. Caption settings and deprecated branding/title settings do not establish original-audio selection.

The relay does not modify iframe internals. It supplies a different streaming player, using the new-component option in the original request.

## Availability boundaries

YouTube must expose compatible accessible HLS tracks, and yt-dlp must understand their metadata. Missing originals, restrictions, extraction errors, and expired sessions produce errors without a dub/default fallback. The service uses backend bandwidth and state. It is not a browser-only package and does not promise every video or historical browser. See [validation](validation.md).
