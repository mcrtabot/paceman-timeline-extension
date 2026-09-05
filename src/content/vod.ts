/**
 * タイムラインのアイコンクリックを、PaceMan 自身のスプリット行に転送する。
 *
 * ランページは既にスプリットのクリックで VOD を floor(vodOffset + splitRta/1000 + 2)
 * へシークする。自前でプレイヤーを触らず、本家のハンドラを踏ませる。
 *
 * 踏ませる相手は行（div.card-line）ではなく **p.split-name** でないといけない。
 * onClick はこの p に付いていて、React は dispatch した要素の fiber から上へ辿るので、
 * 親の行に投げても子のハンドラには届かない（実ページで確認済み）。
 *
 * 行の対応付けはインデックスでも表示テキストでもなく img.icon の alt で取る。
 * インデックスは liveruns をマージすると second_portal のように本家のカードに
 * 無い行が入って 1 つずれ、p.split-name のテキストはタイムしか持っていない。
 */

import type { EventType } from '../timeline/types.js';

/** EventType と、PaceMan のカードのアイコン alt との対応。 */
const SPLIT_ALT: Partial<Record<EventType, string>> = {
  enter_nether: 'nether',
  enter_bastion: 'bastion',
  enter_fortress: 'fortress',
  first_portal: 'first_portal',
  second_portal: 'second_portal',
  enter_stronghold: 'stronghold',
  enter_end: 'end',
  credits: 'finish',
};

export const forwardSplitClick = (type: EventType, doc: Document = document): boolean => {
  const alt = SPLIT_ALT[type];
  if (alt === undefined) return false;
  for (const line of doc.querySelectorAll('div.card-line')) {
    if (line.querySelector('img.icon')?.getAttribute('alt') !== alt) continue;
    const target = line.querySelector('p.split-name') ?? line;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }
  return false;
};
