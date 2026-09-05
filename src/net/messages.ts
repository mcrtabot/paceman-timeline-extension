/** content script ⇄ background service worker のメッセージ。 */

export type FetchJsonRequest = {
  type: 'ptc:fetchJson';
  /** paceman.gg 上の絶対パス。ホストは background 側で固定する。 */
  path: string;
  /** キャッシュの生存時間。完走ランは不変なので長くできる。 */
  ttlMs: number;
};

export type FetchJsonResponse =
  | { ok: true; data: unknown; fromCache: boolean }
  | { ok: false; error: string; retryAfterMs?: number };

/**
 * 画像などを data URL にして返す。設定画面は chrome-extension:// オリジンなので
 * PaceMan の画像を直接読むとクロスオリジンになり、/images/ は Vercel のボット対策で
 * 403 を返すこともある。host_permissions を持つ background から取る。
 */
export type FetchDataUrlRequest = {
  type: 'ptc:fetchDataUrl';
  path: string;
};

export type FetchDataUrlResponse =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

export type PtcRequest = FetchJsonRequest | FetchDataUrlRequest;
