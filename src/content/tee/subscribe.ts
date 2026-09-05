/**
 * isolated world 側。MAIN world から流れてくるペイロードを受ける。
 * 自前でリクエストは出さない。ページが叩いているものを横取りするだけ。
 *
 * パッチは document_start、マウントは document_idle 以降なので、購読するころには
 * ページの初回リクエストが済んでいる。その空白は TEE_REPLAY で埋める。
 */

import {
  TEE_MESSAGE,
  TEE_REPLAY,
  type TeeKind,
  type TeeMessage,
  type TeeReplayRequest,
} from './protocol.js';

const isTeeMessage = (d: unknown): d is TeeMessage =>
  typeof d === 'object' &&
  d !== null &&
  (d as { type?: unknown }).type === TEE_MESSAGE &&
  typeof (d as { kind?: unknown }).kind === 'string' &&
  typeof (d as { at?: unknown }).at === 'number';

export type SubscribeOptions = {
  kind: TeeKind;
  /**
   * at はページが受け取った時刻。再生されたものは今より古い。
   * live のタイム推定はここを起点にする。
   */
  onPayload: (payload: unknown, at: number) => void;
  win?: Window;
};

export const subscribeTee = ({ kind, onPayload, win = window }: SubscribeOptions): (() => void) => {
  const onMessage = (e: MessageEvent): void => {
    // 同一ウィンドウからのものだけ受ける
    if (e.source !== win || !isTeeMessage(e.data) || e.data.kind !== kind) return;
    onPayload(e.data.payload, e.data.at);
  };
  win.addEventListener('message', onMessage);

  // 購読前に流れた分を取り戻す。控えが無ければ何も返らず、次のポーリングで届く
  const replay: TeeReplayRequest = { type: TEE_REPLAY, kind };
  try {
    win.postMessage(replay, win.location.origin);
  } catch {
    /* 再生できなくても次のポーリングで届く */
  }

  return () => win.removeEventListener('message', onMessage);
};
