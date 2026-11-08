# -*- coding: utf-8 -*-
u"""公開中の掲示板から、台本・効果音・BGM・図を取り出して作業場所へ戻す。

    python3 -I 掲示板から台本を取り戻す.py <掲示板のHTML> ...

■ なぜ要るか（2026-11-07）
  台本は git に入れない決まりなので、**コンテナが作り直されると消える。**
  掲示板には doc-<印>-sub / doc-<印>-tts として中身が入っているので、
  そこから書き戻せる。掲示板が控えそのものになっている。

■ 音と図も入っていた（2026-11-08）
  台本だけ戻して安心していたら、**仕上げ.py の最後で build.py が止まった**：

      [中断] …/scratchpad/video/効果音/はさみ.mp3 がありません

  効果音・BGM・図は**そもそも git に入っていない**（音と絵は本人のパソコン）。
  でも掲示板には base64 で入っている：

      <script type="text/plain" data-se="はさみ.mp3">…</script>
      <script type="text/plain" data-bgm="ふおんなきり.mp3">…</script>
      <script type="text/plain" data-fig="rou" data-name="図_….jpg">…</script>

  **掲示板は台本だけの控えではない。** ここから全部戻す。
"""
import html
import io
import os
import re
import sys

V = u"/home/user/animatch/.claude/video/"
B = u"/tmp/claude-0/-home-user-animatch/d021c7eb-d2b4-50cd-88d9-50c602c1820d/scratchpad/"

michi = {}
for ln in io.open(V + u"動画一覧.txt", encoding="utf-8-sig"):
    t = ln.rstrip(u"\n").replace(u"\r", u"")
    if not t or t.startswith(u"#"):
        continue
    c = t.split(u"\t")
    if len(c) >= 4:
        michi[c[0]] = (c[2], c[3])

dashita = 0
for p in sys.argv[1:]:
    s = io.open(p, encoding="utf-8", errors="replace").read()
    for m in re.finditer(
            u'<script type="text/plain" id="doc-([a-z0-9]+)-(sub|tts)">(.*?)</script>',
            s, re.S):
        shirushi, kind, naka = m.group(1), m.group(2), m.group(3)
        if shirushi not in michi:
            print(u"（%s は 動画一覧.txt にありません。飛ばします）" % shirushi)
            continue
        saki = michi[shirushi][0 if kind == "sub" else 1]
        out = os.path.join(B, saki.replace(u"/", os.sep))
        d = os.path.dirname(out)
        if d and not os.path.isdir(d):
            os.makedirs(d)
        t = html.unescape(naka).lstrip(u"\n")
        # 掲示板に入れるときに \r\n になっているので、台本の決まりに合わせる
        t = t.replace(u"\r\n", u"\n")
        if not t.endswith(u"\n"):
            t += u"\n"
        io.open(out, "w", encoding="utf-8", newline="\r\n").write(t)
        dashita += 1
print(u"台本 %d本を書き戻しました" % dashita)

# ── 効果音・BGM・図（base64 で入っている）─────────────────
import base64

oto = 0
for p2 in sys.argv[1:]:
    s2 = io.open(p2, encoding="utf-8", errors="replace").read()
    for ana, saki in (
            (u'<script type="text/plain" data-se="([^"]+)">(.*?)</script>',
             u"video/効果音"),
            (u'<script type="text/plain" data-bgm="([^"]+)">(.*?)</script>',
             u"video/BGM")):
        for m in re.finditer(ana, s2, re.S):
            na, naka = m.group(1), m.group(2).strip()
            if not naka or naka.startswith(u"@@"):
                continue
            d = os.path.join(B, saki.replace(u"/", os.sep))
            if not os.path.isdir(d):
                os.makedirs(d)
            out = os.path.join(d, na)
            if os.path.isfile(out):
                continue
            try:
                io.open(out, "wb").write(base64.b64decode(naka))
            except Exception as e:
                print(u"（%s は戻せません: %s）" % (na, e))
                continue
            oto += 1
            print(u"  音を戻しました: %s/%s（%d バイト）"
                  % (saki, na, os.path.getsize(out)))

    for m in re.finditer(
            u'<script type="text/plain" data-fig="([a-z0-9]+)" data-name="([^"]+)">(.*?)</script>',
            s2, re.S):
        shirushi, na, naka = m.group(1), m.group(2), m.group(3).strip()
        if not naka or naka.startswith(u"@@"):
            continue
        d = os.path.join(B, u"video", u"図", shirushi)
        if not os.path.isdir(d):
            os.makedirs(d)
        out = os.path.join(d, na)
        if os.path.isfile(out):
            continue
        try:
            io.open(out, "wb").write(base64.b64decode(naka))
        except Exception as e:
            print(u"（%s は戻せません: %s）" % (na, e))
            continue
        oto += 1
        print(u"  図を戻しました: 図/%s/%s（%d バイト）"
              % (shirushi, na, os.path.getsize(out)))

print(u"音と図 %d個を書き戻しました" % oto)
