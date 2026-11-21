# -*- coding: utf-8 -*-
u"""台本の作品名を、控え（放送情報.txt・続編情報.txt・作品メモ.txt・原作の状態.txt）の
作品名に引き当てる。放送情報検査.py・事実検査.py・作品メモ検査.py が使う。

■ なぜ要るか（2026-11-17・本人の台本）

  本人が書いたつなぎは「続いての作品は、インフィニット・ストラトス、制作はエイトビット。」。
  控えの作品名は「IS」なので、前の引き方（そのまま → 前方一致）では引けず、
  3つの検査が「放送情報.txt にありません」「控えがまだ無い」と言った。
  放送情報.txt の8列目には AniList の題名（IS〈インフィニット・ストラトス〉）があるので、
  記号を落として、その中に台本の作品名が入っているかで引き当てる。

  引き方は ①そのまま ②前方一致（1つに決まるときだけ）③AniList の題名に入っている
  （1つに決まるときだけ）の順。②③で2つ以上当たったら引かない（別の作品を引くよりよい）。
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
_MUKOU = [None]


def narasu(t):
    u"""比べるために、空白と記号を落とし、英字を小文字にする。"""
    return re.sub(u"[\\s・〈〉＜＞<>「」『』、。！!？?～~:：\\-－‐()（）]", u"", t or u"").lower()


def mukou():
    u"""放送情報.txt の 作品名 → AniList の題名（8列目）。"""
    if _MUKOU[0] is None:
        d = {}
        p = os.path.join(HERE, u"放送情報.txt")
        if os.path.exists(p):
            for ln in io.open(p, encoding="utf-8-sig"):
                if ln.startswith(u"#") or u"\t" not in ln:
                    continue
                c = ln.rstrip(u"\r\n").split(u"\t")
                if len(c) >= 8:
                    d[c[0].strip()] = c[7].strip()
        _MUKOU[0] = d
    return _MUKOU[0]


def hiku(na, keys):
    u"""台本の作品名 na を、keys（控えの作品名）のどれかに引き当てる。無ければ None。"""
    keys = list(keys)
    if na in keys:
        return na
    k = [x for x in keys if na.startswith(x) or x.startswith(na)]
    if len(k) == 1:
        return k[0]
    n = narasu(na)
    if len(n) < 4:
        return None
    m = mukou()
    k = [x for x in keys if n in narasu(m.get(x, u""))]
    return k[0] if len(k) == 1 else None
