/** MAIN world ⇄ isolated world の橋渡し。window.postMessage で運ぶ。 */

export const TEE_MESSAGE = 'ptc:tee';

/** 直近のペイロードをもう一度流してもらう要求。購読が間に合わなかったぶんを埋める。 */
export const TEE_REPLAY = 'ptc:tee-replay';

export type TeeReplayRequest = { type: typeof TEE_REPLAY; kind: string };

/**
 * 目印の要素を React が hydrate し終えたか尋ねる／答える。
 *
 * React が DOM ノードに付ける内部プロパティで見るしかなく、それはページが足した
 * プロパティなので isolated world からは覗けない（Chrome も Firefox も見えない）。
 * 判定は MAIN world 側に置き、結果だけを postMessage で返す。
 */
export const TEE_HYDRATED_ASK = 'ptc:hydrated?';
export const TEE_HYDRATED_SAY = 'ptc:hydrated!';

export type HydratedAsk = {
  type: typeof TEE_HYDRATED_ASK;
  /** 待ち合わせの識別子。同時に複数尋ねても取り違えない。 */
  id: string;
  selector: string;
};

export type HydratedSay = {
  type: typeof TEE_HYDRATED_SAY;
  id: string;
  /** false は「hydrate 済みとは言えない」。React が居ないページでも false。 */
  hydrated: boolean;
};

/** 横取りする対象。パスの部分一致で見る。 */
export const TEE_PATTERNS = {
  liveruns: '/api/ars/liveruns',
  players: '/api/ars/players',
  playerRuns: '/stats/api/getPlayerRuns',
} as const;

export type TeeKind = keyof typeof TEE_PATTERNS;

export type TeeMessage = {
  type: typeof TEE_MESSAGE;
  kind: TeeKind;
  /** ページが受け取ったのと同じ JSON。 */
  payload: unknown;
  at: number;
};

export const kindForUrl = (url: string): TeeKind | null => {
  for (const [kind, pattern] of Object.entries(TEE_PATTERNS)) {
    if (url.includes(pattern)) return kind as TeeKind;
  }
  return null;
};
