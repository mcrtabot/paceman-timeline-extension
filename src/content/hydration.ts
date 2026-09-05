/**
 * PaceMan の React が hydrate し終えるのを待つ。
 *
 * SSR された HTML に要素を足すのは、hydrate が終わるまでは踏んではいけない。
 * React が不一致と見なして木をまるごと作り直し（production の #418）、
 * そのとき掴んでいた目印の要素は捨てられて二度と繋がらない。ホストは貼り直す先を
 * 失い、タイムラインが出ないまま終わる。Firefox で「たまに出る」ことがあったのは
 * content script のマウントと hydration の競争に勝ったときだけ出ていたため。
 *
 * 判定そのものは MAIN world（tee/main-world.ts）が持つ。ここは尋ねて待つだけ。
 */

import { type HydratedSay, TEE_HYDRATED_ASK, TEE_HYDRATED_SAY, type HydratedAsk } from './tee/protocol.js';

/**
 * 返事が来ないまま進む上限。MAIN world が入っていないページ（横取りが効かない環境）で
 * 何も出せないまま固まらないための保険。ここを過ぎたら hydration 待ちは諦めて描く。
 */
const ANSWER_TIMEOUT_MS = 12_000;

const isSay = (d: unknown, id: string): d is HydratedSay =>
  typeof d === 'object' &&
  d !== null &&
  (d as { type?: unknown }).type === TEE_HYDRATED_SAY &&
  (d as { id?: unknown }).id === id;

export type WaitForHydrationOptions = {
  win?: Window;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * 目印の要素まで hydrate が及ぶまで待つ。
 * 返り値は「hydrate 済みと確認できたか」。false でも呼び出し側は先へ進んでよい。
 */
export const waitForHydration = (
  selector: string,
  { win = window, timeoutMs = ANSWER_TIMEOUT_MS, signal }: WaitForHydrationOptions = {},
): Promise<boolean> =>
  new Promise((resolve) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const finish = (hydrated: boolean): void => {
      if (settled) return;
      settled = true;
      win.removeEventListener('message', onMessage);
      win.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(hydrated);
    };

    const onMessage = (e: MessageEvent): void => {
      if (e.source !== win || !isSay(e.data, id)) return;
      finish(e.data.hydrated);
    };
    const onAbort = (): void => finish(false);

    win.addEventListener('message', onMessage);
    const timer = win.setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });

    const ask: HydratedAsk = { type: TEE_HYDRATED_ASK, id, selector };
    try {
      win.postMessage(ask, win.location.origin);
    } catch {
      finish(false);
    }
  });
