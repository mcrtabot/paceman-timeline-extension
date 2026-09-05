/**
 * MCSRImageBuilder の Indicator.tsx から calcPosition / getTimelineLineItems /
 * getTimelineDotItems / range を、hooks.ts から getTimelinePattern を移したもの。
 *
 * 変えたのは 2 点。'%' 文字列ではなく 0..1 の数値を返すことと、分母を pbFinalIGT
 * ではなく引数で受けること。セグメントを直前のイベントで塗る部分はそのまま。
 */

import type {
  ContextCluster,
  ContextMarker,
  EventType,
  TimelineDotItem,
  TimelineIconItem,
  TimelineItem,
  TimelineLineItem,
} from './types.js';

export const MINUTE_MS = 60_000;

export const range = (start: number, end: number): number[] =>
  end < start ? [] : Array.from({ length: end - start + 1 }, (_v, k) => k + start);

/** 時刻 → 0..1 の割合。分母が 0 以下なら 0。 */
export const calcPosition = (igt: number | null | undefined, denominatorMs: number): number =>
  denominatorMs > 0 ? (igt ?? 0) / denominatorMs : 0;

/**
 * バイオームのセグメント列。各区間はそのあいだ居た場所、つまり直前のイベントで型が付く。
 * t=0 の合成 overworld から始まり、末尾は endIgt までの開いた区間。
 */
export const getTimelineLineItems = (
  timeline: readonly TimelineItem[],
  endIgt: number,
  denominatorMs: number,
): TimelineLineItem[] => {
  const lineItems: TimelineLineItem[] = [];
  if (!endIgt) return lineItems;

  let itemType: EventType = 'overworld';
  let itemStartIGT = 0;

  for (const item of timeline) {
    if (item.igt > endIgt) break;
    lineItems.push({
      left: calcPosition(itemStartIGT, denominatorMs),
      width: calcPosition(item.igt - itemStartIGT, denominatorMs),
      type: itemType,
    });
    itemType = item.type;
    itemStartIGT = item.igt;
  }

  lineItems.push({
    left: calcPosition(itemStartIGT, denominatorMs),
    width: calcPosition(endIgt - itemStartIGT, denominatorMs),
    type: itemType,
  });

  // credits は終わったあとなので塗らない
  // 幅 0 も落とす。先頭の合成 overworld:0 と、同一 igt のイベント対で出る
  // （second_portal と enter_stronghold が同時刻の実例がある）
  return lineItems.filter((li) => li.type !== 'credits' && li.width > 0);
};

/** 毎分の目盛りドット。その分が属するバイオームで色分けできるよう型を付ける。 */
export const getTimelineDotItems = (
  timeline: readonly TimelineItem[],
  endIgt: number,
  denominatorMs: number,
): TimelineDotItem[] => {
  if (!endIgt) return [];
  return range(1, Math.floor(endIgt / MINUTE_MS)).map((minute) => {
    const at = minute * MINUTE_MS;
    let itemType: EventType = 'overworld';
    for (const item of timeline) {
      if (item.igt > at) break;
      itemType = item.type;
    }
    return { left: calcPosition(at, denominatorMs), type: itemType, minute };
  });
};

/** バーの上下に置くアイコン。合成 overworld は描かない。 */
export const getTimelineIconItems = (
  timeline: readonly TimelineItem[],
  denominatorMs: number,
): TimelineIconItem[] =>
  timeline
    .filter((item) => item.type !== 'overworld')
    .map((item) => ({
      left: calcPosition(item.igt, denominatorMs),
      type: item.type,
      igt: item.igt,
    }));

/**
 * ルート判定。bastion 先行なら 'bf'、fortress 先行なら 'fb'。
 * ルートが違う PB とは bastion/fortress の差分を出さない、という判断に使う。
 */
export const getTimelinePattern = (timeline: readonly TimelineItem[]): 'bf' | 'fb' | null => {
  for (const item of timeline) {
    if (item.type === 'enter_bastion') return 'bf';
    if (item.type === 'enter_fortress') return 'fb';
  }
  return null;
};

/**
 * 近すぎる context マーカーをまとめる。目盛りは細いので、数秒差で並ぶと重なって
 * 個別に触れない。まとめたものはツールチップに全部並べる。
 *
 * しきい値は割合で持つ。px 幅は描画時まで分からないが、幅の 1.5% 程度なら
 * どの置き場所でも当たり判定と釣り合う。
 */
export const clusterContextItems = (
  context: readonly ContextMarker[],
  denominatorMs: number,
  minGap = 0.015,
): ContextCluster[] => {
  const sorted = [...context].sort((a, b) => a.igt - b.igt);
  const clusters: ContextCluster[] = [];
  for (const item of sorted) {
    const left = calcPosition(item.igt, denominatorMs);
    const last = clusters[clusters.length - 1];
    // 距離はかたまりの先頭から測る。少しずつずれて数珠つなぎになるのを防ぐ
    if (last && left - last.left < minGap) last.items.push(item);
    else clusters.push({ left, items: [item] });
  }
  return clusters;
};
