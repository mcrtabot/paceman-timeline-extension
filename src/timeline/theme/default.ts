/**
 * MCSRImageBuilder の resources/theme/default の indicator.css と setting.json を
 * データに写したもの。テクスチャ・線幅・枠・色・アイコンは変えていない。
 *
 * 変えたのは 3 点。スプリットタイムを表示する（default はバーとアイコンだけ）。
 * pace アイコンをバーの上へ出す（PB ゴースト行が無いので上段が空いている）。
 * face の歩く Steve は持ち込まない（url(/setting/face.png) が絶対パスで解決できない）。
 *
 * どれもトークンなので、上書きすれば元に戻せる。
 */

import { MC_FONT_STACK } from './fonts.js';
import type { Theme } from './types.js';

export const defaultTheme: Theme = {
  id: 'default',

  tokens: {
    '--ptc-text-color': 'rgba(255, 255, 255, 1)',
    '--ptc-highlighted-text-color': 'rgba(255, 128, 128, 1)',
    '--ptc-background': 'transparent',

    // 元テーマの --id-digits-font も Minecraft が先頭。実体は content/font.ts が登録する
    '--ptc-digits-family': MC_FONT_STACK,
    '--ptc-font': 'normal normal 18px/1 var(--ptc-digits-family)',
    '--ptc-digits-font': 'normal normal 18px/1 var(--ptc-digits-family)',

    '--ptc-line-size': '24px',
    '--ptc-dot-size': '7px',
    '--ptc-icon-size': '40px',
    '--ptc-face-size': '32px',
    '--ptc-texture-scale': '60px',

    // アイコンをバーの上へ。バーの上端 -12px に対して下端が -24px なので 12px 空く
    '--ptc-icon-offset': '-44px',
    // context マーカーが出ているぶんタイムを下げる量。既定は 0
    '--ptc-context-text-space': '0px',
    // context の絵の大きさ。既定は個別ランページ向け。元画像は 32px なのでここが上限
    '--ptc-context-icon-size': '24px',
    // タイムを出す
    '--ptc-display-pace-text': 'block',
    '--ptc-display-pace-text-label': 'none',
    '--ptc-display-pace-text-rotate': '32deg',
    // バーの下端は +12px。タイムの起点をそこへ寄せる
    '--ptc-text-offset': '18px',

    '--ptc-highlighted-shadow-color': 'rgba(255, 128, 128, 1)',
  },

  // setting.json の label をそのまま。second_portal だけ default に無いので補う
  labels: {
    enter_nether: 'Enter Nether',
    enter_bastion: 'Enter Bastion',
    enter_fortress: 'Enter Fortress',
    first_portal: 'First Portal',
    second_portal: 'Second Portal',
    enter_stronghold: 'Enter Stronghold',
    enter_end: 'Enter End',
    credits: 'Finish',
  },

  /**
   * indicator.css の .mcsr-indicator__line--pace.mcsr-indicator__line--<type> を写したもの。
   * second_portal は default に規則が無いので、_builder に倣って overworld にする。
   * 第 2 ポータルを抜けた先は要塞へ向かうオーバーワールドなので実態とも合う。
   */
  textures: {
    overworld: 'texture/overworld.png',
    enter_nether: 'texture/netherrack.png',
    enter_bastion: 'texture/gilded_blackstone.png',
    enter_fortress: 'texture/nether_bricks.png',
    first_portal: 'texture/nerthergate.png',
    second_portal: 'texture/overworld.png',
    enter_stronghold: 'texture/cracked_stone_bricks.png',
    enter_end: 'texture/end_stone.png',
  },

  /** ネザーインと第1/第2ポータルは同じポータルの絵。default に second_portal.png は無い。 */
  icons: {
    enter_nether: 'icon/nether_portal.png',
    enter_bastion: 'icon/enter_bastion.png',
    enter_fortress: 'icon/enter_fortress.png',
    first_portal: 'icon/nether_portal.png',
    second_portal: 'icon/nether_portal.png',
    enter_stronghold: 'icon/enter_stronghold.png',
    enter_end: 'icon/enter_end.png',
    credits: 'icon/credits.png',
  },
};
