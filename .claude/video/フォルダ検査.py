# -*- coding: utf-8 -*-
u"""画面表示_○○.txt の4列目（作品フォルダ）が、**本人のフォルダに本当に当たるか**。

    python フォルダ検査.py            おすすめ紹介の回を全部
    python フォルダ検査.py ラブコメ20選   その回だけ

■ なぜ要るか（2026-11-11・本人のログ）

ラブコメ20選を本人が作ったら、20作品のうち6作品で

    対象話数に書かれた話数が見つかりません: 僕の心のヤバイやつ
    対象話数に書かれた話数が見つかりません: 冴えない彼女の育てかた  …

と出て、**その章は別の作品の絵になっていた**（ゆびさきと恋々 41枚・
乙女ゲー世界 39枚・エヴァ 20枚がラブコメの動画に出た）。

6つのうち2つは**名前の1文字ちがい**だった：

    4列目  僕の心のヤバイやつ      本人  僕の心のヤバいやつ
    4列目  冴えない彼女の育てかた   本人  冴えない彼女の育て方

メモリ 25節に「フォルダ名は推測してはいけない。330個あるので、
1回もらって突き合わせる」と書いたまま、**もらっていなかった。**
ログに324個ぜんぶ出ていたので 本人のフォルダ.txt に写し、ここで毎回くらべる。

■ 見分けるもの

  × 近い名前のフォルダがあるのに当たらない  … **こちらの書きまちがい。落とす**
  ! 近い名前も無い                          … 本人がまだ絵を集めていない作品。
                                               落とさない（名前を並べて知らせる）

当て方は make_slideshow の resolve_focus と同じ `w == f or w in f`（部分一致）。
"""
from __future__ import print_function
import difflib
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

FOL = os.path.join(HERE, u"本人のフォルダ.txt")


def yomu_fol(path=FOL):
    out = []
    if not os.path.exists(path):
        return out
    for ln in io.open(path, encoding="utf-8-sig").read().replace(u"\r\n", u"\n").split(u"\n"):
        if not ln.strip() or ln.startswith(u"#"):
            continue
        out.append(ln.split(u"\t")[0].strip())
    return out


def narasu(x):
    u"""近い名前を探すためだけの形。記号・空白・かな/カナ/全角半角の差をならす。"""
    x = re.sub(u"[\\s　!！?？:：;；・\\-ー―～~、。,.「」『』【】《》\\[\\]()（）/／☆×]+", u"", x)
    out = []
    for ch in x.lower():
        o = ord(ch)
        if 0x30A1 <= o <= 0x30F6:          # カタカナ → ひらがな
            ch = chr(o - 0x60)
        elif 0xFF01 <= o <= 0xFF5E:        # 全角英数 → 半角
            ch = chr(o - 0xFEE0)
        out.append(ch)
    return u"".join(out)


def ataru(w, fols):
    return [f for f in fols if w == f or w in f]


def chikai(w, fols):
    u"""当たらなかった名前に、近いフォルダを出す。無ければ空。"""
    nw = narasu(w)
    kouho = []
    for f in fols:
        nf = narasu(f)
        if not nw or not nf:
            continue
        r = difflib.SequenceMatcher(None, nw, nf).ratio()
        # 片方がもう片方をほぼ含む（副題つき）ものも拾う
        if nw in nf or nf in nw:
            r = max(r, 0.9)
        if r >= 0.72:
            kouho.append((-r, f))
    return [f for (_r, f) in sorted(kouho)[:3]]


def overlay_fols(path):
    out = []
    for ln in io.open(path, encoding="utf-8-sig").read().replace(u"\r\n", u"\n").split(u"\n"):
        if not ln.startswith(u"章\t"):
            continue
        c = ln.split(u"\t")
        if len(c) >= 4 and c[3].strip():
            for w in c[3].replace(u"、", u",").split(u","):
                w = w.strip()
                if w:
                    out.append((c[2].replace(u"\\N", u" "), w))
    return out


def main(argv):
    import 動画一覧 as D
    fols = yomu_fol()
    if not fols:
        print(u"（本人のフォルダ.txt が無いので、見ていません）")
        return 0
    print(u"本人のフォルダ %d個と突き合わせます" % len(fols))
    warui, mada = 0, {}
    for v in D.yomu(ban=u"osusume"):
        if argv and v.namae not in argv:
            continue
        if not os.path.exists(v.overlay):
            continue
        mita, x_gyou = set(), []
        for (shou, w) in overlay_fols(v.overlay):
            if w in mita:
                continue
            mita.add(w)
            if ataru(w, fols):
                continue
            ch = chikai(w, fols)
            if ch:
                x_gyou.append(u"    × 4列目「%s」が当たりません → 本人のフォルダは「%s」"
                              % (w, u"」「".join(ch)))
            else:
                mada.setdefault(w, []).append(v.namae)
        print(u"%s 画面表示_%s.txt  作品フォルダ %d個%s"
              % (u"×" if x_gyou else u"○", v.namae, len(mita),
                 u"" if not x_gyou else u" / 名前ちがい %d個" % len(x_gyou)))
        for g in x_gyou:
            print(g)
        warui += len(x_gyou)
    if mada:
        print(u"")
        print(u"! 本人のフォルダにまだ無い作品 %d個（絵を集めるまで、その章は公式画像も絵も出ません）:"
              % len(mada))
        for w in sorted(mada):
            print(u"    %s  （%s）" % (w, u"・".join(mada[w])))
    print(u"")
    if warui:
        print(u"落ちました。名前ちがい %d個。**4列目を本人のフォルダ名に合わせてください。**" % warui)
        return 1
    print(u"名前ちがいはありません。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
