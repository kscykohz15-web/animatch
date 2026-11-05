# -*- coding: utf-8 -*-
u"""台本に書いた **放送年・季・話数** が 放送情報.txt と合っているか見る。

    python 放送情報検査.py ../../final/実は最強アニメ20選_字幕用_最終版.txt

■ なぜ要るか（2026-11-05・本人の指定）
  「放送年や話数、原作等は間違えないように調査しながら進めてください」。
  調べるだけでは足りない。**書いたあとに突き合わせる所まで機械にする。**
  見ていない所は必ず壊れる。

台本の中の、作品名を名乗る段落の次の「本作は…」の段落を見る。
    本作は2006年の秋に放送された全37話の…   → 2006 / 秋 / 37
放送情報.txt の同じ作品の行とくらべ、違っていたら落とす。
放送情報.txt に無い作品、年が ？ の作品も落とす（数字を書いてはいけないので）。
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
JOHO = os.path.join(HERE, u"放送情報.txt")

TSUNAGI = (u"最初にご紹介する作品は|一番最初にご紹介する作品は|続いての作品は|"
           u"続く作品は|続いては|次の作品は|最後にご紹介する作品は")


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))


def yomu_joho():
    out = {}
    if not os.path.exists(JOHO):
        return out
    for ln in io.open(JOHO, encoding="utf-8-sig", errors="replace"):
        t = ln.rstrip(u"\n")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) >= 8:
            out[c[0]] = {u"年": c[1], u"季": c[2], u"話数": c[3],
                         u"原作": c[4], u"制作": c[5]}
    return out


def dan(path):
    return [x.strip() for x in
            io.open(path, encoding="utf-8-sig").read().replace("\r\n", "\n").split("\n")
            if x.strip()]


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 2:
        say(u"使い方: python 放送情報検査.py <台本_字幕用.txt>")
        return 1
    joho = yomu_joho()
    if not joho:
        say(u"放送情報.txt がありません。先に 放送情報を引く.py を回してください。")
        return 1

    p = dan(sys.argv[1])
    warui, mita = [], 0
    for i, x in enumerate(p):
        m = re.search(u"(?:%s)、?(.+)$" % TSUNAGI, x)
        if not m:
            continue
        na = m.group(1).strip()
        if i + 1 >= len(p) or not p[i + 1].startswith(u"本作は"):
            warui.append(u"%s … 次の段落が「本作は」で始まっていません" % na)
            continue
        h = p[i + 1]
        mita += 1

        # 放送情報.txt のどの行か（題名そのまま → 前方一致 の順）
        key = na if na in joho else None
        if key is None:
            kouho = [k for k in joho if na.startswith(k) or k.startswith(na)]
            key = kouho[0] if len(kouho) == 1 else None
        if key is None:
            warui.append(u"%s … 放送情報.txt にありません。**調べてから書くこと**" % na)
            continue
        j = joho[key]
        if j[u"年"] == u"？":
            warui.append(u"%s … 引けていません。**数字を書かないこと**" % na)
            continue

        mt = re.search(u"(\\d{4})年", h)
        if mt and mt.group(1) != j[u"年"]:
            warui.append(u"%s … 年が台本 %s／調べ %s" % (na, mt.group(1), j[u"年"]))
        ms = re.search(u"\\d{4}年の(春|夏|秋|冬)", h)
        if ms and ms.group(1) != j[u"季"]:
            warui.append(u"%s … 季が台本 %s／調べ %s" % (na, ms.group(1), j[u"季"]))
        mw = re.search(u"全(\\d+)話", h)
        if mw and j[u"話数"] != u"？" and mw.group(1) != j[u"話数"]:
            warui.append(u"%s … 話数が台本 %s／調べ %s" % (na, mw.group(1), j[u"話数"]))

    say(u"作品 %d本を見ました（放送情報.txt は %d本ぶん）" % (mita, len(joho)))
    if warui:
        say(u"")
        say(u"── 合っていません ──")
        for w in warui:
            say(u"  × " + w)
        return 1
    say(u"○ 台本の年・季・話数は、調べたものと全部合っています。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
