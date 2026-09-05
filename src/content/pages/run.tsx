/**
 * /stats/run/<id> の個別ランページ。
 *
 * データは DOM から読まない。表示されている時刻は表示フォーマットであってデータではない。
 *
 * 進行中かどうかで経路が分かれる:
 *   完走・中断済み … getWorld を 1 回だけ。以後変わらないのでポーリングしない
 *   進行中         … liveruns を数秒ごとに取り直し、**マージせずそれだけで描く**
 *
 * ライブ中に getWorld と混ぜないのは、両者がスプリットの時刻を 1 秒ずれて返すことが
 * あるため。normalizeItems は型ごとに早い方を残すので、混ぜると enter_stronghold が
 * second_portal と同時刻に寄り、アイコンが完全に重なって片方が見えなくなる。
 * liveruns は getWorld の列をすべて含んだうえに second_portal と context も持つので、
 * 進行中に限れば単体で足りる（getWorld にしか無い runId / twitch / vod* は
 * このページの描画に使っていない。VOD シークは本家のカードへクリックを転送している）。
 */

import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fromGetWorld } from '../../adapters/getWorld.js';
import { imageBuilderUrl } from '../../adapters/imageBuilder.js';
import { fromLiveRuns } from '../../adapters/liveruns.js';
import { findLiveByWorldId } from '../../adapters/merge.js';
import { getLiveRuns, getWorld } from '../../net/client.js';
import { AssetProvider } from '../../react/AssetContext.js';
import { headUrl } from '../../react/head.js';
import { Timeline, type TimelineProps } from '../../react/Timeline.js';
import { useNow } from '../../react/useNow.js';
import type { Settings } from '../../settings.js';
import { baseIgtOf, estimateIgt, type LiveAnchor, nextAnchor } from '../../timeline/live.js';
import type { RunTimeline } from '../../timeline/types.js';
import { isResolvedRef } from '../../timeline/theme/types.js';
import { themeFromSettings } from '../theme.js';
import { forwardSplitClick } from '../vod.js';

const asset = (ref: string) =>
  isResolvedRef(ref) ? ref : chrome.runtime.getURL(`assets/${ref}`);

/** 本家のカードと同じ間隔。liveruns は TTL 3 秒で持つので実リクエストはこれ以上増えない。 */
const POLL_MS = 3_000;

/*
 * 幅の上限。挿し場所の div.col-12 は container いっぱい（大きい画面で 1320px）まで
 * 広がるが、下にある本家の run-card は 580px を scale(.75) した約 441px しかない。
 * 全幅で描くとカードの 3 倍の帯になって浮くので、間を取って抑える。
 *
 * カードちょうどまで詰めると、40px のアイコン 8 個が 44px 間隔になって重なる。
 * この幅なら間隔は 90px 以上あく。
 */
const RUN_PAGE_MAX_WIDTH = '960px';

const RUN_PAGE_TOKENS: Readonly<Record<string, string>> = {
  '--ptc-max-width': RUN_PAGE_MAX_WIDTH,
};

/** /stats/run/<id>/ と /run/<id>/ の両方から id を取る。 */
export const runIdFromPath = (pathname: string): string | null =>
  pathname.match(/^\/(?:stats\/)?run\/([^/]+)\/?$/)?.[1] ?? null;

export const loadRun = async (runId: string): Promise<RunTimeline | null> => {
  // 完走済みかは取るまで分からないので、まずライブ想定の短い TTL で引く
  const base = fromGetWorld(await getWorld(runId, true));
  if (!base) return null;
  if (!base.isLive) return base;

  try {
    // 進行中なら liveruns の方が細かい。混ぜずに差し替える（冒頭のコメント参照）
    const live = findLiveByWorldId(fromLiveRuns(await getLiveRuns()), base.worldId);
    return live ?? base;
  } catch {
    // liveruns が取れなくても getWorld 単体で描ける
    return base;
  }
};

type LiveState = { run: RunTimeline; anchor: LiveAnchor | undefined };

const initialState = (run: RunTimeline): LiveState => ({
  run,
  anchor: run.isLive ? nextAnchor(undefined, run, Date.now()) : undefined,
});

/**
 * 進行中のあいだ liveruns を取り直す。
 *
 * liveruns から消えたら走り終わったか走者が落ちたということなので、getWorld を
 * 1 回取り直して確定状態に落とし、そこでポーリングを止める。credits を見る前に
 * リストから落ちるランは実在するので、消えた=完走とは決めつけない。
 *
 * タブが見えていないあいだは取りに行かない（見えない画面のために PaceMan を叩かない）。
 * タイマーは回したままにして、戻ってきたら次の tick で追いつく。
 */
const useLiveRun = (initial: RunTimeline): LiveState => {
  const [state, setState] = useState<LiveState>(() => initialState(initial));

  useEffect(() => {
    const worldId = initial.worldId;
    if (!initial.isLive || !worldId) return;

    let stopped = false;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(tick, POLL_MS);
    };

    const settle = async (): Promise<void> => {
      /*
       * 完走扱いの長い TTL では引かない。ここで確定でない応答を掴むと
       * 24 時間そのまま返り続ける。
       */
      const done = fromGetWorld(await getWorld(worldId, true));
      if (stopped || !done) return schedule();
      setState({ run: done, anchor: undefined });
      // まだ進行中と言われたら（リストから一時的に落ちただけ）続ける
      if (done.isLive) return schedule();
      stopped = true;
    };

    const tick = async (): Promise<void> => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return schedule();

      try {
        const at = Date.now();
        const live = findLiveByWorldId(fromLiveRuns(await getLiveRuns()), worldId);
        if (stopped) return;
        if (!live) return settle();

        setState((prev) => ({
          run: live,
          anchor: nextAnchor(prev.anchor, live, at),
        }));
        schedule();
      } catch {
        // 一時的な失敗ではあきらめない。次の tick で取り直す
        schedule();
      }
    };

    schedule();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [initial]);

  return state;
};

/**
 * 先端マーカー。
 *
 * 進行中なら走者の頭が現在位置を歩き、その右に現在時刻が出る。
 * 進行中でない未完走のラン、つまり諦めたランは、到達点の先に ... を引いて
 * 色を落とした顔と RESET を置く。ここで終わったことが分かる。
 *
 * 位置は context も含めた到達点。スプリットを踏んだあと溶岩バケツまで取って
 * やめたランは、そこまで走った時間で止まる。そこから先どこまで走ったかは
 * PaceMan が記録していないので分からない（getWorld の updateTime は
 * 最後のイベントの時刻に張り付いていて、諦めた時刻ではない）。
 *
 * 完走したランには出さない。finish が右端に来て、そのタイムがすぐ下に並ぶので、
 * 同じ時刻をもう一度置く意味が無い。
 */
const markerOf = (
  { run, anchor }: LiveState,
  now: number,
): TimelineProps['marker'] => {
  if (run.final !== null) return undefined;
  const face = { faceSrc: headUrl(run), label: run.nickname ?? undefined };
  if (!run.isLive) return { igt: baseIgtOf(run), walking: false, reset: true, ...face };
  if (!anchor) return undefined;
  return { igt: estimateIgt(anchor, now), walking: true, ...face };
};

const RunTimelinePanel = ({
  run: initial,
  settings,
}: {
  run: RunTimeline;
  settings: Settings;
}) => {
  const theme = themeFromSettings(settings);
  const state = useLiveRun(initial);
  const now = useNow();
  /*
   * 進行中なら踏むたびに増える。作り直しはパラメータを組み直すだけなので毎描画でいい。
   * 押した時点のスプリットが入った URL になる。
   */
  const builderUrl = imageBuilderUrl(state.run);

  return (
    <>
      <Timeline
        run={state.run}
        theme={theme}
        // 1 本しか出さないので px/分 固定の意味が無い。収まりを優先して幅いっぱいに
        scale={{ mode: 'fit' }}
        tokens={RUN_PAGE_TOKENS}
        marker={markerOf(state, now)}
        onSplitClick={(type) => forwardSplitClick(type)}
      />
      {builderUrl && (
        <div className="ptc-actions" style={{ maxWidth: RUN_PAGE_MAX_WIDTH }}>
          <a className="ptc-action" href={builderUrl} target="_blank" rel="noreferrer">
            Image Builder ↗
          </a>
        </div>
      )}
    </>
  );
};

export const renderRun = (
  root: ShadowRoot,
  run: RunTimeline,
  settings: Settings,
): (() => void) => {
  const container = document.createElement('div');
  root.appendChild(container);
  const reactRoot: Root = createRoot(container);

  reactRoot.render(
    <AssetProvider value={asset}>
      <RunTimelinePanel run={run} settings={settings} />
    </AssetProvider>,
  );

  return () => reactRoot.unmount();
};
