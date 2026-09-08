import { describe, expect, it } from 'vitest';
import { normalizeItems } from '../src/adapters/normalize.js';
import {
  calcPosition,
  clusterContextItems,
  getTimelineDotItems,
  getTimelineIconItems,
  getTimelineLineItems,
  getTimelinePattern,
  range,
} from '../src/timeline/layout.js';

const MIN = 60_000;

describe('calcPosition', () => {
  it('maps time to a 0..1 fraction of the denominator', () =>
    expect(calcPosition(3 * MIN, 12 * MIN)).toBeCloseTo(0.25));
  it('is 0 when the denominator is unusable', () =>
    expect(calcPosition(1000, 0)).toBe(0));
  it('treats a null time as 0', () => expect(calcPosition(null, 12 * MIN)).toBe(0));
});

describe('range', () => {
  it('is inclusive', () => expect(range(1, 3)).toEqual([1, 2, 3]));
  it('is empty when end < start (a run shorter than a minute)', () =>
    expect(range(1, 0)).toEqual([]));
});

describe('getTimelineLineItems', () => {
  const items = normalizeItems([
    { type: 'enter_nether', igt: 2 * MIN },
    { type: 'enter_bastion', igt: 4 * MIN },
    { type: 'enter_fortress', igt: 6 * MIN },
  ]);

  it('types each segment by the PREVIOUS event (where you were during it)', () => {
    const lines = getTimelineLineItems(items, 8 * MIN, 12 * MIN);
    expect(lines.map((l) => l.type)).toEqual([
      'overworld', // 0-2min: before entering the nether
      'enter_nether', // 2-4min: in the nether
      'enter_bastion', // 4-6min: in the bastion
      'enter_fortress', // 6-8min: in the fortress (open-ended)
    ]);
  });

  it('produces contiguous, non-overlapping segments', () => {
    const lines = getTimelineLineItems(items, 8 * MIN, 12 * MIN);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]!.left).toBeCloseTo(lines[i - 1]!.left + lines[i - 1]!.width);
    }
    expect(lines[0]!.left).toBe(0);
    const last = lines[lines.length - 1]!;
    expect(last.left + last.width).toBeCloseTo(8 / 12);
  });

  it('never emits a negative width', () => {
    const lines = getTimelineLineItems(items, 8 * MIN, 12 * MIN);
    for (const l of lines) expect(l.width).toBeGreaterThanOrEqual(0);
  });

  it('does not paint anything after credits', () => {
    const done = normalizeItems([
      { type: 'enter_nether', igt: 2 * MIN },
      { type: 'credits', igt: 9 * MIN },
    ]);
    const lines = getTimelineLineItems(done, 9 * MIN, 12 * MIN);
    expect(lines.some((l) => l.type === 'credits')).toBe(false);
  });

  it('is empty when the run has no elapsed time', () =>
    expect(getTimelineLineItems(items, 0, 12 * MIN)).toEqual([]));
});

describe('getTimelineDotItems', () => {
  it('places one dot per whole minute, tagged with the biome it falls in', () => {
    const items = normalizeItems([
      { type: 'enter_nether', igt: 2 * MIN + 30_000 },
      { type: 'enter_bastion', igt: 4 * MIN + 30_000 },
    ]);
    const dots = getTimelineDotItems(items, 5 * MIN, 12 * MIN);
    expect(dots.map((d) => d.minute)).toEqual([1, 2, 3, 4, 5]);
    expect(dots.map((d) => d.type)).toEqual([
      'overworld',
      'overworld',
      'enter_nether',
      'enter_nether',
      'enter_bastion',
    ]);
  });

  it('emits no dots for a sub-minute run', () =>
    expect(getTimelineDotItems([], 30_000, 12 * MIN)).toEqual([]));
});

describe('getTimelineIconItems', () => {
  it('skips the synthetic overworld origin', () => {
    const items = normalizeItems([{ type: 'enter_nether', igt: 2 * MIN }]);
    expect(getTimelineIconItems(items, 12 * MIN)).toEqual([
      { left: 2 / 12, type: 'enter_nether', igt: 2 * MIN },
    ]);
  });
});

describe('getTimelinePattern', () => {
  it('detects bastion-first', () =>
    expect(
      getTimelinePattern(
        normalizeItems([
          { type: 'enter_bastion', igt: 273_522 },
          { type: 'enter_fortress', igt: 563_022 },
        ]),
      ),
    ).toBe('bf'));

  it('detects fortress-first', () =>
    expect(
      getTimelinePattern(
        normalizeItems([
          { type: 'enter_bastion', igt: 563_022 },
          { type: 'enter_fortress', igt: 273_522 },
        ]),
      ),
    ).toBe('fb'));

  it('is null when neither structure was entered', () =>
    expect(getTimelinePattern(normalizeItems([{ type: 'enter_nether', igt: 100 }]))).toBeNull());
});

describe('clusterContextItems', () => {
  const ctx = (igts: number[]) => igts.map((igt, i) => ({ key: `e${i}`, igt, rta: igt }));

  it('leaves well-separated markers alone', () => {
    const out = clusterContextItems(ctx([1 * MIN, 5 * MIN, 9 * MIN]), 12 * MIN);
    expect(out).toHaveLength(3);
    expect(out.every((c) => c.items.length === 1)).toBe(true);
  });

  it('merges markers that would overlap, keeping every one in the tooltip', () => {
    // 12 分幅の 1.5% は約 11 秒。5 秒差の 2 つはまとまる
    const out = clusterContextItems(ctx([60_000, 65_000, 300_000]), 12 * MIN);
    expect(out).toHaveLength(2);
    expect(out[0]!.items.map((i) => i.key)).toEqual(['e0', 'e1']);
    expect(out[1]!.items.map((i) => i.key)).toEqual(['e2']);
  });

  it('anchors a cluster at its first marker, so a chain does not drift', () => {
    // 少しずつずれた 4 つ。先頭からの距離で見るので数珠つなぎにはならない
    const out = clusterContextItems(ctx([0, 8_000, 16_000, 24_000]), 12 * MIN);
    expect(out.length).toBeGreaterThan(1);
    expect(out[0]!.left).toBe(0);
  });

  it('sorts by time regardless of input order', () => {
    const out = clusterContextItems(ctx([300_000, 60_000]), 12 * MIN);
    expect(out.map((c) => c.items[0]!.igt)).toEqual([60_000, 300_000]);
  });

  it('handles an empty list', () => {
    expect(clusterContextItems([], 12 * MIN)).toEqual([]);
  });
});
