# storyboard.yaml のスキーマ

`build_storyboard.py` が生成し、`render_video.py` が読み込む中間ファイル。
人手(またはClaude)による調整はすべてこのファイルに対して行う。

```yaml
cues:
  - id: 1                # 台本上のカット番号(1始まり)。アセットのファイル名prefixと対応
    start: 0.0           # 台本上の開始時刻(秒)。narration側のタイムラインとも一致させる
    end: 5.0             # 台本上の終了時刻(秒)
    duration: 5.0        # end - start (参考値。render_video.pyは end-start を再計算して使う)
    text: "..."          # 字幕として焼き込む/付与するテキスト
    visual: assets/001_title.png   # このカットで表示する画像 or 動画。null不可(レンダリング前に必須)
    kind: image           # "image" | "video" | null(nullの場合は拡張子から自動判定)
    zoom: in               # "in" | "out" | "none" (静止画のみ有効。動画クリップは常にnone扱い)
    transition: cut        # 現状 "cut" のみ実装。将来クロスフェード等を足す場合はここを拡張する
```

## 編集時の注意

- `visual` が `null` のまま `render_video.py` を実行するとエラーになる。
  台本のテキストとアセット一覧を見て、そのカットに一番合う素材を選ぶ。適切なものが
  手元に無い場合は生成/用意が必要なのでユーザーに確認する(でっち上げない)。
- `zoom: in` は徐々にズームイン、`zoom: out` は最初から少しズームした状態から
  ズームアウトする、いわゆるKen Burns効果。テロップだけの静止画など動きが不要な
  場合は `none` にする。
- カットの `start`/`end` を手で変えると台本の音声とズレるので、基本的には
  `parse_script.py` が出した値をそのまま使う。どうしても尺を調整したい場合は、
  台本(SRT/VTT/プレーンテキスト)側を直してから `parse_script.py` を再実行する方が安全。
