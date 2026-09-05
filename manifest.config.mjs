/**
 * chrome / firefox のマニフェストを1ソースから生成する。
 *
 * 権限は意図的に最小限:
 *   - host_permissions は paceman.gg のみ（"tabs" も <all_urls> も要らない）
 *   - "storage" は設定の保存だけ
 * ストア審査を通すかは未定だが、通すなら軽い側に留めておくのが得。
 */

const NAME = 'MCSR Timeline for PaceMan';
const DESCRIPTION =
  "Adds MCSRImageBuilder's visual timeline to runs on paceman.gg.";

/** @param {{ target: 'chrome' | 'firefox', version: string, dev?: boolean }} opts */
export const buildManifest = ({ target, version, dev = false }) => {
  const matches = ['https://paceman.gg/*'];
  // 開発時だけ、ハーネス相当のローカルページでも動かせるようにする。
  // **本番ビルドには絶対に入れない。**
  if (dev) matches.push('http://localhost:5173/*');

  const base = {
    manifest_version: 3,
    name: NAME,
    version,
    description: DESCRIPTION,
    icons: {
      16: 'assets/ext/icon-16.png',
      48: 'assets/ext/icon-48.png',
      128: 'assets/ext/icon-128.png',
    },
    permissions: ['storage'],
    host_permissions: ['https://paceman.gg/*'],
    content_scripts: [
      {
        // ページの fetch/XHR を横取りする。ページのグローバルを触るので MAIN world。
        // アプリのバンドルより先に入る必要があるので document_start。
        matches,
        js: ['tee-main.js'],
        run_at: 'document_start',
        world: 'MAIN',
      },
      {
        matches,
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
    web_accessible_resources: [{ resources: ['assets/*'], matches }],
    options_ui: { page: 'options/index.html', open_in_tab: true },
    /*
     * 拡張ボタンを押したときのポップアップ。設定画面と同じページを出す。
     * オプション画面まで行かずに絵柄などを切り替えられる方が実用的で、
     * 2 つ作ると同じ設定 UI を二重に持つことになるので 1 枚を使い回す。
     *
     * 高さは 600px ほどで頭打ちになるが、説明文を「?」で畳んでいるので
     * 項目そのものはスクロールせずに収まる（options.tsx の Row）。
     */
    action: {
      default_popup: 'options/index.html',
      default_title: NAME,
      default_icon: {
        16: 'assets/ext/icon-16.png',
        48: 'assets/ext/icon-48.png',
        128: 'assets/ext/icon-128.png',
      },
    },
  };

  if (target === 'firefox') {
    return {
      ...base,
      // Firefox は service_worker ではなく background.scripts
      background: { scripts: ['background.js'], type: 'module' },
      browser_specific_settings: {
        gecko: { id: 'paceman-timeline-extension@mcrtabot', strict_min_version: '128.0' },
      },
    };
  }

  return { ...base, background: { service_worker: 'background.js', type: 'module' } };
};
