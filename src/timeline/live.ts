/**
 * 進行中ランの現在位置を推定する。DOM には触らない。
 *
 * liveruns に現在 IGT のフィールドは無い。トップの TIME 列も最後のスプリットの
 * IGT を出しているだけで秒を刻まない。lastUpdated も当てにならず、context が
 * 増えている行でも 9 秒動かないことがあった。
 *
 * なのでこちらで推定する。
 *
 *   currentIgt(now) = anchor.baseIgt + (now - anchor.at)
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
 * ただしここでいうイベントは eventList のスプリットだけで、contextEventList では
 * lastUpdated は動かない。バスチョンを踏んだあと loot_bastion と
 * obtain_crying_obsidian が増えても lastUpdated は 0ms のまま、というのを
 * 5 秒ポーリングで確認した。そこで baseIgt に context の igt を採ったまま
 * at を lastUpdated に置くと、**スプリットからその context までの時間が二重に乗る**。
 * エンドに入って 100 秒後にドラゴンを倒すと、そこから finish まで +100 秒ずれた
 * タイムを歩き続けていた（finish が来ると正しい値に戻る）のがこれ。
 *
 * context にも rta が付いているので、ラン開始時刻
 *   start = lastUpdated - 最後のスプリットの rta
 * を経由してその context の壁時計時刻 `start + context.rta` が出せる。差分で書くと
 *   at = lastUpdated + (context.rta - スプリットの rta)
 * スプリットの先に context が無ければ差は 0、つまり at = lastUpdated のまま。
 *
 * rta で足すので、その区間のポーズやロードぶん（rta - igt の伸び）も勘定に入る。
 * igt で足すと二重計上は消えるがその伸びだけ進めすぎる。
 *
 * lastUpdated 自体は律儀ではなく、数イベントぶん止まってからまとめて追いつくことが
 * ある（+0.0s / +72.7s のあと +82.8s / +10.0s で帳尻が合う）。遅れているあいだは
 * 基準が実際より古く見えるので、進めすぎる向きの誤差が出る。次のイベントで解消する。
 *
 * アンカーは baseIgt が増えたときだけ張り直す。毎回張り直すと、lastUpdated が
 * まとめて追いついた拍子にマーカーが後ろへ跳ねる。
 *
 * ポーズ中は IGT が止まるし、走者が落ちても一覧から消えるまでは進み続ける。
 * だいたいの位置を出すためのもの。
 */

import { lastIgt } from '../adapters/normalize.js';
import type { ContextMarker, RunTimeline } from './types.js';

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

/**
 * 最後のスプリット。items は必ず合成 overworld:0 から始まるので空にはならない。
 * その合成分の rta は rtaByType に無いが、0 と分かっている。
 */
const lastSplitOf = (run: RunTimeline): { igt: number; rta: number | null } => {
  const item = run.items[run.items.length - 1];
  if (item === undefined) return { igt: 0, rta: 0 };
  if (item.type === 'overworld' && item.igt === 0) return { igt: 0, rta: 0 };
  return { igt: item.igt, rta: run.rtaByType[item.type] ?? null };
};

/** そのスプリットより先まで来ている context のうち最も進んだもの。 */
const contextBeyond = (run: RunTimeline, igt: number): ContextMarker | undefined => {
  let found: ContextMarker | undefined;
  for (const c of run.context) {
    if (c.igt > igt && (found === undefined || c.igt > found.igt)) found = c;
  }
  return found;
};

/** lastUpdated から張るアンカー。信用できない値なら null。 */
const anchorFromLastUpdated = (
  run: RunTimeline,
  observedAt: number,
): LiveAnchor | null => {
  const lastUpdated = run.lastUpdated;
  if (lastUpdated === null) return null;

  const split = lastSplitOf(run);
  const ctx = contextBeyond(run, split.igt);
  /*
   * rta が揃っていない経路（getWorld 由来など context を持たないか rta が無い）では
   * ずらしようが無いので、スプリットで止める。context の igt を base に採らないので
   * 二重計上にはならず、その context までの時間は now - at 側で歩いて追いつく。
   */
  const anchor =
    ctx !== undefined && ctx.rta !== null && split.rta !== null && ctx.rta > split.rta
      ? { baseIgt: ctx.igt, at: lastUpdated + (ctx.rta - split.rta) }
      : { baseIgt: split.igt, at: lastUpdated };

  const age = observedAt - anchor.at;
  return age < 0 || age > MAX_ANCHOR_AGE_MS ? null : anchor;
};

/** baseIgt が進んだときだけ張り直す。 */
export const nextAnchor = (
  prev: LiveAnchor | undefined,
  run: RunTimeline,
  observedAt: number,
): LiveAnchor => {
  // lastUpdated が使えないときは到達点から観測時刻で歩き出すしかない
  const next = anchorFromLastUpdated(run, observedAt) ?? {
    baseIgt: baseIgtOf(run),
    at: observedAt,
  };
  if (prev && next.baseIgt <= prev.baseIgt) return prev;
  return next;
};

export const estimateIgt = (anchor: LiveAnchor, now: number): number =>
  anchor.baseIgt + Math.max(0, now - anchor.at);
