/** MCSRImageBuilder の web/src/types.ts から移した語彙。DOM には依存しない。 */

/** MCSRImageBuilder の TIMELINE_EVENTS。同時刻のタイブレークにこの順を使う。 */
export const EVENT_TYPES = [
  'overworld',
  'enter_nether',
  'enter_bastion',
  'leave_bastion',
  'enter_fortress',
  'leave_fortress',
  'first_portal',
  'second_portal',
  'enter_stronghold',
  'portal_room',
  'enter_end',
  'credits',
  'overworld2',
  'enter_nether2',
  'enter_bastion2',
  'enter_fortress2',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_ORDER = new Map<EventType, number>(EVENT_TYPES.map((t, i) => [t, i]));

/** 正準順での位置。未知の型は末尾扱い。 */
export const eventOrder = (type: EventType): number => EVENT_ORDER.get(type) ?? Number.MAX_SAFE_INTEGER;

export const isEventType = (v: string): v is EventType => EVENT_ORDER.has(v as EventType);

/**
 * PaceMan が供給できるイベント。SIMPLE_MODE から portal_room を引いた集合。
 * これ以外はテーマトークン側で非表示にする。
 */
export const PACEMAN_EVENT_TYPES = [
  'overworld',
  'enter_nether',
  'enter_bastion',
  'enter_fortress',
  'first_portal',
  'second_portal',
  'enter_stronghold',
  'enter_end',
  'credits',
] as const satisfies readonly EventType[];

/** MCSRImageBuilder と同じ形。igt はミリ秒。 */
export type TimelineItem = {
  type: EventType;
  igt: number;
};

/**
 * 溶岩バケツやブレイズ棒などの点。フェーズ境界ではないので TimelineItem には混ぜない。
 * getTimelineLineItems は直前イベントでセグメントを塗るため、混ぜると塗りが壊れる。
 */
export type ContextMarker = {
  key: string;
  igt: number;
  /** ライブ推定のアンカーに使う。列で持っていない経路では null。 */
  rta: number | null;
};

/** 全ページ・全データ源がここに収束する。 */
export type RunTimeline = {
  source: 'liveruns' | 'getWorld' | 'playerRuns' | 'merged';
  worldId: string | null;
  runId: number | null;
  nickname: string | null;
  uuid: string | null;
  gameVersion: string | null;
  /** 時間軸。必ず overworld:0 から始まり、igt 昇順。 */
  items: TimelineItem[];
  /** VOD シーク専用。calcPosition には渡さない。 */
  rtaByType: Partial<Record<EventType, number>>;
  context: ContextMarker[];
  /** null は未完走。MCSRImageBuilder と違い PaceMan は死んだペースだらけ。 */
  final: { igt: number; rta: number | null } | null;
  isLive: boolean;
  lastUpdated: number | null;
  twitch: string | null;
  vodId: number | null;
  vodOffset: number | null;
  numLeaves: number | null;
};

/**
 * 時間軸の分母の決め方。
 *
 * fit は親要素の幅いっぱいに収める。完走なら finish が右端、未完走なら 3 分刻みで
 * 切り上げ、下限 9 分。一覧では短くしたいので minMs で下げられる。
 * reference は分母を直接指定する。行をまたいで縮尺を揃えたいときに使う。
 */
export type Scale =
  | { mode: 'fit'; minMs?: number }
  | { mode: 'reference'; refMs: number; label?: string };

/** レイアウト結果。left/width は 0..1 の割合で、単位は呼び出し側が決める。 */
export type TimelineLineItem = {
  left: number;
  width: number;
  type: EventType;
};

export type TimelineDotItem = {
  left: number;
  type: EventType;
  minute: number;
};

/** 近すぎてまとめた context マーカー。 */
export type ContextCluster = {
  left: number;
  items: ContextMarker[];
};

export type TimelineIconItem = {
  left: number;
  type: EventType;
  igt: number;
};
