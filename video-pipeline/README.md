# 動画編集自動化パイプライン（画像連動）

台本テキストから、画面に表示する画像をシーンごとに自動で割り当てる仕組み。
Filmoraは外部スクリプトから操作できないため、まずは「どのタイミングでどの画像を出すか」を
自動で決める計画ファイル（`scene_plan.json`）を作るところまでを自動化する。

## 使い方

1. `video-pipeline/assets/images/<キーワード>/` に、台本に出てくる人物名・地名などの
   フォルダを作り、対応する画像を入れる（詳細は `assets/images/README.md`）。
2. 台本テキスト（字幕用でも読み上げ用でもよい）を用意する。
3. 以下を実行する。

```bash
node video-pipeline/scripts/plan-scenes.mjs 台本_字幕用.txt
```

4. `video-pipeline/output/scene_plan.json` に、シーンごとの
   - 本文
   - 推定の開始・終了時間（秒）
   - 一致したキーワード
   - 割り当てられた画像ファイル
   が出力される。画像が割り当てられなかったシーンはコンソールに候補キーワードとして表示されるので、
   フォルダを追加して再実行すれば埋まる。

## タイミングについて

音声（merged.wav）がまだ無い段階でも動かせるように、文字数と読み上げ速度（speed=135想定）から
シーンの長さを推定している。実際の音声ファイルができたら、その合計秒数を指定して
再実行すると、推定時間の比率を保ったまま実測値に合わせてスケーリングし直せる。

```bash
node video-pipeline/scripts/plan-scenes.mjs 台本_字幕用.txt --actual-duration-sec=612
```

推定精度に納得できない場合は `--chars-per-sec=` で1秒あたりの文字数を調整できる。

## オプション一覧

| オプション | 説明 | デフォルト |
|---|---|---|
| `--assets=` | 画像フォルダのパス | `video-pipeline/assets/images` |
| `--out=` | 出力先JSONのパス | `video-pipeline/output/scene_plan.json` |
| `--actual-duration-sec=` | 実測の合計秒数（分かっている場合） | なし（推定のみ） |
| `--chars-per-sec=` | 読み上げ速度の目安（1秒あたり文字数） | `9.5` |
| `--seconds-per-image=` | 1枚の画像を表示する目安秒数 | `4` |

## 次のステップ（未実装）

`scene_plan.json` ができたら、それを使って実際の動画（mp4）をffmpeg等で
組み立てるレンダリングスクリプトを追加する予定。画像・BGM・字幕（SRT）を
このプランに沿って合成すれば、Filmoraを使わずに最終出力まで自動化できる。
