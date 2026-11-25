# VST3 プラグイン化 計画（Ableton Live 12）

> **状況（2026-11-25）**：手順1〜4は実装済み。VST3 と Standalone がビルドでき、Standalone でテスト信号のコード判定とチューナーが動くことを確認した。残りは手順5（Ableton での確認）と手順6（配布 zip）。使い方は [plugin/README.md](../plugin/README.md)。

## 調査結果（2026-11-25 時点）

| 項目 | 状況 |
|---|---|
| ビルド環境 | Visual Studio Community 2026（18.8）、CMake 4.2.1、Ninja 1.13 がインストール済み |
| DAW | Ableton Live 12 Lite がインストール済み（VST3 に対応） |
| 多音検出エンジン | EffeTune の DSP コアは C++20・MIT で公開されている（[Frieve-A/effetune `dsp/`](https://github.com/Frieve-A/effetune/tree/main/dsp)）。WASM 版と同じコードに C ABI（`include/effetune/abi.h`）がある。`et_engine_create` / `et_instance_create("NoteSpectrogram")` / `et_instance_process` / `et_telemetry_read` を使えば、Web版と同じ解析をネイティブで動かせる |
| UI | JUCE 8 の `WebBrowserComponent`（Windows では WebView2）で、今の Web UI（`dist/`）をそのまま表示できる |

## 構成

```
Ableton（ASIO）
  └─ VST3: Guitar Note Visualizer（音はそのまま素通し、レイテンシ 0 を報告）
       ├─ オーディオスレッド: モノラル化 → EffeTune NoteSpectrogram（ネイティブ）
       │                       → テレメトリ（約20 ms ごと）をロックフリーFIFOへ
       │                     + チューナー用の MPM 音高推定（pitchDetect.ts を C++ に移植）
       └─ メッセージスレッド: FIFO → WebView へイベント送信（1フレーム約2 KB）
            └─ WebView2: 今の Web UI。PitchEngine を NativeEngine に差し替える
```

- **ロジック層はそのまま流用する**：`noteTracker` / `chordNamer` / `guide` / `fretboard`、UI 全体
- **Web 側に追加するもの**：`src/audio/nativeEngine.ts`
  - `window.__JUCE__` があればこちらを使い、なければ従来の EffeTuneEngine（WASM）を使う
  - プラグイン内では入力デバイス欄を隠す（入力は DAW のトラック）
- **UI ファイルの配信**：`dist/` をバイナリリソースとしてプラグインに埋め込み、JUCE の ResourceProvider で返す。ローカルサーバーは使わない
- **設定の保存**：WebView の localStorage に加えて、DAW のプロジェクトにも保存する（`getStateInformation`）

## 遅延の見込み

| 区間 | Web版（WASAPI） | VST3（ASIO 64〜128 smp） |
|---|---|---|
| 入力経路 | 約15〜30 ms | 約2〜5 ms |
| 音高推定 | 単音45〜85 ms／和音85〜110 ms（実測） | 同じ |
| UIへの転送と描画 | 1〜2フレーム | 同じ＋WebView へのイベント転送（1 ms未満） |

## 作業の順番

1. **EffeTune コアを MSVC でビルドする**
   - `dsp/` を FetchContent で取得し、静的ライブラリにする
   - 同じ入力を与えて、WASM 版とネイティブ版で `levels` が一致することを小さな CLI で確かめる
2. **JUCE 8 のプラグイン雛形を作る**（VST3 と、確認用の Standalone）
   - 音を素通しし、オーディオスレッドで NoteSpectrogram を動かす
3. **WebView エディタを作る**：`dist/` を埋め込み、テレメトリをイベントで送る。Web 側に `nativeEngine.ts` を追加する
4. **チューナーの MPM を C++ に移植する**（またはモノラル音声を間引いて UI に送る）
5. **Ableton Live 12 で確認する**
   - `C:\Program Files\Common Files\VST3` に配置して再スキャンする
   - ギタートラックのエフェクトとして挿し、反応と CPU 負荷を確認する
6. **配布用 zip と README を作る**

## リスクと対策

- **パラメータのバイト列**
  - リスク：NoteSpectrogram に渡すパラメータのバイト配置は、JS 側で生成コードが組み立てている
  - 対策：`dsp/generated` のスキーマから同じ配置を C++ で組む。手順1で WASM 版と照合する
- **MSVC 対応**
  - リスク：コアは Clang/Emscripten 向けに書かれている
  - 対策：MSVC でビルドが通らなければ、clang-cl（VS に同梱）を使う
- **WebView2 SDK**：ビルド時に NuGet パッケージ（Microsoft.Web.WebView2）が要る。実行時のランタイムは Windows 11 に標準で入っている
- **JUCE のライセンス**：JUCE 8 は、個人や小規模なら無償の Personal ライセンスか AGPLv3 で使える。自分用なら問題なく、配布する場合は条件を確認する
