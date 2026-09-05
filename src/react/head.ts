/**
 * 走者の頭アイコン。PaceMan 自身が使っているサービスで、ページ側で既に読まれている。
 * uuid が無いランでも nickname で引けるので、どちらかがあれば出る。
 */

import type { RunTimeline } from '../timeline/types.js';

export const headUrl = (run: RunTimeline): string | undefined => {
  const id = run.uuid ?? run.nickname;
  return id ? `https://mc-heads.net/avatar/${encodeURIComponent(id)}/64` : undefined;
};
