/** PaceMan の語彙 → MCSRImageBuilder の語彙。 */

import type { EventType } from '../timeline/types.js';

/**
 * liveruns の eventId。rsg. を剥がすと MCSRImageBuilder の型名と一致する。
 * 表に無いものは無視する。PaceMan は今後もイベントを増やす。
 */
export const RSG_EVENT_MAP: Readonly<Record<string, EventType>> = {
  'rsg.enter_nether': 'enter_nether',
  'rsg.enter_bastion': 'enter_bastion',
  'rsg.enter_fortress': 'enter_fortress',
  'rsg.first_portal': 'first_portal',
  'rsg.second_portal': 'second_portal',
  'rsg.enter_stronghold': 'enter_stronghold',
  'rsg.enter_end': 'enter_end',
  'rsg.credits': 'credits',
};

/** `/stats/api/getWorld/` と `getPlayerRuns` のフラット列名 → 型名。 */
export const COLUMN_EVENT_MAP = {
  nether: 'enter_nether',
  bastion: 'enter_bastion',
  fortress: 'enter_fortress',
  first_portal: 'first_portal',
  stronghold: 'enter_stronghold',
  end: 'enter_end',
  finish: 'credits',
} as const satisfies Readonly<Record<string, EventType>>;

export type SplitColumn = keyof typeof COLUMN_EVENT_MAP;

export const SPLIT_COLUMNS = Object.keys(COLUMN_EVENT_MAP) as SplitColumn[];

/** IGT 列に対応する RTA 列名。VOD シークに使う。 */
export const RTA_COLUMN: Readonly<Record<SplitColumn, string>> = {
  nether: 'netherRta',
  bastion: 'bastionRta',
  fortress: 'fortressRta',
  first_portal: 'first_portalRta',
  stronghold: 'strongholdRta',
  end: 'endRta',
  finish: 'finishRta',
};

/** /api/cs/leaderboard の数値 eventId。 */
export const NUMERIC_EVENT_MAP: Readonly<Record<number, EventType>> = {
  0: 'enter_nether',
  1: 'enter_bastion',
  2: 'enter_fortress',
  3: 'first_portal',
  4: 'second_portal',
  5: 'enter_stronghold',
  6: 'enter_end',
  7: 'credits',
};

/**
 * context イベントの表示名。素の key は読みにくいので _ 区切りを単語に開く。
 * 知らないイベントが来てもそれなりに読める形になる。
 * PaceMan 自身が別の呼び方をしているものだけ、その名前に合わせる。
 */
const CONTEXT_LABELS: Readonly<Record<string, string>> = {
  trade: 'Villager Trade',
  obtain_gold_block: 'Loot Monument',
  break_underground_bookshelf: 'Enter Library',
};

export const contextLabel = (key: string): string =>
  CONTEXT_LABELS[key] ??
  key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export const asNumber = num;

export const asString = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
