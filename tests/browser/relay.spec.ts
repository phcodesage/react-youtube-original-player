import { expect, test } from '@playwright/test';

test('URL resolves through the real relay into original-only HLS with media controls', async ({ page }) => {
  await page.route(/https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) => route.abort());
  const metadataResponse = page.waitForResponse((r) => r.url().includes('/api/original?'));
  const masterResponse = page.waitForResponse((r) => r.url().endsWith('/master.m3u8'));
  await page.goto('/?test', { waitUntil: 'domcontentloaded' });
  const metadata = await (await metadataResponse).json();
  expect(metadata.selection.audioFormatId).toBe('original');
  expect(metadata.language).toBe('es');
  const master = await (await masterResponse).text();
  expect(master.match(/#EXT-X-MEDIA:/g)).toHaveLength(1);
  expect(master).toContain('LANGUAGE="es"');
  expect(master).not.toContain('dub');
  await expect(page.locator('figcaption')).toHaveText('Título original de prueba');
  await expect(page.locator('iframe, youtube-video')).toHaveCount(0);
  const media = page.locator('hls-video');
  const events = page.getByLabel('Playback events', { exact: true });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => media.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.4);
  await expect(events).toContainText('onStart');
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('1.1');
  await expect(media).toHaveJSProperty('playbackRate', 1.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(media).toHaveJSProperty('paused', true);
  await page.getByLabel('Seek to seconds').fill('4');
  await page.getByRole('button', { name: 'Seek', exact: true }).click();
  await expect(events).toContainText('onSeeked');
  await expect.poll(() => media.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(4, 0);
  await expect(media).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => media.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(4.2);
  await expect(events.locator('code').filter({ hasText: 'onStart' })).toHaveCount(1);
  await page.getByLabel('Seek to seconds').fill('7.8');
  await page.getByRole('button', { name: 'Seek', exact: true }).click();
  await expect(events).toContainText('onEnd');
});

test('native HLS plays when Media Source Extensions are unavailable', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Native HLS fallback is a Safari/WebKit capability.');
  const supportsNativeHls = await page.evaluate(() => Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl')));
  test.skip(!supportsNativeHls, 'This WebKit platform has no native HLS implementation.');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'MediaSource', { value: undefined, configurable: true });
    Object.defineProperty(window, 'ManagedMediaSource', { value: undefined, configurable: true });
  });
  await page.route(/https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) => route.abort());
  await page.goto('/?test', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('figcaption')).toHaveText('Título original de prueba');
  const media = page.locator('hls-video');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => media.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(0.3);
  expect(await media.evaluate((v) => Boolean((v as HTMLElement & { api?: unknown }).api))).toBe(false);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Seek to seconds').fill('4');
  await page.getByRole('button', { name: 'Seek', exact: true }).click();
  await expect.poll(() => media.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(4, 0);
  await expect(media).toHaveJSProperty('paused', true);
});
