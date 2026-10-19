# Generated test media

Committed media contains a generated test pattern and 440 Hz tone, with no speech. It is not copied from the YouTube samples.

```sh
mkdir -p demo/public/hls
ffmpeg -f lavfi -i 'testsrc2=size=640x360:rate=24' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000' \
  -t 8 -c:v libx264 -pix_fmt yuv420p -crf 32 \
  -c:a aac -b:a 32k -movflags +faststart demo/public/fixture.mp4
ffmpeg -i demo/public/fixture.mp4 -an -c:v copy \
  -hls_time 2 -hls_playlist_type vod \
  -hls_segment_filename 'demo/public/hls/video-%d.ts' demo/public/hls/video.m3u8
ffmpeg -i demo/public/fixture.mp4 -vn -c:a copy \
  -hls_time 2 -hls_playlist_type vod \
  -hls_segment_filename 'demo/public/hls/audio-%d.ts' demo/public/hls/audio.m3u8
```

Playwright enables `ORIGINAL_RELAY_FIXTURE=1` only in its dedicated Vite process. That process substitutes extraction metadata and local CDN reads; the HTTP relay, selection, manifest rewriting, player, and callbacks run normally. The ordinary demo uses live extraction.
