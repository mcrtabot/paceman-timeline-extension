/**
 * 開発ハーネス。採取した実データで描画を目で確かめるギャラリーと、採取した実 DOM に
 * 対して拡張と同じ mount コードを走らせる場所。
 *
 * オフラインで決まった動きをするので、レート制限もライブデータのばらつきも無い。
 * アンカー探索・observer・二重マウントのバグはここで潰せる。
 */

import { createContext, StrictMode, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { fromGetWorld } from '../adapters/getWorld.js';
import { fromLiveRuns, frontierIgt } from '../adapters/liveruns.js';
import { findLiveByWorldId, mergeRunTimeline } from '../adapters/merge.js';
import { fromPlayerRuns } from '../adapters/playerRuns.js';
import { fromPlayers } from '../adapters/players.js';
import { sortRuns } from '../content/pages/home.js';
import { anchorForPath } from '../content/anchors.js';
import { ensureMinecraftFont } from '../content/font.js';
import { createMount, type MountHandle } from '../content/mount.js';
import { AssetProvider } from '../react/AssetContext.js';
import { LiveTable } from '../react/LiveTable.js';
import { PlayerStrip } from '../react/PlayerStrip.js';
import { RunList } from '../react/RunList.js';
import { Timeline } from '../react/Timeline.js';
import { estimateIgt, type LiveAnchor, nextAnchor } from '../timeline/live.js';
import { defaultTheme } from '../timeline/theme/default.js';
import {
  ICON_SET_LABELS,
  ICON_SETS,
  ICONS,
  type IconSetId,
  OUTLINED,
} from '../timeline/theme/iconSets.js';
import { isResolvedRef, type Theme } from '../timeline/theme/types.js';
import { resolveScale, sharedDenominatorMs } from '../timeline/scale.js';
import { convertMillisecondsToTime } from '../timeline/time.js';
import type { RunTimeline } from '../timeline/types.js';
import css from '../timeline/styles/timeline.css?raw';

/**
 * vite がリポジトリのルートを配信しているのでそのまま参照できる。
 * /stats/*.webp は vite.config.ts の dev プロキシ経由で同一オリジンとして取れる。
 */
const asset = (ref: string) => (isResolvedRef(ref) ? ref : `/assets/${ref}`);

/** 個別ランページ相当。親要素いっぱいに収める。 */
const FIT = { mode: 'fit' } as const;

const json = (path: string) => fetch(path).then((r) => r.json());

/** 拡張の既定と同じ絵柄。ハーネスでは切り替え UI から差し替える。 */
const themeFor = (set: IconSetId): Theme => ({
  ...defaultTheme,
  icons: ICONS[set],
  outlinedIcons: OUTLINED[set],
});

const ThemeContext = createContext<Theme>(themeFor('paceman-stats'));
const useTheme = () => useContext(ThemeContext);

/** context マーカーは既定で非表示。トークンを 1 つ上書きすれば出る。 */
/** 拡張の themeFromSettings と同じ扱い。表示だけでなく下の余地も広げる。 */
const withContextMarkers = (t: Theme): Theme => ({
  ...t,
  tokens: {
    ...t.tokens,
    '--ptc-display-context': 'block',
    '--ptc-context-space': '16px',
    '--ptc-context-text-space': '10px',
  },
});

type CaseSpec = { label: string; run: RunTimeline; context?: boolean };

const Case = ({ label, run, context }: CaseSpec) => {
  const theme = useTheme();
  return (
    <div className="case">
      <div className="label">{label}</div>
      <Timeline run={run} theme={context ? withContextMarkers(theme) : theme} scale={FIT} />
    </div>
  );
};

const Gallery = () => {
  const [runs, setRuns] = useState<CaseSpec[]>([]);

  useEffect(() => {
    void (async () => {
      const [world, worldLive, live, playerRuns] = await Promise.all([
        json('/fixtures/api/getWorld.finished.json'),
        json('/fixtures/api/getWorld.live.json'),
        json('/fixtures/api/liveruns.json'),
        json('/fixtures/api/getPlayerRuns.json'),
      ]);

      const finished = fromGetWorld(world)!;
      const liveBase = fromGetWorld(worldLive)!;
      const liveRuns = fromLiveRuns(live);
      const merged = mergeRunTimeline(liveBase, findLiveByWorldId(liveRuns, liveBase.worldId)!);
      const history = fromPlayerRuns(playerRuns, { uuid: null, nickname: '3x7en' });

      const cases: CaseSpec[] = [
        { label: 'getWorld — 完走 (3x7en 17:39)', run: finished },
        { label: 'getWorld — ライブ（未達スプリットは描かない）', run: liveBase },
        {
          label: `merged — getWorld + liveruns（context マーカー ${merged.context.length} 件を表示）`,
          run: merged,
          context: true,
        },
      ];
      for (const r of liveRuns) {
        cases.push({ label: `liveruns — ${r.nickname ?? '?'}`, run: r });
      }
      const fortressFirst = history.find((r) => r.runId === 2827674);
      const dead = history.find((r) => r.runId === 2827663);
      if (fortressFirst) cases.push({ label: 'playerRuns — fortress 先行', run: fortressFirst });
      if (dead) cases.push({ label: 'playerRuns — ネザーで死亡', run: dead });

      setRuns(cases);
    })();
  }, []);

  return (
    <>
      <h2>ギャラリー（採取した実データ / 個別ランページ相当 = fit）</h2>
      {runs.length === 0 && <div className="case"><div className="label">読み込み中…</div></div>}
      {runs.map((c) => (
        <Case key={c.label} {...c} />
      ))}
    </>
  );
};

/**
 * トップの一覧とラン履歴で使うパネル。
 *
 * 分母が 3 分単位で伸びること、先端マーカーが歩くこと、先端のタイムが列から
 * はみ出さないことを確かめられるよう、時計を差し替えてある。実時間ではなく
 * offsetMs を進めるので、早送りも任意の時刻への移動もできる。
 */
const Panels = () => {
  const theme = useTheme();
  const [live, setLive] = useState<RunTimeline[]>([]);
  const [history, setHistory] = useState<RunTimeline[]>([]);
  const anchors = useRef(new Map<string, LiveAnchor>());
  /** 起点。アンカーもこの時刻で張るので offsetMs がそのまま経過時間になる。 */
  const t0 = useRef(Date.now());
  const [offsetMs, setOffsetMs] = useState(0);
  /** 0 で停止、1 が実時間と同じ速さ。 */
  const [speed, setSpeed] = useState(10);
  const [squash, setSquash] = useState(false);
  // ハーネスでは実際に遷移させず、どこへ行くはずだったかを出す
  const [players, setPlayers] = useState<readonly string[]>([]);

  const now = t0.current + offsetMs;

  useEffect(() => {
    if (speed === 0) return;
    const tick = 100;
    const id = window.setInterval(() => setOffsetMs((o) => o + tick * speed), tick);
    return () => window.clearInterval(id);
  }, [speed]);

  useEffect(() => {
    void (async () => {
      const [liveJson, runsJson, finishedJson, playersJson] = await Promise.all([
        json('/fixtures/api/liveruns.json'),
        json('/fixtures/api/getPlayerRuns.json'),
        json('/fixtures/api/getWorld.finished.json'),
        json('/fixtures/api/players.json'),
      ]);
      setPlayers(fromPlayers(playersJson));
      // fixtures の liveruns は全部進行中なので、finish で止まる完走ランを 1 本混ぜている
      const finished = fromGetWorld(finishedJson);
      // 並べ替えは描画時。現在タイムを使う
      const runs = [...fromLiveRuns(liveJson), ...(finished ? [finished] : [])];
      for (const r of runs) {
        anchors.current.set(r.worldId ?? '', nextAnchor(undefined, r, t0.current));
      }
      setLive(runs);
      setHistory(fromPlayerRuns(runsJson, { uuid: null, nickname: '3x7en' }));
    })();
  }, []);

  const igtOf = (run: RunTimeline): number => {
    if (run.final !== null) return run.final.igt;
    const anchor = anchors.current.get(run.worldId ?? '');
    return anchor ? estimateIgt(anchor, now) : frontierIgt(run);
  };

  const sortedLive = sortRuns(live, 'elapsed', igtOf);

  // スケールは行ごと。15 分までは伸縮せず、超えたぶんを 3 分刻みで伸ばす
  const ROW_MIN_MS = 15 * 60_000;
  const denominatorOf = (run: RunTimeline) =>
    resolveScale({ mode: 'fit', minMs: ROW_MIN_MS }, igtOf(run), false).denominatorMs;

  // 履歴は表示中で最も遅い完走を 100% にする
  const historyFinishes = history.filter((r) => r.final !== null).map((r) => r.final?.igt ?? 0);
  const fullDenominator = sharedDenominatorMs(
    historyFinishes.length > 0 ? historyFinishes : history.map(frontierIgt),
  );
  // 分母を超えるランがどう溢れるかを確認するためのトグル
  const historyDenominator = squash ? Math.round(fullDenominator / 3) : fullDenominator;

  const worstPct = live.reduce((m, r) => {
    const d = denominatorOf(r);
    return d > 0 ? Math.max(m, Math.round((igtOf(r) / d) * 100)) : m;
  }, 0);
  const denominators = [...new Set(live.map(denominatorOf))].sort((a, b) => a - b);
  const SPEEDS = [0, 1, 10, 60, 300];

  return (
    <>
      <h2>パネル（Active Pace = 本家の行を隠して置き換える表 / ラン履歴 = 最も遅い完走が 100%）</h2>

      <div className="ptc-dev-clock">
        <div className="ptc-dev-clock__row">
          <span>速度</span>
          {SPEEDS.map((v) => (
            <button
              key={v}
              className={speed === v ? 'is-on' : ''}
              onClick={() => setSpeed(v)}
            >
              {v === 0 ? '停止' : `${v}x`}
            </button>
          ))}
          <button onClick={() => setOffsetMs(0)}>先頭へ</button>
          <button onClick={() => setSquash((v) => !v)}>
            {squash ? '履歴の分母を戻す' : '履歴の分母を 1/3'}
          </button>
        </div>

        <div className="ptc-dev-clock__row">
          <span>経過</span>
          <input
            type="range"
            min={0}
            max={40 * 60_000}
            step={1000}
            value={offsetMs}
            onChange={(e) => {
              setSpeed(0);
              setOffsetMs(Number(e.target.value));
            }}
            style={{ flex: 1, minWidth: 240 }}
          />
          <code>+{convertMillisecondsToTime(offsetMs)}</code>
        </div>

        <div className="ptc-dev-clock__readout">
          {sortedLive.map((r) => (
            <span key={r.worldId ?? r.runId} style={{ marginRight: 16 }}>
              {r.nickname} {convertMillisecondsToTime(igtOf(r))}/
              {convertMillisecondsToTime(denominatorOf(r))}
            </span>
          ))}
          <br />
          先端の最大 {worstPct}% / 使われている縮尺{' '}
          {denominators.map((d) => convertMillisecondsToTime(d)).join(', ')}
        </div>
      </div>

      <PlayerStrip players={players} playerHref={(n) => `https://paceman.gg/stats/player/${n}/`} />
      <LiveTable
        runs={sortedLive}
        theme={theme}
        scaleOf={(run) => ({ mode: 'reference', refMs: denominatorOf(run) })}
        headUrlOf={(run) => {
          const id = run.uuid ?? run.nickname;
          return id ? `https://mc-heads.net/avatar/${encodeURIComponent(id)}/64` : undefined;
        }}
        runHref={(run) => `https://paceman.gg/stats/run/${run.worldId ?? run.runId}/`}
        playerHref={(run) => `https://paceman.gg/stats/player/${run.nickname}/`}
        markerOf={(run) => {
          const id = run.uuid ?? run.nickname;
          const common = {
            faceSrc: id ? `https://mc-heads.net/avatar/${encodeURIComponent(id)}/64` : undefined,
            label: run.nickname ?? undefined,
          };
          if (run.final !== null) return { igt: run.final.igt, walking: false, ...common };
          const anchor = anchors.current.get(run.worldId ?? '');
          if (!anchor) return undefined;
          return { igt: estimateIgt(anchor, now), walking: true, ...common };
        }}
      />
      <RunList
        title={`3x7en — Timeline (${history.length}) · 全幅 ${convertMillisecondsToTime(historyDenominator)}`}
        runs={history}
        theme={theme}
        scale={{ mode: 'reference', refMs: historyDenominator }}
        labelOf={(r) => {
          if (r.final !== null) return `#${r.runId}`;
          const last = r.items[r.items.length - 1];
          const reached = last && last.type !== 'overworld' ? theme.labels[last.type] ?? last.type : 'reset';
          return `#${r.runId} — ${reached}`;
        }}
      />
    </>
  );
};

/** 実 DOM 骨格に対して、拡張と同じ mount コードを走らせる。 */
const AnchorLab = () => {
  const theme = useTheme();
  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<MountHandle | null>(null);
  const runRef = useRef<RunTimeline | null>(null);
  const [log, setLog] = useState('');

  const say = (m: string) => setLog((l) => `${l}${l ? '\n' : ''}${m}`);

  const loadStage = async () => {
    const [html, world] = await Promise.all([
      fetch('/fixtures/dom/run-page.html').then((r) => r.text()),
      json('/fixtures/api/getWorld.finished.json'),
    ]);
    runRef.current = fromGetWorld(world);
    if (stageRef.current) stageRef.current.innerHTML = html;
    say('stage: 実ランページの DOM 骨格を読み込んだ');
  };

  useEffect(() => {
    void loadStage();
    return () => mountRef.current?.stop();
  }, []);

  const doMount = async () => {
    const stage = stageRef.current;
    const run = runRef.current;
    if (!stage || !run) return;

    // 拡張と同じ経路で pathname からアンカー仕様を引く
    const anchor = anchorForPath('/stats/run/2827631/');
    if (!anchor) return say('anchor: 一致するページ種別が無い');

    mountRef.current = createMount({
      hostId: 'ptc-host',
      anchor,
      css,
      doc: document,
      render: (root) => {
        const container = document.createElement('div');
        root.appendChild(container);
        const r = createRoot(container);
        r.render(
          <AssetProvider value={asset}>
            <Timeline run={run} theme={theme} scale={FIT} />
          </AssetProvider>,
        );
        return () => r.unmount();
      },
    });
    await mountRef.current.start();
    say(`mount: host ${document.getElementById('ptc-host') ? 'あり' : 'なし'}`);
  };

  const doMountTwice = async () => {
    await doMount();
    await doMount();
    say(`冪等性: host の数 = ${document.querySelectorAll('#ptc-host').length}（1 であるべき）`);
  };

  const simulateReactWipe = () => {
    // React が兄弟ごと貼り替えた状況を作る
    document.getElementById('ptc-host')?.remove();
    say('React による除去をシミュレート → observer が貼り直すはず');
    setTimeout(
      () => say(`  0.3秒後: host ${document.getElementById('ptc-host') ? '復活した' : '消えたまま'}`),
      300,
    );
  };

  const simulateSpaNav = async () => {
    mountRef.current?.stop();
    say('SPA 遷移をシミュレート: stop() → DOM 差し替え → start()');
    await loadStage();
    await doMount();
  };

  return (
    <>
      <h2>アンカー / マウント（実 DOM 骨格に対して）</h2>
      <div>
        <button onClick={() => void doMount()}>mount</button>
        <button onClick={() => mountRef.current?.stop()}>stop</button>
        <button onClick={() => void doMountTwice()}>二重 mount（冪等性）</button>
        <button onClick={simulateReactWipe}>React による除去</button>
        <button onClick={() => void simulateSpaNav()}>SPA 遷移</button>
        <button onClick={() => setLog('')}>ログ消去</button>
      </div>
      <div id="log">{log}</div>
      <div id="stage" ref={stageRef} />
    </>
  );
};

void ensureMinecraftFont();

const App = () => {
  const [iconSet, setIconSet] = useState<IconSetId>('paceman-stats');
  const [showContext, setShowContext] = useState(false);
  const base = themeFor(iconSet);
  return (
    <ThemeContext.Provider value={showContext ? withContextMarkers(base) : base}>
      <AssetProvider value={asset}>
        <h1>paceman-timeline-extension — dev harness</h1>
        <div style={{ color: '#8b95a3', fontSize: 12, marginBottom: 8 }}>
          個別ラン = fit（幅いっぱい） / Active Pace = 行ごと（15 分まで伸縮なし） /
          ラン履歴 = 最も遅い完走が 100%
        </div>
        <div className="ptc-dev-clock__row" style={{ marginBottom: 12 }}>
          <span>アイコン</span>
          {ICON_SETS.map((id) => (
            <button
              key={id}
              className={iconSet === id ? 'is-on' : ''}
              onClick={() => setIconSet(id)}
            >
              {ICON_SET_LABELS[id]}
            </button>
          ))}
          <button
            className={showContext ? 'is-on' : ''}
            onClick={() => setShowContext((v) => !v)}
          >
            context マーカー
          </button>
        </div>
        <style>{css}</style>
        <Gallery />
        <Panels />
        <AnchorLab />
      </AssetProvider>
    </ThemeContext.Provider>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
