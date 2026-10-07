# -*- coding: utf-8 -*-
u"""動画一覧.txt を読む。**どの動画があるかの唯一の置き場所。**

    import 動画一覧 as D
    for v in D.yomu():
        v.shirushi  v.namae  v.sub  v.tts  v.midashi
        v.overlay   … 画面表示_○○.txt の道のり
        v.plan      … 画像プラン_○○.txt の道のり

前は同じ一覧が4か所にあって、1本足すとどこかを忘れました。
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
SC = os.path.join(HERE, u"..")            # scratchpad（台本がある所）
ICHIRAN = os.path.join(HERE, u"動画一覧.txt")


class Douga(object):
    def __init__(self, c):
        self.shirushi, self.namae, sub, tts, self.midashi = c[:5]
        self.sub = os.path.join(SC, sub)
        self.tts = os.path.join(SC, tts)
        self.sub_rel, self.tts_rel = sub, tts
        self.overlay = os.path.join(HERE, u"画面表示_%s.txt" % self.namae)
        self.plan = os.path.join(HERE, u"画像プラン_%s.txt" % self.namae)

    def __repr__(self):
        return "<Douga %s %s>" % (self.shirushi, self.namae)


def yomu(path=None):
    out = []
    for line in io.open(path or ICHIRAN, encoding="utf-8-sig") \
            .read().replace("\r\n", "\n").split("\n"):
        t = line.rstrip()
        if not t.strip() or t.lstrip().startswith(u"#") or u"\t" not in t:
            continue
        c = [x.strip() for x in t.split(u"\t")]
        if len(c) < 5:
            raise ValueError(u"動画一覧.txt の列が足りません: " + t)
        out.append(Douga(c))
    if not out:
        raise ValueError(u"動画一覧.txt に1本も書かれていません")
    return out


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    for v in yomu():
        print(u"%-7s %-8s %s" % (v.shirushi, v.namae, v.midashi))
        for p in (v.sub, v.tts, v.overlay):
            if not os.path.exists(p):
                print(u"   × ありません: " + os.path.basename(p))
