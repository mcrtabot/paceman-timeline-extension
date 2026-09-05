/** content script 側。通信は必ず background 経由。理由は background/broker.ts。 */

import type { FetchJsonRequest, FetchJsonResponse } from './messages.js';

/** 完走したランは不変なので長く持てる。 */
export const TTL = {
  finishedRun: 24 * 60 * 60_000,
  liveRun: 5_000,
  liveRuns: 3_000,
  playerRuns: 30_000,
  pb: 10 * 60_000,
} as const;

export const fetchJson = async (path: string, ttlMs: number): Promise<unknown> => {
  const req: FetchJsonRequest = { type: 'ptc:fetchJson', path, ttlMs };
  const res = (await chrome.runtime.sendMessage(req)) as FetchJsonResponse | undefined;
  if (!res) throw new Error('background service worker did not respond');
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

export const getWorld = (worldId: string, isLikelyLive: boolean): Promise<unknown> =>
  fetchJson(
    `/stats/api/getWorld/?worldId=${encodeURIComponent(worldId)}`,
    isLikelyLive ? TTL.liveRun : TTL.finishedRun,
  );

export const getLiveRuns = (): Promise<unknown> =>
  fetchJson('/api/ars/liveruns', TTL.liveRuns);
