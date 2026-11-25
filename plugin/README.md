# Guitar Note Visualizer — VST3 / Standalone

Web版と同じ UI を、VST3 プラグインとして Ableton Live 12 などの DAW で動かす。

- 音はそのまま素通しする（レイテンシ 0）
- 多音検出は EffeTune の NoteSpectrogram（Web版の WASM と同じ C++ コード）をネイティブで動かす。同じ入力で WASM 版と結果が一致することを `tools/compare-ns.mjs` で確認済み（差は最大 2.4×10⁻⁷）
- UI は JUCE の WebBrowserComponent（WebView2）で表示する。Web版をビルドした `dist-plugin/` を zip にしてプラグインに埋め込む

## 使い方（Ableton Live 12）

1. 下の手順でビルドし、VST3 を配置する
   - カスタムフォルダの場合：`plugin\install-vst3.ps1 -Destination D:\VST3`
   - システムフォルダの場合：`plugin\install-vst3.ps1`（管理者権限の確認が出る）
2. Live の 設定 → プラグイン で、使うフォルダ（「VST3 プラグインカスタムフォルダ」またはシステムフォルダ）をオンにし、「再スキャン」を押す
3. ギターのオーディオトラックに「Guitar Note Visualizer」を挿し、トラックの Monitor を「In」にする（「Auto」のままだと、トラックをアームしない限り入力がプラグインに届かない）
4. プラグインのウィンドウで「チャンネル」を、ギターがつながっている側（入力 1 = L、入力 2 = R、ミックス）に合わせる

テスト信号ボタンを押すと、プラグイン内で合成したギター音が解析にだけ入る（トラックの出力には出ない）。ギターなしで動作を確認できる。

## ビルド

前提：Visual Studio 2026（C++ デスクトップ開発）、CMake 3.24 以上、Ninja、Node.js。

```powershell
# 1. 依存ソースを取得（初回だけ）
git clone --depth 1 --filter=blob:none --sparse https://github.com/Frieve-A/effetune.git plugin\third_party\effetune
git -C plugin\third_party\effetune sparse-checkout set dsp
git clone --depth 1 --branch 9.0.5 https://github.com/juce-framework/JUCE.git plugin\third_party\JUCE
# WebView2 SDK（NuGet パッケージ Microsoft.Web.WebView2 1.0.3485.44）を
# plugin\third_party\webview2\Microsoft.Web.WebView2.1.0.3485.44\ に展開する

# 2. 埋め込む UI をビルド
npm run build:plugin

# 3. プラグインをビルド（plugin フォルダで）
.\vsrun.bat cmake -S . -B build\rel -G Ninja -DCMAKE_BUILD_TYPE=Release
.\vsrun.bat cmake --build build\rel --target GuitarNoteVisualizer_VST3 GuitarNoteVisualizer_Standalone
```

成果物：

- `build\rel\GuitarNoteVisualizer_artefacts\Release\VST3\Guitar Note Visualizer.vst3`
- `build\rel\GuitarNoteVisualizer_artefacts\Release\Standalone\Guitar Note Visualizer.exe`（単体起動版。Windows の既定の入力を使う）

## 構成

| ファイル | 役割 |
|---|---|
| `src/PluginProcessor.*` | 音の素通し、解析するチャンネルの選択、EffeTune エンジン、テレメトリのロックフリーFIFO、チューナー用リングバッファ、テスト信号 |
| `src/PluginEditor.*` | WebView2 の表示、埋め込み UI の配信、イベントの送受信（`gnvTelemetry` / `gnvAudio` / `gnvInit` など） |
| `../src/audio/nativeBridge.ts` | Web UI 側の受け口。`window.__JUCE__` があれば WASM の代わりにこちらを使う |
| `tools/ns_probe.cpp`, `tools/compare-ns.mjs` | ネイティブ版と WASM 版の照合 |

## ライセンス上の注意

- JUCE 9 は AGPLv3 と JUCE のライセンス（個人・小規模なら無償の区分あり）のデュアルライセンス。自分で使う分には問題ないが、配布する場合は条件を確認すること
- EffeTune DSP：MIT（同梱の PFFFT などの表示は `third_party/effetune/dsp/vendor` 内）
- WebView2 SDK：Microsoft のライセンス（WebView2Loader を静的リンク）
