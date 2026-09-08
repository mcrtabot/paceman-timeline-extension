/**
 * トップの Active Pace を、TIMELINE 列を足した自前の表として描く。
 * 本家の行は毎秒 index キーで貼り替わるので、列を差し込まずに行ごと描いて元は隠す。
 *
 * データはページのリクエストの横取りで、届いた時点で絞り込まれている。
 * ヘッダのバージョンフィルタもそのまま効く。
 */

import { useState } from 'react';
import { frontierIgt } from '../adapters/liveruns.js';
import { isFavorite, TABLE_COLUMNS, type TableColumn } from '../settings.js';
import { FavoriteStar } from './FavoriteStar.js';
import { useAsset } from './AssetContext.js';
import { SmallIcon, spriteStyleOf } from './SmallIcon.js';
import type { Theme } from '../timeline/theme/types.js';
import { convertMillisecondsToTime } from '../timeline/time.js';
import type { EventType, RunTimeline, Scale } from '../timeline/types.js';
import { Timeline, type TimelineProps } from './Timeline.js';

/*
 * この列だけ .ptc-table__timeline の負マージンで行の上下 padding に食い込ませ、
 * バーとアイコンを大きく取っている。
 *   アイコン 22px・中心 -22px → 上端 -33px
 *   バー 14px                → 下端 +7px
 * 余白込みの高さは .ptc-table__timeline .mcsr-indicator の padding を参照。
 */
const TABLE_TOKENS: Readonly<Record<string, string>> = {
  '--ptc-display-pace-text': 'none',
  '--ptc-icon-size': '22px',
  '--ptc-icon-offset': '-22px',
  '--ptc-line-size': '14px',
  '--ptc-dot-size': '6px',
  '--ptc-context-icon-size': '16px',
  '--ptc-face-size': '24px',
  '--ptc-face-time-font': 'normal normal 15px/1 var(--ptc-digits-family)',
};

export type LiveTableProps = {
  runs: readonly RunTimeline[];
  theme: Theme;
  /**
   * 行ごとのスケール。共有の分母にすると先頭のランに引きずられて短いランが潰れ、
   * 1:57 のランが列の 9% になった。行ごとなら短いランも読める大きさになる。
   * 同じ時刻が同じ横位置に来る性質は失うが、TIME 列とアイコンで読み取れる。
   */
  scaleOf: (run: RunTimeline) => Scale;
  headUrlOf: (run: RunTimeline) => string | undefined;
  markerOf?: (run: RunTimeline) => TimelineProps['marker'];
  /*
   * 遷移先は href で受ける。onClick で window.location を叩くと Cmd/Ctrl+クリックも
   * 中クリックも効かず、新しいタブで開けない。
   */
  /** タイムライン列のリンク先。個別ランページ。 */
  runHref?: (run: RunTimeline) => string | undefined;
  /** 頭アイコンのリンク先。プレイヤーの stats ページ。 */
  playerHref?: (run: RunTimeline) => string | undefined;
  emptyText?: string;
  /*
   * ここから下は配信モード用。既定は今までどおりの見た目で、settings.stream が
   * OFF のあいだは呼び出し側が何も渡さない。
   */
  /** 出す列。既定は全部。 */
  columns?: Readonly<Record<TableColumn, boolean>>;
  /** 見出し行。既定は出す。 */
  showHeader?: boolean;
  /** 枠線と背景を落として中身だけにする。 */
  bare?: boolean;
  /** 文字色。空ならスタイルシートのまま。バーの先端のタイムにも同じ色を渡す。 */
  textColor?: string;
  favorites?: readonly string[];
  /** 渡すと Player 列に星が出る。 */
  onToggleFavorite?: (name: string, on: boolean) => void;
};

/** 既定は全部出す。配信モードのときだけ呼び出し側が絞る。 */
const ALL_COLUMNS: Readonly<Record<TableColumn, boolean>> = {
  player: true,
  split: true,
  version: true,
  time: true,
  timeline: true,
};

/** 最後に到達したスプリット。完走なら credits。 */
const lastSplit = (run: RunTimeline): { type: EventType; igt: number } | null => {
  const last = run.items[run.items.length - 1];
  return last && last.type !== 'overworld' ? last : null;
};

export const LiveTable = ({
  runs,
  theme,
  scaleOf,
  headUrlOf,
  markerOf,
  runHref,
  playerHref,
  emptyText = 'No runs in progress',
  columns = ALL_COLUMNS,
  showHeader = true,
  bare = false,
  textColor = '',
  favorites = [],
  onToggleFavorite,
}: LiveTableProps) => {
  const asset = useAsset();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const show = (column: TableColumn): boolean => columns[column];
  const visible = TABLE_COLUMNS.filter(show);

  /* 表の TIME 列などもテーマの数字フォントに従わせる */
  const rootStyle = {
    '--ptc-digits-family': theme.tokens['--ptc-digits-family'],
    /*
     * 列を減らしたときだけ組み直す。幅そのものは timeline.css の --ptc-col-* に
     * 置いてあるので、ここでは並べ直すだけで済む（行と展開したスプリット一覧が
     * 同じ変数を見るので、両方まとめてずれない）。
     */
    ...(visible.length === TABLE_COLUMNS.length
      ? {}
      : { '--ptc-table-columns': visible.map((c) => `var(--ptc-col-${c})`).join(' ') }),
    ...(textColor ? { color: textColor } : {}),
  } as React.CSSProperties;

  // 先端のタイムはタイムライン側のトークンで色が決まる。表の文字色に合わせる
  const tokens = textColor
    ? { ...TABLE_TOKENS, '--ptc-text-color': textColor }
    : TABLE_TOKENS;

  return (
  <div className={`ptc-table${bare ? ' ptc-table--bare' : ''}`} style={rootStyle}>
    {showHeader && (
      <div className="ptc-table__row ptc-table__row--head">
        {show('player') && <div>Player</div>}
        {show('split') && <div>Split</div>}
        {show('version') && <div>Version</div>}
        {show('time') && <div>Time</div>}
        {show('timeline') && <div>Timeline</div>}
      </div>
    )}

    {/* 空の文言は配信モードでは邪魔になるので、空文字を渡せば何も出さない */}
    {runs.length === 0 && emptyText !== '' && (
      <div className="ptc-table__empty">{emptyText}</div>
    )}

    {runs.map((run) => {
      const key = run.worldId ?? String(run.runId ?? run.nickname);
      const split = lastSplit(run);
      const completed = run.final !== null;
      const head = headUrlOf(run);
      const iconOf = (type: EventType) => spriteStyleOf(theme.icons[type], asset);
      const splitIcon = split ? iconOf(split.type) : undefined;
      const splits = run.items.filter((i) => i.type !== 'overworld');
      const isOpen = expanded.has(key);
      const runLink = runHref?.(run);
      const playerLink = playerHref?.(run);
      const fav = isFavorite(favorites, run.nickname);
      // リンクが無いときはグリッドのセルを崩さないよう div のまま置く
      const Cell = (runLink ? 'a' : 'div') as 'a';

      return (
        <div key={key} className="ptc-table__group">
          <div
            className={[
              'ptc-table__row',
              completed ? 'ptc-table__row--completed' : '',
              fav ? 'ptc-table__row--fav' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {show('player') && (
              <div className="ptc-table__player">
                {onToggleFavorite && run.nickname && (
                  <FavoriteStar name={run.nickname} on={fav} onToggle={onToggleFavorite} />
                )}
                {head &&
                  (playerLink ? (
                    <a
                      className="ptc-table__head-link"
                      href={playerLink}
                      aria-label={`View stats for ${run.nickname ?? 'player'}`}
                    >
                      <img className="ptc-table__head" src={head} alt="" />
                    </a>
                  ) : (
                    <img className="ptc-table__head" src={head} alt="" />
                  ))}
                {/* liveAccount は配信中のときだけ入る。本家も配信中だけ名前をリンクにしている。 */}
                {run.twitch ? (
                  <a
                    className="ptc-table__name ptc-table__name--live"
                    href={`https://twitch.tv/${encodeURIComponent(run.twitch)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {run.nickname ?? '—'}
                  </a>
                ) : (
                  <span className="ptc-table__name">{run.nickname ?? '—'}</span>
                )}
              </div>
            )}

            {show('split') && (
              <div className="ptc-table__split">
                {splitIcon && (
                  <SmallIcon
                    className="ptc-table__split-icon"
                    icon={splitIcon}
                    outlined={split ? (theme.outlinedIcons?.has(split.type) ?? false) : false}
                  />
                )}
                <span>{split ? (theme.labels[split.type] ?? split.type) : '—'}</span>
              </div>
            )}

            {show('version') && (
              <div className="ptc-table__version">{run.gameVersion ?? '—'}</div>
            )}

            {show('time') && (
              <button
                type="button"
                className="ptc-table__time"
                aria-expanded={isOpen}
                disabled={splits.length === 0}
                onClick={() => toggle(key)}
              >
                {convertMillisecondsToTime(split?.igt ?? frontierIgt(run))}
                {splits.length > 0 && (
                  <span className={`ptc-table__chevron${isOpen ? ' ptc-table__chevron--open' : ''}`}>
                    ▾
                  </span>
                )}
              </button>
            )}

            {/* 個別ランページは新しいタブで開く。一覧を見失わずに戻れる方が使いやすい */}
            {show('timeline') && (
              <Cell
                className={`ptc-table__timeline${runLink ? ' ptc-table__timeline--clickable' : ''}`}
                {...(runLink
                  ? { href: runLink, target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <Timeline
                  run={run}
                  theme={theme}
                  scale={scaleOf(run)}
                  tokens={tokens}
                  marker={markerOf?.(run)}
                />
              </Cell>
            )}
          </div>

          {isOpen && (
            <div
              className={`ptc-table__splits${completed ? ' ptc-table__row--completed' : ''}`}
            >
              {/*
                * 行と同じ列構成を共有するので、スプリット名は SPLIT 列に、
                * タイムは TIME 列にそのまま揃う。
                */}
              {splits.map((item) => {
                const src = iconOf(item.type);
                return (
                  <div className="ptc-table__splits-row" key={item.type}>
                    {show('player') && <div />}
                    {show('split') && (
                      <div className="ptc-table__splits-name">
                        {src && (
                          <SmallIcon
                            className="ptc-table__splits-icon"
                            icon={src}
                            outlined={theme.outlinedIcons?.has(item.type) ?? false}
                          />
                        )}
                        <span>{theme.labels[item.type] ?? item.type}</span>
                      </div>
                    )}
                    {show('version') && <div />}
                    {show('time') && (
                      <div className="ptc-table__splits-time">
                        {convertMillisecondsToTime(item.igt)}
                      </div>
                    )}
                    {show('timeline') && <div />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    })}
  </div>
  );
};
