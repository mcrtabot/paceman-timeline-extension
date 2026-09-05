/** 拡張の設定。chrome.storage.sync に置く。既定はすべて ON。 */

import type { PageKind } from './content/anchors.js';

/**
 * 設定で ON/OFF できるページ。
 *
 * プロフィールは持たない。あそこに足すのはお気に入りの星 1 つで、本家の表示を
 * 何も置き換えないので、消したい人には全体スイッチで足りる。
 */
export type TogglablePage = Exclude<PageKind, 'player'>;
import type { DigitFontId } from './timeline/theme/fonts.js';
import { ICON_SETS, type IconSetId } from './timeline/theme/iconSets.js';

/**
 * トップの表の並び順。page は本家のまま、elapsed は現在タイムの長い順。
 *
 * 到達スプリットで並べる案は入れていない。誰かが着くたびに行が段をまたいで飛ぶ。
 * 短い順も入れていない。開始直後のランが先頭に居座る。
 */
export const HOME_SORTS = ['page', 'elapsed'] as const;

export type HomeSort = (typeof HOME_SORTS)[number];

/**
 * context マーカーの出し方。icon はアイテムの絵、tick はバーの下の短い目盛り。
 * 並びは既定を先頭にする（設定画面のラジオはこの順に出る）。
 */
export const CONTEXT_MARKERS = ['icon', 'tick'] as const;

export type ContextMarker = (typeof CONTEXT_MARKERS)[number];

export type Settings = {
  /**
   * 全体のスイッチ。OFF ならどのページにもマウントしない。
   * pages と別に持つのは、一時的に本家の見た目へ戻すのに 3 つ消して戻すのが面倒だから。
   */
  enabled: boolean;
  pages: Record<TogglablePage, boolean>;
  /**
   * アイコンの絵柄。既定は stats ページのもの。MCSRImageBuilder の絵柄は
   * 同じ意味に別の絵が当たっていて（金ブロックが PaceMan ではバスティオン、
   * default テーマでは要塞）、ページのスプリット一覧と並べるとずれて見える。
   */
  iconSet: IconSetId;
  /** タイムの数字に使うフォント。既定は Minecraft。 */
  digitFont: DigitFontId;
  /** 溶岩バケツ・ブレイズ棒などの点マーカー。既定は非表示。 */
  showContext: boolean;
  /** その点マーカーの見た目。既定はアイテムの絵。 */
  contextMarker: ContextMarker;
  /** 今 MCSR を回している人の顔を並べる。既定は表示。 */
  showPlayers: boolean;
  /** トップの表の並び順。既定は本家のまま。 */
  homeSort: HomeSort;
  /**
   * お気に入り走者。Minecraft の名前をそのまま持つ。
   * 突き合わせは大文字小文字を無視する。PaceMan の表記ゆれに巻き込まれないため。
   */
  favorites: readonly string[];
  /** スプリットタイムの傾き（度）。0 で水平。 */
  textRotateDeg: number;
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  pages: { run: true, home: true, playerRuns: true },
  iconSet: 'paceman-stats',
  digitFont: 'minecraft',
  showContext: false,
  contextMarker: 'icon',
  showPlayers: true,
  homeSort: 'page',
  favorites: [],
  textRotateDeg: 32,
};

const KEY = 'settings';

/**
 * 知っているページだけ拾う。真偽値でない値と、もう使っていないキー
 * （プロフィールの ON/OFF を持っていた頃の残り）を落とす。
 */
const mergePages = (stored: unknown): Settings['pages'] => {
  const pages = { ...DEFAULT_SETTINGS.pages };
  if (typeof stored !== 'object' || stored === null) return pages;
  const s = stored as Record<string, unknown>;
  for (const kind of Object.keys(pages) as TogglablePage[]) {
    if (typeof s[kind] === 'boolean') pages[kind] = s[kind];
  }
  return pages;
};

const merge = (stored: unknown): Settings => {
  if (typeof stored !== 'object' || stored === null) return DEFAULT_SETTINGS;
  const s = stored as Partial<Settings>;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
    pages: mergePages(s.pages),
    iconSet: ICON_SETS.includes(s.iconSet as IconSetId)
      ? (s.iconSet as IconSetId)
      : DEFAULT_SETTINGS.iconSet,
    digitFont:
      s.digitFont === 'minecraft' || s.digitFont === 'default'
        ? s.digitFont
        : DEFAULT_SETTINGS.digitFont,
    showContext: typeof s.showContext === 'boolean' ? s.showContext : DEFAULT_SETTINGS.showContext,
    contextMarker: CONTEXT_MARKERS.includes(s.contextMarker as ContextMarker)
      ? (s.contextMarker as ContextMarker)
      : DEFAULT_SETTINGS.contextMarker,
    showPlayers: typeof s.showPlayers === 'boolean' ? s.showPlayers : DEFAULT_SETTINGS.showPlayers,
    homeSort: HOME_SORTS.includes(s.homeSort as HomeSort)
      ? (s.homeSort as HomeSort)
      : DEFAULT_SETTINGS.homeSort,
    favorites: Array.isArray(s.favorites)
      ? s.favorites.filter((n): n is string => typeof n === 'string' && n !== '')
      : DEFAULT_SETTINGS.favorites,
    textRotateDeg:
      typeof s.textRotateDeg === 'number' ? s.textRotateDeg : DEFAULT_SETTINGS.textRotateDeg,
  };
};

export const loadSettings = async (): Promise<Settings> => {
  try {
    const got = await chrome.storage.sync.get(KEY);
    return merge(got[KEY]);
  } catch {
    // storage が使えなくても描画は続ける
    return DEFAULT_SETTINGS;
  }
};

/** そのページに出すかどうか。全体スイッチとページごとの設定の両方を見る。 */
export const isPageEnabled = (settings: Settings, kind: PageKind): boolean => {
  if (!settings.enabled) return false;
  return kind === 'player' ? true : settings.pages[kind];
};

export const saveSettings = (settings: Settings): Promise<void> =>
  chrome.storage.sync.set({ [KEY]: settings });

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export const isFavorite = (favorites: readonly string[], name: string | null): boolean =>
  name !== null && favorites.some((f) => sameName(f, name));

/** 入れ替えた配列を返す。追加は末尾で、登録した順に並ぶ。 */
export const withFavorite = (
  favorites: readonly string[],
  name: string,
  on: boolean,
): string[] => {
  const rest = favorites.filter((f) => !sameName(f, name));
  return on ? [...rest, name] : rest;
};

/**
 * お気に入りだけを保存する。読んでから書くので、設定画面で別の項目を触っていても
 * そちらを巻き戻さない。
 */
export const saveFavorites = async (favorites: readonly string[]): Promise<void> => {
  const current = await loadSettings();
  await saveSettings({ ...current, favorites });
};

/** 設定変更の購読。オプション画面での変更を開いているタブに反映する。 */
export const onSettingsChanged = (cb: (s: Settings) => void): (() => void) => {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area === 'sync' && changes[KEY]) cb(merge(changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
};
