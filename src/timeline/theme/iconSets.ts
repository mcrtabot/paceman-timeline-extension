/**
 * スプリットアイコンの絵柄。
 *
 *   paceman-top    トップページのスプライトシート
 *   paceman-stats  stats ページの個別 webp
 *   mcsr           MCSRImageBuilder の default テーマ。同梱
 *
 * PaceMan 側の 2 つは同一オリジンから参照するだけで同梱していない。
 * 読めなければ mcsr に落ちる。
 */

import type { EventType } from '../types.js';
import type { AssetRef, IconSource, SpriteRef } from './types.js';

export const ICON_SETS = ['paceman-top', 'paceman-stats', 'mcsr'] as const;
export type IconSetId = (typeof ICON_SETS)[number];

export const ICON_SET_LABELS: Readonly<Record<IconSetId, string>> = {
  'paceman-top': 'PaceMan',
  'paceman-stats': 'PaceMan Stat',
  mcsr: 'MCSR Timeline',
};

/** 見本として並べる順。ラン中に通る順で並べる。 */
export const PREVIEW_ORDER = [
  'enter_nether',
  'enter_bastion',
  'enter_fortress',
  'first_portal',
  'enter_stronghold',
  'enter_end',
  'credits',
] as const satisfies readonly EventType[];

/**
 * 同梱アイコン。PaceMan 側が読めなかったときのフォールバックにも使う。
 * ネザーイン・第1/第2ポータルは同じポータルの絵なので 1 ファイルを共有する。
 */
const BUNDLED: Readonly<Partial<Record<EventType, AssetRef>>> = {
  enter_nether: 'icon/nether_portal.png',
  enter_bastion: 'icon/enter_bastion.png',
  enter_fortress: 'icon/enter_fortress.png',
  first_portal: 'icon/nether_portal.png',
  second_portal: 'icon/nether_portal.png',
  enter_stronghold: 'icon/enter_stronghold.png',
  enter_end: 'icon/enter_end.png',
  credits: 'icon/credits.png',
};

/**
 * トップページのスプライトシート。/images/sprite_sheet.json を見て位置を取った。
 * 160x128 に 32x32 が並ぶので 5 列 4 行。
 */
const SHEET = { sheet: '/images/!sprite_sheet.png', cols: 5, rows: 4 } as const;
const sprite = (col: number, row: number): SpriteRef => ({ ...SHEET, col, row });

const PACEMAN_TOP: Readonly<Partial<Record<EventType, IconSource>>> = {
  enter_nether: sprite(2, 3), // nether.png (64,96)
  enter_bastion: sprite(3, 2), // bastion.png (96,64)
  enter_fortress: sprite(1, 3), // fortress.png (32,96)
  first_portal: sprite(3, 3), // portal.png (96,96)
  second_portal: sprite(3, 3),
  enter_stronghold: sprite(4, 3), // sh.png (128,96)
  enter_end: sprite(0, 3), // end.png (0,96)
  credits: sprite(4, 2), // credits.png (128,64)
};

/** stats ページの個別ファイル。読めなければ同梱アイコンに落ちる。 */
const PACEMAN_STATS: Readonly<Partial<Record<EventType, IconSource>>> = {
  enter_nether: ['/stats/nether.webp', BUNDLED.enter_nether!],
  enter_bastion: ['/stats/bastion.webp', BUNDLED.enter_bastion!],
  enter_fortress: ['/stats/fortress.webp', BUNDLED.enter_fortress!],
  first_portal: ['/stats/first_portal.webp', BUNDLED.first_portal!],
  // PaceMan に second_portal の画像は無いので first_portal を流用する
  second_portal: ['/stats/first_portal.webp', BUNDLED.second_portal!],
  enter_stronghold: ['/stats/stronghold.webp', BUNDLED.enter_stronghold!],
  enter_end: ['/stats/end.webp', BUNDLED.enter_end!],
  credits: ['/stats/finish.webp', BUNDLED.credits!],
};

export const ICONS: Readonly<
  Record<IconSetId, Readonly<Partial<Record<EventType, IconSource>>>>
> = {
  'paceman-top': PACEMAN_TOP,
  'paceman-stats': PACEMAN_STATS,
  mcsr: BUNDLED,
};

/** 輪郭の色。絵柄と置き場所によらず同じ。真っ白は目立ちすぎるので半透明にしてある。 */
export const OUTLINE_COLOR = 'rgba(255, 255, 255, 0.45)';

/**
 * context マーカーの絵。キーは ContextMarker.key で、rsg. を剥がしたもの。
 *
 * ここに無いキーは目盛りのまま出す。API は今後もイベントを増やすので、
 * 表を引けなかったものを落とさない。絵は Minecraft のインベントリアイコン。
 * blaze_rod と gold_block は 2 つのキーで共用する。
 */
export const CONTEXT_ICONS: Readonly<Record<string, AssetRef>> = {
  obtain_iron_ingot: 'icon/context/iron_ingot.png',
  obtain_iron_pickaxe: 'icon/context/iron_pickaxe.png',
  obtain_lava_bucket: 'icon/context/lava_bucket.png',
  obtain_blaze_rod: 'icon/context/blaze_rod.png',
  killed_blaze: 'icon/context/blaze_rod.png',
  obtain_obsidian: 'icon/context/obsidian.png',
  obtain_crying_obsidian: 'icon/context/crying_obsidian.png',
  obtain_gold_block: 'icon/context/gold_block.png',
  loot_monument: 'icon/context/gold_block.png',
  loot_bastion: 'icon/context/chest.png',
  distract_piglin: 'icon/context/gold_ingot.png',
  kill_dragon: 'icon/context/dragon_egg.png',
  trade: 'icon/context/emerald.png',
  break_underground_bookshelf: 'icon/context/bookshelf.png',
  tower_start: 'icon/context/ladder.png',
};

/**
 * 輪郭を付ける context キー。黒曜石はほぼ黒で、暗い背景に置くと形が見えない。
 * 色と太さはスプリットアイコンと同じ扱い（OUTLINE_COLOR、1px の drop-shadow）。
 */
export const CONTEXT_OUTLINED: ReadonlySet<string> = new Set([
  'obtain_obsidian',
  'obtain_crying_obsidian',
]);

/**
 * 背景に沈むので輪郭を付けるアイコン。全部には付けない。輪郭は drop-shadow で
 * 画像の背後に出るので、透明度のある絵だと色が透けて印象が変わる。
 * トップページのスプライトは元から輪郭付きなので不要。
 */
export const OUTLINED: Readonly<Record<IconSetId, ReadonlySet<EventType>>> = {
  'paceman-top': new Set(),
  // 要塞は暗い赤、フィニッシュはほぼ黒のドラゴン
  'paceman-stats': new Set(['enter_fortress', 'credits']),
  // ポータル系は黒曜石の枠、フィニッシュは暗い
  mcsr: new Set(['enter_nether', 'first_portal', 'second_portal', 'credits']),
};
