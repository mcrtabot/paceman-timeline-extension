/**
 * GET /api/ars/liveruns から RunTimeline へ。
 * 一番情報が多い経路で eventList / contextEventList / numLeaves を持つ。
 * itemData は null になることがあるので存在を前提にしない。
 */

import type { ContextMarker, EventType, RunTimeline } from '../timeline/types.js';
import { lastIgt, normalizeItems, type RawSplit } from './normalize.js';
import { asNumber, asString, RSG_EVENT_MAP } from './paceman.js';

type RawEvent = { eventId?: unknown; igt?: unknown; rta?: unknown };

const readEvents = (v: unknown): RawEvent[] => (Array.isArray(v) ? (v as RawEvent[]) : []);

export const fromLiveRun = (raw: unknown): RunTimeline | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const worldId = asString(r['worldId']);
  if (!worldId) return null;

  const splits: RawSplit[] = [];
  const rtaByType: Partial<Record<EventType, number>> = {};

  for (const e of readEvents(r['eventList'])) {
    const id = asString(e.eventId);
    if (!id) continue;
    const type = RSG_EVENT_MAP[id];
    if (!type) continue; // 未知の rsg.* は黙って無視
    const igt = asNumber(e.igt);
    splits.push({ type, igt });
    const rta = asNumber(e.rta);
    if (rta !== null && rtaByType[type] === undefined) rtaByType[type] = rta;
  }

  /*
   * context にホワイトリストは持たない。API が contextEventList として分けた時点で
   * 分類は済んでいる。既知の名前だけ通していたころは rsg.distract_piglin を
   * 取りこぼしていた。出すのは名前と時刻だけなので、知らない名前でも困らない。
   */
  const context: ContextMarker[] = [];
  for (const e of readEvents(r['contextEventList'])) {
    const id = asString(e.eventId);
    const igt = asNumber(e.igt);
    if (!id || igt === null) continue;
    context.push({ key: id.replace(/^rsg\./, ''), igt, rta: asNumber(e.rta) });
  }
  context.sort((a, b) => a.igt - b.igt);

  const items = normalizeItems(splits);
  const creditsIgt = items.find((i) => i.type === 'credits')?.igt ?? null;

  const user = (typeof r['user'] === 'object' && r['user'] !== null
    ? (r['user'] as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  return {
    source: 'liveruns',
    worldId,
    runId: null,
    nickname: asString(r['nickname']),
    uuid: asString(user['uuid']),
    gameVersion: asString(r['gameVersion']),
    items,
    rtaByType,
    context,
    final: creditsIgt === null ? null : { igt: creditsIgt, rta: rtaByType.credits ?? null },
    // liveruns に載っている時点で進行中。credits が来ていれば完走
    isLive: creditsIgt === null,
    lastUpdated: asNumber(r['lastUpdated']),
    twitch: asString(user['liveAccount']),
    vodId: null,
    vodOffset: null,
    numLeaves: asNumber(r['numLeaves']),
  };
};

/** 配列全体。パースできなかった要素と、isCheated / isHidden の行は落とす。 */
export const fromLiveRuns = (raw: unknown): RunTimeline[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((r) => {
      if (typeof r !== 'object' || r === null) return false;
      const o = r as Record<string, unknown>;
      return o['isCheated'] !== true && o['isHidden'] !== true;
    })
    .map(fromLiveRun)
    .filter((r): r is RunTimeline => r !== null);

/** バーの右端に使う時刻。完走していれば finish、していなければ最後のスプリット。 */
export const frontierIgt = (run: RunTimeline): number => run.final?.igt ?? lastIgt(run.items);
