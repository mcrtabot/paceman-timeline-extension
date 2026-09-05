/**
 * @vitest-environment jsdom
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildManifest } from '../manifest.config.mjs';
import { forwardSplitClick } from '../src/content/vod.js';
import { runIdFromPath } from '../src/content/pages/run.js';
import { themeFromSettings } from '../src/content/theme.js';
import { DEFAULT_SETTINGS } from '../src/settings.js';
import { ICON_SETS, ICONS, OUTLINE_COLOR, OUTLINED } from '../src/timeline/theme/iconSets.js';
import { isResolvedRef } from '../src/timeline/theme/types.js';

const runPageHtml = readFileSync(resolve('fixtures/dom/run-page.html'), 'utf8');

describe('runIdFromPath', () => {
  it('accepts both the numeric id and the 64-hex worldId', () => {
    expect(runIdFromPath('/stats/run/2827631/')).toBe('2827631');
    expect(runIdFromPath('/run/2827631')).toBe('2827631');
    expect(runIdFromPath('/stats/run/7f2e8ef4372ded91/')).toBe('7f2e8ef4372ded91');
  });
  it('rejects anything else', () => {
    expect(runIdFromPath('/stats/player/3x7en/runs/')).toBeNull();
    expect(runIdFromPath('/')).toBeNull();
  });
});

describe('forwardSplitClick', () => {
  /** 行の img.icon の alt で引く。表示テキストはタイムしか持っていない。 */
  it('matches the row by the icon alt PaceMan renders', () => {
    document.body.innerHTML = runPageHtml;
    const clicked: string[] = [];
    for (const p of document.querySelectorAll('p.split-name')) {
      p.addEventListener('click', () => {
        clicked.push(p.textContent!);
      });
    }

    expect(forwardSplitClick('enter_fortress')).toBe(true);
    expect(clicked).toEqual(['9:23']);
  });

  /**
   * onClick は p.split-name に付いている。React は dispatch した要素の fiber から
   * 上へ辿るので、親の div.card-line へ投げても子のハンドラには届かない。
   */
  it('clicks p.split-name itself, not the enclosing row', () => {
    document.body.innerHTML = runPageHtml;
    const targets: string[] = [];
    for (const line of document.querySelectorAll('div.card-line')) {
      line.addEventListener('click', (e) => {
        targets.push((e.target as Element).className);
      });
    }

    forwardSplitClick('credits');
    expect(targets).toEqual(['split-name has-vod']);
  });

  it('bubbles, because React 18 listens at the root container', () => {
    document.body.innerHTML = runPageHtml;
    let sawAtRoot = false;
    document.body.addEventListener('click', () => {
      sawAtRoot = true;
    });
    forwardSplitClick('enter_nether');
    expect(sawAtRoot).toBe(true);
  });

  it('is a no-op when the split has no row (e.g. second_portal after a merge)', () => {
    document.body.innerHTML = runPageHtml;
    expect(forwardSplitClick('second_portal')).toBe(false);
  });

  it('is a no-op for a type PaceMan never puts on the card', () => {
    document.body.innerHTML = runPageHtml;
    expect(forwardSplitClick('overworld')).toBe(false);
  });
});

describe('buildManifest', () => {
  const prod = buildManifest({ target: 'chrome', version: '0.1.0' });

  it('asks for the narrowest permissions that work', () => {
    expect(prod.permissions).toEqual(['storage']);
    expect(prod.host_permissions).toEqual(['https://paceman.gg/*']);
  });

  it('never ships the localhost dev matcher', () => {
    const json = JSON.stringify(prod);
    expect(json).not.toContain('localhost');
    expect(prod.content_scripts[0]!.matches).toEqual(['https://paceman.gg/*']);
  });

  it('adds localhost only in a dev build', () => {
    const devManifest = buildManifest({ target: 'chrome', version: '0.1.0', dev: true });
    expect(devManifest.content_scripts[0]!.matches).toContain('http://localhost:5173/*');
  });

  it('exposes assets only to paceman.gg', () => {
    expect(prod.web_accessible_resources).toEqual([
      { resources: ['assets/*'], matches: ['https://paceman.gg/*'] },
    ]);
  });

  it('uses the right background shape per browser', () => {
    expect(prod.background).toEqual({ service_worker: 'background.js', type: 'module' });
    const ff = buildManifest({ target: 'firefox', version: '0.1.0' });
    expect(ff.background).toEqual({ scripts: ['background.js'], type: 'module' });
    expect(ff.browser_specific_settings?.gecko.id).toBeTruthy();
  });
});

describe('the built artifact', () => {
  // build 済みのときだけ。クリーンチェックアウトでは dist が無い
  const builtPath = resolve('dist/chrome/manifest.json');
  it.skipIf(!existsSync(builtPath))('has no localhost matcher in the shipped manifest', () => {
    expect(readFileSync(builtPath, 'utf8')).not.toContain('localhost');
  });

  /*
   * 設定画面は chrome-extension://<id>/options/index.html として開かれる。
   * 参照が /assets/... だと chrome-extension://<id>/assets/... を探して 404 になり、
   * 画面が真っ白になる。実体は options/assets/ の下。base: './' が効いていることを見る。
   */
  const optionsHtml = resolve('dist/chrome/options/index.html');
  it.skipIf(!existsSync(optionsHtml))('references the options bundle relatively', () => {
    const html = readFileSync(optionsHtml, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref, ref).not.toMatch(/^\//);
      expect(existsSync(resolve('dist/chrome/options', ref)), ref).toBe(true);
    }
  });
});

describe('icon sets', () => {
  const SPLITS = [
    'enter_nether',
    'enter_bastion',
    'enter_fortress',
    'first_portal',
    'enter_stronghold',
    'enter_end',
    'credits',
  ] as const;

  it('offers the three sets the user can choose between', () => {
    expect([...ICON_SETS]).toEqual(['paceman-top', 'paceman-stats', 'mcsr']);
  });

  it('covers every split PaceMan itself can show, in all three sets', () => {
    for (const set of ICON_SETS) {
      for (const type of SPLITS) {
        expect(ICONS[set][type], `${set}/${type}`).toBeDefined();
      }
    }
  });

  it('reads the top-page icons out of the sprite sheet', () => {
    const nether = ICONS['paceman-top'].enter_nether;
    expect(nether).toEqual({
      sheet: '/images/!sprite_sheet.png',
      cols: 5,
      rows: 4,
      col: 2,
      row: 3,
    });
    // 5 列 4 行のシートなので位置はその範囲に収まる
    for (const type of SPLITS) {
      const s = ICONS['paceman-top'][type] as { col: number; row: number };
      expect(s.col, type).toBeLessThan(5);
      expect(s.row, type).toBeLessThan(4);
    }
  });

  it('falls back from the stats icons to the bundled ones', () => {
    for (const type of SPLITS) {
      const refs = ICONS['paceman-stats'][type] as readonly string[];
      expect(refs, type).toHaveLength(2);
      expect(refs[0], type).toMatch(/^\/stats\/.+\.webp$/);
      expect(refs[1], type).toMatch(/^icon\/.+\.png$/);
    }
  });

  it('bundles the MCSRImageBuilder set, so it works without PaceMan', () => {
    for (const type of SPLITS) {
      expect(ICONS.mcsr[type], type).toMatch(/^icon\/.+\.png$/);
    }
  });

  it('treats PaceMan urls as already resolved, bundled refs as not', () => {
    expect(isResolvedRef('/stats/nether.webp')).toBe(true);
    expect(isResolvedRef('/images/!sprite_sheet.png')).toBe(true);
    expect(isResolvedRef('icon/nether_portal.png')).toBe(false);
  });

  it('defaults to the stats icon set', () => {
    expect(DEFAULT_SETTINGS.iconSet).toBe('paceman-stats');
    expect(themeFromSettings(DEFAULT_SETTINGS).icons).toBe(ICONS['paceman-stats']);
  });

});

describe('icon outlines', () => {
  it('outlines the icons that sink into the background, per icon set', () => {
    expect([...OUTLINED['paceman-stats']].sort()).toEqual(['credits', 'enter_fortress']);
    expect([...OUTLINED.mcsr].sort()).toEqual([
      'credits',
      'enter_nether',
      'first_portal',
      'second_portal',
    ]);
    // トップのスプライトは元から輪郭付きなので足さない
    expect([...OUTLINED['paceman-top']]).toEqual([]);
  });

  it('never outlines the PaceMan stats portal, whose image is uniformly semi-transparent', () => {
    // 全面がアルファ 160-190 で、背後に描く輪郭が透けて色が変わる
    expect(OUTLINED['paceman-stats'].has('enter_nether')).toBe(false);
    expect(OUTLINED['paceman-stats'].has('first_portal')).toBe(false);
  });

  it('uses one colour everywhere, so every place looks the same', () => {
    expect(OUTLINE_COLOR).toMatch(/^rgba\(255, 255, 255, 0?\.\d+\)$/);
  });

  it('switches both the icons and their outlines together', () => {
    for (const set of ICON_SETS) {
      const theme = themeFromSettings({ ...DEFAULT_SETTINGS, iconSet: set });
      expect(theme.icons, set).toBe(ICONS[set]);
      expect(theme.outlinedIcons, set).toBe(OUTLINED[set]);
    }
  });
});
