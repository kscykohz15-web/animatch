# -*- coding: utf-8 -*-
u"""ぜんぶの動画の 画面表示.txt を、まとめて確かめる。

どの動画があるかは 動画一覧.txt にだけ書いてあります（ここには書きません）。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shou_check
import 動画一覧 as D
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

warui = 0
douga = D.yomu()
for v in douga:
    if not os.path.exists(v.overlay):
        print(u"× %s がありません" % os.path.basename(v.overlay)); warui += 1; continue
    k = shou_check.shirabe(v.overlay, v.sub, shizuka=True)
    mark = u"×" if k else u"○"
    print(u"%s %-24s %s" % (mark, os.path.basename(v.overlay), u" / ".join(k) if k else u"問題なし"))
    warui += bool(k)
print(u"\n%d本中 %d本に問題があります。" % (len(douga), warui))
sys.exit(1 if warui else 0)
