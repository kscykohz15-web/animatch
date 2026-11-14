# -*- coding: utf-8 -*-
u"""ぜんぶの 画像プラン を、章ごとの話数つきでまとめて作る。

■ 章がアニメの何話（20選なら、どの作品か）にあたるかは、ここには書きません。
   画面表示_○○.txt の 章の行の4列目 が、ただ一つの置き場所です。

■ どの動画があるかも、ここには書きません。
   動画一覧.txt が、ただ一つの置き場所です。

台本を書きかえたら、これを回しなおしてください。
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import プラン下書き as P
import plan_check
import 動画一覧 as D
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

if __name__ == "__main__":
    warui = 0
    douga, _nai = D.dekiteiru()
    D.dekiteiru_iu(_nai, u"プラン全部作る:")
    for v in douga:
        # 章→話数（20選は章→作品フォルダ）は tsukuru が
        # 画面表示_○○.txt の4列目から読みます
        # 20選は、作品の頭の1文だけ公式画像（作品フォルダの「1」）にする。
        # 無職転生は作品フォルダではなく話数フォルダなので、付けません。
        n, a = P.tsukuru(v.sub, v.overlay, v.plan, v.midashi,
                         koushiki=(v.ban == u"osusume"))
        kou = P.KOU_SAIGO[0]
        k, wariai = plan_check.shirabe(v.plan, v.sub, shizuka=True)
        mark = u"×" if k else u"○"
        print(u"%s 画像プラン_%-7s 字幕%3d枚 / 当て方 %3d枚 / 当たる %3.0f%%%s  %s"
              % (mark, v.namae, n, a, wariai,
                 (u" / 公式 %2d枚" % kou) if kou else u"",
                 u" / ".join(k) if k else u""))
        warui += bool(k)
    print(u"\n%d本中 %d本に問題があります。" % (len(douga), warui))
    sys.exit(1 if warui else 0)
