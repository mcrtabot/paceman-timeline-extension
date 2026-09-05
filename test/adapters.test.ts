/** paceman.gg から採取した fixtures を入力にしたゴールデンテスト。 */
import { describe, expect, it } from 'vitest';
import { fromGetWorld } from '../src/adapters/getWorld.js';
import { fromLiveRuns, frontierIgt } from '../src/adapters/liveruns.js';
import { findLiveByWorldId, mergeRunTimeline } from '../src/adapters/merge.js';
import { normalizeItems } from '../src/adapters/normalize.js';
import { contextLabel, NUMERIC_EVENT_MAP } from '../src/adapters/paceman.js';
import { fromPlayerRuns } from '../src/adapters/playerRuns.js';
import { fromPlayers } from '../src/adapters/players.js';
import { getTimelineLineItems, getTimelinePattern } from '../src/timeline/layout.js';
import { fixture } from './helpers.js';

describe('fromGetWorld — finished run (3x7en 17:39, id 2827631)', () => {
  const run = fromGetWorld(fixture('api/getWorld.finished.json'))!;

  it('parses identity and completion', () => {
    expect(run.nickname).toBe('3x7en');
    expect(run.runId).toBe(2827631);
    expect(run.isLive).toBe(false);
    expect(run.final).toEqual({ igt: 1_059_681, rta: 1_074_427 });
  });

  it('yields the full split chain in chronological order', () => {
    expect(run.items.map((i) => i.type)).toEqual([
      'overworld',
      'enter_nether',
      'enter_bastion',
      'enter_fortress',
      'first_portal',
      'enter_stronghold',
      'enter_end',
      'credits',
    ]);
  });

  it('keeps RTA out of the time axis but available for VOD seeking', () => {
    expect(run.items.every((i) => i.igt <= 1_059_681)).toBe(true);
    expect(run.rtaByType.enter_nether).toBe(142_551);
    expect(run.vodId).toBe(2865664661);
    expect(run.vodOffset).toBe(10023);
  });

  it('documents the known data loss of this endpoint', () => {
    // getWorld には second_portal 列も contextEventList も無い
    expect(run.items.some((i) => i.type === 'second_portal')).toBe(false);
    expect(run.context).toEqual([]);
  });

  it('normalises getWorld second-granularity timestamps to milliseconds', () => {
    expect(run.lastUpdated).toBe(1_788_591_648_000);
  });
});

describe('fromGetWorld — live run', () => {
  const run = fromGetWorld(fixture('api/getWorld.live.json'))!;

  it('skips unreached splits instead of zero-filling them', () => {
    expect(run.items.map((i) => i.type)).toEqual(['overworld', 'enter_nether', 'enter_bastion']);
  });

  it('has no final time yet', () => {
    expect(run.final).toBeNull();
    expect(run.isLive).toBe(true);
  });

  it('still paints a bar up to the pace frontier', () => {
    const lines = getTimelineLineItems(run.items, frontierIgt(run), 12 * 60_000);
    expect(lines.map((l) => l.type)).toEqual(['overworld', 'enter_nether']);
    expect(lines.every((l) => l.width > 0)).toBe(true);
  });
});

describe('fromLiveRuns', () => {
  const runs = fromLiveRuns(fixture('api/liveruns.json'));

  it('parses every entry in the captured payload', () => {
    expect(runs.length).toBe(3);
    expect(runs.every((r) => r.worldId !== null && r.nickname !== null)).toBe(true);
  });

  it('captures both route orders present in real data', () => {
    const patterns = runs.map((r) => getTimelinePattern(r.items));
    expect(patterns).toContain('bf');
    expect(patterns).toContain('fb');
  });

  it('separates context markers from the time axis', () => {
    const r = runs.find((x) => x.nickname === '3x7en')!;
    expect(r.context.map((c) => c.key)).toEqual([
      'obtain_iron_ingot',
      'obtain_iron_pickaxe',
      'obtain_lava_bucket',
    ]);
    // context がフェーズ境界として混入していないこと
    expect(r.items.every((i) => i.type.startsWith('enter_') || i.type === 'overworld')).toBe(true);
  });

  it('tolerates itemData being null (observed on every captured entry)', () => {
    expect(runs.every((r) => r.numLeaves !== undefined)).toBe(true);
  });

  it('treats a run without credits as still live', () => {
    expect(runs.every((r) => r.isLive)).toBe(true);
    expect(runs.every((r) => r.final === null)).toBe(true);
  });
});

describe('fromPlayerRuns', () => {
  const runs = fromPlayerRuns(fixture('api/getPlayerRuns.json'), {
    uuid: '7d5a64b2-8967-4db6-9b10-18441c860e22',
    nickname: '3x7en',
  });

  it('renders the history grid with no extra requests', () => {
    expect(runs.length).toBe(10);
    expect(runs[0]!.runId).toBe(2827683);
  });

  it('handles the fortress-first row correctly', () => {
    const fortressFirst = runs.find((r) => r.runId === 2827674)!;
    expect(fortressFirst.items.map((i) => i.type)).toEqual([
      'overworld',
      'enter_nether',
      'enter_fortress',
    ]);
  });

  it('handles a row that died in the nether', () => {
    const dead = runs.find((r) => r.runId === 2827663)!;
    expect(dead.items.map((i) => i.type)).toEqual(['overworld', 'enter_nether']);
    expect(dead.final).toBeNull();
  });

  it('parses the ISO lastUpdated of this endpoint', () => {
    expect(runs[0]!.lastUpdated).toBe(Date.parse('2026-09-05T07:31:43.000Z'));
  });
});

describe('merge — getWorld + liveruns', () => {
  const base = fromGetWorld(fixture('api/getWorld.live.json'))!;
  const live = fromLiveRuns(fixture('api/liveruns.json'));

  it('matches the two sources by worldId (verified against the live API in M0)', () => {
    const match = findLiveByWorldId(live, base.worldId);
    expect(match).not.toBeNull();
    expect(match!.nickname).toBe(base.nickname);
  });

  it('keeps getWorld VOD data while gaining liveruns context', () => {
    const merged = mergeRunTimeline(base, findLiveByWorldId(live, base.worldId)!);
    expect(merged.source).toBe('merged');
    expect(merged.vodId).toBe(base.vodId);
    expect(merged.context.length).toBeGreaterThan(0);
    expect(merged.gameVersion).toBe('1.16.1');
  });

  it('produces a still-monotonic timeline', () => {
    const merged = mergeRunTimeline(base, findLiveByWorldId(live, base.worldId)!);
    for (let i = 1; i < merged.items.length; i++) {
      expect(merged.items[i]!.igt).toBeGreaterThanOrEqual(merged.items[i - 1]!.igt);
    }
  });
});

describe('real out-of-order data from /api/cs/leaderboard', () => {
  it('sorts by value, not by arrival order', () => {
    const board = fixture<{ nickname: string; eventList: { eventId: number; time: number }[] }[]>(
      'api/cs_leaderboard.json',
    );
    // 到着順が 0, 2, 1 になっている行（fortress が bastion より先）を実データから探す
    const outOfOrder = board.find((r) => {
      const ids = r.eventList.map((e) => e.eventId);
      const b = ids.indexOf(1);
      const f = ids.indexOf(2);
      return b >= 0 && f >= 0 && f < b;
    });
    expect(outOfOrder, 'fixture should contain a fortress-first run').toBeDefined();

    const items = normalizeItems(
      outOfOrder!.eventList.map((e) => ({ type: NUMERIC_EVENT_MAP[e.eventId]!, igt: e.time })),
    );
    expect(getTimelinePattern(items)).toBe('fb');
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.igt).toBeGreaterThanOrEqual(items[i - 1]!.igt);
    }
  });
});

describe('context events — no whitelist', () => {
  /*
   * API が contextEventList として分けた時点で分類は済んでいる。既知の名前だけ通すと
   * PaceMan が追加したイベントを捨てることになり、rsg.distract_piglin を落としていた。
   */
  const payload = [
    {
      worldId: 'a'.repeat(64),
      nickname: 'someone',
      user: { uuid: 'u' },
      eventList: [{ eventId: 'rsg.enter_nether', igt: 100_000, rta: 100_500 }],
      contextEventList: [
        { eventId: 'rsg.obtain_lava_bucket', igt: 60_000, rta: 60_500 },
        { eventId: 'rsg.distract_piglin', igt: 80_000, rta: 80_500 },
        { eventId: 'rsg.some_future_event', igt: 90_000, rta: 90_500 },
      ],
    },
  ];

  it('keeps events the whitelist used to drop', () => {
    const run = fromLiveRuns(payload)[0]!;
    expect(run.context.map((c) => c.key)).toEqual([
      'obtain_lava_bucket',
      'distract_piglin',
      'some_future_event',
    ]);
  });

  it('still keeps context out of the time axis', () => {
    const run = fromLiveRuns(payload)[0]!;
    expect(run.items.map((i) => i.type)).toEqual(['overworld', 'enter_nether']);
  });

  it('drops entries with no usable time', () => {
    const run = fromLiveRuns([
      {
        ...payload[0],
        contextEventList: [
          { eventId: 'rsg.ok', igt: 1000 },
          { eventId: 'rsg.no_igt' },
          { igt: 2000 },
        ],
      },
    ])[0]!;
    expect(run.context.map((c) => c.key)).toEqual(['ok']);
  });
});

describe('contextLabel', () => {
  it('turns the raw key into something readable', () => {
    expect(contextLabel('obtain_iron_ingot')).toBe('Obtain Iron Ingot');
    expect(contextLabel('distract_piglin')).toBe('Distract Piglin');
    expect(contextLabel('obtain_crying_obsidian')).toBe('Obtain Crying Obsidian');
  });

  it('uses PaceMan wording where it differs from the raw key', () => {
    expect(contextLabel('obtain_gold_block')).toBe('Loot Monument');
    expect(contextLabel('break_underground_bookshelf')).toBe('Enter Library');
    expect(contextLabel('trade')).toBe('Villager Trade');
  });

  it('handles an event it has never seen, since there is no whitelist', () => {
    expect(contextLabel('some_future_event')).toBe('Some Future Event');
    expect(contextLabel('single')).toBe('Single');
  });
});

describe('fromPlayers', () => {
  it('reads the name list', () => {
    expect(fromPlayers({ playerList: ['Beta', 'alpha', 'Gamma'] })).toEqual([
      'alpha',
      'Beta',
      'Gamma',
    ]);
  });

  it('drops duplicates and non-strings', () => {
    expect(fromPlayers({ playerList: ['a', 'a', 1, null, '', 'b'] })).toEqual(['a', 'b']);
  });

  it('survives a shape it does not expect', () => {
    expect(fromPlayers(null)).toEqual([]);
    expect(fromPlayers({})).toEqual([]);
    expect(fromPlayers({ playerList: 'nope' })).toEqual([]);
  });

  it('accepts a bare array too', () => {
    expect(fromPlayers(['x'])).toEqual(['x']);
  });
});
