import { describe, expect, it } from 'vitest';
import { normalizeItems } from '../src/adapters/normalize.js';

describe('normalizeItems', () => {
  it('always starts from a synthetic overworld at 0', () => {
    expect(normalizeItems([])).toEqual([{ type: 'overworld', igt: 0 }]);
  });

  it('drops null / negative / non-finite igt (unreached splits)', () => {
    const out = normalizeItems([
      { type: 'enter_nether', igt: 100 },
      { type: 'enter_bastion', igt: null },
      { type: 'enter_fortress', igt: undefined },
      { type: 'enter_end', igt: -5 },
      { type: 'credits', igt: Number.NaN },
    ]);
    expect(out.map((i) => i.type)).toEqual(['overworld', 'enter_nether']);
  });

  it('sorts by igt, not by input order (column order is not chronological)', () => {
    // getWorld は nether, bastion, fortress... の列順で来るが、
    // fortress 先行のランでは fortress のほうが小さい
    const out = normalizeItems([
      { type: 'enter_nether', igt: 189_224 },
      { type: 'enter_bastion', igt: 400_000 },
      { type: 'enter_fortress', igt: 216_372 },
    ]);
    expect(out.map((i) => i.type)).toEqual([
      'overworld',
      'enter_nether',
      'enter_fortress',
      'enter_bastion',
    ]);
  });

  it('keeps the earliest occurrence when a type repeats', () => {
    const out = normalizeItems([
      { type: 'enter_nether', igt: 500 },
      { type: 'enter_nether', igt: 200 },
    ]);
    expect(out).toEqual([
      { type: 'overworld', igt: 0 },
      { type: 'enter_nether', igt: 200 },
    ]);
  });

  it('breaks ties at equal igt in canonical order', () => {
    // second_portal と enter_stronghold が同一 igt になる実例がある
    const out = normalizeItems([
      { type: 'enter_stronghold', igt: 711_554 },
      { type: 'second_portal', igt: 711_554 },
    ]);
    expect(out.map((i) => i.type)).toEqual(['overworld', 'second_portal', 'enter_stronghold']);
  });

  it('never emits a negative-width interval', () => {
    const out = normalizeItems([
      { type: 'credits', igt: 10 },
      { type: 'enter_nether', igt: 900 },
      { type: 'enter_end', igt: 50 },
    ]);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.igt).toBeGreaterThanOrEqual(out[i - 1]!.igt);
    }
  });
});
