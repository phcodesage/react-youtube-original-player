# Contributing

Use Node 22.12+ and `npm ci`. Run `npm run check` before submitting a change. Playback changes should also pass `npm run test:browser` after installing Playwright's Chromium, Firefox, and WebKit browsers.

Keep original-track selection explicit. The relay requires original metadata and emits a single-audio HLS master. Never substitute a default/language-matching track. Include reproducible live evidence for selection changes, with browser, viewer language, source language, video ID, observed track, and metadata/API status.

Add regression tests for behavior changes. Keep keys, credentials, and signed CDN URLs out of logs and reports. Live tests remain opt-in because video/network availability varies. Offline browser tests run the real relay with generated media; do not replace these checks with fabricated successful playback.

Pull requests should describe the behavior that changed and the validation performed. Contributions are provided under the MIT license.
