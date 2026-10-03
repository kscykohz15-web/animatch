# -*- coding: utf-8 -*-
u"""章タイトルのカードが、右半分からはみ出していないか調べる。

本人の指定は「画面半分に絵、もう半分に章の名前」です。
幅で折り返すだけだと長い章の名前がはみ出し、絵の側まで字が乗ります。
実際「オルステッドが二百年を百回くり返したという説の検証」で
右の端を 18px 超えていました。

ここでは 8本すべての 画面表示_*.txt から本物の章の名前を集め、
本体と同じ write_ass を通して、1行の幅と行の高さの合計を数えます。

  python カード検査.py
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import make_slideshow as M

W, H = 1920, 1080
NAGAI = u"オルステッドが二百年を百回くり返したという説の検証"   # わざと長いもの


def shou_atsumeru():
    namae = []
    for f in sorted(os.listdir(HERE)):
        if not (f.startswith(u"画面表示_") and f.endswith(u".txt")):
            continue
        _, chaps = M.load_overlay(os.path.join(HERE, f))
        for (_toki, title) in chaps:
            namae.append((f, title))
    return namae


def main():
    mi = M.load_mitame(os.path.join(HERE, u"見た目.txt"))[0]
    en = M.load_enshutsu(os.path.join(HERE, u"演出.txt"))
    hidari = en.get("card_hidari", 0.5)
    size = int(min(W, H) / float(mi.get(u"字幕の大きさ", 11)))
    cardsz = int(size * 1.15)

    hako = W * (1.0 - hidari)          # 右半分の幅
    migi = W - int(W * 0.02)           # 字が触れてよい右の端
    sahaji = int(W * hidari) + int(W * 0.02)

    namae = shou_atsumeru()
    namae.append((u"(わざと長いもの)", NAGAI))
    if len(namae) < 8:
        print(u"× 章の名前が %d個しか集まりませんでした（画面表示_*.txt を確認）"
              % len(namae))
        return 1

    warui = []
    for (moto, title) in namae:
        ap = os.path.join(HERE, "_card_check.ass")
        M.write_ass([], ap, W, H, mi.get(u"フォント", u"Yu Gothic UI"),
                    size, 0, int(mi.get(u"字幕の行数", 2)),
                    credit=u"", chapters=[], total=1.5,
                    cards=[(0.0, 1.5, title)], mi=mi, hidari=hidari)
        s = io.open(ap, encoding="utf-8").read()
        os.remove(ap)
        line = [x for x in s.split(u"\n") if u",Card,," in x]
        if not line:
            warui.append(u"%s … カードの行が出ていません" % title)
            continue
        tx = line[0].split(u",,", 1)[1].split(u",", 5)[-1]
        fs = cardsz
        m = re.match(r"\{\\fs(\d+)\}", tx)
        if m:
            fs = int(m.group(1))
            tx = tx[m.end():]
        gyou = tx.split(u"\\N")
        haba = max(M._widths(g)[-1] for g in gyou) * fs
        takasa = len(gyou) * fs * 1.15
        if sahaji + haba > migi + 1:
            warui.append(u"%s … 右に %.0fpx はみ出し (%d行 %dpx)"
                         % (title, sahaji + haba - migi, len(gyou), fs))
        if takasa > H * 0.8:
            warui.append(u"%s … 縦に長すぎます (%.0fpx)" % (title, takasa))
        if len(gyou) > 4:
            warui.append(u"%s … %d行は多すぎます" % (title, len(gyou)))
        # 改行の書き方が \\n(小文字)のままだと、_esc が円記号だけ消すので
        # 画面に n が1文字だけ残ります。実際に7本でそうなっていました。
        for g in gyou:
            moji = title.replace(u"\\n", u"").replace(u"\\N", u"")
            if u"n" in g and u"n" not in moji:
                warui.append(u"%s … 改行のつもりの n が字として出ています" % title)
                break

    if warui:
        for x in warui[:12]:
            print(u"× " + x)
        print(u"\n× 章タイトルのカードが %d件はみ出しています。" % len(warui))
        return 1
    print(u"○ 章の名前 %d個（%d本ぶん）すべて、右半分 %dpx に収まります"
          % (len(namae), len([f for f in os.listdir(HERE)
                              if f.startswith(u"画面表示_")]), int(hako)))
    ichiban = max(namae, key=lambda t: len(t[1]))
    print(u"   いちばん長いもの: %s (%d文字)" % (ichiban[1], len(ichiban[1])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
