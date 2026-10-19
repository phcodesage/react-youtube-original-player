import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

const engine = process.env.BROWSER ?? 'chromium';
const nativeHls = process.env.NATIVE_HLS === '1';
const reportName = `${engine}${nativeHls ? '-native' : ''}`;
const type = { chromium, firefox, webkit }[engine];
if (!type) throw new Error('BROWSER must be chromium, firefox, or webkit.');
const origin = process.env.BASE_URL ?? 'http://127.0.0.1:5174';
const browser = await type.launch({
  ...(engine === 'chromium' && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
});
const reports = [];
await mkdir('artifacts', { recursive: true });
try {
  for (const [id, language, locale] of [['8TT2-kwAss0', 'es', 'en-US'], ['Af6i6ChAVTw', 'en', 'es-ES']]) {
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    if (nativeHls) await page.addInitScript(() => {
      Object.defineProperty(window, 'MediaSource', { value: undefined, configurable: true });
      Object.defineProperty(window, 'ManagedMediaSource', { value: undefined, configurable: true });
    });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const resolved = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/original' && url.searchParams.get('src') === id;
    }, { timeout: 100_000 });
    void resolved.catch(() => {});
    await page.goto(`${origin}/?test&video=${id}`, { waitUntil: 'domcontentloaded' });
    const response = await resolved;
    const metadata = await response.json();
    assert.equal(response.status(), 200, JSON.stringify(metadata));
    assert.equal(metadata.language, language);
    await page.waitForFunction((title) => document.querySelector('figcaption')?.textContent === title, metadata.title);
    const master = await (await fetch(origin + metadata.streamUrl)).text();
    assert.equal((master.match(/#EXT-X-MEDIA:/g) ?? []).length, 1);
    assert.ok(master.includes(`LANGUAGE="${language}"`));
    assert.equal(await page.locator('iframe, youtube-video').count(), 0);
    const read = () => page.evaluate(() => {
      const media = document.querySelector('hls-video');
      return { time: media.currentTime, duration: media.duration, paused: media.paused,
        speed: media.playbackRate, tracks: media.api?.audioTracks?.map((track) => ({ name: track.name, language: track.lang })) };
    });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('hls-video')?.currentTime > 1, {}, { timeout: 45_000 });
    const playback = await read();
    assert.equal(playback.paused, false);
    if (playback.tracks) assert.deepEqual(playback.tracks, [{ name: 'Original', language }]);
    await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('1.1');
    await page.waitForFunction(() => document.querySelector('hls-video')?.playbackRate === 1.1);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByLabel('Seek to seconds').fill('120');
    await page.getByRole('button', { name: 'Seek', exact: true }).click();
    await page.waitForFunction(() => {
      const media = document.querySelector('hls-video');
      return media.currentTime >= 119.9 && !media.seeking && media.readyState >= 2;
    }, {}, { timeout: 30_000 });
    assert.equal((await read()).paused, true);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('hls-video')?.currentTime > 121, {}, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const resumed = await read();
    const events = await page.getByLabel('Playback events', { exact: true }).innerText();
    assert.ok(events.includes('onSeeked'));
    assert.equal((events.match(/onStart/g) ?? []).length, 1);
    await page.screenshot({ path: `artifacts/live-${reportName}-${language}.png`, fullPage: true });
    await page.getByLabel('Seek to seconds').fill(String(resumed.duration - 0.8));
    await page.getByRole('button', { name: 'Seek', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Playback events"]')?.textContent.includes('onEnd'), {}, { timeout: 30_000 });
    assert.deepEqual(pageErrors, []);
    const report = { engine, nativeHls, browser: browser.version(), videoId: id, title: metadata.title, viewerLocale: locale,
      originalLanguage: metadata.language, selection: metadata.selection, audioRenditions: 1,
      playback, resumed, seekAndEndEvents: true, pageErrors };
    reports.push(report);
    console.log(JSON.stringify(report));
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(`artifacts/live-${reportName}.json`, JSON.stringify(reports, null, 2));
}
