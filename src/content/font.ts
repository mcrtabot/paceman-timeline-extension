/**
 * Minecraft フォントを使えるようにする。実体は PaceMan が同一オリジンの
 * /stats/mc.ttf で配信しているものを借りる。同梱はしない。
 *
 * @font-face は Shadow DOM 内のスタイルシートでは無視されるのでドキュメント側に
 * 登録が要る。head に <style> を挿す代わりに FontFace API を使えばページの DOM を
 * 触らずに済む。ドキュメントに登録した face は Shadow tree からも見える。
 *
 * /stats/* は mcFont を自前で読んでいるが URL に Next.js のハッシュが付いていて
 * 当てにできず、トップページに至っては Minecraft 系を一切読んでいない。
 * どのページでも同じように使えるよう自分で登録する。
 */

import { MC_FONT_FAMILY } from '../timeline/theme/fonts.js';

const FAMILY = MC_FONT_FAMILY;
/* 相対パスなら拡張でもハーネスの dev プロキシでも同じ経路になる */
const SRC = 'url(/stats/mc.ttf)';

let started: Promise<boolean> | null = null;

/** 遷移のたびに呼ばれても登録は一度きり。 */
export const ensureMinecraftFont = (): Promise<boolean> => {
  started ??= (async () => {
    try {
      if (typeof FontFace !== 'function' || !document.fonts) return false;
      for (const f of document.fonts) if (f.family === FAMILY) return true;
      const face = new FontFace(FAMILY, SRC);
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      // 読めなくてもフォールバックのフォントで描ける
      return false;
    }
  })();
  return started;
};

