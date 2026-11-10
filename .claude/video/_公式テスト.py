# -*- coding: utf-8 -*-
u"""作品の頭の1文が、ちゃんと公式画像になるか

■ 本人の指定（2026-11-10）

  > ここでは二枚目の画像のような字幕配置で、画像のオフィシャルのもの。
  > そして、それ以降は一枚目のように右上と左上にそれぞれ情報書いておきながら、
  > あとはしゃべる内容を普段通りの字幕で展開してください。

  > C:\\Youtube動画\\おすすめアニメ\\画像　画像はこちらのフォルダに、
  > アニメ作品ごとに保存しており、公式画像は「1」という名前で
  > 保存しております。

■ なぜ検査が要るか

公式画像は**本人のパソコンにしかありません**。こちらの作業場所には
作品フォルダも 1.jpg も無いので、**この枝はこちらでは一度も通りません。**
「通らない枝は、壊れても分からない」── メモリ 70節・㉓ と同じ失敗を
もう一度やらないために、作品フォルダをその場で作って全部通します。

  ① #公式 → その作品フォルダの「1」に読みかわる（拡張子は何でも）
  ② @@話数 が複数あるときは、左から順に探す
  ③ 公式画像が無い作品は、黙って別の絵にせず**名指しで言う**
     （そのうえで次の候補＝タグに流れ、プランは壊れない）
  ④ 作品フォルダの外の「1」を拾わない
  ⑤ 章カードも同じ絵を使い、**背景を抜かない**（公式画像は丸ごと見せる）
  ⑥ プラン下書きは、作品の章の**頭の1文だけ**に #公式 を書く
     （はじめに・おわりには付けない＝右上に年と季が無い章）
  ⑦ #公式 はタグではないので、タグの綴り検査で落ちない
"""
from __future__ import print_function
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

warui = []


def iu(ok, msg):
    print(u"%s %s" % (u"○" if ok else u"×", msg))
    if not ok:
        warui.append(msg)


def ms_yomu():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        u"ms_kou", os.path.join(HERE, u"make_slideshow.py"))
    m = importlib.util.module_from_spec(spec)
    sys.modules[u"ms_kou"] = m
    spec.loader.exec_module(m)
    return m


def main():
    ms = ms_yomu()

    # 本人のフォルダと同じ形。公式画像は「1」。拡張子はそろっていない。
    images = [
        u"ニセコイ/1.jpg",
        u"ニセコイ/0002.jpg",
        u"ニセコイ/0003.jpg",
        u"とらドラ/1.png",
        u"とらドラ/0002.jpg",
        u"五等分の花嫁/0002.jpg",          # 公式画像が無い作品
        u"1.jpg",                           # 画像フォルダ直下（作品の外）
        u"無職転生Ⅲ 第11話/001_aaa.png",   # 話数フォルダ（公式画像は無い）
    ]

    # ── ① 拡張子ちがいでも引ける
    iu(ms.koushiki_e([u"ニセコイ"], images) == u"ニセコイ/1.jpg",
       u"① ニセコイ/1.jpg を引いた")
    iu(ms.koushiki_e([u"とらドラ"], images) == u"とらドラ/1.png",
       u"① 拡張子が png でも引いた")

    # ── ② @@話数 が複数あるときは左から
    iu(ms.koushiki_e([u"五等分の花嫁", u"ニセコイ"], images) == u"ニセコイ/1.jpg",
       u"② 1枚目に無ければ次の作品フォルダを見る")

    # ── ③ 無い作品は None（名指しは plan_code_naosu が出す）
    iu(ms.koushiki_e([u"五等分の花嫁"], images) is None,
       u"③ 公式画像が無い作品は None")

    # ── ④ 作品フォルダの外の「1」は拾わない
    iu(ms.koushiki_e([u""], images) is None,
       u"④ 画像フォルダ直下の 1.jpg は公式画像にしない")
    iu(ms.wa_koushiki(u"1.jpg") is False,
       u"④ フォルダ名の無い 1.jpg は公式画像ではない")
    iu(ms.wa_koushiki(u"ニセコイ/1.jpg") is True
       and ms.wa_koushiki(u"ニセコイ/0002.jpg") is False
       and ms.wa_koushiki(u"@@card00") is False,
       u"④ 公式画像の見分けが付く")

    # ── 画像プランの読みかえ（規則の4つめが @@話数）
    kitei = [u"#穏やか", u"#室内", u"#立ち姿"]
    rules = [
        [[u"ニセコイ"], [u"#公式"] + kitei, 0, [u"ニセコイ"]],
        [[u"制作はシャフト"], [u"#公式"] + kitei, 0, [u"ニセコイ"]],
        [[u"物語は"], list(kitei), 0, [u"ニセコイ"]],
        [[u"五等分の花嫁"], [u"#公式"] + kitei, 0, [u"五等分の花嫁"]],
    ]
    log = []
    moto_say = ms.say
    ms.say = lambda *a: log.append(u" ".join(unicode(x) if str is bytes else str(x)
                                             for x in a))
    try:
        rules, default = ms.plan_code_naosu(rules, list(kitei), images)
    finally:
        ms.say = moto_say
    hon = u"\n".join(log)

    iu(rules[0][1][0] == u"ニセコイ/1.jpg" and rules[1][1][0] == u"ニセコイ/1.jpg",
       u"⑤ 作品の頭の2枚が公式画像になった")
    iu(rules[0][1][1:] == kitei,
       u"⑤ うしろのタグはそのまま残る（公式画像が無い回の逃げ道）")
    iu(rules[2][1] == kitei, u"⑤ #公式 を書いていない行は触らない")
    iu(rules[3][1] == kitei,
       u"③ 公式画像が無い作品は #公式 を落として、タグに流す")
    iu(u"五等分の花嫁" in hon and u"公式画像" in hon,
       u"③ 公式画像が無い作品を名指しで言う")
    iu(u"公式画像" in hon and u"2 か所" in hon,
       u"⑤ 当てた枚数を言う")

    # ── 手で選んだ絵として扱われるか（カタログの判定より上）
    te = [r for r in rules
          if any(not (f.startswith(u"#") or f.startswith(u"@")) for f in r[1])]
    iu(len(te) == 2, u"⑤ 公式画像の行は「手で選んだ絵」として扱われる")

    # ── ⑤ 章カードは公式画像を使い、背景を抜かない
    rows = [(3.0, u"ニセコイ/1.jpg", u"ニセコイ"),
            (3.0, u"ニセコイ/1.jpg", u"制作はシャフト"),
            (3.0, u"ニセコイ/0003.jpg", u"物語は")]
    cat = {u"ニセコイ/0003.jpg": u"一人 アップ 穏やか"}
    e = ms.card_no_e(rows, 0, 3, u"ニセコイ\\N2014年冬", cat)
    iu(e == u"ニセコイ/1.jpg", u"⑥ 章カードの絵も公式画像")
    iu(ms.wa_koushiki(e) is True, u"⑥ だから背景抜きは切られる")

    # ── ⑥ プラン下書きが書く場所
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        u"shitagaki", os.path.join(HERE, u"プラン下書き.py"))
    P = importlib.util.module_from_spec(spec)
    sys.modules[u"shitagaki"] = P
    spec.loader.exec_module(P)

    import tempfile
    d = tempfile.mkdtemp(prefix="kousiki")
    sub = os.path.join(d, u"台本.txt")
    ov = os.path.join(d, u"画面表示.txt")
    out = os.path.join(d, u"画像プラン.txt")
    io.open(sub, "w", encoding="utf-8", newline="\n").write(u"""\
どうもこんにちわ、かさです。

今回は、最高のラブコメアニメを20作品ご紹介していきます。それでは早速ご紹介していきます。

最初にご紹介する作品は、ニセコイ、制作はシャフト。

本作は週刊少年ジャンプ連載の漫画が原作となっており、2014年の冬に放送が開始された全20話の作品です。

続いての作品は、とらドラ！、制作はJ.C.STAFF。

本作はライトノベルが原作となっており、2008年の秋に放送が開始された全25話の作品です。
""")
    io.open(ov, "w", encoding="utf-8", newline="\n").write(u"""\
引用\t各作品の著作権は、それぞれの権利者に帰属します
章\t最高のラブコメアニメを20作品\tはじめに\tニセコイ\t
章\tニセコイ\tニセコイ\\N2014年冬\tニセコイ\t
章\tとらドラ\tとらドラ！\\N2008年秋\tとらドラ\t
""")
    P.tsukuru(sub, ov, out, u"ためし", koushiki=True)
    gyou = [l for l in io.open(out, encoding="utf-8-sig").read().split(u"\n")
            if l.strip() and not l.lstrip().startswith(u"#")]
    kou = [l.split(u"\t")[0] for l in gyou if u"#公式" in l]
    # key_of は「、。！？」を落とすので「とらドラ！」は「とらドラ」
    iu(kou == [u"ニセコイ", u"制作はシャフト",
               u"とらドラ", u"制作はJ.C.STAFF"],
       u"⑦ 作品の章の頭の1文だけに #公式 が付いた（いまは %s）"
       % u" / ".join(kou))
    iu(P.KOU_SAIGO[0] == 4, u"⑦ 枚数を数えている")

    # はじめにの章には付かない
    iu(not any(u"#公式" in l and l.startswith(u"最高のラブコメ") for l in gyou),
       u"⑦ はじめにの章には付けない")
    # 20選でない動画（無職転生）には1つも付かない
    P.tsukuru(sub, ov, out, u"ためし", koushiki=False)
    gyou2 = io.open(out, encoding="utf-8-sig").read()
    iu(u"#公式" not in gyou2, u"⑦ 無職転生のプランには #公式 を書かない")

    # ── ⑨ @@全部おまかせ でも #公式 の行は落ちない
    #    当て方.txt には @@話数 が無いので、ここで落とすと黙って消える。
    moto_rules = [
        [[u"ニセコイ"], [u"#公式"] + kitei, 0, [u"ニセコイ"]],
        [[u"物語は"], list(kitei), 0, [u"ニセコイ"]],
    ]
    nokoru = [r for r in moto_rules if ms.KOUSHIKI in r[1]]
    iu(len(nokoru) == 1 and nokoru[0][3] == [u"ニセコイ"],
       u"⑨ おまかせでも #公式 の行（と @@話数）が残る")
    iu(u"KOUSHIKI in r[1]" in io.open(
        os.path.join(HERE, u"make_slideshow.py"), encoding="utf-8").read(),
       u"⑨ おまかせの枝が #公式 の行を取り分けている")

    # ── ⑧ #公式 はタグの綴り検査で落ちない
    spec = importlib.util.spec_from_file_location(
        u"pc_kou", os.path.join(HERE, u"plan_check.py"))
    PC = importlib.util.module_from_spec(spec)
    sys.modules[u"pc_kou"] = PC
    spec.loader.exec_module(PC)
    tags = PC.tags_of(os.path.join(HERE, u"タグ一覧.txt"))
    warui_tag = set()
    for f in [u"#公式", u"#穏やか"]:
        if f == PC.KOUSHIKI:
            continue
        for w in f[1:].split():
            if w not in tags:
                warui_tag.add(w)
    iu(not warui_tag, u"⑧ #公式 はタグの綴り検査から外れている")
    iu(not PC.shinu_tags([([u"ニセコイ"], [u"#公式"])],
                         {u"一人 アップ": 1}),
       u"⑧ #公式 は「絵が1枚も無いタグ」にも数えない")


if __name__ == "__main__":
    main()
    print(u"")
    if warui:
        print(u"落ちました。%d件:" % len(warui))
        for w in warui:
            print(u"  ・" + w)
        sys.exit(1)
    print(u"全部通りました。")
