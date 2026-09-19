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

## レンダリング（mp4書き出し）

`scene_plan.json` ができたら、以下でffmpegによる自動合成を行い最終mp4を書き出す。
事前に `ffmpeg` / `ffprobe` をPATHに入れておくこと。

```bash
node video-pipeline/scripts/render-video.mjs video-pipeline/output/scene_plan.json \
  --audio=merged.wav \
  --bgm=bgm.mp3 \
  --out=video-pipeline/output/final.mp4
```

- 画像は各シーンの `durationSec` に合わせてスライドショーとして結合される（画像未割当のシーンは黒画面で代替）
- `--audio` を指定するとナレーションを合成する。指定した音声の実測長さと `scene_plan.json` の推定長さが2%以上ずれていると警告が出るので、その場合は
  `plan-scenes.mjs` を `--actual-duration-sec=<実測秒数>` 付きで再実行してから render し直すとズレが解消する
- `--bgm` を指定するとBGMを無限ループさせてナレーションの下に薄く（`--bgm-volume`、既定0.15）流す
- 字幕は既存運用（Vrew/YouTubeネイティブ字幕アップロード）に合わせてデフォルトでは焼き込まない。焼き込みたい場合のみ `--subtitles=subtitle.srt --burn-subtitles` を付ける
- 実際にffmpegを動かす前に `--dry-run` を付けると、実行されるffmpegコマンドと中間ファイルだけ確認できる

### オプション一覧（render-video.mjs）

| オプション | 説明 | デフォルト |
|---|---|---|
| `--audio=` | ナレーション音声（merged.wav） | なし（無音） |
| `--bgm=` | BGMファイル | なし |
| `--bgm-volume=` | BGMの音量倍率 | `0.15` |
| `--subtitles=` | 字幕SRT（`--burn-subtitles`併用時のみ使用） | なし |
| `--burn-subtitles` | 字幕を映像に焼き込む | 焼き込まない |
| `--out=` | 出力先mp4パス | `video-pipeline/output/final.mp4` |
| `--width=` / `--height=` / `--fps=` | 出力解像度・フレームレート | `1920` / `1080` / `30` |
| `--dry-run` | ffmpegを実行せず、コマンドだけ確認する | 無効 |
| `--keep-temp` | 中間ファイル（concatリスト・無音スライドショー）を残す | 削除する |
