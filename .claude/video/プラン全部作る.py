# -*- coding: utf-8 -*-
u"""8本ぶんの 画像プラン を、章ごとの話数つきでまとめて作る。

■ 章がアニメの何話にあたるかは、ここにはもう書きません。
   画面表示_○○.txt の 章の行の4列目 が、ただ一つの置き場所です。
   前はこのファイルにも章→話数の表が入っていて、同じことが2か所にあり、
   章の名前を直したとたんに黙って効かなくなりました。

台本を書きかえたら、これを回しなおしてください。
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import プラン下書き as P
import plan_check
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SC = os.path.join(HERE, u"..")

KUMI = [
 # (id, 台本, 見出し)  ※章→話数は 画面表示_○○.txt の章の行の4列目
 (u"第0弾", u"第0弾_ターニングポイント全解説_字幕用_v4段落整理版.txt",
  u"ターニングポイント全解説"),
 (u"第1回", u"final/第1回_人生年表_字幕用_最終版.txt",
  u"ルーデウス人生年表"),
 (u"第3回", u"final/第3回_伏線7選_字幕用_最終版.txt",
  u"回収済みの伏線7選"),
 (u"第4回", u"final/第4回_謎7選_字幕用_最終版.txt",
  u"まだ答えの出ていない謎7選"),
 (u"第5回", u"final/第5回_3人が一度いなくなる理由_字幕用_最終版.txt",
  u"ヒロイン3人が一度いなくなる理由"),
 (u"第6回", u"final/第6回_ヒトガミの正体_字幕用_最終版.txt",
  u"ヒトガミの正体と四つの助言"),
 (u"第7回", u"final/第7回_オルステッドの正体_字幕用_最終版.txt",
  u"龍神オルステッドの正体"),
]

if __name__ == "__main__":
    warui = 0
    for (nm, sc, midashi) in KUMI:
        script = os.path.join(SC, sc)
        overlay = os.path.join(HERE, u"画面表示_%s.txt" % nm)
        out = os.path.join(HERE, u"画像プラン_%s.txt" % nm)
        # 章→話数は tsukuru が 画面表示_○○.txt の4列目から読みます
        n, a = P.tsukuru(script, overlay, out, midashi)
        k, wariai = plan_check.shirabe(out, script, shizuka=True)
        mark = u"×" if k else u"○"
        print(u"%s 画像プラン_%-5s 字幕%3d枚 / 当て方 %3d枚 / 当たる %3.0f%%  %s"
              % (mark, nm, n, a, wariai, u" / ".join(k) if k else u""))
        warui += bool(k)
    print(u"\n%d本中 %d本に問題があります。" % (len(KUMI), warui))
    sys.exit(1 if warui else 0)
