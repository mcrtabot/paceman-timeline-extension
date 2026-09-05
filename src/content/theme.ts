import { defaultTheme } from '../timeline/theme/default.js';
import { DIGIT_FONTS } from '../timeline/theme/fonts.js';
import { CONTEXT_ICONS, ICONS, OUTLINED } from '../timeline/theme/iconSets.js';
import type { Theme } from '../timeline/theme/types.js';
import type { Settings } from '../settings.js';

/** テクスチャはテーマのまま。アイコンと表示トークンだけ設定で切り替える。 */
export const themeFromSettings = (settings: Settings): Theme => ({
  ...defaultTheme,
  icons: ICONS[settings.iconSet],
  outlinedIcons: OUTLINED[settings.iconSet],
  ...(settings.contextMarker === 'icon' ? { contextIcons: CONTEXT_ICONS } : {}),
  tokens: {
    ...defaultTheme.tokens,
    // 表の TIME 列や先端のタイムでも同じものを使うので、家族名だけ別トークンにしてある
    '--ptc-digits-family': DIGIT_FONTS[settings.digitFont],
    '--ptc-display-context': settings.showContext ? 'block' : 'none',
    /*
     * context マーカーはバーの下に出る。表と一覧はこの値で下の余白を広げる。
     * 絵は目盛りより背が高いのでその分だけ多く取る。
     */
    '--ptc-context-space': settings.showContext
      ? settings.contextMarker === 'icon'
        ? 'calc(var(--ptc-context-icon-size) + 6px)'
        : '16px'
      : '0px',
    /*
     * スプリットタイムを下げる量。バーの下端 +12px から数えて、目盛りは 26px まで、
     * 絵は 14px + 絵の大きさ まで伸びる。タイムの既定位置は 18px なので、そこから逃がす。
     * タイムを出すのは個別ランページだけで、表と一覧では効かない。
     */
    '--ptc-context-text-space': settings.showContext
      ? settings.contextMarker === 'icon'
        ? 'calc(var(--ptc-context-icon-size) - 2px)'
        : '10px'
      : '0px',
    '--ptc-display-pace-text-rotate': `${settings.textRotateDeg}deg`,
  },
});
