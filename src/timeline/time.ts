/**
 * MCSRImageBuilder `web/src/utils/utils.ts` からの移植。
 * h:mm:ss.fff / mm:ss / m:ss.f を許容する寛容なパーサ。
 */

const TIME_RE = /(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d+))?/;

/** "1:23:45.678" / "9:55" などをミリ秒へ。解釈できなければ null。 */
export const convertTimeToMilliSeconds = (time: string): number | null => {
  const match = time.match(TIME_RE);
  if (!match) return null;
  const [, h, m, s, frac] = match;
  const hours = h ? Number(h) : 0;
  const minutes = Number(m);
  const seconds = Number(s);
  // ".5" は 500ms、".05" は 50ms。桁数に応じてスケールする。
  const millis = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0;
  if (!Number.isFinite(hours + minutes + seconds + millis)) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
};

/** ミリ秒を "m:ss" / "h:mm:ss" へ。PaceMan の表示に合わせて既定はミリ秒なし。 */
export const convertMillisecondsToTime = (ms: number, withMillis = false): string => {
  const total = Math.max(0, Math.floor(ms));
  const millis = total % 1000;
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / 60_000) % 60;
  const hours = Math.floor(total / 3_600_000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : `${minutes}`;
  const base = `${head}:${pad(seconds)}`;
  return withMillis ? `${base}.${String(millis).padStart(3, '0')}` : base;
};
