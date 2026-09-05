/**
 * paceman.gg の DOM に依存する記述はここに集める。ページが変わって壊れるのもここだけ。
 * セレクタは 2026-09-05 の実ページから採った。
 */

export type PageKind = 'run' | 'home' | 'playerRuns' | 'player';

export type AnchorSpec = {
  kind: PageKind;
  /** location.pathname がこれに一致するページで有効。 */
  matchPath: (pathname: string) => boolean;
  /** マウント位置の基準要素。 */
  selector: string;
  /** 基準要素の前に挿すか、後ろに挿すか。 */
  place: 'before' | 'after';
  /**
   * ホストに足すインラインスタイル。既定は block なので、見出しの行に混ぜたいときに使う。
   */
  hostStyle?: Readonly<Record<string, string>>;
  /** 目印から挿し場所まで登り直す。null ならマウントしない。 */
  lift?: (found: Element, doc: Document) => Element | null;
  /** マウント中だけページ側に当てるスタイル。stop() で戻す。 */
  styleWhileMounted?: ReadonlyArray<{
    selector: string;
    style: Readonly<Record<string, string>>;
    /**
     * 自前の表を出せているあいだだけ当てる。横取りが届かないときやランが 0 本のとき、
     * 本家を隠したまま自分も何も出せない状態になるのを避ける。
     */
    onlyWhenReplacing?: boolean;
  }>;
};

export const ANCHORS: readonly AnchorSpec[] = [
  {
    kind: 'run',
    // /stats/run/<id>/ 。nginx 側で /stats を剥がすので pathname は両方ありうる
    matchPath: (p) => /^\/(?:stats\/)?run\/[^/]+\/?$/.test(p),
    /*
     * 祖先は main.main.world > div.container > div.row > div.col-12 > div.run-card。
     * col-12 の子は run-card 1 つだけなので、その兄弟に挿せば
     * Zustand の更新で再描画される run-card の中に入らずに済む。
     */
    selector: 'div.run-card',
    place: 'before',
  },
  {
    kind: 'home',
    matchPath: (p) => p === '/' || p === '',
    /*
     * 目印はカードの内容領域。カードの子は [ヘッダ, 内容領域] の 2 つで、どちらも
     * 空/非空で入れ替わらない。
     *
     * 行のスクローラ（div.overflow-y-auto.max-h-[50vh]）を目印にすると壊れる。
     * ランが 0 本になると本家はスクローラを外して
     * div.flex.items-center.justify-center.py-16 に差し替えるので、
     * その隣に置いたホストが新しい要素の中に取り込まれて潰れた。
     *
     * .h-full まで含めるのは、overflow-auto だけだと main 内の別の枠を先に拾うため。
     */
    selector: 'main > div > div > div.overflow-auto.h-full',
    place: 'before',
    styleWhileMounted: [
      // 本家の行を隠す。自前の表を出せているときだけ
      {
        selector: 'div.overflow-y-auto[class*="max-h-"]',
        style: { display: 'none' },
        onlyWhenReplacing: true,
      },
      /*
       * カードの max-w-5xl を外してコンテナ幅まで広げる。TIMELINE 列を足すと
       * 1024px では足りない。main の max-width まで外すと 1648px になるが、
       * そこまで行くとページ全体のレイアウトが変わる。
       *
       * onlyWhenReplacing は付けない。ランが出入りするたびに幅が跳ねる。
       */
      {
        selector: 'main > div > div:has(> div.overflow-auto.h-full)',
        style: { 'max-width': 'none' },
      },
    ],
  },
  {
    kind: 'playerRuns',
    matchPath: (p) => /^\/(?:stats\/)?player\/[^/]+\/runs\/?$/.test(p),
    selector: 'div.fastRunsGrid',
    place: 'before',
  },
  {
    /*
     * プロフィール。見出しは
     *   main.playerStats > div.container > h1.header > [span"Stats for <名前>", img.titleHead]
     * という並びなので、頭アイコンの後ろに挿せば名前のすぐ横に出る。
     * h1 の中に入るので、ホストは inline-block にしないと行が折れる。
     */
    kind: 'player',
    matchPath: (p) => /^\/(?:stats\/)?player\/[^/]+\/?$/.test(p),
    selector: 'main.playerStats h1.header img.titleHead',
    place: 'after',
    hostStyle: { display: 'inline-block', 'vertical-align': 'middle' },
  },
];

export const anchorForPath = (pathname: string): AnchorSpec | null =>
  ANCHORS.find((a) => a.matchPath(pathname)) ?? null;
