/**
 * content script のエントリ。全体のスイッチとページ種別ごとの ON/OFF があり、
 * どちらかが OFF ならマウントしない。データが取れないときは何も出さない。
 */

import { anchorForPath } from './anchors.js';
import { ensureMinecraftFont } from './font.js';
import { waitForHydration } from './hydration.js';
import {
  createMount,
  type CreateMountOptions,
  type MountHandle,
  observePathname,
} from './mount.js';
import { renderHome } from './pages/home.js';
import { nickFromPlayerPath, renderPlayer } from './pages/player.js';
import { nickFromPath, renderPlayerRuns } from './pages/playerRuns.js';
import { loadRun, renderRun, runIdFromPath } from './pages/run.js';
import { isPageEnabled, loadSettings, onSettingsChanged, type Settings } from '../settings.js';
import css from '../timeline/styles/timeline.css?raw';

const HOST_ID = 'ptc-host';

let current: MountHandle | null = null;
let settings: Settings | null = null;

const mountWith = async (
  anchor: NonNullable<ReturnType<typeof anchorForPath>>,
  render: CreateMountOptions['render'],
): Promise<void> => {
  current = createMount({ hostId: HOST_ID, anchor, css, render });
  await current.start();
};

const setup = async (pathname: string): Promise<void> => {
  current?.stop();
  current = null;

  const anchor = anchorForPath(pathname);
  if (!anchor) return;

  // 描く前に登録しておく。失敗してもフォールバックで描ける
  await ensureMinecraftFont();

  settings ??= await loadSettings();
  if (!isPageEnabled(settings, anchor.kind)) return;
  const s = settings;

  /*
   * PaceMan の hydration が済むまでページの DOM には触らない。SSR された木に
   * ホストを挿すと React が不一致と判断して木を作り直し、掴んだ目印ごと捨てられる。
   * document_idle は hydration より前に来ることがあり、Firefox ではほぼ毎回そうなる。
   */
  await waitForHydration(anchor.selector);
  if (location.pathname !== pathname) return;

  try {
    if (anchor.kind === 'run') {
      const runId = runIdFromPath(pathname);
      if (!runId) return;
      const run = await loadRun(runId);
      // 待っているあいだに遷移していたら捨てる
      if (!run || location.pathname !== pathname) return;
      await mountWith(anchor, (root) => renderRun(root, run, s));
      return;
    }

    if (anchor.kind === 'home') {
      await mountWith(anchor, (root, page) => renderHome(root, s, page));
      return;
    }

    if (anchor.kind === 'playerRuns') {
      const nick = nickFromPath(pathname);
      if (!nick) return;
      await mountWith(anchor, (root) => renderPlayerRuns(root, s, nick));
      return;
    }

    if (anchor.kind === 'player') {
      const nick = nickFromPlayerPath(pathname);
      if (!nick) return;
      await mountWith(anchor, (root) => renderPlayer(root, s, nick));
    }
  } catch (e) {
    console.debug('[paceman-timeline-extension] setup failed:', e);
  }
};

void setup(location.pathname);
observePathname((pathname) => void setup(pathname));
/**
 * お気に入りの増減だけなら貼り直さない。貼り直すと横取りしたデータが一度消えて、
 * 星を押すたびに表が 1 秒ほど空になる。描画側は自分の state で先に反映している。
 */
const onlyFavoritesChanged = (a: Settings, b: Settings): boolean =>
  JSON.stringify({ ...a, favorites: [] }) === JSON.stringify({ ...b, favorites: [] });

onSettingsChanged((next) => {
  const prev = settings;
  settings = next;
  if (prev && onlyFavoritesChanged(prev, next)) return;
  void setup(location.pathname);
});
