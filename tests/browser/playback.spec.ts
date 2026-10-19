import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Deterministic controls tests use the local asset; never mock YouTube success.
  await page.route(/https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) => route.abort());
  await page.goto('/?source&test', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
});

test('play/pause, time updates, one start, rate changes, and paused seeking', async ({ page }) => {
  const events = page.getByLabel('Playback events', { exact: true });
  const video = page.locator('video');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', false);
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.2);
  await expect.poll(async () => Number.parseFloat(await page.getByLabel('Current time', { exact: true }).innerText())).toBeGreaterThan(0);
  await expect(events).toContainText('onStart');
  await expect(events).toContainText('onPlay');
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('1.1');
  await expect(video).toHaveJSProperty('playbackRate', 1.1);
  await expect(page.getByLabel('Actual playback speed')).toHaveText('1.1×');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', true);
  await expect(events).toContainText('onPause');
  await page.getByLabel('Seek to seconds').fill('5');
  await page.getByRole('button', { name: 'Seek', exact: true }).click();
  await expect(events).toContainText('onSeeked');
  await expect(video).toHaveJSProperty('currentTime', 5);
  await expect(video).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(video).toHaveJSProperty('paused', false);
  await expect(events.locator('code').filter({ hasText: 'onStart' })).toHaveCount(1);
});

test('end event and seeking while playing', async ({ page }) => {
  const events = page.getByLabel('Playback events', { exact: true });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('video')).toHaveJSProperty('paused', false);
  await page.getByLabel('Seek to seconds').fill('7.5');
  await page.getByRole('button', { name: 'Seek', exact: true }).click();
  await expect(events).toContainText('onSeeked');
  await expect(events).toContainText('onEnd');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('title presentation and strict mode block iframe playback', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Original title', exact: true }).fill('Título sin traducir');
  await expect(page.locator('figcaption')).toHaveText('Título sin traducir');
  await expect(page.locator('figcaption')).toHaveAttribute('translate', 'no');
  await page.getByRole('checkbox', { name: 'Require original audio' }).check();
  await page.getByRole('button', { name: '01 / YouTube embed' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Playback blocked' })).toBeVisible();
  await expect(page.locator('iframe, video, youtube-video')).toHaveCount(0);
});

test('mobile layout stays within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('video')).toBeVisible();
});
