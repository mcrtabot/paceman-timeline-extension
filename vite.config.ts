import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 開発ハーネス用。リポジトリのルートを配信するので、
 * `/fixtures/...`（採取した実データ・実 DOM）と `/assets/...`（テーマ画像）が
 * そのまま参照できる。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    open: '/src/dev/index.html',
    /*
     * /stats/* と /images/* を PaceMan にプロキシする。
     * ハーネスを拡張と同じ「同一オリジン」の条件に揃えるため。
     * とくにフォント（/stats/mc.ttf）は CORS ヘッダが無いので、
     * プロキシしないとハーネスでだけ Minecraft フォントが出ない。
     * アイコン（/stats/*.webp、/images/!sprite_sheet.png）も同じ経路で取れる。
     */
    proxy: {
      '/stats/': { target: 'https://paceman.gg', changeOrigin: true },
      '/images/': { target: 'https://paceman.gg', changeOrigin: true },
    },
  },
});
