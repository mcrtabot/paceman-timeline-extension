/**
 * /stats/player/<nick>/runs/ のラン履歴。
 *
 * 行には差し込まず、グリッドの上に自前パネルを置いて同じランを積む。px/分 固定なので、
 * どのランがどこで詰まったかが横位置で揃う。
 *
 * データはページが叩いた getPlayerRuns の横取り。自前で取ると今どのページ・どの並び順・
 * どのフィルタを見ているかを MUI の状態から読み直すことになり、そちらの方が壊れやすい。
 */

import { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { frontierIgt } from '../../adapters/liveruns.js';
import { fromPlayerRuns } from '../../adapters/playerRuns.js';
import { AssetProvider } from '../../react/AssetContext.js';
import { RunList } from '../../react/RunList.js';
import type { Settings } from '../../settings.js';
import { sharedDenominatorMs } from '../../timeline/scale.js';
import { convertMillisecondsToTime } from '../../timeline/time.js';
import type { RunTimeline } from '../../timeline/types.js';
import { isResolvedRef } from '../../timeline/theme/types.js';
import { defaultTheme } from '../../timeline/theme/default.js';
import { themeFromSettings } from '../theme.js';
import { subscribeTee } from '../tee/subscribe.js';

const asset = (ref: string) =>
  isResolvedRef(ref) ? ref : chrome.runtime.getURL(`assets/${ref}`);

export const nickFromPath = (pathname: string): string | null =>
  pathname.match(/^\/(?:stats\/)?player\/([^/]+)\/runs\/?$/)?.[1] ?? null;

/** 行の見出し。完走かどうかは RunList のバッジと枠色が出すので、ここでは繰り返さない。 */
const rowLabel = (run: RunTimeline): string => {
  const when = run.lastUpdated ? new Date(run.lastUpdated).toLocaleDateString() : '';
  if (run.final !== null) return when;

  const last = run.items[run.items.length - 1];
  if (!last || last.type === 'overworld') return `${when} — reset`.trim();
  // 内部名ではなく表示名を出す
  const reached = defaultTheme.labels[last.type] ?? last.type;
  return `${when} — ${reached} ${convertMillisecondsToTime(last.igt)}`.trim();
};

const HistoryPanel = ({ settings, nick }: { settings: Settings; nick: string }) => {
  const [runs, setRuns] = useState<RunTimeline[]>([]);

  useEffect(
    () =>
      subscribeTee({
        kind: 'playerRuns',
        // 自前取得はしない。ページのクエリ条件を再現できない
        onPayload: (payload) => setRuns(fromPlayerRuns(payload, { uuid: null, nickname: nick })),
      }),
    [nick],
  );

  /*
   * 表示中で最も遅い完走を 100% にする。履歴は行が静的なので、px/分 固定より
   * 全部を並べて見比べる方が読みやすい。
   *
   * 未完走は分母に入れない。完走せずに走り続けたランは長さがいくらでも伸びる。
   * 分母を超えたぶんははみ出して横スクロールになるが、潰れるよりはいい。
   * 完走が 1 本も無いページでは到達点の最大に落とす。
   */
  const finished = runs.filter((r) => r.final !== null).map((r) => r.final?.igt ?? 0);
  const denominatorMs = sharedDenominatorMs(
    finished.length > 0 ? finished : runs.map(frontierIgt),
  );

  return (
    <RunList
      title={`${nick} — Timeline (${runs.length})${
        runs.length > 0 ? ` · full width = ${convertMillisecondsToTime(denominatorMs)}` : ''
      }`}
      runs={runs}
      theme={themeFromSettings(settings)}
      scale={{ mode: 'reference', refMs: denominatorMs }}
      labelOf={rowLabel}
      emptyText="Runs appear here once the page loads them"
      runHref={(run) => (run.runId !== null ? `/stats/run/${run.runId}/` : undefined)}
    />
  );
};

export const renderPlayerRuns = (
  root: ShadowRoot,
  settings: Settings,
  nick: string,
): (() => void) => {
  const container = document.createElement('div');
  root.appendChild(container);
  const reactRoot: Root = createRoot(container);
  reactRoot.render(
    <AssetProvider value={asset}>
      <HistoryPanel settings={settings} nick={nick} />
    </AssetProvider>,
  );
  return () => reactRoot.unmount();
};
