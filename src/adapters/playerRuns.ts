/**
 * GET /stats/api/getPlayerRuns/?uuid=&page=&pageSize= の行から RunTimeline へ。
 *
 * 行はスプリット列をそのまま持っているので、履歴は追加リクエスト無しで描ける。
 * pageSize は 10 / 25 / 50 / 100 のみで、それ以外はエラー JSON が返る。
 * nickname / uuid / worldId は行に無いので呼び出し側から渡す。
 */

import type { EventType, RunTimeline } from '../timeline/types.js';
import { normalizeItems, type RawSplit } from './normalize.js';
import { asNumber, asString, COLUMN_EVENT_MAP, RTA_COLUMN, SPLIT_COLUMNS } from './paceman.js';

export type PlayerContext = { uuid: string | null; nickname: string | null };

export const fromPlayerRunRow = (raw: unknown, player: PlayerContext): RunTimeline | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const runId = asNumber(d['id']);
  if (runId === null) return null;

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
  const lastUpdatedRaw = d['lastUpdated'];

  return {
    source: 'playerRuns',
    worldId: null,
    runId,
    nickname: player.nickname,
    uuid: player.uuid,
    gameVersion: null,
    items,
    rtaByType,
    context: [],
    final: finishIgt === null ? null : { igt: finishIgt, rta: rtaByType.credits ?? null },
    isLive: false,
    // この経路の lastUpdated は ISO 文字列
    lastUpdated:
      typeof lastUpdatedRaw === 'string'
        ? (Number.isNaN(Date.parse(lastUpdatedRaw)) ? null : Date.parse(lastUpdatedRaw))
        : asNumber(lastUpdatedRaw),
    twitch: asString(d['twitch']),
    vodId: asNumber(d['vodId']),
    vodOffset: null,
    numLeaves: null,
  };
};

export const fromPlayerRuns = (payload: unknown, player: PlayerContext): RunTimeline[] => {
  const rows =
    typeof payload === 'object' && payload !== null && Array.isArray((payload as { rows?: unknown }).rows)
      ? ((payload as { rows: unknown[] }).rows)
      : Array.isArray(payload)
        ? payload
        : [];
  return rows.map((r) => fromPlayerRunRow(r, player)).filter((r): r is RunTimeline => r !== null);
};
