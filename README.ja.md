[English](README.md) · **日本語**

# MCSR Timeline for PaceMan

paceman.gg のランを、数字ではなく「形」で読めるようにする Chrome / Firefox 拡張です。

![paceman.gg の完走ラン。run card の上にタイムラインが出ている](docs/run-page.png)

色はそのとき居たバイオーム。ネザーが長い、要塞で止まった、終盤で巻き返した。
スプリットタイムを引き算しなくても、走りの形がそのまま目に入ります。

## できること

**トップページに `TIMELINE` 列。**
今ペースが出ている全員が 1 画面に並びます。進行中のランは頭のマーカーがバーの上を歩き、
その右で現在タイムが進み続けます。上には今 MCSR を回している人の顔がずらりと。

![TIMELINE 列が増えた Active Pace の表](docs/active-pace.png)

**そのほか**

- 星をひとつ押せば、推しは常に一番上。名前も琥珀色になって見つけやすくなります
- スプリットのアイコンをクリックすると、VOD がその瞬間まで飛びます
- バーの下の `Image Builder ↗` で
  [MCSRImageBuilder](https://mcrtabot.github.io/MCSRImageBuilder/) が入力済みで開きます。
  そのまま画像にして共有できます

## インストール

Chrome ウェブストアには出していません。
[Releases](https://github.com/mcrtabot/paceman-timeline-extension/releases) から
ビルド済みのものを取ってください。

**Chrome / Edge**

1. `paceman-timeline-extension-<version>-chrome.zip` をダウンロードして展開
2. フォルダを消えない場所に置く。**毎回ここから読み込まれるので、移動や削除をすると
   動かなくなります**
3. `chrome://extensions` を開く → **デベロッパーモード**を ON →
   **パッケージ化されていない拡張機能を読み込む** → そのフォルダを選ぶ

**Firefox**

1. `paceman-timeline-extension-<version>-firefox.zip` をダウンロードして展開
2. `about:debugging#/runtime/this-firefox` を開く → **一時的なアドオンを読み込む** →
   フォルダの中の `manifest.json` を選ぶ（再起動すると外れます）

あとは paceman.gg を開くだけです。

更新するときは、新しいリリースでフォルダの中身を置き換えて `chrome://extensions` で
再読み込みしてください。自動では上がりません。

## 設定

ツールバーのアイコンから開きます。変更はすぐ反映されます。

| セクション | |
| --- | --- |
| **Enabled** | 全体のスイッチ。OFF なら paceman.gg が元のまま |
| **Show on** | ページごとに出す・出さない |
| **Favorites** | お気に入りの一覧。× で外せます |
| **Active Pace** | 並び順と、走っている人の一覧を出すかどうか |
| **Appearance** | アイコンの絵柄、タイムのフォントと傾き、context マーカー |

context マーカーは溶岩バケツやブレイズロッドをバーの下に出す機能で、既定は OFF です。
PaceMan がこの情報をライブ中しか持っていないため、**進行中のランでのみ**出ます。

## うまく表示されないとき

paceman.gg 側の HTML が変わると、置き場所を見失って何も出なくなることがあります。
そのときも**ページ自体は元のまま動きます**。本家の表示を書き換えていないので、
壊れても邪魔にはなりません。

URL を添えて issue を立ててもらえると直せます。

## 開発

```
pnpm install
pnpm dev         # 開発ハーネス http://localhost:5173/src/dev/index.html
pnpm build       # dist/chrome と dist/firefox を出力
pnpm test
pnpm typecheck
```

`pnpm dev` の開発ハーネスは、採取した実データに対してオフラインで動きます。時計を
差し替えられる（停止・1x・10x・60x・300x）ので、進行中のランが伸びていく様子や
先端マーカーの動きを、決まった動きで何度でも確認できます。マウント周りは採取した
DOM の骨格に対して拡張と同じコードを走らせています。

なぜこの作りなのかは **[DESIGN.md](DESIGN.md)**（英語）に書いてあります。

## ライセンス

コードは MIT です（[`LICENSE`](LICENSE)）。`assets/` 以下のファイルは対象外です。

Minecraft は Mojang Synergies AB の商標です。このプロジェクトは Minecraft の公式製品では
なく、Mojang Studios や Microsoft の承認を受けたものでも、関係するものでもありません。

タイムラインの描画ロジックは、同じ作者の
[MCSRImageBuilder](https://github.com/mcrtabot/MCSRImageBuilder) から移植したものです。
