# -*- coding: utf-8 -*-
u"""画像プランを、動画を作らずにその場で試す。

    python shiken.py --plan 画像プラン_老デウス.txt

一覧.txt のセリフと尺をそのまま使い、make_slideshow.py の割り当てだけを
やり直して、新しい一覧を作る。あとは miru_kekka.py で採点する。
"""
from __future__ import print_function
import io, os, sys, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_slideshow as MS

def yomu(p):
    return io.open(p, encoding="utf-8-sig", errors="replace").read()

ap = argparse.ArgumentParser()
ap.add_argument("--plan", default=None)
ap.add_argument("--ichiran", default=None)
ap.add_argument("--catalog", default=u"画像カタログ.txt")
ap.add_argument("--out", default=u"一覧_試作.txt")
a = ap.parse_args()

if not a.ichiran:
    for c in [os.path.join(u"確認用", u"一覧.txt"), u"一覧.txt"]:
        if os.path.exists(c):
            a.ichiran = c
            break
if not a.ichiran or not os.path.exists(a.ichiran):
    print(u"× 一覧.txt が見つかりません。"
          u"先に「2 動画 + 1枚ずつの確認用」で"
          u"一度動画を作ってください。")
    raise SystemExit(1)
if not a.plan or not os.path.exists(a.plan):
    cands = [f for f in os.listdir(u".")
             if f.startswith(u"画像プラン") and f.endswith(u".txt")]
    if not cands:
        cands = [u"画像プラン.txt"]
    a.plan = sorted(cands)[0]

rows = []
for L in yomu(a.ichiran).split(u"\n"):
    p = L.rstrip(u"\r").split(u"\t")
    if len(p) < 5 or p[0].strip() == u"番号":
        continue
    rows.append((p[0], p[1], float(p[2]), p[4]))

# カタログの目印を、そのまま「持っている絵」として使う
cat = {}
for L in yomu(a.catalog).split(u"\n"):
    L = L.rstrip(u"\r")
    if not L or L.lstrip().startswith(u"#") or u"\t" not in L:
        continue
    k, v = L.split(u"\t", 1)
    cat[k.strip()] = v.strip()
cat = MS.apply_person_rules(cat, MS.load_person_rules(u"人物ルール.txt"))
images = sorted([k for k in cat if u"/" in k], key=MS.natkey)
# 図表スライドも候補に入れる
for L in yomu(a.plan).split(u"\n"):
    for w in L.replace(u"\t", u",").split(u","):
        w = w.strip()
        if w.startswith(u"図_") and w.endswith(u".jpg") and w not in images:
            images.append(w)
            cat[w] = u"図表"

rules, default, focus = MS.load_imageplan(a.plan)
slots = [(0.0, d, tx) for (_n, _s, d, tx) in rows]
out = MS.assign_images(slots, images, rules, default, catalog=cat, epmap={}, focus=focus)

with io.open(a.out, "w", encoding="utf-8") as f:
    f.write(u"番号\t開始\t尺\t画像\tセリフ\n")
    for (no, st, du, tx), img in zip(rows, out):
        f.write(u"%s\t%s\t%.2f\t%s\t%s\n" % (no, st, du, img, tx))
print(u"-> %s" % a.out)
