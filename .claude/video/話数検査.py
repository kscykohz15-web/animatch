# -*- coding: utf-8 -*-
u"""話数検査 ─ 絵が「対象話数」の外へ出ていかないことを確かめる

■ なぜこの検査が要るか（2026-10-10・本人の第6回のログから）

本人が手で選んだ26件は、ぜんぶ Ⅲ11・Ⅲ12・Ⅲ14・Ⅲ8 だった。
ところが機械が使った話数はこうなっていた。

    無職転生Ⅲ 第11話   43枚 (19%)
    無職転生 第9話      34枚 (15%)   ← 一期
    無職転生Ⅲ 第12話   30枚 (13%)
    無職転生 第12話     29枚 (13%)   ← 一期
    無職転生Ⅲ 第13話   24枚 (11%)   ← 本人は26件で一度も選んでいない

対象話数(既定)は Ⅲ11 / Ⅲ12 / Ⅲ14 なので、**87枚(39%)が外**。
しかも**一期の絵**で、三期の話をしている所に出ている。

原因はログにも出ている。

    次の指定は対象話数の中に見つからず、他の話数から選びました:
        #子供 / #恐怖 / #空 / #街 / #魔法 夜 …

`usable()` は、当て方の行の候補を**対象話数の中で全部試してから**広げる。
だから広がるのは「その行がまるごと空振りしたとき」だけだが、
**広がった先が全話数**なので、一期まで出ていってしまう。

絵が合うかどうかは、その場面をどの話数から探すかでほぼ決まる
（メモリ 14.56・話数を学ぶ.py）。**外に出た時点で、もう合わない。**

■ この検査が見るもの

本物と同じ形の材料を作る。

    対象話数 3つ   Ⅲ11 / Ⅲ12 / Ⅲ14 … 人物の絵はある。「恐怖」「子供」「街」は無い
    同じ期の外 1つ Ⅲ8               … そこにも「恐怖」「子供」「街」がある
    遠い外 2つ     第9話 / 第12話    … そこにも同じタグがある

**外に出るのが悪いのではない。** 本人も 22番「この子供には名前があって、」で
Ⅲ第8話を選んでいる。悪いのは**一期まで飛ぶこと**。
対象話数の中で済むならその中で、済まないなら**同じ期の近い話数**で、
一期までは行かないこと ── それを見る。

使い方:
    python 話数検査.py
"""
from __future__ import print_function
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_slideshow as M

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

TAISHO = [u"無職転生Ⅲ 第11話", u"無職転生Ⅲ 第12話", u"無職転生Ⅲ 第14話"]
# 同じ三期の、対象話数の外。**本人は 22番でここ（Ⅲ第8話）を選んでいる。**
CHIKAI = [u"無職転生Ⅲ 第8話"]
# 遠い外（一期）。ここが選ばれたら負け。
TOOI = [u"無職転生 第9話", u"無職転生 第12話"]
SOTO = CHIKAI + TOOI
HITO = [u"ヒトガミ", u"ルーデウス", u"ロキシー", u"オルステッド"]
# 対象話数には無く、外の話数にだけあるタグ（本物と同じ形）
SOTO_DAKE = [u"恐怖", u"子供", u"街"]


def zairyou():
    u"""画像・カタログ・当て方の行を作る。戻り値 (images, catalog, rules)"""
    images, cat = [], {}
    for wa in TAISHO:
        n = 0
        for h in HITO:
            for k in range(5):
                n += 1
                key = u"%s/%03d_%s%d_x2.png" % (wa, n, h, k)
                images.append(key)
                cat[key] = u"%s 室内 穏やか" % h
    for wa in SOTO:
        n = 0
        for h in HITO:
            for t in SOTO_DAKE:
                n += 1
                key = u"%s/%03d_%s%s_x2.png" % (wa, n, h, t)
                images.append(key)
                cat[key] = u"%s %s 室内" % (h, t)
        # 外の話数にも人物だけの絵を置く（ここへ逃げられると困る）
        for h in HITO:
            n += 1
            key = u"%s/%03d_%s_hito_x2.png" % (wa, n, h)
            images.append(key)
            cat[key] = u"%s 室内 穏やか" % h
    # 当て方の行。[キーワード, 候補, 使った回数, 対象話数]
    rules = [
        [[u"こわがる"], [u"#恐怖", u"#ヒトガミ"], 0, list(TAISHO)],
        [[u"子供"], [u"#子供", u"#ルーデウス"], 0, list(TAISHO)],
        [[u"街"], [u"#街"], 0, list(TAISHO)],          # 逃げ道が無い行
        [[u"ヒトガミ"], [u"#ヒトガミ"], 0, list(TAISHO)],
        [[u"オルステッド"], [u"#オルステッド"], 0, list(TAISHO)],
    ]
    return images, cat, rules


JIMAKU = [
    (u"ヒトガミはこわがる顔をしていました。", [u"ヒトガミ"]),
    (u"ルーデウスとロキシーの子供が、",       [u"ルーデウス", u"ロキシー"]),
    (u"その街の様子を見てみましょう。",        None),
    (u"ヒトガミには、",                       [u"ヒトガミ"]),
    (u"龍神オルステッドと手を組み、",          [u"オルステッド"]),
]


def main():
    images, cat, rules = zairyou()
    slots = [(i * 2.0, 2.0, tx) for i, (tx, _h) in enumerate(JIMAKU)]
    picked = M.assign_images(slots, images, rules, [], catalog=cat,
                             epmap={}, focus=list(TAISHO))
    print(u"")
    soto, hito_chigai, tooi_de = [], [], []
    for i, (tx, hoshii) in enumerate(JIMAKU):
        img = picked[i] if i < len(picked) else u""
        fol = img.split(u"/")[0] if u"/" in img else u""
        setsu = cat.get(img, u"")
        # 対象話数の中、または同じ期の近い話数ならよい。一期はだめ。
        ok_wa = (fol in TAISHO) or (fol in CHIKAI)
        ita = [h for h in HITO if h in setsu]
        ok_hito = (not hoshii) or any(h in hoshii for h in ita)
        shirushi = u"○" if (ok_wa and ok_hito) else u"×"
        print(u"%s %-30s → %-18s %s" % (shirushi, tx[:28], fol, setsu))
        if not ok_wa:
            soto.append((tx, fol))
        if fol in TOOI:
            tooi_de.append((tx, fol))
        if not ok_hito:
            hito_chigai.append((tx, u"・".join(ita) or u"(人なし)", hoshii))
    print(u"")
    warui = 0
    if tooi_de:
        warui += 1
        print(u"× 遠い期（一期）の絵が %d枚 出ました" % len(tooi_de))
        for (tx, fol) in tooi_de:
            print(u"     %-30s → %s" % (tx[:28], fol))
    elif soto:
        warui += 1
        print(u"× 近くもない外の絵が %d枚 出ました" % len(soto))
        for (tx, fol) in soto:
            print(u"     %-30s → %s" % (tx[:28], fol))
    else:
        print(u"○ 絵は対象話数の中か、同じ期の近い話数から選ばれました")
    if hito_chigai:
        warui += 1
        print(u"× 人ちがいが %d枚 ありました" % len(hito_chigai))
        for (tx, ita, hoshii) in hito_chigai:
            print(u"     %-30s 望み %s / 選んだ絵 %s"
                  % (tx[:28], u"・".join(hoshii), ita))
    else:
        print(u"○ 人ちがいはありません")
    return 1 if warui else 0


if __name__ == "__main__":
    sys.exit(main())
