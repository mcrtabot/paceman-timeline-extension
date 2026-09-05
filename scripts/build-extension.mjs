/**
 * 拡張のビルド。
 *
 * @crxjs/vite-plugin は使わない（Vite 8 との組み合わせが未確認で、
 * content script の HMR という利点は開発ハーネスで代替できるため）。
 * 代わりに Vite の JS API で3回ビルドし、成果物を組み立てる。
 *
 *   content.js     … MV3 の content script はモジュールではないので IIFE 単一ファイル
 *   background.js  … service worker は type: module なので ESM
 *   options/       … 通常の HTML ページ
 *
 * 最後に Releases へ上げる zip も作る（--dev では作らない）。名前は README が
 * 案内しているものと同じでなければならない。
 */

import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import { buildManifest } from '../manifest.config.mjs';

const run = promisify(execFile);

const root = resolve(import.meta.dirname, '..');
const shared = resolve(root, 'dist/.shared');
const dev = process.argv.includes('--dev');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version ?? '0.0.1';

const common = {
  root,
  configFile: false,
  plugins: [react()],
  // lib モードでは Vite が NODE_ENV を注入しないので自分で入れる。
  // これが無いと react-dom の**開発ビルド**が同梱され、content.js が数倍に膨らむ。
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
};

await rm(resolve(root, 'dist'), { recursive: true, force: true });

// 1. content script — IIFE 単一ファイル（依存はすべてインライン化）
await build({
  ...common,
  build: {
    outDir: shared,
    emptyOutDir: false,
    minify: !dev,
    lib: {
      entry: resolve(root, 'src/content/index.tsx'),
      formats: ['iife'],
      name: 'PacemanTimelineChart',
      fileName: () => 'content.js',
    },
    rollupOptions: { output: { assetFileNames: 'content.[ext]' } },
  },
});

// 2. MAIN world の横取りスクリプト — これも content script なので IIFE
await build({
  ...common,
  build: {
    outDir: shared,
    emptyOutDir: false,
    minify: !dev,
    lib: {
      entry: resolve(root, 'src/content/tee/main-world.ts'),
      formats: ['iife'],
      name: 'PacemanTimelineChartTee',
      fileName: () => 'tee-main.js',
    },
  },
});

// 3. background service worker — ESM
await build({
  ...common,
  build: {
    outDir: shared,
    emptyOutDir: false,
    minify: !dev,
    lib: {
      entry: resolve(root, 'src/background/broker.ts'),
      formats: ['es'],
      fileName: () => 'background.js',
    },
  },
});

// 4. options ページ
// root を src/options に置く。root のままだと index.html が
// dist/.shared/options/src/options/index.html に入れ子で出てしまう。
//
// base: './' が要る。既定の '/' だと HTML が /assets/index-xxx.js と絶対パスで
// 参照し、拡張のオリジンでは chrome-extension://<id>/assets/... を探して 404 になる
// （実体は options/assets/ の下）。結果、設定画面が真っ白になる。
await build({
  ...common,
  root: resolve(root, 'src/options'),
  base: './',
  build: {
    outDir: resolve(shared, 'options'),
    emptyOutDir: false,
    minify: !dev,
  },
});

// 5. アセットと manifest を並べて、ターゲットごとの成果物にする
for (const target of ['chrome', 'firefox']) {
  const out = resolve(root, 'dist', target);
  await mkdir(out, { recursive: true });
  await cp(shared, out, { recursive: true });
  await cp(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });
  await writeFile(
    resolve(out, 'manifest.json'),
    `${JSON.stringify(buildManifest({ target, version, dev }), null, 2)}\n`,
  );
  console.log(`built dist/${target}${dev ? ' (dev)' : ''}`);

  if (dev) continue;

  /*
   * リリース用の zip。中身はフォルダで包まずに根に置く。公開済みの v0.1.0 が
   * その形で、README も「展開してできたフォルダを読み込む」と書いてある。
   *
   * 固めるのは OS の zip に任せる。依存を 1 つ増やさずに済み、-X で macOS の
   * 拡張属性を、-x で .DS_Store を落とせる。
   */
  const zip = `${pkg.name}-${version}-${target}.zip`;
  const zipPath = resolve(root, 'dist', zip);
  await rm(zipPath, { force: true });
  try {
    await run('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '.DS_Store', '*/.DS_Store'], {
      cwd: out,
    });
  } catch (e) {
    throw new Error(`zip に失敗した（zip コマンドが要る）: ${e.message}`);
  }
  console.log(`packed dist/${zip}`);
}

await rm(shared, { recursive: true, force: true });
