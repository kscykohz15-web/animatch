# このスキルが使っているffmpegのレシピ

`render_video.py` は1本の巨大な `filter_complex` を組むのではなく、段階ごとに
中間ファイルを吐きながら進める(`--work-dir` で確認可能)。各段階で何をしているか。

## 1. カットごとのセグメント生成

**静止画(Ken Burns風パン/ズーム)**
```
ffmpeg -loop 1 -i image.jpg -t <duration> \
  -vf "scale=2W:2H:force_original_aspect_ratio=increase,crop=2W:2H,\
       zoompan=z='min(zoom+0.0012,1.4)':d=<duration*fps>:s=WxH:fps=<fps>,format=yuv420p" \
  -r <fps> -pix_fmt yuv420p seg.mp4
```
- 先に2倍サイズへスケール&クロップしてから `zoompan` を掛けるのは、ズーム時の
  ジャギー/ブロックノイズを減らすための定番の下ごしらえ。
- `zoompan` の `d`(フレーム数)を `duration * fps` に厳密に合わせることで、
  他のカットとの結合位置がズレない。
- ズームアウトは `z='if(eq(on,1),1.4,max(zoom-0.0012,1.0))'` のように、最初のフレーム
  (`on==1`)だけ最大倍率を注入してから徐々に戻す。

**動画クリップ**
```
ffmpeg -stream_loop -1 -i clip.mp4 -t <duration> \
  -vf "scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p" \
  -r <fps> -an -pix_fmt yuv420p seg.mp4
```
- `-stream_loop -1` で無限ループさせてから `-t` で切るので、素材がカットの尺より
  短くても長くても同じロジックで処理できる。
- 音声は `-an` で落とす(音はナレーション/BGM側で別途ミックスする)。

## 2. 結合 + 字幕焼き込み

```
ffmpeg -f concat -safe 0 -i concat_list.txt \
  -vf "subtitles=subtitles.srt:force_style='FontName=<font>'" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p silent_video.mp4
```
- 全セグメントが同じcodec/解像度/fpsで作られているので、字幕を焼かない場合は
  `-c copy` で高速に結合できる(`--subtitles soft` / `none` のとき)。
- `subtitles` フィルタはlibassを介してレンダリングされるため、**システムに
  日本語フォントが無いと文字化け(豆腐)する**。`fc-list :lang=ja` で確認し、
  無ければ `fonts-noto-cjk` 等の導入を案内した上で `--font` を指定する。

## 3. 音声ミックス

**ナレーション単体**: そのまま使う(`apad` + `atrim` で全体尺に合わせるだけ)。

**ナレーション+BGM(ダッキング)**
```
[bgm][nar]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=400[ducked];
[ducked][nar]amix=inputs=2:duration=first:dropout_transition=0,volume=2[aout]
```
- `sidechaincompress` でナレーションの音量に反応してBGMを自動的に下げる
  (しゃべっている間だけBGMが小さくなる)。
- `amix` はデフォルトで音量を入力数で割ってしまう(2入力なら半分)ため、
  聞感上ナレーションが小さくなりすぎるのを防ぐために `volume=2` で補正している。
  BGMの元音量が大きすぎる/小さすぎる場合は `threshold` / `ratio` や
  BGM側の `volume=` を先に調整する方が自然な仕上がりになる。

**カット単位のナレーションクリップを結合する場合**
```
[0:a]adelay=<start_ms>:all=1[a0]; [1:a]adelay=<start_ms>:all=1[a1]; ...
[a0][a1]...amix=inputs=N:duration=longest:dropout_transition=0[aout]
```
- `adelay=...:all=1` はモノラル/ステレオを問わず全チャンネルに同じ遅延をかける
  (ffmpeg 4系以降の `all` オプション)。古いffmpegでは `all=1` が無い場合があるので、
  その際は `<ms>|<ms>` のように遅延値をチャンネル数分並べる形に書き換える。

## 4. 最終ミックス

```
ffmpeg -i silent_video.mp4 -i final_audio.wav [-i subtitles.srt] \
  -map 0:v -map 1:a [-map 2:s] \
  -c:v copy -c:a aac -b:a 192k [-c:s mov_text] \
  -t <total_duration> out.mp4
```
- 音声・映像どちらの尺がズレていても `-t <total_duration>` で最終的に台本の尺へ
  強制的に揃える(ナレーションが長ければ末尾は切れ、短ければ無音でパディングされる
  — パディングは音声ミックス段階の `apad` が担当)。

## よくあるトラブル

- **字幕が豆腐になる** → CJKフォント未導入。`fc-list :lang=ja` で確認し導入、
  もしくは `--font` で明示的にインストール済みフォント名を指定する。
- **音がズレている** → 台本のタイムスタンプとナレーション音声の録音タイミングが
  そもそも一致していない可能性が高い。`parse_script.py` の出力(cues.json)の
  `start` と、実際にナレーションでその台詞が始まる時刻をいくつか耳で確認する。
- **ズーム映像がガタつく/ジャギる** → 元画像の解像度が低すぎる可能性がある。
  最低でも出力解像度の2倍(1920x1080出力なら3840x2160相当)以上の画像を使う。
- **ffmpegが `Unknown encoder` 等で落ちる** → ビルドされているffmpegに
  必要なコーデック(libx264, aac, libass 等)が含まれているか
  `ffmpeg -codecs` / `ffmpeg -filters` で確認する。
