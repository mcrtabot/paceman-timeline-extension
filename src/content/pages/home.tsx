/**
 * トップの Active Pace 一覧。
 *
 * 行には触らない。毎秒 index キーで貼り替えられ、data-* も安定 ID も無いので、
 * 列を差し込む方式は React の再調整と噛み合わない。本家の行を隠して、
 * TIMELINE 列を足した表を丸ごと自前で描く。カードのヘッダは本家のものが上に残る。
 *
 * データは liveruns の横取り。ページ側のフィルタが効いたものがそのまま来る。
 * 届くまでは本家の表示を残す。
 */

import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fromLiveRuns, frontierIgt } from '../../adapters/liveruns.js';
import { fromPlayers } from '../../adapters/players.js';
import { AssetProvider } from '../../react/AssetContext.js';
import { headUrl } from '../../react/head.js';
import { LiveTable } from '../../react/LiveTable.js';
import { PlayerStrip } from '../../react/PlayerStrip.js';
import type { TimelineProps } from '../../react/Timeline.js';
import { useNow } from '../../react/useNow.js';
import {
  type HomeSort,
  isFavorite,
  passesFilter,
  sameName,
  saveFavorites,
  type Settings,
  withName,
} from '../../settings.js';
import { estimateIgt, type LiveAnchor, nextAnchor } from '../../timeline/live.js';
import { resolveScale } from '../../timeline/scale.js';
import type { RunTimeline, Scale } from '../../timeline/types.js';
import { isResolvedRef } from '../../timeline/theme/types.js';
import { themeFromSettings } from '../theme.js';
import type { PageControl } from '../mount.js';
import { subscribeTee } from '../tee/subscribe.js';

const asset = (ref: string) =>
  isResolvedRef(ref) ? ref : chrome.runtime.getURL(`assets/${ref}`);

/**
 * 表の並び順。settings.ts の HOME_SORTS で選ぶ。
 *
 * page は本家が返した順のまま。elapsed は現在タイムの長い順で、到達スプリットは見ない。
 * スプリットを第一基準にすると、誰かが着いた瞬間にその行が段をまたいで飛ぶ。
 * 時間だけなら進行中のランは全員同じ速さで進むので順位が動かない。
 * 短い順にしないのは、走り始めたばかりのランが先頭を占めるから。
 */
export const sortRuns = (
  runs: readonly RunTimeline[],
  mode: HomeSort,
  igtOf: (run: RunTimeline) => number = frontierIgt,
  favorites: readonly string[] = [],
): RunTimeline[] => {
  const ordered =
    mode === 'elapsed' ? [...runs].sort((a, b) => igtOf(b) - igtOf(a)) : [...runs];
  if (favorites.length === 0) return ordered;
  // お気に入りだけ前に出す。その中の並びは選んだ順序のまま
  const fav = ordered.filter((r) => isFavorite(favorites, r.nickname));
  return fav.length === 0
    ? ordered
    : [...fav, ...ordered.filter((r) => !isFavorite(favorites, r.nickname))];
};

/**
 * まだ Pace に載っていない人の行。合成 overworld:0 だけを持つ、何も踏んでいないラン。
 *
 * バーは空のまま（getTimelineLineItems は endIgt が 0 だと何も返さない）で、
 * 先端マーカーも出ない（アンカーを張るのは liveruns から届いたランだけ）。
 * 出せるのは名前と顔だけだが、配信では「まだ走り出していない」がそのまま読める。
 */
const waitingRun = (nickname: string): RunTimeline => ({
  source: 'liveruns',
  worldId: null,
  runId: null,
  nickname,
  uuid: null,
  gameVersion: null,
  items: [{ type: 'overworld', igt: 0 }],
  rtaByType: {},
  context: [],
  final: null,
  isLive: false,
  lastUpdated: null,
  twitch: null,
  vodId: null,
  vodOffset: null,
  numLeaves: null,
});

const LivePanel = ({ settings, page }: { settings: Settings; page?: PageControl }) => {
  const [runs, setRuns] = useState<RunTimeline[]>([]);
  // ラン 1 本ごとの「いつ・どこまで進んでいたか」。baseIgt が進んだときだけ張り直す
  const anchors = useRef(new Map<string, LiveAnchor>());
  const now = useNow();
  const [players, setPlayers] = useState<readonly string[]>([]);
  /*
   * お気に入りは自分の state で持つ。storage の書き込みを待って描き直すと
   * 星を押してから反映まで一拍あくし、content/index.tsx は貼り直しを見送るので
   * ここが更新されない限り画面が動かない。
   */
  const [favorites, setFavorites] = useState<readonly string[]>(settings.favorites);
  const toggleFavorite = (name: string, on: boolean) => {
    const next = withName(favorites, name, on);
    setFavorites(next);
    void saveFavorites(next);
  };

  useEffect(
    () =>
      subscribeTee({
        kind: 'players',
        onPayload: (payload) => setPlayers(fromPlayers(payload)),
      }),
    [],
  );

  useEffect(
    () =>
      subscribeTee({
        kind: 'liveruns',
        onPayload: (payload, at) => {
          // 並べ替えは描画時。現在タイムを使うので受信時点では決められない。
          // at はページが受け取った時刻。ここを Date.now() にすると、
          // 再生された古い応答のぶんだけ全行のタイムが進みすぎる。
          const next = fromLiveRuns(payload);
          const live = new Map<string, LiveAnchor>();
          for (const run of next) {
            const key = run.worldId ?? run.nickname ?? '';
            const prev = anchors.current.get(key);
            live.set(key, nextAnchor(prev, run, at));
          }
          // 一覧から消えたランのアンカーは捨てる
          anchors.current = live;
          setRuns(next);
        },
      }),
    [],
  );

  /** 行ごとの先端マーカー。分母の計算にも使うので先に作る。 */
  const markerOf = (run: RunTimeline): TimelineProps['marker'] => {
    const common = { faceSrc: headUrl(run), label: run.nickname ?? undefined };
    // 完走したランは finish で止める
    if (run.final !== null) return { igt: run.final.igt, walking: false, ...common };
    const anchor = anchors.current.get(run.worldId ?? run.nickname ?? '');
    if (!anchor) return undefined;
    return { igt: estimateIgt(anchor, now), walking: true, ...common };
  };

  /*
   * スケールは行ごとに決める。共有の分母にすると先頭のランに引きずられて
   * 短いランが潰れ、1:57 のランが列の 9% になった。
   *
   * 15 分までは伸縮させない。15 分以内のランどうしが同じ縮尺になり、
   * 行をまたいで見比べられる。超えたぶんは 3 分刻みで伸ばす。
   *
   * 先端の顔とタイムは分母ではなく padding-right で受ける
   * （.ptc-table__timeline .mcsr-indicator）。分母で受けると 14 分のランが
   * 18 分の縮尺になり、15 分の下限が崩れる。
   *
   * isComplete は渡さない。渡すと finish ぴったりが分母になって、
   * 9 分の完走だけ縮尺が変わる。
   */
  const igtOf = (run: RunTimeline): number => markerOf(run)?.igt ?? frontierIgt(run);
  /*
   * 配信モードの絞り込み。名前を挙げていなければ素通しなので、
   * stream が ON でもリストが空のあいだは今までどおり全員出る。
   */
  const stream = settings.stream;
  const only = stream.enabled ? stream.onlyPlayers : [];
  const shown = runs.filter((r) => passesFilter(only, r.nickname));
  const sorted = sortRuns(shown, settings.homeSort, igtOf, favorites);
  /** 指名した名前で今出ているランを引く。 */
  const runOf = (name: string): RunTimeline | undefined =>
    shown.find((r) => r.nickname !== null && sameName(r.nickname, name));

  /*
   * 配信モードの行。
   *
   * keepRow    … 指名したのに Pace に載っていない人を 0:00 の行で埋める。
   *              走り出す前から行の高さと位置が決まるので、載せたまま待てる
   * fixedOrder … 並びを指名した順に固定する。タイムでも到達スプリットでも動かない。
   *              名前を挙げていないと基準が無いので、そのときは普段の並びのまま
   */
  const streamRows = (): RunTimeline[] => {
    const waiting = stream.keepRow
      ? only.filter((name) => runOf(name) === undefined)
      : [];
    if (!stream.fixedOrder || only.length === 0) {
      return waiting.length === 0 ? sorted : [...sorted, ...waiting.map(waitingRun)];
    }
    const listed = only
      .map((name) => runOf(name) ?? (stream.keepRow ? waitingRun(name) : undefined))
      .filter((r): r is RunTimeline => r !== undefined);
    // 名前を挙げていない人は絞り込みで既に落ちているが、絞り込みが空のときのために残す
    const rest = sorted.filter(
      (r) => !only.some((n) => r.nickname !== null && sameName(n, r.nickname)),
    );
    return [...listed, ...rest];
  };

  const rows = stream.enabled ? streamRows() : sorted;

  const ROW_MIN_MS = 15 * 60_000;
  const scaleOf = (run: RunTimeline): Scale => ({
    mode: 'reference',
    refMs: resolveScale(
      { mode: 'fit', minMs: ROW_MIN_MS },
      igtOf(run),
      false,
    ).denominatorMs,
  });

  const statsHref = (name: string) => `/stats/player/${encodeURIComponent(name)}/`;

  /*
   * 出せる表があるときだけ本家の行を隠す。ランが 0 本のときや横取りが届く前に
   * 隠すと、本家を消したまま自分も何も出せない状態になる。
   *
   * 配信モードだけは 0 本でも居座る。ここで本家に戻すと、絞り込んだ人が走って
   * いないあいだだけ本家の一覧が画面に出てくる。
   */
  const hasRuns = rows.length > 0 || stream.enabled;
  useEffect(() => {
    page?.setReplacing(hasRuns);
  }, [page, hasRuns]);

  return (
    <>
      {(stream.enabled ? stream.showPlayers : settings.showPlayers) && (
        <PlayerStrip
          players={players.filter((n) => passesFilter(only, n))}
          playerHref={statsHref}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          bare={stream.enabled && stream.bare}
        />
      )}
      {hasRuns && (
        <LiveTable
          runs={rows}
          theme={themeFromSettings(settings)}
          scaleOf={scaleOf}
          headUrlOf={headUrl}
          markerOf={markerOf}
          runHref={(run) => (run.worldId ? `/stats/run/${run.worldId}/` : undefined)}
          playerHref={(run) => (run.nickname ? statsHref(run.nickname) : undefined)}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          {...(stream.enabled
            ? {
                columns: stream.columns,
                showHeader: stream.showHeader,
                bare: stream.bare,
                textColor: stream.textColor,
                // 走っている人が居ないときに文言だけ残らないように
                emptyText: '',
              }
            : {})}
        />
      )}
    </>
  );
};

export const renderHome = (
  root: ShadowRoot,
  settings: Settings,
  page?: PageControl,
): (() => void) => {
  const container = document.createElement('div');
  root.appendChild(container);
  const reactRoot: Root = createRoot(container);
  reactRoot.render(
    <AssetProvider value={asset}>
      <LivePanel settings={settings} {...(page ? { page } : {})} />
    </AssetProvider>,
  );
  return () => reactRoot.unmount();
};
