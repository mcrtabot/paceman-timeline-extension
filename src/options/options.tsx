import type React from 'react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SmallIcon, spriteStyleOf } from '../react/SmallIcon.js';
import {
  CONTEXT_MARKERS,
  type ContextMarker,
  DEFAULT_SETTINGS,
  HOME_SORTS,
  type HomeSort,
  isFavorite,
  loadSettings,
  parsePlayerList,
  sameName,
  saveSettings,
  type Settings,
  type StreamOverlay,
  TABLE_COLUMNS,
  type TableColumn,
  withName,
} from '../settings.js';
import {
  ICON_SET_LABELS,
  ICON_SETS,
  ICONS,
  type IconSetId,
  OUTLINED,
  PREVIEW_ORDER,
} from '../timeline/theme/iconSets.js';
import {
  DIGIT_FONT_LABELS,
  DIGIT_FONTS,
  type DigitFontId,
} from '../timeline/theme/fonts.js';
import { isResolvedRef } from '../timeline/theme/types.js';

/** 並びは画面での見え方の順。トップ、個別ラン、履歴。 */
const PAGE_LABELS: ReadonlyArray<readonly [keyof Settings['pages'], string]> = [
  ['home', 'Active Pace'],
  ['run', 'Run Page'],
  ['playerRuns', 'Player Run History'],
];

const CONTEXT_MARKER_LABELS: Readonly<Record<ContextMarker, string>> = {
  tick: 'Ticks',
  icon: 'Item icons',
};

const HOME_SORT_LABELS: Readonly<Record<HomeSort, string>> = {
  page: 'Default',
  elapsed: 'Current time',
};

const COLUMN_LABELS: Readonly<Record<TableColumn, string>> = {
  player: 'Player',
  split: 'Split',
  version: 'Version',
  time: 'Time',
  timeline: 'Timeline',
};

/*
 * この画面は chrome-extension:// で開かれるので、PaceMan のアイコンを絶対 URL に
 * しないと拡張自身の中を探して 404 になる。
 *
 * ビルド結果をそのままブラウザで開くと chrome.runtime が無い。描画中に例外が出ると
 * 画面が真っ白になるので、ここで受けて相対パスのまま返す。
 */
const bundled = (path: string): string => {
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return path;
  }
};

/**
 * /images/ を直接読むと Vercel のボット対策で 403 が返ることがある。
 * /stats/ は nginx 配下なので影響を受けない。
 * paceman.gg への権限は拡張が持っているので、background 経由で取って data URL にする。
 * 取れなければ見本を出さないだけ。
 */
const useDataUrls = (paths: readonly string[]) => {
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    let alive = true;
    void (async () => {
      const pairs = await Promise.all(
        paths.map(async (path) => {
          try {
            const res = (await chrome.runtime.sendMessage({
              type: 'ptc:fetchDataUrl',
              path,
            })) as { ok: boolean; dataUrl?: string } | undefined;
            return res?.ok && res.dataUrl ? ([path, res.dataUrl] as const) : null;
          } catch {
            return null;
          }
        }),
      );
      if (alive) setUrls(Object.fromEntries(pairs.filter((p) => p !== null)));
    })();
    return () => {
      alive = false;
    };
    // paths はモジュール定数なので依存に入れない
  }, []);
  return urls;
};

/** background 経由で取れた画像は data URL に差し替える。 */
const makeAsset = (dataUrls: Readonly<Record<string, string>>) => (ref: string) => {
  if (ref.startsWith('http')) return ref;
  if (!isResolvedRef(ref)) return bundled(`assets/${ref}`);
  return dataUrls[ref] ?? `https://paceman.gg${ref}`;
};

/** 見本に必要な PaceMan 側の画像。 */
const REMOTE_ASSETS = [
  ...new Set(
    ICON_SETS.flatMap((set) =>
      PREVIEW_ORDER.flatMap((type) => {
        const icon = ICONS[set][type];
        if (icon === undefined) return [];
        if (typeof icon === 'string') return isResolvedRef(icon) ? [icon] : [];
        if (Array.isArray(icon)) return icon.filter(isResolvedRef);
        return [(icon as { sheet: string }).sheet];
      }),
    ),
  ),
];

/**
 * 説明文は畳んでおき、「?」を押したときだけ出す。
 * 説明は 1 つ 2〜3 行あって、全部出すと画面の 1/3 以上になる。ポップアップの高さは
 * 600px ほどで頭打ちなので、項目そのものがスクロールの外へ出てしまう。
 */
const Row = ({ hint, children }: { hint?: React.ReactNode; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="row">
        {children}
        {hint !== undefined && (
          <button
            type="button"
            className="help"
            aria-expanded={open}
            aria-label="What this does"
            onClick={() => setOpen((v) => !v)}
          >
            ?
          </button>
        )}
      </div>
      {open && <div className="hint">{hint}</div>}
    </>
  );
};

/**
 * セクションの中の小見出し。h2 は「何を出すか / 誰を / どのページの挙動 / 見た目」の
 * 4 つだけに使い、その中の項目のまとまりはこちらで見出しを付ける。
 */
const SubHeading = ({ children }: { children: React.ReactNode }) => (
  <span className="iconset__name">{children}</span>
);

const IconPreview = ({
  set,
  asset,
}: {
  set: IconSetId;
  asset: (ref: string) => string;
}) => (
  <span className="preview">
    {PREVIEW_ORDER.map((type) => {
      const icon = spriteStyleOf(ICONS[set][type], asset);
      return icon ? (
        <SmallIcon
          key={type}
          className="preview__icon"
          icon={icon}
          outlined={OUTLINED[set].has(type)}
        />
      ) : null;
    })}
  </span>
);

/**
 * 「この人だけ」の指定。お気に入りはチェックボックスで足せるので、名前を打つのは
 * お気に入りに入れていない人だけで済む。
 *
 * 入力欄は打っているあいだ文字列のまま持つ。保存した配列から組み直すと、
 * 区切りを打った拍子にカーソルが飛ぶ。持つのはチェックボックス側の名前を除いたぶん。
 */
const PlayerFilter = ({
  value,
  favorites,
  onChange,
}: {
  value: readonly string[];
  favorites: readonly string[];
  onChange: (names: string[]) => void;
}) => {
  const [text, setText] = useState(
    value.filter((n) => !isFavorite(favorites, n)).join(', '),
  );

  return (
    <>
      {favorites.length > 0 && (
        <div className="favchecks">
          {favorites.map((name) => (
            <label key={name} className="choice">
              <input
                type="checkbox"
                checked={value.some((n) => sameName(n, name))}
                onChange={(e) => onChange(withName(value, name, e.target.checked))}
              />
              {name}
            </label>
          ))}
        </div>
      )}
      <input
        type="text"
        className="names"
        value={text}
        placeholder={favorites.length > 0 ? 'Someone else…' : 'mcrtabot, …'}
        onChange={(e) => {
          setText(e.target.value);
          onChange([
            ...parsePlayerList(e.target.value).filter((n) => !isFavorite(favorites, n)),
            ...value.filter((n) => isFavorite(favorites, n)),
          ]);
        }}
      />
    </>
  );
};

/** 色 1 つ。チェックを外すと「そのまま」に戻る（空文字で持つ）。 */
const ColorRow = ({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (color: string) => void;
}) => (
  <div className="row">
    <label>
      <input
        type="checkbox"
        checked={value !== ''}
        onChange={(e) => onChange(e.target.checked ? fallback : '')}
      />
      {label}
    </label>
    {value !== '' && (
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )}
  </div>
);

const App = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const asset = makeAsset(useDataUrls(REMOTE_ASSETS));

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveSettings(next);
  };

  const stream = settings.stream;
  const setStream = (patch: Partial<StreamOverlay>) =>
    update({ stream: { ...stream, ...patch } });

  if (!ready) return <div>Loading…</div>;

  return (
    <>
      <h1>MCSR Timeline for PaceMan</h1>

      <Row hint="Turn everything off to see PaceMan exactly as it ships. Your other choices are kept.">
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          Enabled
        </label>
      </Row>

      {/* OFF のあいだは中身ごと畳む。効かない選択肢を並べても迷わせるだけ。 */}
      {settings.enabled && (
        <>
          <h2>Show on</h2>
          {PAGE_LABELS.map(([kind, label]) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={settings.pages[kind]}
                onChange={(e) =>
                  update({ pages: { ...settings.pages, [kind]: e.target.checked } })
                }
              />
              {label}
            </label>
          ))}

          <h2>Favorites</h2>
          <Row hint="Favorites sort to the top of the Active Pace table and the PLAYING list, and their name turns amber. Add one by clicking the star next to a runner on any of those pages.">
            <span>{settings.favorites.length} registered</span>
          </Row>
          {settings.favorites.length > 0 && (
            <div className="favs">
              {settings.favorites.map((name) => (
                <span key={name} className="fav">
                  <img
                    className="fav__face"
                    src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/32`}
                    alt=""
                    // 読めなくても名前は出す
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                  {name}
                  <button
                    type="button"
                    className="fav__x"
                    aria-label={`Remove ${name} from favorites`}
                    title="Remove"
                    onClick={() =>
                      update({ favorites: settings.favorites.filter((f) => f !== name) })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <h2>Active Pace</h2>
          <Row
            hint={
              <>
                Row order. &ldquo;Default&rdquo; keeps PaceMan&rsquo;s own order. &ldquo;Current
                time&rdquo; puts the longest-running first and never reshuffles while you
                watch — every live run counts up at the same speed.
              </>
            }
          >
            <SubHeading>Sort order</SubHeading>
          </Row>
          {HOME_SORTS.map((id) => (
            <label key={id}>
              <input
                type="radio"
                name="homeSort"
                checked={settings.homeSort === id}
                onChange={() => update({ homeSort: id })}
              />
              {HOME_SORT_LABELS[id]}
            </label>
          ))}

          <Row
            hint={
              <>
                A row of skin faces above the table. PaceMan only shows the count, but the API
                returns the names. These are everyone resetting, not just those on pace.
              </>
            }
          >
            <label>
              <input
                type="checkbox"
                checked={settings.showPlayers}
                onChange={(e) => update({ showPlayers: e.target.checked })}
              />
              Show who is currently running
            </label>
          </Row>

          <h2>Appearance</h2>
          <Row>
            <SubHeading>Split icons</SubHeading>
          </Row>
          {ICON_SETS.map((id) => (
            <label key={id} className="iconset">
              <input
                type="radio"
                name="iconSet"
                checked={settings.iconSet === id}
                onChange={() => update({ iconSet: id })}
              />
              <IconPreview set={id} asset={asset} />
              <span className="iconset__name">{ICON_SET_LABELS[id]}</span>
            </label>
          ))}

          <Row>
            <SubHeading>Time font</SubHeading>
          </Row>
          {(Object.keys(DIGIT_FONT_LABELS) as DigitFontId[]).map((id) => (
            <label key={id}>
              <input
                type="radio"
                name="digitFont"
                checked={settings.digitFont === id}
                onChange={() => update({ digitFont: id })}
              />
              <span style={{ fontFamily: DIGIT_FONTS[id] }}>{DIGIT_FONT_LABELS[id]} 17:39</span>
            </label>
          ))}

          <Row hint="Run page only — the table and the history fold their times away.">
            <SubHeading>Split times</SubHeading>
          </Row>
          <label>
            <input
              type="number"
              min={0}
              max={90}
              step={1}
              value={settings.textRotateDeg}
              onChange={(e) => update({ textRotateDeg: Number(e.target.value) })}
            />
            Angle (degrees, 0 for flat)
          </label>

          <Row
            hint={
              <>
                What happened between splits, marked under the bar. Hover for name and time.
                Only live runs carry this, so finished runs and history show none.
                Rows get taller while this is on.
              </>
            }
          >
            <SubHeading>Context markers</SubHeading>
          </Row>
          <label>
            <input
              type="checkbox"
              checked={settings.showContext}
              onChange={(e) => update({ showContext: e.target.checked })}
            />
            Show (lava bucket, blaze rod, …)
          </label>

          {settings.showContext &&
            CONTEXT_MARKERS.map((id) => (
              <label key={id} style={{ marginLeft: '26px' }}>
                <input
                  type="radio"
                  name="contextMarker"
                  checked={settings.contextMarker === id}
                  onChange={() => update({ contextMarker: id })}
                />
                {CONTEXT_MARKER_LABELS[id]}
              </label>
            ))}

          {/*
            * 配信用。普段は使わないので一番下に置く。全体スイッチと同じで、
            * チェックを入れるまで中身は出さない。効くのは Active Pace だけで、
            * 一式そろえると「自分のタイムラインだけが載ったページ」になる。
            */}
          <h2>Stream overlay</h2>
          <Row
            hint={
              <>
                Turns the Active Pace table into something you can put on stream with a
                window capture: keep only the runners you care about, drop the columns you
                do not need, and strip the borders and backgrounds. Everything here is off
                until you turn it on, and only affects the front page.
              </>
            }
          >
            <label>
              <input
                type="checkbox"
                checked={stream.enabled}
                onChange={(e) => setStream({ enabled: e.target.checked })}
              />
              Enable
            </label>
          </Row>

          {stream.enabled && (
            <>
              <Row hint="Tick a favorite, or type any other names separated by commas or spaces. Leave all of it empty to show everyone. Case does not matter. Ticking here does not change your favorites — they keep sorting and coloring as usual.">
                <SubHeading>Show only these players</SubHeading>
              </Row>
              <PlayerFilter
                value={stream.onlyPlayers}
                favorites={settings.favorites}
                onChange={(onlyPlayers) => setStream({ onlyPlayers })}
              />
              <Row hint="Keeps a 0:00 row for anyone listed above who is not on pace right now, so the overlay does not jump around when they start or finish a run.">
                <label>
                  <input
                    type="checkbox"
                    checked={stream.keepRow}
                    onChange={(e) => setStream({ keepRow: e.target.checked })}
                  />
                  Keep their row when they are not running
                </label>
              </Row>
              <Row hint="Rows come out in the order you listed the names above and stay there — no reordering when someone is faster or starts a new run. Needs at least one name; everyone else follows below in the usual order.">
                <label>
                  <input
                    type="checkbox"
                    checked={stream.fixedOrder}
                    onChange={(e) => setStream({ fixedOrder: e.target.checked })}
                  />
                  Keep them in the order listed
                </label>
              </Row>

              <Row hint="Which columns the table draws. Uncheck everything but Timeline to leave just the bar.">
                <SubHeading>Columns</SubHeading>
              </Row>
              {TABLE_COLUMNS.map((column) => (
                <label key={column}>
                  <input
                    type="checkbox"
                    checked={stream.columns[column]}
                    onChange={(e) =>
                      setStream({
                        columns: { ...stream.columns, [column]: e.target.checked },
                      })
                    }
                  />
                  {COLUMN_LABELS[column]}
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={stream.showHeader}
                  onChange={(e) => setStream({ showHeader: e.target.checked })}
                />
                Header row
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={stream.showPlayers}
                  onChange={(e) => setStream({ showPlayers: e.target.checked })}
                />
                PLAYING strip
              </label>

              <Row hint="Every border and background comes off — the rows, the sticky header, and the PaceMan card the table sits in — so only the text and the bars are left. Colors below are optional — leave them off to keep PaceMan's.">
                <SubHeading>Look</SubHeading>
              </Row>
              <label>
                <input
                  type="checkbox"
                  checked={stream.bare}
                  onChange={(e) => setStream({ bare: e.target.checked })}
                />
                No borders or backgrounds
              </label>
              <ColorRow
                label="Text color"
                value={stream.textColor}
                fallback="#ffffff"
                onChange={(textColor) => setStream({ textColor })}
              />
              <ColorRow
                label="Page background (for chroma key)"
                value={stream.background}
                fallback="#00ff00"
                onChange={(background) => setStream({ background })}
              />

              <Row hint="Hides everything else on the front page — the site header, the card title and filters, the other panels — leaving the table alone on the page. Reload the page, or turn this off, to get PaceMan back.">
                <SubHeading>Table only</SubHeading>
              </Row>
              <label>
                <input
                  type="checkbox"
                  checked={stream.solo}
                  onChange={(e) => setStream({ solo: e.target.checked })}
                />
                Hide the rest of the page
              </label>
            </>
          )}
        </>
      )}
    </>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
