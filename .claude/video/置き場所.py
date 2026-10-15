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
