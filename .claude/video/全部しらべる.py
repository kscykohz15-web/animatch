# -*- coding: utf-8 -*-
u"""ぜんぶの動画の 画面表示.txt を、まとめて確かめる。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shou_check
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

KUMI = [
 (u"画面表示_老デウス.txt", u"../final/老デウス_壮絶な人生年表_字幕用_最終版.txt"),
 (u"画面表示_第0弾.txt",  u"../第0弾_ターニングポイント全解説_字幕用_v4段落整理版.txt"),
 (u"画面表示_第1回.txt",  u"../final/第1回_人生年表_字幕用_最終版.txt"),
 (u"画面表示_第3回.txt",  u"../final/第3回_伏線7選_字幕用_最終版.txt"),
 (u"画面表示_第4回.txt",  u"../final/第4回_謎7選_字幕用_最終版.txt"),
 (u"画面表示_第5回.txt",  u"../final/第5回_3人が一度いなくなる理由_字幕用_最終版.txt"),
 (u"画面表示_第6回.txt",  u"../final/第6回_ヒトガミの正体_字幕用_最終版.txt"),
 (u"画面表示_第7回.txt",  u"../final/第7回_オルステッドの正体_字幕用_最終版.txt"),
]
HERE = os.path.dirname(os.path.abspath(__file__))
warui = 0
for ov, sc in KUMI:
    ov = os.path.join(HERE, ov); sc = os.path.join(HERE, sc)
    if not os.path.exists(ov):
        print(u"× %s がありません" % os.path.basename(ov)); warui += 1; continue
    k = shou_check.shirabe(ov, sc, shizuka=True)
    mark = u"×" if k else u"○"
    print(u"%s %-22s %s" % (mark, os.path.basename(ov), u" / ".join(k) if k else u"問題なし"))
    warui += bool(k)
print(u"\n%d本中 %d本に問題があります。" % (len(KUMI), warui))
sys.exit(1 if warui else 0)
