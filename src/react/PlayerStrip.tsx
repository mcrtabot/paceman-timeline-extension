/**
 * 今 MCSR を回している人の一覧。トップページは人数しか出していないが、
 * API は名前まで返している。
 *
 * 既定は顔だけの横並びで 1 行に収まる。開くと顔と名前の一覧になる。
 *
 * 名前は UUID ではなく Minecraft の ID。mc-heads は名前でも引けて、
 * 見つからなければ既定のスキンを返すので失敗を扱わなくていい。
 */

import { useState } from 'react';
import { isFavorite } from '../settings.js';
import { FavoriteStar } from './FavoriteStar.js';
import { Tip, useTip } from './Tip.js';

export type PlayerStripProps = {
  players: readonly string[];
  /**
   * 名前ごとのリンク先。onClick で window.location を叩くと Cmd/Ctrl+クリックも
   * 中クリックも効かないので href で受ける。
   */
  playerHref?: (name: string) => string | undefined;
  favorites?: readonly string[];
  /** 渡すと開いた一覧に星が出る。畳んだ顔の列には出さない（1 行に収めたいので）。 */
  onToggleFavorite?: (name: string, on: boolean) => void;
  /** 配信モード。下の区切り線を落として表と地続きにする。 */
  bare?: boolean;
};

/** お気に入りを先頭へ。残りは API が返した順のまま。 */
const favoritesFirst = (
  players: readonly string[],
  favorites: readonly string[],
): readonly string[] => {
  if (favorites.length === 0) return players;
  const fav = players.filter((n) => isFavorite(favorites, n));
  return fav.length === 0
    ? players
    : [...fav, ...players.filter((n) => !isFavorite(favorites, n))];
};

const faceUrl = (name: string) =>
  `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64`;

export const PlayerStrip = ({
  players,
  playerHref,
  favorites = [],
  onToggleFavorite,
  bare = false,
}: PlayerStripProps) => {
  const { tip, tipProps } = useTip();
  const [open, setOpen] = useState(false);
  if (players.length === 0) return null;

  const ordered = favoritesFirst(players, favorites);

  /*
   * <a> にすればキーボードもフォーカスも新しいタブも素で付いてくる。
   * リンク先が無いときだけ素の要素に落とす。
   */
  const linkProps = (name: string) => {
    const href = playerHref?.(name);
    return href ? { href } : {};
  };
  const Entry = (playerHref ? 'a' : 'span') as 'a';

  return (
    <div
      className={`ptc-players${open ? ' ptc-players--open' : ''}${
        bare ? ' ptc-players--bare' : ''
      }`}
    >
      <button
        type="button"
        className="ptc-players__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ptc-players__caret" />
        {players.length} playing
      </button>

      {open ? (
        <div className="ptc-players__list">
          {ordered.map((name) => {
            const fav = isFavorite(favorites, name);
            return (
              // 星は <a> の中に入れられない（対話要素の入れ子になる）ので兄弟に置く
              <div
                key={name}
                className={`ptc-players__entry${fav ? ' ptc-players__entry--fav' : ''}`}
              >
                {onToggleFavorite && (
                  <FavoriteStar name={name} on={fav} onToggle={onToggleFavorite} />
                )}
                {/* 名前が出ているのでツールチップは付けない */}
                <Entry className="ptc-players__entry-link" {...linkProps(name)}>
                  <img className="ptc-players__face" src={faceUrl(name)} alt="" />
                  <span className="ptc-players__name">{name}</span>
                </Entry>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ptc-players__faces">
          {ordered.map((name) => (
            <Entry
              key={name}
              className={`ptc-players__face-link${
                isFavorite(favorites, name) ? ' ptc-players__face-link--fav' : ''
              }`}
              aria-label={name}
              {...tipProps(name)}
              {...linkProps(name)}
            >
              <img className="ptc-players__face" src={faceUrl(name)} alt="" />
            </Entry>
          ))}
        </div>
      )}
      <Tip tip={tip} />
    </div>
  );
};
