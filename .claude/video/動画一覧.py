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
        self.ban = c[5] if len(c) >= 6 else u"mushoku"
        self.sub = os.path.join(SC, sub)
        self.tts = os.path.join(SC, tts)
        self.sub_rel, self.tts_rel = sub, tts
        self.overlay = os.path.join(HERE, u"画面表示_%s.txt" % self.namae)
        self.plan = os.path.join(HERE, u"画像プラン_%s.txt" % self.namae)

    def __repr__(self):
        return "<Douga %s %s>" % (self.shirushi, self.namae)


def yomu(path=None, ban=None):
    u"""ban に "osusume" などを渡すと、その掲示板の動画だけを返す。"""
    out = []
    for line in io.open(path or ICHIRAN, encoding="utf-8-sig") \
            .read().replace("\r\n", "\n").split("\n"):
        t = line.rstrip()
        if not t.strip() or t.lstrip().startswith(u"#") or u"\t" not in t:
            continue
        c = [x.strip() for x in t.split(u"\t")]
        if len(c) < 6:
            raise ValueError(u"動画一覧.txt の列が足りません(6列): " + t)
        out.append(Douga(c))
    if not out:
        raise ValueError(u"動画一覧.txt に1本も書かれていません")
    if ban:
        out = [v for v in out if v.ban == ban]
        if not out:
            raise ValueError(u"掲示板 %s の動画が1本もありません" % ban)
    return out


def dekiteiru(path=None, ban=None):
    u"""**台本ができている動画だけ**を返す（2026-10-15）。

    動画一覧.txt には、先に行を足して台本はこれから書く ── という
    途中の状態がある。`仕上げ.py` は自分のまわる所ではそれを飛ばして
    「まだ台本が無いので検査しません」と出していたが、
    **呼び出す道具（全部しらべる・プラン全部作る・折り返し検査・演出あわせ）
    には伝えていなかった。** そちらは台本を開こうとして落ち、
    4項目が「落ちた」と出ていた。

    **直した所と関係ない所で落ちる検査は、見なくなる。** それがいちばん危ない。
    飛ばしたものは名前で出す（黙って飛ばすと、本当に無いことに気づけない）。
    """
    out, nai = [], []
    for v in yomu(path, ban):
        if os.path.exists(v.sub):
            out.append(v)
        else:
            nai.append(v.namae)
    return out, nai


def dekiteiru_iu(nai, dare=u""):
    u"""飛ばしたものを1行で知らせる。"""
    if nai:
        print(u"%s… まだ台本が無いので飛ばします: %s"
              % ((dare + u" ") if dare else u"", u" / ".join(nai)))


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    for v in yomu():
        print(u"%-7s %-9s %-8s %s" % (v.shirushi, v.ban, v.namae, v.midashi))
        for p in (v.sub, v.tts, v.overlay):
            if not os.path.exists(p):
                print(u"   × ありません: " + os.path.basename(p))
