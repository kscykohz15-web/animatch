# -*- coding: utf-8 -*-
u"""置き場所.txt を読む。**絵と録画の道は、ここだけに書きます。**

    import 置き場所
    置き場所.gazou()    画像フォルダ（作品・話数フォルダが直に並んでいる所）
    置き場所.rokuga()   録画フォルダ
    置き場所.oomoto()   おおもと

前は道具9本に同じ道が直書きしてありました
（miru.py / make_contact.py / shiboru.py / extract_frames.py /
 画像一覧.py / short.py / 直す.py / make_slideshow.py / shindan.py）。
掲示板を2枚に分けたとき、片方だけ直す事故が起きる形だったので1か所にします。

置き場所.txt が無ければ、これまでどおりの道を返します（無職転生の並び）。
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = u"置き場所.txt"

KITEI = {
    u"おおもと": u"C:\\Youtube動画\\無職転生",
    u"画像": u"C:\\Youtube動画\\無職転生\\画像\\高画質",
    u"録画": u"C:\\Youtube動画\\無職転生\\録画",
}

_oboe = [None]


def yomu(path=None):
    u"""置き場所.txt を読む。1回読んだら覚えておく。"""
    if path is None and _oboe[0] is not None:
        return _oboe[0]
    out = dict(KITEI)
    sagasu = [path] if path else [
        os.path.join(HERE, FILE),
        os.path.join(os.getcwd(), FILE),
        os.path.join(os.path.dirname(HERE), FILE),
    ]
    for p in sagasu:
        if not p or not os.path.exists(p):
            continue
        for line in io.open(p, encoding="utf-8-sig", errors="replace") \
                .read().replace("\r\n", "\n").split("\n"):
            t = line.strip()
            if not t or t.startswith(u"#") or u"\t" not in t:
                continue
            k, v = t.split(u"\t", 1)
            k, v = k.strip(), v.strip()
            if k and v:
                out[k] = v
        break
    if path is None:
        _oboe[0] = out
    return out


# ■ **絵ではないフォルダ**（2026-10-27・本人の付け直しログから）
#
# 画像フォルダの中には、絵ではないものも入っている。
#
#   一覧/1-02_02.png          … 番号をふった一覧シート（327枚）
#   無職転生Ⅱ 第4話/一覧_03.png
#
# make_slideshow.py はこれを外していたが、**miru.py は外していなかった。**
# そのため
#   miru.py          画像 6697枚
#   make_slideshow.py 画像 6370枚   ← 327枚ちがう
# となり、miru.py は動画に使われない一覧シートを説明づけしていた
# （大きな貼り合わせ画像なので「何も取れませんでした」にもなりやすい）。
#
# **二つの道具が別のものを見ていた。** 一覧が make_slideshow.py にしか
# 無かったのが原因なので、道と同じくここに1回だけ置く。
TSUKAWANAI_FOL = (u"一覧", u"確認用", u"素材", u"_選んだ画像", u"候補")


def tsukawanai_fol():
    u"""絵ではないフォルダの名前。画像を集める所では必ず外す。"""
    return TSUKAWANAI_FOL


def oomoto():
    return yomu()[u"おおもと"]


def gazou():
    return yomu()[u"画像"]


def rokuga():
    return yomu()[u"録画"]


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    for k, v in sorted(yomu().items()):
        print(u"%-6s %s" % (k, v))
