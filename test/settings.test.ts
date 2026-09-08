import { describe, expect, it } from 'vitest';
import { parsePlayerList, passesFilter } from '../src/settings.js';

describe('stream overlay filter', () => {
  it('lets everyone through when no name is listed', () => {
    expect(passesFilter([], 'mcrtabot')).toBe(true);
    expect(passesFilter([], null)).toBe(true);
  });

  it('matches regardless of case — PaceMan is not consistent about it', () => {
    expect(passesFilter(['mcrtabot'], 'MCRTABOT')).toBe(true);
    expect(passesFilter(['MCRTAbot'], 'mcrtabot')).toBe(true);
  });

  it('keeps everyone else out, name unknown included', () => {
    expect(passesFilter(['mcrtabot'], '3x7en')).toBe(false);
    expect(passesFilter(['mcrtabot'], null)).toBe(false);
  });

  it('takes several names', () => {
    const only = ['mcrtabot', '3x7en'];
    expect(passesFilter(only, '3x7en')).toBe(true);
    expect(passesFilter(only, 'aaasyan')).toBe(false);
  });
});

describe('parsePlayerList', () => {
  it('splits on commas, spaces and newlines alike', () => {
    expect(parsePlayerList('mcrtabot, 3x7en')).toEqual(['mcrtabot', '3x7en']);
    expect(parsePlayerList('mcrtabot 3x7en')).toEqual(['mcrtabot', '3x7en']);
    expect(parsePlayerList('mcrtabot\n3x7en')).toEqual(['mcrtabot', '3x7en']);
  });

  it('drops the empty pieces left while typing', () => {
    expect(parsePlayerList('mcrtabot,  ,')).toEqual(['mcrtabot']);
    expect(parsePlayerList('   ')).toEqual([]);
    expect(parsePlayerList('')).toEqual([]);
  });
});
