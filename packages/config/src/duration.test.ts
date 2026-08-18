import { describe, expect, it } from 'vitest';
import { parseDurationToMs, parseDurationToSeconds } from './duration';

describe('parseDuration', () => {
  it('parses every supported unit', () => {
    expect(parseDurationToMs('500ms')).toBe(500);
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('15m')).toBe(900_000);
    expect(parseDurationToMs('2h')).toBe(7_200_000);
    expect(parseDurationToMs('7d')).toBe(604_800_000);
  });

  it('treats a bare number as seconds', () => {
    expect(parseDurationToMs('45')).toBe(45_000);
  });

  it('converts to whole seconds', () => {
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('1500ms')).toBe(1);
  });

  it('rejects malformed input rather than guessing', () => {
    for (const bad of ['', 'abc', '-5m', '5y', '5 m']) {
      expect(() => parseDurationToMs(bad)).toThrow(TypeError);
    }
  });
});
