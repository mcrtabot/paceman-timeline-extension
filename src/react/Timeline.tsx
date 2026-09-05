/**
 * MCSRImageBuilder の Indicator.tsx の JSX を、PaceMan の単一ラン向けに移したもの。
 *
 * PB ゴースト行と face マーカーは持たない。.mcsr-indicator__item は relative の
 * 中に絶対配置の子を置くのではなく item 自体を絶対配置にした。単一ランなら等価で
 * DOM が 1 段浅くなる。レイアウト計算は timeline/layout.ts をそのまま呼ぶ。
 */

import React, { useState } from 'react';
import { frontierIgt } from '../adapters/liveruns.js';
import { contextLabel } from '../adapters/paceman.js';
import {
  calcPosition,
  clusterContextItems,
  getTimelineDotItems,
  getTimelineIconItems,
  getTimelineLineItems,
} from '../timeline/layout.js';
import { resolveScale } from '../timeline/scale.js';
import { CONTEXT_ICONS, CONTEXT_OUTLINED, OUTLINE_COLOR } from '../timeline/theme/iconSets.js';
import {
  type AssetRef,
  type IconSource,
  isSpriteRef,
  type Theme,
} from '../timeline/theme/types.js';
import { convertMillisecondsToTime } from '../timeline/time.js';
import type { ContextMarker, EventType, RunTimeline, Scale } from '../timeline/types.js';
import { useAsset } from './AssetContext.js';
import { spriteVars } from './SmallIcon.js';
import { Tip, useTip } from './Tip.js';

const pct = (v: number) => `${v * 100}%`;

/*
 * context のツールチップ。ポータル先は Shadow DOM の外でスタイルシートが届かないので、
 * 見た目はインラインで持つ（Tip.tsx と同じ理由）。
 */
const TIP_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '16px auto auto',
  gap: '3px 8px',
  alignItems: 'center',
};
const TIP_ICON: React.CSSProperties = { width: 16, height: 16, imageRendering: 'pixelated' };
/* ツールチップは Shadow DOM の外なので .ptc-outlined が届かない。同じ指定を直に書く */
const TIP_ICON_OUTLINED: React.CSSProperties = {
  ...TIP_ICON,
  filter: `drop-shadow(1px 0 0 ${OUTLINE_COLOR}) drop-shadow(-1px 0 0 ${OUTLINE_COLOR}) drop-shadow(0 1px 0 ${OUTLINE_COLOR}) drop-shadow(0 -1px 0 ${OUTLINE_COLOR})`,
};
const TIP_TIME: React.CSSProperties = { textAlign: 'right', opacity: 0.85 };

/** 絵の無いキーは 1 列目を空けたまま並べる。行がずれない。 */
const ContextTip = ({ items }: { items: readonly ContextMarker[] }) => {
  const asset = useAsset();
  return (
    <span style={TIP_GRID}>
      {items.map((c) => {
        const icon = CONTEXT_ICONS[c.key];
        return (
          <React.Fragment key={`${c.key}:${c.igt}`}>
            {icon !== undefined ? (
              <img
                style={CONTEXT_OUTLINED.has(c.key) ? TIP_ICON_OUTLINED : TIP_ICON}
                src={asset(icon)}
                alt=""
              />
            ) : (
              <span />
            )}
            <span>{contextLabel(c.key)}</span>
            <span style={TIP_TIME}>{convertMillisecondsToTime(c.igt)}</span>
          </React.Fragment>
        );
      })}
    </span>
  );
};

const refList = (ref: IconSource | undefined): readonly AssetRef[] =>
  ref === undefined || isSpriteRef(ref) ? [] : typeof ref === 'string' ? [ref] : ref;

/**
 * 候補を順に試す。多重 background だと、先頭が読めていても透明部分から後ろが透ける。
 * PaceMan のポータルの後ろに MCSRImageBuilder の黒曜石枠が出た。表示するのは常に 1 枚。
 */
const SplitIcon = ({
  source,
  label,
  time,
  outlined,
  tipProps,
  onClick,
}: {
  source: IconSource | undefined;
  label: string;
  time: string;
  outlined: boolean;
  tipProps: (content: React.ReactNode) => Record<string, unknown>;
  onClick?: (() => void) | undefined;
}) => {
  const asset = useAsset();
  const [index, setIndex] = useState(0);

  const className = `mcsr-indicator__icon${outlined ? ' ptc-outlined' : ''}`;

  // シートは切り出しが要るので背景で描く。サイズはトークン次第なので列と行だけ渡す
  if (source !== undefined && isSpriteRef(source)) {
    return (
      <div
        className={`${className} mcsr-indicator__icon--sprite`}
        aria-label={label}
        {...tipProps(`${label} ${time}`)}
        style={spriteVars(source, asset) as React.CSSProperties}
        {...(onClick ? { role: 'button', tabIndex: 0, onClick } : {})}
      />
    );
  }

  const refs = refList(source);
  if (refs.length === 0) return null;
  const ref = refs[Math.min(index, refs.length - 1)] as AssetRef;

  return (
    <img
      className={className}
      src={asset(ref)}
      alt={label}
      {...tipProps(`${label} ${time}`)}
      onError={() => setIndex((i) => (i + 1 < refs.length ? i + 1 : i))}
      {...(onClick
        ? { role: 'button', tabIndex: 0, onClick }
        : {})}
    />
  );
};

export type TimelineProps = {
  run: RunTimeline;
  theme: Theme;
  scale: Scale;
  /**
   * トークンの上書き。トークンは要素へインラインで載るので CSS 側からは上書きできない。
   * テーマではなく置き場所の都合で変えたいものはここから渡す。
   */
  tokens?: Readonly<Record<string, string>>;
  /**
   * バーの先端に置く走者マーカー。バーはここまで伸びる。
   * 進行中なら timeline/live.ts の推定位置、完走なら finish。
   * walking は歩行アニメの有無で、走り終わったランは歩かせない。
   */
  marker?:
    | {
        igt: number;
        faceSrc?: string | undefined;
        label?: string | undefined;
        walking?: boolean | undefined;
        /**
         * 諦めたランの印。到達点の先に ... を引き、色を落とした顔と RESET を出す。
         * 時刻はここに出さない。最後のスプリットの下に既に並んでいるので、
         * 同じ数字より「ここで終わった」ことの方が読みたい情報になる。
         */
        reset?: boolean | undefined;
      }
    | undefined;
  /** PB より速いスプリット。reference モードのときだけ意味がある。 */
  highlighted?: ReadonlySet<EventType>;
  /** アイコンのクリック。run ページで VOD シークに転送するのに使う。 */
  onSplitClick?: (type: EventType, igt: number) => void;
};

export const Timeline = ({
  run,
  theme,
  scale,
  tokens,
  marker,
  highlighted,
  onSplitClick,
}: TimelineProps) => {
  const asset = useAsset();
  const { tip, tipProps } = useTip();
  // マーカーがあればそこまでバーを伸ばす
  const endIgt = Math.max(frontierIgt(run), marker?.igt ?? 0);
  const { denominatorMs, widthPx } = resolveScale(scale, endIgt, run.final !== null);

  const lines = getTimelineLineItems(run.items, endIgt, denominatorMs);
  const dots = getTimelineDotItems(run.items, endIgt, denominatorMs);
  const icons = getTimelineIconItems(run.items, denominatorMs);

  const rootStyle: Record<string, string> = { ...theme.tokens, ...tokens };
  if (widthPx !== null) rootStyle.width = `${widthPx}px`;

  return (
    <div className="mcsr-indicator-scroll">
    <div
      className={`mcsr-indicator mcsr-indicator--${run.isLive ? 'running' : 'completed'}${
        marker ? ' mcsr-indicator--marked' : ''
      }`}
      style={rootStyle as React.CSSProperties}
    >
      <div className="mcsr-indicator__line-container">
        {lines.map((line, i) => {
          const texture = theme.textures[line.type];
          return (
            <div
              key={`${line.type}-${i}`}
              className={`mcsr-indicator__line mcsr-indicator__line--pace mcsr-indicator__line--${line.type}`}
              style={{
                left: pct(line.left),
                width: pct(line.width),
                ...(texture ? { backgroundImage: `url(${asset(texture)})` } : {}),
              }}
            />
          );
        })}
      </div>

      <div className="mcsr-indicator__dot-container">
        {dots.map((dot) => (
          <div
            key={dot.minute}
            className={`mcsr-indicator__dot mcsr-indicator__dot--pace mcsr-indicator__dot--${dot.type}`}
            style={{ left: pct(dot.left) }}
          />
        ))}
      </div>

      <div className="mcsr-indicator__context-container">
        {clusterContextItems(run.context, denominatorMs).map((cluster) => {
          // 絵を出す設定でも、表に無いキーは目盛りに落ちる
          const key = cluster.items[0]?.key;
          const icon = key === undefined ? undefined : theme.contextIcons?.[key];
          return (
            <div
              key={cluster.items[0]?.igt ?? cluster.left}
              className={[
                'mcsr-indicator__context',
                cluster.items.length > 1 ? 'mcsr-indicator__context--many' : '',
                icon !== undefined ? 'mcsr-indicator__context--icon' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: pct(cluster.left) }}
              {...tipProps(<ContextTip items={cluster.items} />)}
            >
              {icon !== undefined && (
                <img
                  className={`mcsr-indicator__context-icon${
                    key !== undefined && CONTEXT_OUTLINED.has(key) ? ' ptc-outlined' : ''
                  }`}
                  src={asset(icon)}
                  alt=""
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mcsr-indicator__timeline-container mcsr-indicator__timeline-container--pace">
        {icons.map((item) => {
          const isHot = highlighted?.has(item.type) ?? false;
          const label = theme.labels[item.type] ?? item.type;
          return (
            <div
              key={item.type}
              className={`mcsr-indicator__item mcsr-indicator__item--${isHot ? 'highlighted' : 'normal'}`}
              style={{ left: pct(item.left) }}
            >
              <SplitIcon
                source={theme.icons[item.type]}
                label={label}
                time={convertMillisecondsToTime(item.igt)}
                outlined={theme.outlinedIcons?.has(item.type) ?? false}
                tipProps={tipProps}
                onClick={onSplitClick ? () => onSplitClick(item.type, item.igt) : undefined}
              />
              <div className="mcsr-indicator__text">
                <div className="mcsr-indicator__text-inner">
                  <span className="mcsr-indicator__text__label">{label}</span>
                  <span className="mcsr-indicator__text__time">
                    {convertMillisecondsToTime(item.igt)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {marker?.reset && (
        <div className="mcsr-indicator__face-container">
          <div
            className="mcsr-indicator__reset"
            style={{ left: pct(calcPosition(marker.igt, denominatorMs)) }}
            {...tipProps(
              `${marker.label ?? ''} ${convertMillisecondsToTime(marker.igt)}`.trim(),
            )}
          >
            <span className="mcsr-indicator__reset-dots" aria-hidden="true" />
            {marker.faceSrc && (
              <img
                className="mcsr-indicator__reset-face"
                src={marker.faceSrc}
                alt={marker.label ?? ''}
              />
            )}
            <span>RESET</span>
          </div>
        </div>
      )}

      {marker && !marker.reset && (
        <div className="mcsr-indicator__face-container">
          {marker.faceSrc && (
            <img
              className={`mcsr-indicator__face${
                marker.walking === false ? ' mcsr-indicator__face--still' : ''
              }`}
              src={marker.faceSrc}
              alt={marker.label ?? ''}
              {...tipProps(`${marker.label ?? ''} ${convertMillisecondsToTime(marker.igt)}`)}
              style={{ left: pct(calcPosition(marker.igt, denominatorMs)) }}
            />
          )}
          <span
            className="mcsr-indicator__face-time"
            style={{ left: pct(calcPosition(marker.igt, denominatorMs)) }}
          >
            {convertMillisecondsToTime(marker.igt)}
          </span>
        </div>
      )}

      <Tip tip={tip} />
    </div>
    </div>
  );
};
