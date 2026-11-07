# -*- coding: utf-8 -*-
u"""その作品が **小説家になろう発** かどうかを、日本語版ウィキペディアで確かめて
   放送情報.txt の 11列目に入れる。

    python なろうを引く.py            11列目が空のものだけ
    python なろうを引く.py 作品名 …   その作品だけ引き直す

■ なぜ要るか（2026-11-05）
  「なろう系アニメ総まとめ」の台本では、1本ずつ「なろう発」と言うことになる。
  ところが**こちらの記憶で書くと外す**。オーバーロードは
  小説家になろうではなく別の投稿サイト発で、そこを「なろう」と書いていた。
  放送情報検査.py は「なろう」と書いたら落とす決まりだったが、
  **引いて確かめたものだけは通す**ようにする。

見るもの（記事の中に下のどれかがあれば「はい」）
  ・infobox の 掲載誌／ウェブサイト が 小説家になろう
  ・[[Category:小説家になろう]]
  ・本文に「小説家になろう」で投稿・掲載・連載と書いてある

「いいえ」は、記事は引けたが上のどれも無かったもの。
「？」は記事が引けなかったもの。**「？」と「いいえ」は台本に書かない。**
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
JOHO = os.path.join(HERE, u"放送情報.txt")

import importlib
_k = importlib.import_module(u"掲載誌を引く")   # hiku / kijimei を借りる

NAROU = re.compile(u"小説家になろう")
TOUKOU = re.compile(u"小説家になろう[^。]{0,40}?(投稿|掲載|連載|公開|発表)")


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))


def miru(t):
    for k in (u"掲載誌", u"ウェブサイト", u"レーベル", u"掲載サイト"):
        for m in re.finditer(u"^\\s*\\|\\s*" + k + u"\\s*=\\s*(.*)$", t, re.M):
            if NAROU.search(m.group(1)):
                return True
    if re.search(u"\\[\\[Category:小説家になろう", t):
        return True
    if TOUKOU.search(t):
        return True
    return False


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    nozomi = list(sys.argv[1:])
    gyou = [ln.rstrip(u"\n") for ln in io.open(JOHO, encoding="utf-8-sig")]
    kazu = {u"はい": 0, u"いいえ": 0, u"？": 0, u"そのまま": 0}
    out = []
    for g in gyou:
        if not g.strip() or g.startswith(u"#"):
            out.append(g)
            continue
        c = g.split(u"\t")
        na = c[0].strip()
        while len(c) < 11:
            c.append(u"")
        ima = c[10].strip()
        if nozomi and na not in nozomi:
            out.append(u"\t".join(c))
            kazu[u"そのまま"] += 1
            continue
        if not nozomi and ima and ima != u"？":
            out.append(u"\t".join(c))
            kazu[u"そのまま"] += 1
            continue
        # 小説が原作でないものは、はじめから「いいえ」
        if c[4].strip() not in (u"ライトノベル", u"小説", u"ウェブ小説", u"漫画"):
            c[10] = u"いいえ"
            kazu[u"いいえ"] += 1
            out.append(u"\t".join(c))
            continue
        kotae, err = None, u""
        for km in _k.kijimei(na):
            t, err = _k.hiku(km)
            if t:
                kotae = miru(t)
                break
        if kotae is None:
            c[10] = u"？"
            kazu[u"？"] += 1
            say(u"× %s → 引けません %s" % (na, err))
        else:
            c[10] = u"はい" if kotae else u"いいえ"
            kazu[u"はい" if kotae else u"いいえ"] += 1
            say(u"%s %s" % (u"○" if kotae else u"－", na))
        out.append(u"\t".join(c))
    io.open(JOHO, "w", encoding="utf-8").write(u"\n".join(out) + u"\n")
    say(u"")
    say(u"なろう %d／ちがう %d／引けません %d／そのまま %d"
        % (kazu[u"はい"], kazu[u"いいえ"], kazu[u"？"], kazu[u"そのまま"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
