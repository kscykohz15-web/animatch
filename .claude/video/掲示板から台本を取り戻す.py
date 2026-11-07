# -*- coding: utf-8 -*-
u"""公開中の掲示板から、中に入っている台本を取り出して作業場所へ戻す。

    python3 -I hakidasu.py <掲示板のHTML> ...

■ なぜ要るか（2026-11-07）
  台本は git に入れない決まりなので、**コンテナが作り直されると消える。**
  掲示板には doc-<印>-sub / doc-<印>-tts として中身が入っているので、
  そこから書き戻せる。掲示板が控えそのものになっている。
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
