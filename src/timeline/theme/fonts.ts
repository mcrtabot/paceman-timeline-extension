/** フォントスタックの定義。読み込みは content/font.ts の担当。 */

/** 自前で登録する Minecraft フォントのファミリー名。 */
export const MC_FONT_FAMILY = 'ptc-mc';

/**
 * ptc-mc は自前登録でどのページでも使える。mcFont は /stats/* が元から読んでいるもの。
 * 最後は等幅に落ちる。
 */
export const MC_FONT_STACK = `${MC_FONT_FAMILY}, mcFont, Minecraft, ui-monospace, monospace`;

/** 数字に使うフォント。既定は Minecraft。 */
export const DIGIT_FONTS = {
  minecraft: MC_FONT_STACK,
  default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

export type DigitFontId = keyof typeof DIGIT_FONTS;

export const DIGIT_FONT_LABELS: Readonly<Record<DigitFontId, string>> = {
  minecraft: 'Minecraft',
  default: 'Default',
};
