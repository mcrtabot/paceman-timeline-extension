/**
 * RunTimeline → MCSRImageBuilder の URL。ここだけ向きが逆（拡張 → 上流）。
 *
 * 上流 web/src/utils/image-builder.ts の toQueryString と同じ形を作る。
 *
 *   ?c=<共通パラメータ>&i=<ラン 1 本ぶん>[,<2 本目>...]
 *
 * c と i の中身はそれ自体が query string で、それを
 * encodeURIComponent → raw deflate → base64（+/ を -_ に）した文字列が入る。
 * 復元側（rawinflate.js）は素の inflate なので、type 0（無圧縮）ブロックでも読める。
 * こちらは詰めない。パラメータはたかだか数百バイトで、縮めたところで URL の
 * 見た目は変わらず、圧縮器を 1 つ抱えるだけ損になる。
 *
 * 1.16.1 RSG のスプリットしか作らない。上流のイベント名も PaceMan が返す列も
 * 1.16.1 の RSG を前提にしているので、他バージョンのランに貼っても意味のある絵にならない。
 */

import { convertMillisecondsToTime } from '../timeline/time.js';
import type { EventType, RunTimeline } from '../timeline/types.js';

const BUILDER_URL = 'https://mcrtabot.github.io/MCSRImageBuilder/';

/** 上流の TIMELINE_EVENT_MAP。ここに無い型は送らない。 */
const EVENT_CODE: Partial<Record<EventType, string>> = {
  enter_nether: 'en',
  enter_bastion: 'eb',
  leave_bastion: 'lb',
  enter_fortress: 'ef',
  leave_fortress: 'lf',
  first_portal: 'fp',
  second_portal: 'sp',
  enter_stronghold: 'es',
  portal_room: 'pr',
  enter_end: 'ee',
  credits: 'fn',
};

/**
 * 上流の SIMPLE_MODE_TIMELINE_EVENTS。ここに無いイベントは
 * Detailed Mode（dm=1）でないと上流側で捨てられる。
 * PaceMan から来るもののうち該当するのは second_portal だけ。
 */
const SIMPLE_EVENTS: ReadonlySet<EventType> = new Set<EventType>([
  'overworld',
  'enter_nether',
  'enter_bastion',
  'enter_fortress',
  'first_portal',
  'enter_stronghold',
  'portal_room',
  'enter_end',
  'credits',
]);

const MAX_BLOCK = 0xffff;

/**
 * 無圧縮ブロックだけの raw deflate。
 * 各ブロックは [BFINAL+BTYPE=00, LEN(LE16), ~LEN(LE16), 生データ]。
 */
const storedDeflate = (bytes: Uint8Array): Uint8Array => {
  const count = Math.max(1, Math.ceil(bytes.length / MAX_BLOCK));
  const out = new Uint8Array(bytes.length + count * 5);
  let at = 0;
  for (let i = 0; i < count; i++) {
    const chunk = bytes.subarray(i * MAX_BLOCK, (i + 1) * MAX_BLOCK);
    const len = chunk.length;
    out[at++] = i === count - 1 ? 1 : 0; // 最後のブロックだけ BFINAL
    out[at++] = len & 0xff;
    out[at++] = (len >> 8) & 0xff;
    out[at++] = ~len & 0xff;
    out[at++] = (~len >> 8) & 0xff;
    out.set(chunk, at);
    at += len;
  }
  return out;
};

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // 上流も = は落とさない。URLSearchParams が %3D に直す
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_');
};

/** 上流 utils/compress.ts の deflate と同じ入出力。 */
export const deflateParam = (text: string): string => {
  // UTF-16 → UTF-8。encodeURIComponent の結果は ASCII なので char code がそのままバイト
  const escaped = encodeURIComponent(text);
  const bytes = new Uint8Array(escaped.length);
  for (let i = 0; i < escaped.length; i++) bytes[i] = escaped.charCodeAt(i);
  return toBase64Url(storedDeflate(bytes));
};

/**
 * 上流が生成する URL に合わせて , / : は生のまま置く。
 * 復元は decodeURIComponent なので、escape したままでも読めはする。
 */
const readable = (params: URLSearchParams): string =>
  params.toString().replaceAll('%2C', ',').replaceAll('%2F', '/').replaceAll('%3A', ':');

/** 走った日。上流の Run Info に文字列としてそのまま出る。 */
const dateOf = (ms: number | null): string | null => {
  if (ms === null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * そのランを開いた状態の Image Builder の URL。
 * 送れるスプリットが 1 つも無ければ null（overworld:0 しか無いランは絵にならない）。
 */
export const imageBuilderUrl = (run: RunTimeline): string | null => {
  const items = run.items.filter((item) => EVENT_CODE[item.type] !== undefined);
  if (items.length === 0) return null;

  const timeline = items
    .map((item) => `${EVENT_CODE[item.type]},${convertMillisecondsToTime(item.igt, true)}`)
    .join('/');

  const item = new URLSearchParams();
  if (run.uuid) item.set('s', run.uuid); // 顔は mineatar が uuid で引く
  if (run.nickname) item.set('n', run.nickname);
  const date = dateOf(run.lastUpdated);
  if (date) item.set('d', date);
  item.set('tl', timeline);

  const common = new URLSearchParams();
  // second_portal を出すには Detailed Mode が要る。無いランでは既定のまま
  if (items.some((i) => !SIMPLE_EVENTS.has(i.type))) common.set('dm', '1');

  const query = new URLSearchParams();
  query.set('c', deflateParam(readable(common)));
  query.set('i', deflateParam(readable(item)));
  return `${BUILDER_URL}?${query.toString()}`;
};
