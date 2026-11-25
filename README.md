# Guitar Note Visualizer

ギターの入力をリアルタイムに解析し、単音名・コード名・度数を表示して、22フレットの指板上の該当位置をすべてハイライトするWebアプリ。

▶ Webブラウザ版：https://asaiibowl.github.io/guitar-note-visualizer/ （Chrome / Edge。インストール不要）

## 使い方（ローカルで動かす）

```powershell
npm install
npm run dev
```

1. Chrome か Edge で http://localhost:5173 を開く
2. 「▶ 開始」を押してマイク（オーディオIF）の使用を許可する
3. 「デバイス」でオーディオIFを、「チャンネル」でギターを挿した入力を選ぶ
4. 鳴らす。反応が鈍いときは入力ゲインを上げ、誤検出が多いときは検出しきい値を上げる

ギターがなくても「テスト信号」ボタンで動作を確認でき、そのとき遅延も計測される。

### 主な機能

- **コード・音名の表示**：単音なら音名とセント、2音なら音程かパワーコード、3音以上ならコード名（add9、sus、オンコードなど）を出す
- **指板**：22フレット。同じ高さの位置を濃く、別オクターブの同じ音名を薄くハイライトし、度数ごとに色分けする
- **ガイド（キー／スケール）**：「ガイド」欄でキーとスケール（メジャー、マイナー、ペンタトニック、ブルース、教会旋法など12種類）を選ぶ
  - 指板にスケール音を輪で、主音を塗りつぶしで表示する
  - スケール外の音を弾くと赤い破線で囲む
  - コード名の下に、キー内での度数（ローマ数字。例：`V7 in C メジャー`）を出す
- **Options（⚙ボタン）**：見やすさを調節する。設定はブラウザに保存される
  - 音名ラベルの文字サイズ・太さ・明度
  - フチ取り
  - マーカーの濃さ（弾いた位置、他オクターブ、ガイド、常時表示の音名）
  - コード名パネルの文字サイズ
- **チューナー（🎯ボタン）**：クロマチックチューナーと、標準チューニングで一番近い弦の案内。基準 A4（415〜466 Hz）を変えられる

## VST3 / Standalone（Ableton Live 12）

同じ UI を VST3 プラグインとして DAW の中で使える。解析はネイティブ（EffeTune の C++ コア）で行う。ビルドと導入の手順は [plugin/README.md](plugin/README.md)。

## 公開（GitHub Pages）

`main` ブランチへ push すると、`.github/workflows/deploy.yml` がテスト・ビルドして GitHub Pages に配信する。

- 初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする
- 公開ページは HTTPS なので、マイク（オーディオIF）入力と AudioWorklet がそのまま使える

## 構成

| 層 | ファイル | 役割 |
|---|---|---|
| 音声 | `src/audio/inputDevice.ts` | デバイスとチャンネルの選択、ゲイン、レベル計測 |
| 音声 | `src/audio/effetuneEngine.ts` | [@effetune/dsp](https://github.com/Frieve-A/effetune)（MIT）の NoteSpectrogram で多音を検出する（約20 ms刻み） |
| ロジック | `src/engine/noteTracker.ts` | 信頼度 → 発音中の音（ヒステリシス付き） |
| ロジック | `src/theory/*.ts` | 音名、[tonal](https://github.com/tonaljs/tonal)（MIT）によるコード名と度数、指板座標 |
| UI | `src/ui/*.ts` | SVG指板、コード表示、設定、デバッグ用ピアノロール |

ロジック層はDOMにもWeb Audioにも依存しない純TSにしてある。将来VST化するとき（JUCE WebView など）に再利用するため。

## テスト

```powershell
npm test
```

## ライセンス

- このプロジェクト：Web アプリ（`src/` など）は [MIT](LICENSE)。VST3 / Standalone プラグイン（`plugin/`）は JUCE を AGPLv3 で使うため [AGPL-3.0](plugin/LICENSE.md)
- 使っているライブラリの著作権表示とライセンス全文：[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。`npm run build` / `npm run build:plugin` のたびに出力フォルダにも同梱され、アプリ画面下の「ライセンス表記」から読める
  - 主なもの：[@effetune/dsp](https://github.com/Frieve-A/effetune)（MIT。PFFFT・fdlibm・mediabunny〔MPL-2.0〕を含む）、[tonal](https://github.com/tonaljs/tonal)（MIT）、プラグインでは JUCE 9（AGPLv3）、VST3 SDK（MIT）、WebView2 SDK（BSD-3-Clause）など
  - ライブラリを更新したら `npm run notices` で作り直す
- VST is a registered trademark of Steinberg Media Technologies GmbH.

## 既知の制約

- 倍音と重なるオクターブ上の音（例：E2を鳴らしたときのE4、B3）は検出されないことがある。逆に、倍音が幽霊ノートとして出ることもある（例：C3に対するG4）。コード名は音名の集合で決まるので、たいていは影響しない。
- ブラウザ（WASAPI共有モード）の入力遅延がASIOより10〜25 ms程度上乗せされる。
- Ableton Live がASIOでオーディオIFを使っている間は、ブラウザから同じIFを開けないことがある。
