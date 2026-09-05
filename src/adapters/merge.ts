/**
 * getWorld に liveruns を重ねる。前者は finish と VOD 情報、後者は second_portal と
 * context を持っている。突合は worldId で、両者が一致することは確認済み。
 * 衝突したら細かい liveruns を採るが、final / vodId / vodOffset / runId は getWorld。
 */

import type { RunTimeline } from '../timeline/types.js';
import { normalizeItems, type RawSplit } from './normalize.js';

export const mergeRunTimeline = (base: RunTimeline, live: RunTimeline): RunTimeline => {
  const splits: RawSplit[] = [
    ...base.items.map((i) => ({ type: i.type, igt: i.igt })),
    ...live.items.map((i) => ({ type: i.type, igt: i.igt })),
  ];

  return {
    source: 'merged',
    worldId: base.worldId ?? live.worldId,
    runId: base.runId ?? live.runId,
    nickname: base.nickname ?? live.nickname,
    uuid: base.uuid ?? live.uuid,
    gameVersion: live.gameVersion ?? base.gameVersion,
    items: normalizeItems(splits),
    rtaByType: { ...live.rtaByType, ...base.rtaByType },
    context: live.context.length > 0 ? live.context : base.context,
    final: base.final ?? live.final,
    isLive: base.isLive || live.isLive,
    lastUpdated: Math.max(base.lastUpdated ?? 0, live.lastUpdated ?? 0) || null,
    twitch: base.twitch ?? live.twitch,
    vodId: base.vodId ?? live.vodId,
    vodOffset: base.vodOffset ?? live.vodOffset,
    numLeaves: live.numLeaves ?? base.numLeaves,
  };
};

/** liveruns の配列から worldId で相方を探す。 */
export const findLiveByWorldId = (
  runs: readonly RunTimeline[],
  worldId: string | null,
): RunTimeline | null =>
  worldId === null ? null : (runs.find((r) => r.worldId === worldId) ?? null);
