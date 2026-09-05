/**
 * お気に入りの入り切りボタン。
 *
 * 星は SVG で描く。shadow root にはページのアイコンフォントも絵文字の見た目も
 * 当てにできないので、形を自分で持つ方が確実（PlayerStrip の三角と同じ理由）。
 *
 * 登録済みは常に見える。そうでないものは行にかざしたときだけ出す
 * （.ptc-fav の CSS）。走者が並ぶ画面で星が全部見えていると、
 * 肝心のタイムとバーより先に目に入ってしまう。
 */

const PATH =
  'M8 1.6l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.4l-3.8 2 .7-4.3-3.1-3 4.3-.6z';

export const FavoriteStar = ({
  name,
  on,
  onToggle,
}: {
  name: string;
  on: boolean;
  onToggle: (name: string, on: boolean) => void;
}) => (
  <button
    type="button"
    className={`ptc-fav${on ? ' ptc-fav--on' : ''}`}
    aria-pressed={on}
    aria-label={on ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
    title={on ? 'Remove from favorites' : 'Add to favorites'}
    onClick={(e) => {
      // 名前や頭アイコンのリンクと同じ行に居るので、そちらへ流さない
      e.preventDefault();
      e.stopPropagation();
      onToggle(name, !on);
    }}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATH} />
    </svg>
  </button>
);
