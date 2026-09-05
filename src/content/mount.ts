/**
 * Shadow DOM ホストの生存管理。
 *
 * PaceMan の React が持つノードの中には入らない。スタイルは Shadow root に閉じる。
 * 二重マウントしない。外されたら貼り直す。
 */

import type { AnchorSpec } from './anchors.js';

/** 描画側からページ側のスタイルを出し入れする口。 */
export type PageControl = {
  /** 本家を置き換えられているか。false のあいだは本家を隠さない。 */
  setReplacing: (on: boolean) => void;
};

export type MountHandle = {
  start: () => Promise<void>;
  stop: () => void;
};

export type CreateMountOptions = {
  hostId: string;
  anchor: AnchorSpec;
  css: string;
  /**
   * shadow root に描画し、後片付けの関数を返す。
   * page.setReplacing(false) で anchors.ts の onlyWhenReplacing なスタイルが外れる。
   */
  render: (root: ShadowRoot, page: PageControl) => () => void;
  doc?: Document;
  anchorTimeoutMs?: number;
};

/** セレクタに一致する要素を待つ。既にあれば即返す。 */
export const waitForAnchor = (
  selector: string,
  { doc, timeoutMs, signal }: { doc: Document; timeoutMs: number; signal: AbortSignal },
): Promise<Element | null> => {
  const existing = doc.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (el: Element | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(el);
    };
    const onAbort = () => finish(null);

    const observer = new MutationObserver(() => {
      const el = doc.querySelector(selector);
      if (el) finish(el);
    });
    observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });

    const timer = setTimeout(() => finish(null), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
};

const applyStyles = (root: ShadowRoot, css: string): void => {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  // 構築済みスタイルシートは同じ realm の CSSStyleSheet で作らないと通らない
  if (view && 'adoptedStyleSheets' in root && typeof view.CSSStyleSheet === 'function') {
    try {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // replaceSync が無い、または adoptedStyleSheets が読み取り専用の実装
    }
  }
  const style = doc.createElement('style');
  style.textContent = css;
  root.appendChild(style);
};

export const createMount = ({
  hostId,
  anchor,
  css,
  render,
  doc = document,
  anchorTimeoutMs = 15_000,
}: CreateMountOptions): MountHandle => {
  let controller: AbortController | null = null;
  let host: HTMLElement | null = null;
  let unmountRender: (() => void) | null = null;
  let keepAlive: MutationObserver | null = null;
  /** まとめてある当て直しの取り消し。 */
  let cancelPending: (() => void) | null = null;
  /**
   * 上書きしたインラインスタイルの元の値。規則ごとに分けて持つ。
   * 要素ごとにまとめると、条件付きの規則を外したときに別の規則が当てた値まで戻る。
   */
  const overridden = new Map<number, Map<HTMLElement, Map<string, string>>>();
  const rules = anchor.styleWhileMounted ?? [];
  /**
   * 描画側が切り替える。既定は false で、出せていると言われるまで本家は隠さない。
   * true から始めると、コミットが落ちたり setReplacing が呼ばれなかったときに
   * 本家を消したまま何も出せない状態が残る。
   */
  let replacing = false;

  const recordsFor = (rule: number): Map<HTMLElement, Map<string, string>> => {
    let byEl = overridden.get(rule);
    if (!byEl) {
      byEl = new Map();
      overridden.set(rule, byEl);
    }
    return byEl;
  };

  const applyPageStyles = (): void => {
    rules.forEach(({ selector, style, onlyWhenReplacing }, rule) => {
      if (onlyWhenReplacing && !replacing) return;
      const byEl = recordsFor(rule);
      // ページが差し替えた要素の控えは捨てる。外れた DOM を掴み続けてしまう
      for (const el of byEl.keys()) if (!el.isConnected) byEl.delete(el);
      for (const el of doc.querySelectorAll<HTMLElement>(selector)) {
        let saved = byEl.get(el);
        if (!saved) {
          saved = new Map();
          byEl.set(el, saved);
        }
        for (const [prop, value] of Object.entries(style)) {
          // 元の値は最初の一度だけ覚える。ページが戻したら当て直す。
          if (!saved.has(prop)) saved.set(prop, el.style.getPropertyValue(prop));
          if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
        }
      }
    });
  };

  /**
   * 1 つの規則が当てたぶんだけ戻す。控えてある要素を直接触る。
   * セレクタで引き直すと、ページ側のクラスが変わって一致しなくなったときに戻せない。
   */
  const restoreRule = (rule: number): void => {
    const byEl = overridden.get(rule);
    if (!byEl) return;
    for (const [el, saved] of byEl) {
      for (const [prop, value] of saved) {
        if (value) el.style.setProperty(prop, value);
        else el.style.removeProperty(prop);
      }
    }
    overridden.delete(rule);
  };

  const page: PageControl = {
    setReplacing: (on) => {
      if (replacing === on) return;
      replacing = on;
      if (on) {
        applyPageStyles();
        return;
      }
      rules.forEach((entry, rule) => {
        if (entry.onlyWhenReplacing) restoreRule(rule);
      });
    },
  };

  const restorePageStyles = (): void => {
    // 後から当てた規則から戻す。同じ性質を二重に触っていても順序が合う
    for (const rule of [...overridden.keys()].sort((a, b) => b - a)) restoreRule(rule);
    overridden.clear();
  };

  /** 目印を引き直す。lift 付きなら挿し場所まで登り直したものを返す。 */
  const resolveAnchor = (): Element | null => {
    const found = doc.querySelector(anchor.selector);
    if (!found) return null;
    return anchor.lift ? anchor.lift(found, doc) : found;
  };

  const attach = (firstAnchor: Element): void => {
    // ページが木を作り直すと差し替わる。引き直したものをここで持ち替える
    let anchorEl: Element = firstAnchor;
    if (!anchorEl.parentElement) return;

    const place = (): void => {
      const parent = anchorEl.parentElement;
      if (!host || !parent) return;
      if (anchor.place === 'before') parent.insertBefore(host, anchorEl);
      else parent.insertBefore(host, anchorEl.nextSibling);
    };

    host = doc.createElement('div');
    host.id = hostId;
    // ページ側のモーダルに埋もれないように。position は流し込み先に任せる
    host.style.setProperty('z-index', '10');
    host.style.setProperty('position', 'relative');
    for (const [prop, value] of Object.entries(anchor.hostStyle ?? {})) {
      host.style.setProperty(prop, value);
    }

    const root = host.attachShadow({ mode: 'open' });
    applyStyles(root, css);
    unmountRender = render(root, page);

    place();
    applyPageStyles();

    /*
     * 外されたら貼り直す。要素が差し替わったらスタイルも当て直す。
     * 行は毎秒貼り替わるので、変化のたびに :has 付きの querySelectorAll を回すと
     * 止まらなくなる。1 フレームに 1 回へまとめる。
     */
    let pending = 0;
    const view = doc.defaultView;
    const schedule = (): void => {
      if (pending) return;
      pending = view?.requestAnimationFrame
        ? view.requestAnimationFrame(() => {
            pending = 0;
            applyPageStyles();
          })
        : (setTimeout(() => {
            pending = 0;
            applyPageStyles();
          }) as unknown as number);
    };
    cancelPending = () => {
      if (!pending) return;
      view?.cancelAnimationFrame?.(pending);
      clearTimeout(pending);
      pending = 0;
    };

    keepAlive = new MutationObserver(() => {
      if (host && !host.isConnected) {
        /*
         * 目印ごと差し替えられていたら引き直す。React は hydration に失敗したときや
         * ルートを描き直したときに木をまるごと作り直すので、掴んでいた要素は
         * 二度と繋がらない。掴んだままだとホストが永久に戻らない。
         * ホストは作り直さず動かすだけ。作り直すと React root ごと state が飛ぶ。
         */
        if (!anchorEl.isConnected) {
          const next = resolveAnchor();
          if (next) anchorEl = next;
        }
        if (anchorEl.isConnected) place();
      }
      schedule();
    });
    /*
     * body の subtree まで見る。隠す対象は目印より深く、ランが 0 本になると
     * 差し替えられる。親ごと作り直されることもあるので、親ではなく body に張る。
     */
    keepAlive.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  };

  const start = async (): Promise<void> => {
    // 既に生きているなら何もしない
    const already = doc.getElementById(hostId);
    if (already?.isConnected) return;

    stop();
    controller = new AbortController();
    const found = await waitForAnchor(anchor.selector, {
      doc,
      timeoutMs: anchorTimeoutMs,
      signal: controller.signal,
    });
    if (!found || controller.signal.aborted) return;

    // 目印と挿し場所が違うことがある。anchors.ts の home を参照
    const anchorEl = resolveAnchor();
    if (!anchorEl) return;
    attach(anchorEl);
  };

  const stop = (): void => {
    controller?.abort();
    controller = null;
    keepAlive?.disconnect();
    keepAlive = null;
    cancelPending?.();
    cancelPending = null;
    restorePageStyles();
    unmountRender?.();
    unmountRender = null;
    host?.remove();
    host = null;
  };

  return { start, stop };
};

/** App Router のクライアント遷移ではリロードが起きないので、pathname を見て張り直す。 */
export const observePathname = (
  onChange: (pathname: string) => void,
  { win = window, intervalMs = 250 }: { win?: Window; intervalMs?: number } = {},
): (() => void) => {
  let last = win.location.pathname;
  const tick = () => {
    const now = win.location.pathname;
    if (now !== last) {
      last = now;
      onChange(now);
    }
  };
  const timer = win.setInterval(tick, intervalMs);
  win.addEventListener('popstate', tick);
  return () => {
    win.clearInterval(timer);
    win.removeEventListener('popstate', tick);
  };
};
