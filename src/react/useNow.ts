/**
 * マーカーを動かすための時計。
 *
 * タブが見えていないあいだは止める。裏で回してもマーカーは誰にも見えないし、
 * 戻ってきたときは次の tick で正しい位置に飛ぶ（位置は経過時間から計算するので、
 * 止まっていたぶんがずれとして残らない）。
 */

import { useEffect, useState } from 'react';

export const useNow = (intervalMs = 250): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      stop();
      if (document.visibilityState === 'visible') {
        timer = window.setInterval(() => setNow(Date.now()), intervalMs);
      }
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', start);
    };
  }, [intervalMs]);

  return now;
};
