import { describe, expect, it } from 'vitest';
import {
  FIT_MIN_MS,
  FIT_STEP_MS,
  resolveScale,
  sharedDenominatorMs,
} from '../src/timeline/scale.js';
import { baseIgtOf, estimateIgt, nextAnchor } from '../src/timeline/live.js';

const MIN = 60_000;

describe('resolveScale (reference)', () => {
  it('uses the given denominator verbatim, even for a longer run', () => {
    // 行をまたいで分母を共有するのが目的なので、行ごとに max を取ってはいけない
    const r = resolveScale({ mode: 'reference', refMs: 595_036 }, 700_000);
    expect(r.denominatorMs).toBe(595_036);
    expect(r.widthPx).toBeNull();
  });

  it('gives every row the same denominator', () => {
    const scale = { mode: 'reference', refMs: 1_059_681 } as const;
    const rows = [200_000, 1_059_681, 2_152_000].map((m) => resolveScale(scale, m).denominatorMs);
    expect(new Set(rows).size).toBe(1);
  });

  it('never yields a zero denominator', () =>
    expect(resolveScale({ mode: 'reference', refMs: 0 }, 0).denominatorMs).toBe(1));
});

describe('sharedDenominatorMs — the run history panel', () => {
  it('makes the longest run on the page exactly 100%', () =>
    expect(sharedDenominatorMs([500_000, 1_059_681])).toBe(1_059_681));

  it('never yields a zero denominator for an empty page', () =>
    expect(sharedDenominatorMs([])).toBe(1));

  it('fills the container rather than using a pixel width', () => {
    const r = resolveScale({ mode: 'reference', refMs: 1_059_681 }, 500_000);
    expect(r.denominatorMs).toBe(1_059_681);
    expect(r.widthPx).toBeNull();
  });

  it('is driven by the slowest finish on the page', () => {
    // 3x7en の履歴 10 件は完走 4 件で 17:39〜35:52 に散らばっていた
    const finishes = [1_059_681, 1_505_000, 2_152_000, 1_682_000];
    expect(sharedDenominatorMs(finishes)).toBe(2_152_000);
  });
});


describe('resolveScale (fit) — the single-run page', () => {
  const fit = { mode: 'fit' } as const;

  it('is 3 minute steps with a 9 minute floor', () => {
    expect(FIT_STEP_MS).toBe(3 * MIN);
    expect(FIT_MIN_MS).toBe(9 * MIN);
  });

  it('puts a completed run\'s finish exactly at the right edge', () => {
    const r = resolveScale(fit, 1_059_681, true);
    expect(r.denominatorMs).toBe(1_059_681);
    expect(r.widthPx).toBeNull(); // 親要素いっぱい
  });

  it('rounds an unfinished run up to the next 3 minutes', () => {
    expect(resolveScale(fit, 11 * MIN, false).denominatorMs).toBe(12 * MIN);
    expect(resolveScale(fit, 12 * MIN, false).denominatorMs).toBe(12 * MIN);
    expect(resolveScale(fit, 12 * MIN + 1, false).denominatorMs).toBe(15 * MIN);
  });

  it('never goes below 9 minutes, so early pace does not fill the bar', () => {
    expect(resolveScale(fit, 4 * MIN, false).denominatorMs).toBe(9 * MIN);
    expect(resolveScale(fit, 0, false).denominatorMs).toBe(9 * MIN);
  });

  it('leaves room on the right when the caller reserves it for the marker label', () => {
    // トップの表はここで 12% ぶん余分に見積もってから切り上げている
    const room = 0.88;
    for (const max of [10 * MIN, 12 * MIN, 17.65 * MIN, 21 * MIN]) {
      const d = resolveScale(fit, max / room, false).denominatorMs;
      expect(max / d).toBeLessThanOrEqual(room);
    }
  });

  it('grows in visible steps rather than creeping every second', () => {
    // 10:30 から 10:31 に進んでも分母は動かない
    const a = resolveScale(fit, 10.5 * MIN, false).denominatorMs;
    const b = resolveScale(fit, 10.52 * MIN, false).denominatorMs;
    expect(a).toBe(b);
  });

  it('never yields a zero denominator for a 0ms completed run', () => {
    expect(resolveScale(fit, 0, true).denominatorMs).toBe(1);
  });
});

describe('live position estimate', () => {
  const run = (igts: number[], ctx: number[] = [], lastUpdated: number | null = null) => ({
    items: [{ type: 'overworld', igt: 0 }, ...igts.map((igt, i) => ({ type: (['enter_nether','enter_bastion','enter_fortress'] as const)[i]!, igt }))],
    context: ctx.map((igt) => ({ key: 'x', igt })),
    lastUpdated,
  }) as never;

  it('uses the furthest known point, including context events', () => {
    // context の方が先まで来ていることが実データでもあった
    expect(baseIgtOf(run([100_000], [180_000]))).toBe(180_000);
    expect(baseIgtOf(run([300_000], [180_000]))).toBe(300_000);
  });

  it('advances with wall-clock time between splits', () => {
    const a = nextAnchor(undefined, run([300_000]), 1_000);
    expect(estimateIgt(a, 6_000)).toBe(305_000);
  });

  it('does NOT jump backwards when the same payload is seen again', () => {
    // 同じ baseIgt で観測時刻だけ新しくなっても、アンカーは動かない
    const a = nextAnchor(undefined, run([300_000]), 1_000);
    const b = nextAnchor(a, run([300_000]), 5_000);
    expect(b).toBe(a);
    expect(estimateIgt(b, 6_000)).toBe(305_000);
  });

  it('re-anchors when a new split actually lands', () => {
    const a = nextAnchor(undefined, run([300_000]), 1_000);
    const b = nextAnchor(a, run([300_000, 400_000]), 9_000);
    expect(b).toEqual({ baseIgt: 400_000, at: 9_000 });
    expect(estimateIgt(b, 9_000)).toBe(400_000);
  });

  it('never goes backwards if the clock jumps', () => {
    const a = nextAnchor(undefined, run([300_000]), 10_000);
    expect(estimateIgt(a, 5_000)).toBe(300_000);
  });

  /*
   * ここが「リロードのたびに巻き戻る」を直した部分。lastUpdated は
   * 最後に届いたイベントが起きた壁時計時刻なので、観測時刻ではなくそちらに張る。
   */
  it('anchors on lastUpdated, not on when we happened to fetch', () => {
    // 5 分前に 5:00 のスプリットが来たランを、今ページを開いた
    const a = nextAnchor(undefined, run([300_000], [], 1_000), 301_000);
    expect(a).toEqual({ baseIgt: 300_000, at: 1_000 });
    // 開いた瞬間から 5 分ぶん進んだ位置に出る（300_000 のままではない）
    expect(estimateIgt(a, 301_000)).toBe(600_000);
  });

  it('falls back to the observation time when lastUpdated is unusable', () => {
    // 端末の時計がサーバより遅れている（lastUpdated が未来）
    expect(nextAnchor(undefined, run([300_000], [], 9_000), 1_000).at).toBe(1_000);
    // 極端に古い。走者が落ちたまま残っている類なので歩かせない
    const stale = 31 * 60_000;
    expect(nextAnchor(undefined, run([300_000], [], 1_000), 1_000 + stale).at).toBe(1_000 + stale);
  });
});

describe('fit with a custom floor — the per-row scale in the Active Pace table', () => {
  // 一覧は 15 分が下限。15 分以内のランどうしは同じ縮尺で並ぶ
  const row = { mode: 'fit', minMs: 15 * MIN } as const;

  it('does not rescale at all below 15 minutes', () => {
    for (const igt of [30_000, 117_000, 5 * MIN, 9 * MIN, 14 * MIN, 15 * MIN]) {
      expect(resolveScale(row, igt, false).denominatorMs, `${igt}`).toBe(15 * MIN);
    }
  });

  it('lets runs under 15 minutes be compared directly, since they share a scale', () => {
    const a = resolveScale(row, 117_000, false).denominatorMs;
    const b = resolveScale(row, 14 * MIN, false).denominatorMs;
    expect(a).toBe(b);
  });

  it('grows in 3 minute steps once past 15 minutes', () => {
    expect(resolveScale(row, 15 * MIN + 1, false).denominatorMs).toBe(18 * MIN);
    expect(resolveScale(row, 18 * MIN, false).denominatorMs).toBe(18 * MIN);
    expect(resolveScale(row, 18 * MIN + 1, false).denominatorMs).toBe(21 * MIN);
    expect(resolveScale(row, 1_059_681, false).denominatorMs).toBe(18 * MIN);
  });

  it('never lets a run exceed its own denominator', () => {
    for (const igt of [30_000, 14 * MIN, 1_059_681, 2_152_000, 40 * MIN]) {
      const d = resolveScale(row, igt, false).denominatorMs;
      expect(igt / d, `${igt}`).toBeLessThanOrEqual(1);
    }
  });
});
