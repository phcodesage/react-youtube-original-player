import { describe, expect, it } from 'vitest';
import { getYouTubeVideoId, normalizeLanguage, validateOriginalSource, validatePlaybackSpeed } from '../src/youtube';

describe('single-video URLs', () => {
  it.each([
    '8TT2-kwAss0', 'https://youtu.be/8TT2-kwAss0?t=30',
    'https://www.youtube.com/watch?v=8TT2-kwAss0&list=ignored',
    'https://www.youtube-nocookie.com/embed/8TT2-kwAss0',
    'https://m.youtube.com/shorts/8TT2-kwAss0', 'https://youtube.com/live/8TT2-kwAss0',
  ])('normalizes %s', (url) => expect(getYouTubeVideoId(url)).toBe('8TT2-kwAss0'));
  it.each(['https://youtube.com.evil.test/watch?v=8TT2-kwAss0', 'https://evil.test/8TT2-kwAss0',
    'javascript:alert(1)', 'https://youtube.com/playlist?list=123', 'not a video',
  ])('rejects %s', (url) => expect(() => getYouTubeVideoId(url)).toThrow(TypeError));
});

it('validates language without confusing it with audio-track selection', () => {
  expect(normalizeLanguage('es-mx')).toBe('es-MX');
  expect(normalizeLanguage()).toBeUndefined();
  expect(() => normalizeLanguage('not_a_language')).toThrow(TypeError);
});

it('accepts continuous speeds in the requested range and rejects invalid numbers', () => {
  for (const speed of [0.5, 0.6, 1, 1.1, 1.5]) expect(validatePlaybackSpeed(speed)).toBe(speed);
  for (const speed of [NaN, Infinity, 0.49, 1.51]) expect(() => validatePlaybackSpeed(speed)).toThrow(RangeError);
});

it('requires a direct asset instead of another YouTube iframe', () => {
  expect(validateOriginalSource('/media/original.mp4')).toBe('/media/original.mp4');
  expect(validateOriginalSource('https://cdn.example.test/original.mp4')).toContain('original.mp4');
  for (const source of ['', 'javascript:alert(1)', '//youtube.com/embed/8TT2-kwAss0',
    'https://www.youtube.com/watch?v=8TT2-kwAss0']) expect(() => validateOriginalSource(source)).toThrow(TypeError);
});
