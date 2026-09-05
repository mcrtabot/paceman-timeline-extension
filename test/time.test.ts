import { describe, expect, it } from 'vitest';
import { convertMillisecondsToTime, convertTimeToMilliSeconds } from '../src/timeline/time.js';

describe('convertTimeToMilliSeconds', () => {
  it('parses mm:ss', () => expect(convertTimeToMilliSeconds('9:55')).toBe(595_000));
  it('parses h:mm:ss.fff', () => expect(convertTimeToMilliSeconds('1:02:03.456')).toBe(3_723_456));
  it('scales short fractions: .5 is 500ms', () =>
    expect(convertTimeToMilliSeconds('0:01.5')).toBe(1_500));
  it('scales two-digit fractions: .05 is 50ms', () =>
    expect(convertTimeToMilliSeconds('0:01.05')).toBe(1_050));
  it('returns null on garbage', () => expect(convertTimeToMilliSeconds('nope')).toBeNull());
});

describe('convertMillisecondsToTime', () => {
  it('formats under an hour without a leading hour field', () =>
    expect(convertMillisecondsToTime(595_036)).toBe('9:55'));
  it('formats over an hour', () =>
    expect(convertMillisecondsToTime(3_723_456)).toBe('1:02:03'));
  it('can include millis', () =>
    expect(convertMillisecondsToTime(595_036, true)).toBe('9:55.036'));
  it('round-trips with the parser', () => {
    const ms = 1_059_681;
    expect(convertTimeToMilliSeconds(convertMillisecondsToTime(ms, true))).toBe(ms);
  });
});
