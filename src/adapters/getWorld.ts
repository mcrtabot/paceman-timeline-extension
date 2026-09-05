/**
 * GET /stats/api/getWorld/?worldId=<id> から RunTimeline へ。
 *
 * liveruns より情報が薄く、second_portal 列と contextEventList が無い。
 * タイムラインを一番出したい /stats/run/<id> が一番データの薄いページになる。
 * ライブ中なら merge.ts で liveruns から補う。
 *
 * 列の順序は時系列ではない。bastion 先行も fortress 先行も実在する。
 * normalizeItems が値でソートするので、列の並び順に意味を持たせないこと。
 */

import type { EventType, RunTimeline } from '../timeline/types.js';
import { normalizeItems, type RawSplit } from './normalize.js';
import { asNumber, asString, COLUMN_EVENT_MAP, RTA_COLUMN, SPLIT_COLUMNS } from './paceman.js';

/** 完走ランなら data.finish が埋まる。未達の列は null で、0 埋めはしない。 */
export const fromGetWorld = (payload: unknown): RunTimeline | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const data = p['data'];
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;

  const splits: RawSplit[] = [];
  const rtaByType: Partial<Record<EventType, number>> = {};

  for (const col of SPLIT_COLUMNS) {
    const type = COLUMN_EVENT_MAP[col];
    splits.push({ type, igt: asNumber(d[col]) });
    const rta = asNumber(d[RTA_COLUMN[col]]);
    if (rta !== null) rtaByType[type] = rta;
  }

  const items = normalizeItems(splits);
  const finishIgt = asNumber(d['finish']);

  return {
    source: 'getWorld',
    worldId: asString(d['worldId']),
    runId: asNumber(d['id']),
    nickname: asString(d['nickname']),
    uuid: asString(d['uuid']),
    gameVersion: null,
    items,
    rtaByType,
    context: [], // getWorld は context を持たない
    final: finishIgt === null ? null : { igt: finishIgt, rta: rtaByType.credits ?? null },
    isLive: p['isLive'] === true,
    // getWorld の時刻列は秒。liveruns の lastUpdated はミリ秒なのでここで揃える
    lastUpdated: (() => {
      const s = asNumber(d['realUpdate']) ?? asNumber(d['updateTime']);
      return s === null ? null : s * 1000;
    })(),
    twitch: asString(d['twitch']),
    vodId: asNumber(d['vodId']),
    vodOffset: asNumber(d['vodOffset']),
    numLeaves: null,
  };
};
