/**
 * 自前のツールチップ。ネイティブの title は出るまで 1 秒ほど待たされるので、
 * 目盛りやアイコンのようにかざしてすぐ読みたいものには使えない。
 *
 * document.body へポータルで出す。position: fixed だけでは足りない。
 * 一覧カードに掛かっている backdrop-filter が fixed の containing block を作るので、
 * 内側に描くとビューポートではなくカード基準の座標になって別の場所に出る。
 * transform / filter / will-change も同じ。
 *
 * ポータル先は Shadow DOM の外でスタイルシートが届かないので、見た目はインラインで持つ。
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';

export type TipState = { x: number; y: number; content: React.ReactNode } | null;

export const useTip = () => {
  const [tip, setTip] = useState<TipState>(null);

  /** ツールチップを出したい要素に展開して渡す。中身は文字列でもノードでもよい。 */
  const tipProps = (content: React.ReactNode) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      // 下に出す。上だとタイムライン本体に被る
      setTip({ x: r.left + r.width / 2, y: r.bottom, content });
    },
    onMouseLeave: () => setTip(null),
  });

  return { tip, tipProps };
};

const STYLE: React.CSSProperties = {
  position: 'fixed',
  zIndex: 2147483000,
  transform: 'translate(-50%, 8px)',
  padding: '6px 10px',
  margin: 0,
  borderRadius: '6px',
  background: 'rgba(17, 24, 39, 0.97)',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)',
  color: '#e6e8eb',
  font: 'normal normal 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: 'normal',
  whiteSpace: 'pre',
  pointerEvents: 'none',
};

export const Tip = ({ tip }: { tip: TipState }) => {
  if (tip === null || typeof document === 'undefined') return null;
  return createPortal(
    <div
      style={{
        ...STYLE,
        // 画面の端で切れないように寄せる。中身の幅は分からないので概算
        left: `${Math.min(Math.max(tip.x, 110), window.innerWidth - 110)}px`,
        top: `${tip.y}px`,
      }}
    >
      {tip.content}
    </div>,
    document.body,
  );
};
