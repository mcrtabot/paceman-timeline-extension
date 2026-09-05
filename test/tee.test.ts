/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fromLiveRuns } from '../src/adapters/liveruns.js';
import { sortRuns } from '../src/content/pages/home.js';
import { nickFromPath } from '../src/content/pages/playerRuns.js';
import { waitForHydration } from '../src/content/hydration.js';
import {
  type HydratedAsk,
  type HydratedSay,
  kindForUrl,
  TEE_HYDRATED_ASK,
  TEE_HYDRATED_SAY,
  TEE_MESSAGE,
  TEE_REPLAY,
  type TeeMessage,
} from '../src/content/tee/protocol.js';
import { subscribeTee } from '../src/content/tee/subscribe.js';

const liveruns = JSON.parse(readFileSync(resolve('fixtures/api/liveruns.json'), 'utf8'));

const postTee = (kind: TeeMessage['kind'], payload: unknown) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: TEE_MESSAGE, kind, payload, at: Date.now() } satisfies TeeMessage,
      source: window,
    }),
  );
};

describe('kindForUrl', () => {
  it('recognises the endpoints worth intercepting', () => {
    expect(kindForUrl('https://paceman.gg/api/ars/liveruns')).toBe('liveruns');
    expect(kindForUrl('/api/ars/liveruns?gameVersion=all')).toBe('liveruns');
    expect(kindForUrl('/stats/api/getPlayerRuns/?uuid=x&page=0')).toBe('playerRuns');
  });
  it('recognises the players endpoint the page already polls', () => {
    expect(kindForUrl('/api/ars/players')).toBe('players');
  });

  it('ignores everything else', () => {
    expect(kindForUrl('/stats/api/getWorld/?worldId=x')).toBeNull();
    expect(kindForUrl('/_next/static/chunk.js')).toBeNull();
  });
});

describe('subscribeTee', () => {
  it('delivers payloads the page fetched, with no request of our own', () => {
    const seen: unknown[] = [];
    const stop = subscribeTee({ kind: 'liveruns', onPayload: (payload) => seen.push(payload) });
    postTee('liveruns', liveruns);
    stop();
    expect(seen).toHaveLength(1);
    expect(fromLiveRuns(seen[0])).toHaveLength(3);
  });

  it('ignores messages for another kind', () => {
    const onPayload = vi.fn();
    const stop = subscribeTee({ kind: 'liveruns', onPayload });
    postTee('playerRuns', []);
    stop();
    expect(onPayload).not.toHaveBeenCalled();
  });

  it('ignores messages that did not come from this window', () => {
    const onPayload = vi.fn();
    const stop = subscribeTee({ kind: 'liveruns', onPayload });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: TEE_MESSAGE, kind: 'liveruns', payload: [], at: 0 },
        source: null,
      }),
    );
    stop();
    expect(onPayload).not.toHaveBeenCalled();
  });

  it('stops listening after teardown', () => {
    const onPayload = vi.fn();
    subscribeTee({ kind: 'liveruns', onPayload })();
    postTee('liveruns', liveruns);
    expect(onPayload).not.toHaveBeenCalled();
  });

  it('asks the MAIN world to replay what it already has', () => {
    // パッチは document_start、マウントは document_idle 以降。その空白を再生で埋める
    const posted: unknown[] = [];
    const spy = vi.spyOn(window, 'postMessage').mockImplementation((m: unknown) => {
      posted.push(m);
    });
    subscribeTee({ kind: 'players', onPayload: () => {} })();
    spy.mockRestore();
    expect(posted).toEqual([{ type: TEE_REPLAY, kind: 'players' }]);
  });
});

describe('subscribeTee — how many requests we actually make', () => {
  it('never issues a request of its own, tee or no tee', async () => {
    /*
     * 見張るのは globalThis.fetch ではなく chrome.runtime.sendMessage。
     * content script の通信は必ず background 経由なので、fetch を見ていても
     * 自前取得が戻ってきたことに気づけない。
     */
    const sendMessage = vi.fn();
    const prevChrome = (globalThis as { chrome?: unknown }).chrome;
    (globalThis as { chrome?: unknown }).chrome = { runtime: { sendMessage } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onPayload = vi.fn();
    const stop = subscribeTee({ kind: 'liveruns', onPayload });

    // 何も届かないまま放置しても自前では取りに行かない
    await new Promise((r) => setTimeout(r, 50));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onPayload).not.toHaveBeenCalled();

    // ページのポーリングが届けば描ける
    postTee('liveruns', liveruns);
    expect(onPayload).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    stop();
    fetchSpy.mockRestore();
    (globalThis as { chrome?: unknown }).chrome = prevChrome;
  });

  it('hands the payload over with the time the page received it', () => {
    // 再生された応答は今より古い。at を今の時刻にするとタイム推定が進みすぎる
    const seen: number[] = [];
    const stop = subscribeTee({ kind: 'liveruns', onPayload: (_p, at) => seen.push(at) });
    const at = Date.now() - 8_000;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: TEE_MESSAGE, kind: 'liveruns', payload: liveruns, at } satisfies TeeMessage,
        source: window,
      }),
    );
    stop();
    expect(seen).toEqual([at]);
  });
});

describe('sortRuns — the order you can pick in Settings', () => {
  // 到達スプリットは見ない。elapsed は現在タイムの長い順だけで決まる
  const run = (nick: string, stage: string, splitIgt: number) =>
    ({
      nickname: nick,
      items: [
        { type: 'overworld', igt: 0 },
        { type: 'enter_nether', igt: splitIgt - 60_000 },
        { type: stage, igt: splitIgt },
      ],
    }) as never;

  // ahead の方が先まで進んでいるが、現在タイムは behind の方が長い
  const ahead = run('ahead', 'enter_bastion', 120_000);
  const behind = run('behind', 'enter_nether', 90_000);
  const runs = [ahead, behind];
  const igtOf = (r: unknown) => (r === ahead ? 160_000 : 720_000);

  it('sorts by the current time alone, longest first', () => {
    expect(sortRuns(runs, 'elapsed', igtOf).map((r) => r.nickname)).toEqual(['behind', 'ahead']);
  });

  it("leaves PaceMan's own order alone by default", () => {
    const original = fromLiveRuns(liveruns);
    expect(sortRuns(original, 'page').map((r) => r.nickname)).toEqual(
      original.map((r) => r.nickname),
    );
  });

  it('does not mutate its input in either mode', () => {
    const original = fromLiveRuns(liveruns);
    const before = original.map((r) => r.nickname);
    for (const mode of ['page', 'elapsed'] as const) sortRuns(original, mode);
    expect(original.map((r) => r.nickname)).toEqual(before);
  });
});

describe('nickFromPath', () => {
  it('reads the nickname from both path shapes', () => {
    expect(nickFromPath('/stats/player/3x7en/runs/')).toBe('3x7en');
    expect(nickFromPath('/player/Feinberg/runs')).toBe('Feinberg');
  });
  it('rejects the profile page (no timeline there)', () => {
    expect(nickFromPath('/stats/player/3x7en/')).toBeNull();
  });
});

describe('waitForHydration', () => {
  /** MAIN world の代役。問い合わせに答えるだけ。 */
  const answerWith = (hydrated: boolean): (() => void) => {
    const onMessage = (e: MessageEvent) => {
      const d: unknown = e.data;
      if (typeof d !== 'object' || d === null) return;
      if ((d as HydratedAsk).type !== TEE_HYDRATED_ASK) return;
      const say: HydratedSay = { type: TEE_HYDRATED_SAY, id: (d as HydratedAsk).id, hydrated };
      window.dispatchEvent(new MessageEvent('message', { data: say, source: window }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  };

  it('resolves with the answer from the main world', async () => {
    const stop = answerWith(true);
    await expect(waitForHydration('div.run-card')).resolves.toBe(true);
    stop();
  });

  it('resolves false when the page turns out not to be hydrating', async () => {
    const stop = answerWith(false);
    await expect(waitForHydration('div.run-card')).resolves.toBe(false);
    stop();
  });

  it('gives up at the timeout so a missing main world cannot block the mount', async () => {
    // 横取りが入っていない環境で、待ち続けて何も描けないままにしない
    await expect(waitForHydration('div.run-card', { timeoutMs: 20 })).resolves.toBe(false);
  });
});
