/** ライブデータは汚い。全アダプタがここを通す。 */

import { eventOrder, type EventType, type TimelineItem } from '../timeline/types.js';

/** 生の (型, igt) 対。igt が null や未達のものが普通に混ざる。 */
export type RawSplit = { type: EventType; igt: number | null | undefined };

/**
 * - 無効な igt（null / 非有限 / 負）を落とす
 * - 同じ型が複数あれば最も早いものだけ残す
 * - igt 昇順に並べ替える。列順もイベントの到着順も時系列とは限らない
 * - 同時刻は正準順でタイブレーク
 * - 先頭に合成 overworld:0 を置く。getTimelineLineItems の起点になる
 */
export const normalizeItems = (raw: readonly RawSplit[]): TimelineItem[] => {
  const earliest = new Map<EventType, number>();
  for (const { type, igt } of raw) {
    if (type === 'overworld') continue; // 合成分と重複させない
    if (igt == null || !Number.isFinite(igt) || igt < 0) continue;
    const prev = earliest.get(type);
    if (prev === undefined || igt < prev) earliest.set(type, igt);
  }

  const items = [...earliest].map(([type, igt]): TimelineItem => ({ type, igt }));
  items.sort((a, b) => a.igt - b.igt || eventOrder(a.type) - eventOrder(b.type));

  return [{ type: 'overworld', igt: 0 }, ...items];
};

/** items の最後の時刻。overworld しか無ければ 0。 */
export const lastIgt = (items: readonly TimelineItem[]): number =>
  items.length > 0 ? (items[items.length - 1] as TimelineItem).igt : 0;
