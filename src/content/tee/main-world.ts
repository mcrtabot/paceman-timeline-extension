/**
 * MAIN world で走る唯一のコード。ページの fetch と XHR を差し替える。
 *
 * ページが 1 req/s で叩いている liveruns / getPlayerRuns を横取りして、
 * 自分では 1 本もリクエストを出さずに同じデータを得る。
 *
 * ここで例外を投げると paceman.gg 自体が壊れる。レスポンスは clone() してから読み、
 * 元の body には触らない。
 *
 * 実測では liveruns は fetch 経由で window.fetch はネイティブのままだった。
 * XHR を張るのは axios などに移った場合の保険。
 *
 * もう 1 つ、ページの hydration が済んだかの判定もここが持つ。React が DOM ノードに
 * 付ける内部プロパティは isolated world からは覗けないので、MAIN world でしか見えない。
 */

import {
  type HydratedAsk,
  type HydratedSay,
  kindForUrl,
  TEE_HYDRATED_ASK,
  TEE_HYDRATED_SAY,
  TEE_MESSAGE,
  TEE_REPLAY,
  type TeeKind,
  type TeeMessage,
} from './protocol.js';

/**
 * 種類ごとの直近のペイロード。履歴ではなく 1 件だけ。遅れて購読した側への再生用。
 * 取った時刻とパスも覚える。再生で at を今の時刻に付け替えると受け取る側が
 * 古さを判断できず、live のタイム推定がずれる。
 */
type Cached = { payload: unknown; at: number; path: string };

const latest = new Map<TeeKind, Cached>();

/** これより古い応答は無いものとして扱う。裏に回っていた間の残骸を流さない。 */
const REPLAY_MAX_AGE_MS = 30_000;

/**
 * 見ているページに紐づくデータ。パスが変われば別人の結果なので再生しない。
 * これが無いと A の履歴から B の履歴へ遷移したとき、B の名前の下に A のランが並ぶ。
 * liveruns / players はページ横断で同じものなので対象外。
 */
const PATH_BOUND = new Set<TeeKind>(['playerRuns']);

const post = (kind: TeeKind, payload: unknown, at: number): void => {
  try {
    const msg: TeeMessage = { type: TEE_MESSAGE, kind, payload, at };
    window.postMessage(msg, window.location.origin);
  } catch {
    /* 構造化複製できない値なら諦める */
  }
};

const remember = (kind: TeeKind, payload: unknown): void => {
  const at = Date.now();
  latest.set(kind, { payload, at, path: window.location.pathname });
  post(kind, payload, at);
};

/** 再生してよい控えだけ返す。古いものと別ページのものは返さない。 */
const replayable = (kind: TeeKind): Cached | null => {
  const cached = latest.get(kind);
  if (!cached) return null;
  if (Date.now() - cached.at > REPLAY_MAX_AGE_MS) return null;
  if (PATH_BOUND.has(kind) && cached.path !== window.location.pathname) return null;
  return cached;
};

const urlOf = (input: unknown): string => {
  try {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input === 'object' && 'url' in input) {
      return String((input as { url: unknown }).url);
    }
  } catch {
    /* noop */
  }
  return '';
};

/*
 * --- hydration の見張り ---
 *
 * PaceMan は Next.js の SSR なので、HTML が来てから React が hydrate するまでに間がある。
 * その間に SSR された木へ要素を足すと React が不一致と判断し、木をまるごと作り直す
 * （production の #418）。作り直された木は別のノードなので、こちらが掴んでいた
 * 目印は二度と繋がらず、タイムラインが出ないまま終わる。
 *
 * hydrate 済みかどうかは React が DOM ノードに付ける内部プロパティで見る。これは
 * ページが足したプロパティなので isolated world からは覗けず、ここでしか判定できない。
 */

const REACT_PROP = /^__react(?:Fiber|Container|Props|Events)\$/;

const hasReactProp = (node: object | null | undefined): boolean => {
  if (!node) return false;
  try {
    for (const key of Object.keys(node)) if (REACT_PROP.test(key)) return true;
  } catch {
    /* 覗けない相手なら「無い」でよい */
  }
  return false;
};

/** その要素まで hydrate が及んだか。要素がまだ無いあいだも false。 */
const isHydrated = (selector: string): boolean => {
  try {
    return hasReactProp(document.querySelector(selector));
  } catch {
    return false;
  }
};

/** ページに React 自体が居るか。居ないなら待っても永久に来ない。 */
const hasReactRoot = (): boolean =>
  [document, document.documentElement, document.body].some((n) => hasReactProp(n));

const HYDRATION_POLL_MS = 50;
/** React が居るのに hydrate されないまま。ここまで来たら諦めて先へ進ませる。 */
const HYDRATION_MAX_MS = 10_000;
/** React が居るかどうかの判定には猶予を置く。バンドルの実行がまだかもしれない。 */
const REACT_GRACE_MS = 1_500;

const answerHydrated = ({ id, selector }: HydratedAsk): void => {
  const say = (hydrated: boolean): void => {
    try {
      const msg: HydratedSay = { type: TEE_HYDRATED_SAY, id, hydrated };
      window.postMessage(msg, window.location.origin);
    } catch {
      /* 返せなければ尋ねた側のタイムアウトに任せる */
    }
  };

  if (isHydrated(selector)) {
    say(true);
    return;
  }

  const started = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - started;
    if (isHydrated(selector)) {
      clearInterval(timer);
      say(true);
      return;
    }
    // React が居ないページ（ハーネスや将来の作り直し）で待たせ続けない
    if (elapsed > REACT_GRACE_MS && !hasReactRoot()) {
      clearInterval(timer);
      say(false);
      return;
    }
    if (elapsed > HYDRATION_MAX_MS) {
      clearInterval(timer);
      say(false);
    }
  }, HYDRATION_POLL_MS);
};

const install = (): void => {
  // --- 再生要求と hydration の問い合わせに答える ---
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return;
    const d: unknown = e.data;
    if (typeof d !== 'object' || d === null) return;
    const type = (d as { type?: unknown }).type;

    if (type === TEE_HYDRATED_ASK) {
      const ask = d as HydratedAsk;
      if (typeof ask.id === 'string' && typeof ask.selector === 'string') answerHydrated(ask);
      return;
    }

    if (type !== TEE_REPLAY) return;
    const kind = (d as { kind?: unknown }).kind as TeeKind;
    const cached = replayable(kind);
    if (cached) post(kind, cached.payload, cached.at);
  });

  // --- fetch ---
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
      const result = originalFetch.apply(this as never, args);
      try {
        const kind = kindForUrl(urlOf(args[0]));
        if (kind) {
          void result
            .then((res) => {
              // clone してから読む。ページ側の body は消費しない
              if (res.ok) {
                void res
                  .clone()
                  .json()
                  .then((d: unknown) => remember(kind, d))
                  .catch(() => {});
              }
              return res;
            })
            .catch(() => {});
        }
      } catch {
        /* 横取りに失敗してもページには影響させない */
      }
      return result;
    } as typeof fetch;
  }

  // --- XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  function patchedOpen(this: XMLHttpRequest, _method: string, url: string | URL): void {
    try {
      const kind = kindForUrl(urlOf(url));
      if (kind) {
        this.addEventListener('load', () => {
          try {
            if (this.status >= 200 && this.status < 300 && typeof this.responseText === 'string') {
              remember(kind, JSON.parse(this.responseText));
            }
          } catch {
            /* JSON でなければ捨てる */
          }
        });
      }
    } catch {
      /* noop */
    }
    // eslint-disable-next-line prefer-rest-params
    return originalOpen.apply(this, arguments as never);
  }
  XMLHttpRequest.prototype.open = patchedOpen as typeof XMLHttpRequest.prototype.open;
};

try {
  install();
} catch {
  /* ここで失敗してもページは動く */
}
