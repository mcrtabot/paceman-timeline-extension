/**
 * @vitest-environment jsdom
 *
 * mount の生存管理。ハーネスで目視している内容を回帰テストとして固定する。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { anchorForPath, ANCHORS } from '../src/content/anchors.js';
import { createMount, type PageChrome, waitForAnchor } from '../src/content/mount.js';

// jsdom 環境では import.meta.url が http: になるので、cwd 基準で読む
const runPageHtml = readFileSync(resolve('fixtures/dom/run-page.html'), 'utf8');

const runAnchor = ANCHORS.find((a) => a.kind === 'run')!;

/**
 * 張りっぱなしのマウントは次のテストに漏れる。keepAlive は body を見ているので、
 * body を差し替えると前のテストのホストが新しい DOM に貼り直されてしまう。
 */
const mounts: { stop: () => void }[] = [];

const makeMount = (onRender?: () => void) => {
  const mount = createMount({
    hostId: 'ptc-host',
    anchor: runAnchor,
    css: '.mcsr-indicator { color: red }',
    anchorTimeoutMs: 500,
    render: (root) => {
      const el = document.createElement('div');
      el.className = 'mcsr-indicator';
      root.appendChild(el);
      onRender?.();
      return () => el.remove();
    },
  });
  mounts.push(mount);
  return mount;
};

beforeEach(() => {
  for (const m of mounts) m.stop();
  mounts.length = 0;
  document.body.innerHTML = runPageHtml;
});

describe('anchorForPath', () => {
  it('matches the run page with and without the /stats prefix', () => {
    expect(anchorForPath('/stats/run/2827631/')?.kind).toBe('run');
    expect(anchorForPath('/run/2827631')?.kind).toBe('run');
  });
  it('matches the home page', () => expect(anchorForPath('/')?.kind).toBe('home'));
  it('matches the player runs page', () =>
    expect(anchorForPath('/stats/player/3x7en/runs/')?.kind).toBe('playerRuns'));
  it('matches the player profile page', () => {
    expect(anchorForPath('/stats/player/3x7en/')?.kind).toBe('player');
    expect(anchorForPath('/player/3x7en')?.kind).toBe('player');
  });
  it('keeps the profile and the runs page apart', () => {
    // どちらも /player/<nick> で始まる。プロフィール側が /runs/ を飲み込むと履歴が出なくなる
    expect(anchorForPath('/stats/player/3x7en/runs/')?.kind).not.toBe('player');
    expect(anchorForPath('/stats/player/3x7en/')?.kind).not.toBe('playerRuns');
  });
  it('does not match unrelated pages', () => {
    expect(anchorForPath('/lb/monthly')).toBeNull();
    expect(anchorForPath('/stats/player/3x7en/stats/extra/')).toBeNull();
  });
});

describe('waitForAnchor', () => {
  it('resolves immediately when the anchor already exists', async () => {
    const el = await waitForAnchor('div.run-card', {
      doc: document,
      timeoutMs: 500,
      signal: new AbortController().signal,
    });
    expect(el).not.toBeNull();
  });

  it('resolves once the anchor appears later (client-side hydration)', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const pending = waitForAnchor('div.run-card', {
      doc: document,
      timeoutMs: 2000,
      signal: new AbortController().signal,
    });
    setTimeout(() => {
      document.getElementById('app')!.innerHTML = '<div class="run-card"></div>';
    }, 20);
    expect(await pending).not.toBeNull();
  });

  it('gives up at the timeout instead of hanging', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const el = await waitForAnchor('div.run-card', {
      doc: document,
      timeoutMs: 50,
      signal: new AbortController().signal,
    });
    expect(el).toBeNull();
  });

  it('stops waiting when aborted', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const ac = new AbortController();
    const pending = waitForAnchor('div.run-card', {
      doc: document,
      timeoutMs: 5000,
      signal: ac.signal,
    });
    ac.abort();
    expect(await pending).toBeNull();
  });
});

/*
 * 配信モードのページ側の細工。トップで使うものだが、ホストから body まで登るだけで
 * ページ構造は見ないので、ここでは採取済みの個別ランページの DOM で確かめる。
 */
describe('stream overlay page chrome', () => {
  const makeChromeMount = (pageChrome: PageChrome) => {
    const mount = createMount({
      hostId: 'ptc-host',
      anchor: runAnchor,
      css: '',
      anchorTimeoutMs: 500,
      pageChrome,
      render: () => () => {},
    });
    mounts.push(mount);
    return mount;
  };

  const displayOf = (selector: string) =>
    document.querySelector<HTMLElement>(selector)!.style.display;

  it('hides the siblings along the way, but not the path to the host', async () => {
    await makeChromeMount({ solo: true }).start();

    // ホストの隣にある本家のカードも、上の階層にある別の row も消える
    expect(displayOf('div.run-card')).toBe('none');
    expect(displayOf('div.row:has(div.twitchWrapper)')).toBe('none');
    expect(displayOf('div.row:has(div.runHeader)')).toBe('none');
    expect(displayOf('div.row:has(div.runButtons)')).toBe('none');
    // 道筋は残る
    expect(displayOf('main.main.world')).toBe('');
    expect(displayOf('main > div.container')).toBe('');
    expect(document.getElementById('ptc-host')!.style.display).toBe('');
  });

  it('puts the page back when it stops', async () => {
    const mount = makeChromeMount({ solo: true });
    await mount.start();
    mount.stop();

    expect(displayOf('div.run-card')).toBe('');
    expect(displayOf('div.row:has(div.runHeader)')).toBe('');
    expect(document.body.style.margin).toBe('');
  });

  it('paints the background it was given and clears what would cover it', async () => {
    const mount = makeChromeMount({ background: '#00ff00' });
    await mount.start();

    // jsdom は色を rgb() に直して持つ
    expect(document.body.style.backgroundColor).toBe('rgb(0, 255, 0)');
    expect(
      document.querySelector<HTMLElement>('main.main.world')!.style.backgroundColor,
    ).toBe('transparent');
    // 背景だけ頼んだので、まわりは消さない
    expect(displayOf('div.run-card')).toBe('');

    mount.stop();
    expect(document.body.style.backgroundColor).toBe('');
  });

  it('flattens the frame the table sits in, and puts it back', async () => {
    const mount = makeChromeMount({ flat: true });
    await mount.start();

    const frame = document.getElementById('ptc-host')!.parentElement!;
    expect(frame.style.boxShadow).toBe('none');
    expect(frame.style.backgroundColor).toBe('transparent');
    expect(frame.style.borderRadius).toBe('0px');
    // 枠を消すだけなので、まわりは消さない
    expect(displayOf('div.run-card')).toBe('');

    mount.stop();
    expect(frame.style.boxShadow).toBe('');
    expect(frame.style.backgroundColor).toBe('');
    expect(frame.style.borderRadius).toBe('');
  });

  it('touches nothing when the overlay is off', async () => {
    await makeChromeMount({}).start();
    expect(displayOf('div.run-card')).toBe('');
    expect(document.body.style.backgroundColor).toBe('');
  });
});

describe('createMount', () => {
  it('inserts the host as a sibling BEFORE run-card, never inside it', async () => {
    const mount = makeMount();
    await mount.start();

    const host = document.getElementById('ptc-host')!;
    const card = document.querySelector('div.run-card')!;
    expect(host.parentElement).toBe(card.parentElement);
    expect(host.nextElementSibling).toBe(card);
    expect(card.contains(host)).toBe(false);
  });

  it('renders into a shadow root so page styles cannot reach it', async () => {
    const mount = makeMount();
    await mount.start();
    const host = document.getElementById('ptc-host')!;
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot!.querySelector('.mcsr-indicator')).not.toBeNull();
    // jsdom に adoptedStyleSheets が無いので <style> の方に落ちる
    const hasStyles =
      host.shadowRoot!.querySelector('style') !== null ||
      host.shadowRoot!.adoptedStyleSheets?.length > 0;
    expect(hasStyles).toBe(true);
  });

  it('is idempotent — starting twice leaves exactly one host', async () => {
    let renders = 0;
    const mount = makeMount(() => {
      renders++;
    });
    await mount.start();
    await mount.start();
    expect(document.querySelectorAll('#ptc-host').length).toBe(1);
    expect(renders).toBe(1);
  });

  it('re-attaches when the page rips the host out', async () => {
    const mount = makeMount();
    await mount.start();
    document.getElementById('ptc-host')!.remove();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.getElementById('ptc-host')?.isConnected).toBe(true);
  });

  it('re-attaches after the page rebuilds the tree it was anchored in', async () => {
    /*
     * hydration に失敗した React は木をまるごと作り直す。掴んでいた目印は捨てられて
     * 二度と繋がらないので、引き直せないとホストは戻らない（Firefox で
     * トップページが出なかった経路）。ホストは作り直さず動かすだけ。
     */
    const mount = makeMount();
    await mount.start();
    const host = document.getElementById('ptc-host')!;
    const oldCard = document.querySelector('div.run-card')!;

    document.body.innerHTML = runPageHtml;
    await new Promise((r) => setTimeout(r, 30));

    const card = document.querySelector('div.run-card')!;
    expect(card).not.toBe(oldCard);
    expect(document.getElementById('ptc-host')).toBe(host);
    expect(host.nextElementSibling).toBe(card);
    mount.stop();
  });

  it('leaves nothing behind after stop (SPA navigation)', async () => {
    const mount = makeMount();
    await mount.start();
    mount.stop();
    expect(document.getElementById('ptc-host')).toBeNull();

    // stop 後は貼り直しの observer も止まっていること
    await new Promise((r) => setTimeout(r, 30));
    expect(document.getElementById('ptc-host')).toBeNull();
  });

  it('does nothing when the anchor never appears', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const mount = makeMount();
    await mount.start();
    expect(document.getElementById('ptc-host')).toBeNull();
  });
});

const homePageHtml = readFileSync(resolve('fixtures/dom/home-page.html'), 'utf8');
/** ランが 0 本のとき本家が出す表示。行のスクローラは DOM ごと消える。 */
const homeEmptyHtml = readFileSync(resolve('fixtures/dom/home-page-empty.html'), 'utf8');
const homeAnchor = ANCHORS.find((a) => a.kind === 'home')!;

describe('home page placement', () => {
  const mountHome = () => {
    const mount = createMount({
      hostId: 'ptc-host',
      anchor: homeAnchor,
      css: '',
      anchorTimeoutMs: 500,
      render: (root, page) => {
        pages.push(page);
        const el = document.createElement('div');
        root.appendChild(el);
        return () => el.remove();
      },
    });
    mounts.push(mount);
    return mount;
  };

  const pages: { setReplacing: (on: boolean) => void }[] = [];
  const mounts: { stop: () => void }[] = [];
  const scroller = () =>
    document.querySelector<HTMLElement>('div.overflow-y-auto[class*="max-h-"]');
  const content = () => document.querySelector<HTMLElement>('div.overflow-auto.h-full')!;

  beforeEach(() => {
    // 前のテストのマウントを残さない。観測者と PageControl が積み上がる
    for (const m of mounts) m.stop();
    mounts.length = 0;
    pages.length = 0;
    document.body.innerHTML = homePageHtml;
  });

  it('sits between the card header and the content area', async () => {
    await mountHome().start();
    const host = document.getElementById('ptc-host')!;

    // カードのヘッダの直下、本家の内容領域の直前
    expect(host.nextElementSibling).toBe(content());
    // 行そのものには触らない。毎秒 index キーで貼り替えられる
    expect(scroller()!.contains(host)).toBe(false);
    // 内容領域の外。中に入れると空表示への差し替えで巻き取られる
    expect(content().contains(host)).toBe(false);
  });

  it('mounts in the same place when nobody is on pace', async () => {
    /*
     * ランが 0 本だと本家はスクローラを DOM ごと外し、中央寄せの
     * "No one is currently on pace..." に差し替える。スクローラを目印にしていた頃は、
     * この差し替えでホストがその中に巻き取られて潰れていた。
     */
    document.body.innerHTML = homeEmptyHtml;
    await mountHome().start();
    const host = document.getElementById('ptc-host')!;

    expect(scroller()).toBeNull();
    expect(host.nextElementSibling).toBe(content());
    expect(content().contains(host)).toBe(false);
  });

  it('hides the original rows only while we have a table to show', async () => {
    expect(scroller()!.style.display).toBe('');
    await mountHome().start();
    const page = pages.at(-1)!;

    // 描画側が出せていると言うまでは隠さない。既定で隠すと、描画が落ちたときに
    // 本家を消したまま何も出せない状態が残る
    expect(scroller()!.style.display).toBe('');

    page.setReplacing(true);
    expect(scroller()!.style.display).toBe('none');

    page.setReplacing(false);
    expect(scroller()!.style.display).toBe('');
  });

  it('puts the rows back even after the page rewrites their classes', () => {
    /*
     * 戻すときにセレクタで引き直すと、ページ側が max-h-* を落とした瞬間に一致しなくなり、
     * 隠したまま戻せない。控えた要素の方を戻す。
     */
    const mount = mountHome();
    return mount.start().then(() => {
      const page = pages.at(-1)!;
      page.setReplacing(true);
      const el = scroller()!;
      expect(el.style.display).toBe('none');

      el.className = 'overflow-y-auto pb-4';
      expect(scroller()).toBeNull();

      page.setReplacing(false);
      expect(el.style.display).toBe('');
    });
  });

  it('keeps the widened card while the rows are shown again', async () => {
    // 条件付きの規則を外しても、無条件のカード幅は巻き添えにしない
    await mountHome().start();
    const card = document.querySelector<HTMLElement>(
      'main > div > div:has(> div.overflow-auto.h-full)',
    )!;
    const page = pages.at(-1)!;
    page.setReplacing(true);
    expect(card.style.maxWidth).toBe('none');

    page.setReplacing(false);
    expect(card.style.maxWidth).toBe('none');
  });

  it('puts the original rows back on teardown', async () => {
    const mount = mountHome();
    await mount.start();
    mount.stop();
    expect(scroller()!.style.display).toBe('');
    expect(document.getElementById('ptc-host')).toBeNull();
  });

  it('re-hides the rows if the page re-renders them visible', async () => {
    await mountHome().start();
    pages.at(-1)!.setReplacing(true);
    scroller()!.style.display = 'block';
    // observer はカードの subtree を見ているので、変化を起こして再適用させる
    scroller()!.parentElement!.appendChild(document.createElement('span'));
    await new Promise((r) => setTimeout(r, 30));
    expect(scroller()!.style.display).toBe('none');
  });

  it('widens the card so the timeline column has room, and puts it back', async () => {
    // カードはクラス名ではなく構造で取る
    const card = () =>
      document.querySelector<HTMLElement>(
        'main > div > div:has(> div.overflow-auto)',
      )!;
    expect(card()).not.toBeNull();
    expect(card().style.maxWidth).toBe('');

    const mount = mountHome();
    await mount.start();
    expect(card().style.maxWidth).toBe('none');

    mount.stop();
    expect(card().style.maxWidth).toBe('');
  });

  it('does nothing when the row list never appears', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    await mountHome().start();
    expect(document.getElementById('ptc-host')).toBeNull();
  });
});
