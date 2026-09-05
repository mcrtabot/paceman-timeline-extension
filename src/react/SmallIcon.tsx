/** 表の中で使う小さなアイコン。シートは切り出しが要って <img> では描けないので吸収する。 */

import type { AssetResolver, IconSource } from '../timeline/theme/types.js';
import { isSpriteRef } from '../timeline/theme/types.js';

export type SmallIconStyle =
  | { kind: 'img'; src: string }
  | { kind: 'sprite'; vars: Record<string, string> };

/** スプライトの切り出しに必要な CSS 変数。表示サイズは CSS 側で calc する。 */
export const spriteVars = (
  source: { sheet: string; col: number; row: number; cols: number; rows: number },
  asset: AssetResolver,
): Record<string, string> => ({
  '--ptc-sprite-url': `url(${asset(source.sheet)})`,
  '--ptc-sprite-col': String(source.col),
  '--ptc-sprite-row': String(source.row),
  '--ptc-sprite-cols': String(source.cols),
  '--ptc-sprite-rows': String(source.rows),
});

/** テーマのアイコン指定を、描画に必要な形へ落とす。 */
export const spriteStyleOf = (
  source: IconSource | undefined,
  asset: AssetResolver,
): SmallIconStyle | undefined => {
  if (source === undefined) return undefined;
  if (isSpriteRef(source)) {
    return { kind: 'sprite', vars: spriteVars(source, asset) };
  }
  const first = typeof source === 'string' ? source : source[0];
  return first === undefined ? undefined : { kind: 'img', src: asset(first) };
};

export const SmallIcon = ({
  className,
  icon,
  outlined = false,
}: {
  className: string;
  icon: SmallIconStyle;
  /** 背景に沈む絵にだけ付ける輪郭。見た目を揃えるため class で持つ。 */
  outlined?: boolean;
}) => {
  const cls = `${className}${outlined ? ' ptc-outlined' : ''}`;
  return icon.kind === 'img' ? (
    <img className={cls} src={icon.src} alt="" />
  ) : (
    <div className={`${cls} ptc-sprite`} style={icon.vars as React.CSSProperties} />
  );
};
