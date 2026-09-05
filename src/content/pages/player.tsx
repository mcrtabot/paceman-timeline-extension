/**
 * /stats/player/<nick>/ のプロフィール。
 *
 * このページには置くものが無い。名前の横にお気に入りの星を 1 つ出すだけ。
 * ラン一覧やトップまで戻らずに登録できる場所を作るのが目的。
 */

import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FavoriteStar } from '../../react/FavoriteStar.js';
import { isFavorite, saveFavorites, type Settings, withFavorite } from '../../settings.js';

export const nickFromPlayerPath = (pathname: string): string | null =>
  pathname.match(/^\/(?:stats\/)?player\/([^/]+)\/?$/)?.[1] ?? null;

/**
 * 星は自分の state で持つ。保存を待って描き直すと一拍あくし、
 * content/index.tsx はお気に入りの増減では貼り直さない。
 */
const FavoriteToggle = ({ settings, nick }: { settings: Settings; nick: string }) => {
  const [favorites, setFavorites] = useState<readonly string[]>(settings.favorites);

  return (
    <span className="ptc-fav-solo">
      <FavoriteStar
        name={nick}
        on={isFavorite(favorites, nick)}
        onToggle={(name, on) => {
          const next = withFavorite(favorites, name, on);
          setFavorites(next);
          void saveFavorites(next);
        }}
      />
    </span>
  );
};

export const renderPlayer = (
  root: ShadowRoot,
  settings: Settings,
  nick: string,
): (() => void) => {
  const container = document.createElement('div');
  root.appendChild(container);
  const reactRoot: Root = createRoot(container);
  reactRoot.render(<FavoriteToggle settings={settings} nick={nick} />);
  return () => reactRoot.unmount();
};
