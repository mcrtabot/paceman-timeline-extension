/**
 * 進行中ランの現在位置を推定する。DOM には触らない。
 *
 * liveruns に現在 IGT のフィールドは無い。トップの TIME 列も最後のスプリットの
 * IGT を出しているだけで秒を刻まない。lastUpdated も当てにならず、context が
 * 増えている行でも 9 秒動かないことがあった。
 *
 * なのでこちらで推定する。
 *
 *   currentIgt(now) = baseIgt + (now - anchor.at)
 *   baseIgt = eventList と contextEventList の最大 igt
 *
 * anchor.at は「その baseIgt に到達した壁時計時刻」でなければならない。ここを
 * 観測時刻（fetch した瞬間）にすると、最後のイベントから 5 分経ったランを開いたとき
 * 5 分ぶん後ろから歩き始める。リロードのたびに巻き戻るのもこれが原因だった。
 *
 * 使えるのは lastUpdated。実測すると `lastUpdated - maxRta` がラン内で一定で、
 * これはランが始まった壁時計時刻にあたる。つまり lastUpdated は
 * **最後に届いたイベントが起きた時刻**。イベント到着に合わせて動くことを、
 * イベントが増えた瞬間を捕まえて確認した（lastUpdated +193.0s / maxRta +192.9s など）。
 *
 * ただし律儀ではなく、数イベントぶん止まってからまとめて追いつくことがある
 * （+0.0s / +72.7s のあと +82.8s / +10.0s で帳尻が合う）。遅れているあいだは
 * 基準が実際より古く見えるので、進めすぎる向きの誤差が出る。次のイベントで解消する。
 *
 * アンカーは baseIgt が増えたときだけ張り直す。毎回張り直すと、lastUpdated が
 * まとめて追いついた拍子にマーカーが後ろへ跳ねる。
 *
 * ポーズ中は IGT が止まるし、走者が落ちても一覧から消えるまでは進み続ける。
 * だいたいの位置を出すためのもの。
 */

import { lastIgt } from '../adapters/normalize.js';
import type { RunTimeline } from './types.js';

export type LiveAnchor = { baseIgt: number; at: number };

/** そのランで判明している最も進んだ時刻。 */
export const baseIgtOf = (run: RunTimeline): number => {
  let base = lastIgt(run.items);
  for (const c of run.context) if (c.igt > base) base = c.igt;
  return base;
};

/**
 * lastUpdated を信用しない条件。端末の時計がサーバとずれていると破綻するので、
 * ありえない値なら観測時刻に落とす。
 * - 負（端末の時計がサーバより遅れている）
 * - 極端に古い。走者が落ちたまま一覧に残っている類なので、そもそも歩かせたくない
 */
const MAX_ANCHOR_AGE_MS = 30 * 60_000;

/** アンカーに使う時刻。lastUpdated が使えるならそれ、駄目なら観測時刻。 */
export const anchorTimeOf = (run: RunTimeline, observedAt: number): number => {
  const at = run.lastUpdated;
  if (at === null) return observedAt;
  const age = observedAt - at;
  return age < 0 || age > MAX_ANCHOR_AGE_MS ? observedAt : at;
};

/** baseIgt が進んだときだけ張り直す。 */
export const nextAnchor = (
  prev: LiveAnchor | undefined,
  run: RunTimeline,
  observedAt: number,
): LiveAnchor => {
  const baseIgt = baseIgtOf(run);
  if (prev && baseIgt <= prev.baseIgt) return prev;
  return { baseIgt, at: anchorTimeOf(run, observedAt) };
};

export const estimateIgt = (anchor: LiveAnchor, now: number): number =>
  anchor.baseIgt + Math.max(0, now - anchor.at);
