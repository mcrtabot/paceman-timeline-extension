import type { EventType } from '../types.js';

/**
 * assets/ からの相対パス。URL への解決は AssetResolver がやる。
 * / や http で始まるものは解決済みとして素通しする。PaceMan のアイコンを指すため。
 */
export type AssetRef = string;

/** アセットの相対パス → 実 URL。拡張では chrome.runtime.getURL、開発では import.meta.url。 */
export type AssetResolver = (ref: AssetRef) => string;

export const isResolvedRef = (ref: AssetRef): boolean =>
  ref.startsWith('/') || ref.startsWith('http');

/**
 * スプライトシートから切り出すアイコン。トップページは個別ファイルではなく
 * /images/!sprite_sheet.png（160x128 に 32x32 が 5 列 4 行）を使っている。
 * 表示サイズはテーマのトークン次第なので、実寸ではなく列と行で持って CSS で calc する。
 */
export type SpriteRef = {
  sheet: AssetRef;
  /** 左から何個目・上から何個目か（0 始まり）。 */
  col: number;
  row: number;
  /** シート全体が何列・何行か。 */
  cols: number;
  rows: number;
};

export type IconSource = AssetRef | readonly AssetRef[] | SpriteRef;

export const isSpriteRef = (v: IconSource): v is SpriteRef =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'sheet' in v;

/**
 * テーマはデータで持つ。MCSRImageBuilder は indicator.css への <link> を実行時に
 * 差し替えていたが、Shadow root にドキュメントの <link> は効かないし、一覧ページで
 * 複数本を個別にテーマできない。CSS は 1 枚に固定して、差分はカスタムプロパティで入れる。
 */
export type Theme = {
  id: string;
  /** `.mcsr-indicator` にインラインで載せる `--ptc-*`。 */
  tokens: Readonly<Record<string, string>>;
  labels: Readonly<Partial<Record<EventType, string>>>;
  /** セグメントを塗るテクスチャ（キーはそのセグメントの型 = 直前のイベント）。 */
  textures: Readonly<Partial<Record<EventType, AssetRef>>>;
  /**
   * 複数指定すると多重 background になり、先頭が読めなければ次が出る。
   * 外部 URL を先頭、同梱を末尾に置けばフォールバックになる。
   */
  icons: Readonly<Partial<Record<EventType, IconSource>>>;
  /** 輪郭を付けるイベント。暗くて背景に沈む絵にだけ。色は OUTLINE_COLOR で一律。 */
  outlinedIcons?: ReadonlySet<EventType>;
  /**
   * context マーカーを絵で出すときの表。未指定なら目盛りのまま。
   * 表に無いキーも目盛りに落ちるので、絵と目盛りは混在しうる。
   */
  contextIcons?: Readonly<Record<string, AssetRef>>;
};
