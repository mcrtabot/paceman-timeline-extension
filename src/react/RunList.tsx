/**
 * 複数ランを縦に積む表示。Active Pace 一覧とラン履歴で共用する。
 * px/分 固定なので、行をまたいで同じ時刻が同じ横位置に来る。自己正規化だとこうならない。
 */

import type { Theme } from '../timeline/theme/types.js';
import { convertMillisecondsToTime } from '../timeline/time.js';
import type { RunTimeline, Scale } from '../timeline/types.js';
import { Timeline, type TimelineProps } from './Timeline.js';

export type RunListProps = {
  title: string;
  runs: readonly RunTimeline[];
  theme: Theme;
  scale: Scale;
  /** 行の見出し。既定はニックネーム。 */
  labelOf?: (run: RunTimeline) => string;
  /** バー先端の走者マーカー。行ごとに変わるので関数で受ける。 */
  markerOf?: (run: RunTimeline) => TimelineProps['marker'];
  /**
   * 行のリンク先。個別ランページ。onClick で window.location を叩くと
   * Cmd/Ctrl+クリックも中クリックも効かないので href で受ける。
   */
  runHref?: (run: RunTimeline) => string | undefined;
  emptyText?: string;
};

const defaultLabel = (run: RunTimeline): string => run.nickname ?? '—';

/**
 * 一覧に積むときの詰めた表示。タイムは畳む。32deg 傾けたテキストは縦に張り出して
 * 次の行に食い込むし、近接スプリットでは文字どうしも重なる（上流も同じ）。
 * 個別の時刻はアイコンのツールチップで読める。
 */
const COMPACT_TOKENS: Readonly<Record<string, string>> = {
  '--ptc-display-pace-text': 'none',
  '--ptc-icon-size': '26px',
  '--ptc-icon-offset': '-28px',
  '--ptc-face-size': '24px',
  '--ptc-face-time-font': 'normal normal 14px/1 var(--ptc-digits-family)',
  '--ptc-line-size': '18px',
  '--ptc-dot-size': '6px',
  '--ptc-context-icon-size': '16px',
};

export const RunList = ({
  title,
  runs,
  theme,
  scale,
  labelOf = defaultLabel,
  markerOf,
  runHref,
  emptyText = 'Nothing to show',
}: RunListProps) => (
  <div
    className="ptc-panel"
    style={{ '--ptc-digits-family': theme.tokens['--ptc-digits-family'] } as React.CSSProperties}
  >
    <div className="ptc-panel__header">{title}</div>
    {runs.length === 0 && <div className="ptc-panel__empty">{emptyText}</div>}
    {runs.map((run) => {
      const key = run.worldId ?? String(run.runId ?? labelOf(run));
      const completed = run.final !== null;
      const link = runHref?.(run);
      const Row = (link ? 'a' : 'div') as 'a';
      return (
        // 個別ランページは新しいタブで開く。一覧を見失わずに戻れる方が使いやすい
        <Row
          className={[
            'ptc-row',
            completed ? 'ptc-row--completed' : '',
            link ? 'ptc-row--clickable' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          key={key}
          {...(link ? { href: link, target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <div className="ptc-row__label">
            <span className="ptc-row__name">{labelOf(run)}</span>
            {completed && (
              <span className="ptc-row__time">
                {convertMillisecondsToTime(run.final?.igt ?? 0)}
              </span>
            )}
          </div>
          <Timeline
            run={run}
            theme={theme}
            scale={scale}
            tokens={COMPACT_TOKENS}
            marker={markerOf?.(run)}
          />
        </Row>
      );
    })}
  </div>
);
