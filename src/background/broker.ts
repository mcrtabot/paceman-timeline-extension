/**
 * すべての通信を集約する service worker。
 *
 * MV3 では content script の fetch がページのオリジンとして CORS 判定され、
 * host_permissions が効かない。それとは別に、次を 1 か所にまとめられる。
 *   - path ごとのトークンバケット。一覧が PB を 20 件引きに行くときに要る
 *   - 同一リクエストの重複排除
 *   - 429 の Retry-After を尊重したネガティブキャッシュ
 *   - 遷移で content script が死んでも生き残るキャッシュ
 *
 * PaceMan 側の制限は getWorld 240/分、getPlayerRuns 120/分、既定 180/分。
 * こちらはそれよりずっと手前で止める。
 */

import type {
  FetchDataUrlResponse,
  FetchJsonRequest,
  FetchJsonResponse,
} from '../net/messages.js';

const ORIGIN = 'https://paceman.gg';

/** path ごとの 1 分あたりの上限。PaceMan の公称値より十分低く取る。 */
const RATE_LIMITS: ReadonlyArray<{ match: RegExp; perMinute: number }> = [
  { match: /^\/stats\/api\/getWorld\//, perMinute: 60 },
  { match: /^\/stats\/api\/getPlayerRuns\//, perMinute: 30 },
  { match: /^\/stats\/api\/getPBs\//, perMinute: 30 },
  { match: /^\/api\/ars\/liveruns/, perMinute: 30 },
];
const DEFAULT_PER_MINUTE = 30;

const limitFor = (path: string): number =>
  RATE_LIMITS.find((r) => r.match.test(path))?.perMinute ?? DEFAULT_PER_MINUTE;

// --- トークンバケット。path のグループ単位 ---

type Bucket = { tokens: number; lastRefill: number; capacity: number };
const buckets = new Map<string, Bucket>();

const bucketKey = (path: string): string => path.split('?')[0] ?? path;

const takeToken = (path: string): boolean => {
  const key = bucketKey(path);
  const capacity = limitFor(path);
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, lastRefill: now, capacity };
    buckets.set(key, b);
  }
  const refill = ((now - b.lastRefill) / 60_000) * b.capacity;
  if (refill > 0) {
    b.tokens = Math.min(b.capacity, b.tokens + refill);
    b.lastRefill = now;
  }
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
};

// --- キャッシュ / 重複排除 / ネガティブキャッシュ ---

type Entry = { data: unknown; expiresAt: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<FetchJsonResponse>>();
/** 429 を食らった path は、Retry-After が明けるまで叩かない。 */
const blockedUntil = new Map<string, number>();

const MAX_CACHE_ENTRIES = 300;

const putCache = (key: string, data: unknown, ttlMs: number): void => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // 挿入順なので先頭が最古
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
};

const doFetch = async (path: string, ttlMs: number): Promise<FetchJsonResponse> => {
  const blocked = blockedUntil.get(bucketKey(path)) ?? 0;
  if (Date.now() < blocked) {
    return { ok: false, error: 'rate limited by server', retryAfterMs: blocked - Date.now() };
  }
  if (!takeToken(path)) {
    return { ok: false, error: 'rate limited locally' };
  }

  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      credentials: 'omit',
      headers: { accept: 'application/json' },
    });

    if (res.status === 429) {
      const retryAfterSec = Number(res.headers.get('retry-after') ?? '60');
      const waitMs = (Number.isFinite(retryAfterSec) ? retryAfterSec : 60) * 1000;
      blockedUntil.set(bucketKey(path), Date.now() + waitMs);
      return { ok: false, error: 'HTTP 429', retryAfterMs: waitMs };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const data: unknown = await res.json();
    putCache(path, data, ttlMs);
    return { ok: true, data, fromCache: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

const handleFetchJson = (path: string, ttlMs: number): Promise<FetchJsonResponse> => {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now()) {
    return Promise.resolve({ ok: true, data: hit.data, fromCache: true });
  }
  const pending = inflight.get(path);
  if (pending) return pending;

  const p = doFetch(path, ttlMs).finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
};

/** 画像を data URL にして返す。設定画面のアイコン見本に使う。 */
const dataUrlCache = new Map<string, string>();

const handleFetchDataUrl = async (path: string): Promise<FetchDataUrlResponse> => {
  const cached = dataUrlCache.get(path);
  if (cached) return { ok: true, dataUrl: cached };
  try {
    const res = await fetch(`${ORIGIN}${path}`, { credentials: 'omit' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(blob);
    });
    dataUrlCache.set(path, dataUrl);
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

const isFetchJson = (m: unknown): m is FetchJsonRequest =>
  typeof m === 'object' &&
  m !== null &&
  (m as { type?: unknown }).type === 'ptc:fetchJson' &&
  typeof (m as { path?: unknown }).path === 'string' &&
  (m as { path: string }).path.startsWith('/');

const isFetchDataUrl = (m: unknown): m is { type: 'ptc:fetchDataUrl'; path: string } =>
  typeof m === 'object' &&
  m !== null &&
  (m as { type?: unknown }).type === 'ptc:fetchDataUrl' &&
  typeof (m as { path?: unknown }).path === 'string' &&
  (m as { path: string }).path.startsWith('/');

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isFetchJson(message)) {
    void handleFetchJson(message.path, message.ttlMs).then(sendResponse);
    return true; // 非同期で応答する
  }
  if (isFetchDataUrl(message)) {
    void handleFetchDataUrl(message.path).then(sendResponse);
    return true;
  }
  return false;
});
