# -*- coding: utf-8 -*-
u"""掲示板に保存された作品の並びと、作品一覧.txt を突き合わせる（見回り用）。

    python3 -I 見回りの突き合わせ.py <ArtifactData が落としたフォルダ>

■ 使い方
  ArtifactData の list に `out_dir` を付けると、掲示板の `sakuhin` コレクションが
  <out_dir>/sakuhin/<印>.json として**ファイルに落ちる**（読んだ中身で場所を食わない）。
  そのフォルダをこれに渡す。`out_dir/sakuhin` でも `out_dir` でもよい。

■ なぜ道具にしたか（2026-11-07）
  見回りは1時間ごとに走る。毎回この突き合わせを打ち直していたので、
  **打ち直すたびにずれる余地**があった。印の取り方（`ban`）、
  並びまで見る（`==` で比べる・集合では見ない）、どの列か（3列目）を1か所に置く。

■ 何を出すか
  ちがいが0件なら「同じ」だけ。1件でもあれば、掲示板側と一覧側を並べて出し、
  **終了コード1**で返す（見回りはそれを見て作り直しに入る）。
"""
import glob
import io
import json
import os
import sys

V = u"/home/user/animatch/.claude/video/作品一覧.txt"

moto = sys.argv[1] if len(sys.argv) > 1 else u"."
if os.path.isdir(os.path.join(moto, u"sakuhin")):
    moto = os.path.join(moto, u"sakuhin")

ichiran = {}
for ln in io.open(V, encoding="utf-8-sig"):
    t = ln.rstrip(u"\n").replace(u"\r", u"")
    if not t or t.startswith(u"#"):
        continue
    c = t.split(u"\t")
    if len(c) >= 3:
        ichiran.setdefault(c[0], []).append(c[2])

mita = sorted(glob.glob(os.path.join(moto, u"*.json")))
if not mita:
    print(u"（%s に json がありません。何もしません）" % moto)
    sys.exit(0)

chigai = 0
for p in mita:
    d = json.load(io.open(p, encoding="utf-8"))
    ban = d.get(u"ban") or os.path.basename(p)[:-5]
    a = d.get(u"works") or []
    b = ichiran.get(ban, [])
    if a == b:
        print(u"同じ: %s（%d作品・並びまで一致）" % (ban, len(a)))
        continue
    chigai += 1
    print(u"ちがう: %s" % ban)
    print(u"  掲示板: %s" % u" / ".join(a))
    print(u"  一覧  : %s" % u" / ".join(b))
    deta = [x for x in b if x not in a]
    haitta = [x for x in a if x not in b]
    if deta:
        print(u"  外れた: %s" % u" / ".join(deta))
    if haitta:
        print(u"  入った: %s" % u" / ".join(haitta))
    if not deta and not haitta:
        print(u"  （中身は同じで**並びだけ**ちがいます）")

print(u"ちがい %d件" % chigai)
sys.exit(1 if chigai else 0)
