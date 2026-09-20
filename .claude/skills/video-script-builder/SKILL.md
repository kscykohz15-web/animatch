---
name: video-script-builder
description: 台本(タイムスタンプ付きスクリプト:SRT/VTTまたは`00:00:05 セリフ`形式)・カットごとの静止画やB-roll動画クリップ・ナレーション音声から、字幕付きの解説動画を自動組み立てする。「動画を編集して」「台本と素材から動画を作って」「ナレーションに合わせて画像を切り替える動画を作って」のように、タイムスタンプ付き台本+カットごとの視覚素材+ナレーション音声(任意でBGM)が揃っている/揃えられる場面で使う。ffmpegが必要。
---

# video-script-builder

台本(いつ・何を話すか)と、カットごとの素材(静止画/動画クリップ)、ナレーション音声から
1本のMP4を自動生成するパイプライン。Claude自身が動画を「見て」編集するのではなく、
Claudeがこのスキルのスクリプト群を使って ffmpeg を操作し、編集作業を代行する。

## 前提

- `ffmpeg` / `ffprobe` が PATH 上にあること。無ければ先にインストールを案内する
  (`apt-get install -y --no-install-recommends ffmpeg` など、環境に応じて)。
- 日本語字幕を焼き込む場合、CJK対応フォント(例: Noto Sans CJK JP)が入っていないと
  文字が豆腐(□)になる。`fc-list :lang=ja` で確認し、無ければ案内する。

## ワークフロー

1. **台本をパースする** — `scripts/parse_script.py`
   ```
   python3 scripts/parse_script.py script.srt -o cues.json
   # プレーンテキスト形式の場合:
   python3 scripts/parse_script.py script.txt --format plain --end-pad 4 -o cues.json
   ```
   SRT/VTT/`00:00:05 テキスト`形式を自動判別してパースし、`{id, start, end, text}` の
   配列を JSON で出力する。プレーン形式では各カットの終了時刻を次のカットの開始時刻から
   推定し、最後のカットだけ `--end-pad` 秒(既定4秒)を与える。

2. **素材をカットに割り当ててstoryboardを作る** — `scripts/build_storyboard.py`
   ```
   python3 scripts/build_storyboard.py cues.json --assets-dir assets -o storyboard.yaml
   ```
   `assets/001_title.png`, `assets/002_market.jpg`, `assets/003.mp4` のように
   **カットID(01始まりの連番)をファイル名の先頭に付ける**規約で自動割り当てする。
   割り当てられなかったカットは `visual: null` のまま警告が出るので、必ずここで
   手を止めて対処する:
   - 台本のテキスト内容とアセット一覧を照らし合わせ、`storyboard.yaml` の
     `visual:` を手動で埋める(適切な画像/動画が無ければユーザーに確認する)。
   - 各カットの `zoom` (`in`/`out`/`none`, 静止画のみ有効) や `kind` も
     必要に応じて調整してよい。

3. **レンダリング前に長さを確認する** — ナレーション音声がある場合、
   `ffprobe -show_entries format=duration narration.wav` の秒数と、
   storyboardの最終カットの `end` がおおむね一致しているか確認する
   (`render_video.py` も1秒以上ズレていれば警告を出す)。大きくズレている場合は
   台本のタイムスタンプが音声と合っていない可能性が高いので、先にそちらを直す。

4. **レンダリングする** — `scripts/render_video.py`
   ```
   python3 scripts/render_video.py storyboard.yaml \
     --narration narration.wav \
     --bgm bgm.mp3 \
     --subtitles burn --font "Noto Sans CJK JP" \
     --out episode.mp4
   ```
   - ナレーションは1本の通しファイル(`--narration`、台本と同じタイムラインで
     録音/書き起こしされたもの)か、カットごとの個別ファイル
     (`--narration-dir` に `001.wav`, `002.wav`, ... の規約で配置)のどちらかを渡す。
   - `--bgm` を渡すと、ナレーションの音量に応じて自動でダッキング(音量を下げる)
     しながらミックスする。
   - `--subtitles burn`(既定, 字幕を映像に焼き込む) / `soft`(mp4の字幕トラックとして
     付与) / `none` から選ぶ。
   - 台本の最初のカットが `t=0` から始まっていない場合(冒頭に無音の間がある場合)、
     自動的に最初のカットの素材でリードインのフリーズフレームを挿入し、ナレーション側の
     タイムラインとズレないようにする。
   - `--work-dir` を指定すると中間ファイル(カットごとのセグメント動画、字幕ファイル、
     ミックス後の音声など)が残るので、途中結果の確認や調整に使える。

5. **仕上がりを確認する** — 少なくとも以下をチェックしてからユーザーに渡す:
   - `ffprobe episode.mp4` で長さ・映像/音声トラックの有無を確認。
   - `ffmpeg -ss <任意の秒> -i episode.mp4 -frames:v 1 check.png` で数カ所の
     カット位置を静止画として抜き出し、素材の割り当てが正しいか目視確認
     (このセッションが動画を直接再生できない場合の代替チェック)。
   - 字幕の文字化け(焼き込みでCJKフォント未指定だと起きやすい)がないか。

## ディレクトリ構成の例

```
project/
  script.srt              # or script.txt (plain timestamps)
  assets/
    001_title.png
    002_market.jpg
    003.mp4
  narration.wav
  bgm.mp3
```

## 参考資料

- `references/storyboard_schema.md` — storyboard.yaml の各フィールドの意味
- `references/ffmpeg_cookbook.md` — このスキルが使っているffmpeg filterのレシピと、
  よくあるトラブル(字幕の文字化け、音ズレ、ループ素材のジャギー感など)への対処
