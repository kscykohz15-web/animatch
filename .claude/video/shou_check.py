# -*- coding: utf-8 -*-
u"""画面表示.txt の章キーワードが、本当に台本に当たるか調べる。

本番と同じ切り方（kugiri）で台本を切ってから、
そのどれかに丸ごと入っているキーワードだけを「当たり」とする。
句点や読点をまたぐキーワードは当たらないので、ここで落ちる。

  python shou_check.py 画面表示_第1回.txt ../final/第1回_人生年表_字幕用_最終版.txt
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_slideshow as M

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def cues_of(script):
    u"""本番と同じ切り方で、字幕1枚ぶんの並びを作る。"""
    out = []
    for dan in io.open(script, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        dan = dan.strip()
        if dan:
            out.extend(M.kugiri(dan))
    return out


def shirabe(overlay, script, shizuka=False):
    credit, chaps = M.load_overlay(overlay)
    cues = cues_of(script)
    atari, hazure, junban = [], [], []
    tsukatta = set()
    for (key, title, _eps) in chaps:
        ban = None
        for i, c in enumerate(cues):
            if i in tsukatta or key not in c:
                continue
            ban = i
            tsukatta.add(i)
            break
        if ban is None:
            hazure.append((key, title))
        else:
            atari.append((ban, key, title))
            junban.append(ban)
    if not shizuka:
        print(u"%s" % os.path.basename(overlay))
        print(u"  引用: %s" % (credit or u"（ありません）"))
        print(u"  字幕 %d枚 / 章 %d本 → 当たり %d / 外れ %d"
              % (len(cues), len(chaps), len(atari), len(hazure)))
        for (ban, key, title) in atari:
            print(u"    %4d  %-18s → %s" % (ban, key, title.replace(u"\\N", u" / ")))
        for (key, title) in hazure:
            print(u"    ×     %-18s → %s" % (key, title.replace(u"\\N", u" / ")))
    komatta = []
    if not credit:
        komatta.append(u"引用がありません")
    if hazure:
        komatta.append(u"台本に無いキーワード %d本" % len(hazure))
    if junban != sorted(junban):
        komatta.append(u"章の順番が台本の順番と合っていません")
    # 同じ章が続きすぎ／短すぎもここで見る
    for i in range(1, len(junban)):
        if junban[i] - junban[i - 1] < 2:
            komatta.append(u"章「%s」が前の章と近すぎます(字幕%d枚ぶん)"
                           % (atari[i][2], junban[i] - junban[i - 1]))
    return komatta


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        pairs = [(sys.argv[1], sys.argv[2])]
    else:
        print(u"使い方: python shou_check.py 画面表示_○○.txt 台本_字幕用.txt")
        sys.exit(1)
    warui = 0
    for ov, sc in pairs:
        k = shirabe(ov, sc)
        if k:
            warui += 1
            print(u"  → " + u" / ".join(k))
        print(u"")
    sys.exit(1 if warui else 0)
