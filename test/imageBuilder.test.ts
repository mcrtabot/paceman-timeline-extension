/**
 * MCSRImageBuilder へ渡す URL。上流の parse* が読み戻せる形かどうかを見る。
 *
 * 復元側の rawinflate.js は素の inflate なので、ここでは node の inflateRaw で
 * 同じことをする。上流の実装そのものではないが、読めなければどちらも読めない。
 */
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fromGetWorld } from '../src/adapters/getWorld.js';
import { deflateParam, imageBuilderUrl } from '../src/adapters/imageBuilder.js';
import { fixture } from './helpers.js';

/** 上流 utils/compress.ts の inflate。 */
const inflateParam = (value: string): string => {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = inflateRawSync(Buffer.from(b64, 'base64')).toString('latin1');
  return decodeURIComponent(raw);
};

/** 上流 ImageBuilderPage が受け取るところまで開く。 */
const paramsOf = (url: string, key: 'c' | 'i') =>
  new URLSearchParams(inflateParam(new URL(url).searchParams.get(key) ?? ''));

describe('deflateParam', () => {
  it('round-trips through a raw inflate', () => {
    for (const text of ['', 'dm=1', 'n=3x7en&tl=en,2:20.423/fn,17:39.681', 'n=%E3%81%82']) {
      expect(inflateParam(deflateParam(text))).toBe(text);
    }
  });

  it('stays inside the alphabet the builder splits on', () => {
    // i= は , で区切って複数ランに分かれる。+ / , が混ざると壊れる
    expect(deflateParam('n=a+b/c,d')).toMatch(/^[A-Za-z0-9\-_=]+$/);
  });
});

describe('imageBuilderUrl — finished run (3x7en 17:39, id 2827631)', () => {
  const run = fromGetWorld(fixture('api/getWorld.finished.json'))!;
  const url = imageBuilderUrl(run)!;

  it('points at the deployed builder', () => {
    expect(url.startsWith('https://mcrtabot.github.io/MCSRImageBuilder/?')).toBe(true);
  });

  it('carries the runner and the date', () => {
    const item = paramsOf(url, 'i');
    expect(item.get('n')).toBe('3x7en');
    expect(item.get('s')).toBe('7d5a64b2-8967-4db6-9b10-18441c860e22');
    expect(item.get('d')).toBe(
      new Date(1_788_591_648_000).toLocaleDateString('sv-SE'), // YYYY-MM-DD、実行環境のタイムゾーンで
    );
  });

  it('encodes the splits as the builder short names with millisecond IGT', () => {
    expect(paramsOf(url, 'i').get('tl')).toBe(
      'en,2:20.423/eb,4:33.522/ef,9:23.022/fp,11:50.522/es,13:35.457/ee,15:45.431/fn,17:39.681',
    );
  });

  it('leaves detailed mode off when there is nothing detailed to show', () => {
    expect(paramsOf(url, 'c').get('dm')).toBeNull();
  });

  it('drops the synthetic overworld:0', () => {
    expect(paramsOf(url, 'i').get('tl')?.startsWith('en,')).toBe(true);
  });
});

describe('imageBuilderUrl — live run (second_portal を持つ)', () => {
  it('turns on detailed mode so second_portal survives the builder filter', () => {
    const run = fromGetWorld(fixture('api/getWorld.finished.json'))!;
    const withSecond = {
      ...run,
      items: [...run.items, { type: 'second_portal' as const, igt: 700_000 }].sort(
        (a, b) => a.igt - b.igt,
      ),
    };
    const params = paramsOf(imageBuilderUrl(withSecond)!, 'c');
    expect(params.get('dm')).toBe('1');
    expect(paramsOf(imageBuilderUrl(withSecond)!, 'i').get('tl')).toContain('sp,11:40.000');
  });
});

describe('imageBuilderUrl — 送るスプリットが無いラン', () => {
  it('returns null', () => {
    const run = fromGetWorld(fixture('api/getWorld.finished.json'))!;
    expect(imageBuilderUrl({ ...run, items: [{ type: 'overworld', igt: 0 }] })).toBeNull();
  });
});
