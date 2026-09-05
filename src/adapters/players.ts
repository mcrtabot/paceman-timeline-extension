/**
 * GET /api/ars/players からプレイヤー名の一覧へ。返るのは { playerList: string[] } で、
 * 中身は UUID ではなく Minecraft の名前。トップページは 1 秒ごとに取って人数だけ出している。
 *
 * 載るのは今 MCSR を回している人で、ペースが出ている人ではない。
 * liveruns に出るのはそのうちスプリットを踏んだ一部だけ。
 */

export const fromPlayers = (raw: unknown): string[] => {
  const list =
    typeof raw === 'object' && raw !== null && Array.isArray((raw as { playerList?: unknown }).playerList)
      ? (raw as { playerList: unknown[] }).playerList
      : Array.isArray(raw)
        ? raw
        : [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v === 'string' && v.length > 0) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
};
