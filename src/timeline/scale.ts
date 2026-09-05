/**
 * 時間軸の分母を決める。
 *
 * MCSRImageBuilder は最終スプリットで正規化していたが、ライブランにはそれが無い。
 * 現在 IGT を分母にすると全行が満幅になり、2 分のランと 9 分のランが同じ長さに見える。
 * fit は未完走を刻み単位で切り上げ、下限も置く。
 */

import { MINUTE_MS } from './layout.js';
import type { Scale } from './types.js';

/**
 * fit の刻み。未完走は最後のスプリットより大きい 3 分の倍数を分母にする。
 * 走行中に分母がじわじわ動くと落ち着かないので、段階的にだけ伸ばす。
 */
export const FIT_STEP_MS = 3 * MINUTE_MS;
export const FIT_MIN_MS = 9 * MINUTE_MS;

export type ResolvedScale = {
  denominatorMs: number;
  /** 常に null で親要素いっぱいに広げる。px 指定は今のところ使っていない。 */
  widthPx: null;
};

export const resolveScale = (
  scale: Scale,
  maxIgtMs: number,
  isComplete = false,
): ResolvedScale => {
  if (scale.mode === 'fit') {
    // 完走なら finish が右端。未完走は 3 分刻みで切り上げ、下限は minMs
    const minMs = scale.minMs ?? FIT_MIN_MS;
    const denominatorMs = isComplete
      ? Math.max(maxIgtMs, 1)
      : Math.max(minMs, Math.ceil(maxIgtMs / FIT_STEP_MS) * FIT_STEP_MS);
    return { denominatorMs, widthPx: null };
  }

  /*
   * 指定された分母をそのまま使う。ここで実ランの長さと max を取ると、
   * 分母を超える行だけ縮尺が変わって整列が壊れる。max が要るなら呼び出し側で取る。
   */
  return { denominatorMs: Math.max(1, scale.refMs), widthPx: null };
};

/**
 * ラン履歴用。表示中で最も長いランを 100% にする分母。
 * 未完走は finish を持たないので、各行の到達点の最大を取る。
 * finish だけ見ると、それより長く走った未完走ランがはみ出す。
 */
export const sharedDenominatorMs = (frontierMsList: readonly number[]): number =>
  Math.max(1, ...frontierMsList);
