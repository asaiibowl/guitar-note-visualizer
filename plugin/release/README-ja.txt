Guitar Note Visualizer VST3（Windows 64bit）
==============================================

ギターの音をリアルタイムに解析して、音名・コード名・度数と、22フレットの指板上の
位置を表示する VST3 プラグインです。音は加工せずにそのまま通します。

ブラウザ版：https://asaiibowl.github.io/guitar-note-visualizer/
ソース   ：https://github.com/asaiibowl/guitar-note-visualizer

■ 動作環境
- Windows 10 / 11（64bit）
- VST3 対応の DAW（Ableton Live 12 で確認）
- Microsoft Edge WebView2 ランタイム（Windows 11 には標準で入っています）

■ 導入
1. zip を展開し、「Guitar Note Visualizer.vst3」フォルダを VST3 フォルダに置きます。
   - 標準：C:\Program Files\Common Files\VST3（管理者権限が必要）
   - または DAW に登録してある VST3 カスタムフォルダ
2. DAW でプラグインを再スキャンします。
   Ableton Live：設定 → プラグイン →「VST3 プラグインシステムフォルダを使用」または
   「VST3 プラグインカスタムフォルダを使用」をオンにして「再スキャン」。

■ 使い方（Ableton Live）
1. ギターのオーディオトラックに「Guitar Note Visualizer」を挿します。
2. トラックの Monitor を「In」にします。
   （「Auto」のままだと、トラックをアームしない限り音がプラグインに届きません）
3. プラグイン画面の「チャンネル」を、ギターがつながっている入力
   （入力 1 = L、入力 2 = R、ミックス）に合わせます。
4. ギターなしで試すときは「テスト信号」のボタンを押します（解析にだけ入り、音は出ません）。

■ 注意
- コード署名をしていないため、ダウンロード時に Windows の警告が出ることがあります。
- 上書き更新するときは、DAW を閉じてから置き換えてください。

■ ライセンス
- このプラグイン：GNU AGPL v3（LICENSE-plugin-AGPL.md）。Web UI 部分は MIT（LICENSE）。
- 使用ライブラリ（JUCE、EffeTune DSP、tonal、VST3 SDK、WebView2 SDK ほか）の
  ライセンス全文：THIRD_PARTY_NOTICES.txt
- ソースコードは上記 GitHub リポジトリの同じバージョンのタグで入手できます。
- VST is a registered trademark of Steinberg Media Technologies GmbH.
