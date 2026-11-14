# -*- coding: utf-8 -*-
u"""字幕の登場人物と、絵の登場人物が合っているか。

■ なぜ要るか（2026-10-12・本人の指摘）

> やはりさすがに字幕の登場人物と画像の登場人物ぐらいは合わせられるように
> してください。こんなとこまで私で指定するのは時間の無駄です。

もっともで、ここが抜けていた。「誰の話か」を前後の文から読む仕組みは
前からあったのに、**絵が1枚も見つからなかったときの逃げ道**にしか
置いていなかった。本人のログは `0枚がセリフの人名から` ＝
**その道は一度も通っていない。** だから「ヒトガミの話なのにロキシーの絵」
が普通に出ていた。

v154 で「材料が見られない変更を出す」という失敗をしたので、
**直す前にこの検査を作り、直す前は落ちて、直したら通ることを確かめる。**

    python 人一致検査.py
"""
import io
import os
import shutil
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
SAGYOU = os.path.join(HERE, u"_人一致検査")
WA = u"無職転生Ⅲ 第14話"


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))


def mochikomu(nm):
    import importlib.util
    sp = importlib.util.spec_from_file_location(
        nm, os.path.join(SAGYOU, u"make_slideshow.py"))
    mo = importlib.util.module_from_spec(sp)
    sys.modules[nm] = mo
    sp.loader.exec_module(mo)
    return mo


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(SAGYOU)
    for f in (u"make_slideshow.py", u"置き場所.py", u"人物ルール.txt",
              u"見た目.txt", u"演出.txt"):
        p = os.path.join(HERE, f)
        if os.path.exists(p):
            shutil.copy(p, os.path.join(SAGYOU, f))


MAISU = 6          # 1人あたりの枚数


def tsukuru(hitotachi, setsu=u"一人 アップ"):
    u"""人ごとに同じ枚数の絵を用意する。**えこひいきを消すため。**

    ■ 1人1枚ではいけない（2026-10-12・最初にここで間違えた）

    1人1枚で作ったら ④⑤ が落ちた。原因は人ちがいではなく
    **「となりに同じ絵を当てない」** が働いて、正しい人の絵が
    1枚しか無いせいで別人に回っていたこと。
    本物の絵は1人に何十枚もあるので、材料もそうする。
    """
    cat = {}
    for w, h in enumerate(hitotachi):
        for i in range(MAISU):
            cat[u"%s/%03d_%s%d.png" % (WA, w * 100 + i + 10, h[:2], i)] = \
                u"%s %s" % (h, setsu)
    return cat


def hashiru(S, jimaku, cat, fuda):
    u"""その札だけを与えて、どの絵が選ばれるかを返す。"""
    imgs = sorted(cat.keys())
    # 全部の字幕に同じ札だけを与える。**人は指定しない。**
    rules = [[[u""], [fuda], 0, [WA]]]
    slots = [(n * 2.0, 2.0, tx) for n, tx in enumerate(jimaku)]
    out = S.assign_images(slots, imgs, rules, [], catalog=cat,
                          epmap={}, focus=[WA])
    return out


def dare(S, cat, img):
    setsu = cat.get(img) or u""
    return [c for c in S.CHARACTERS if c in setsu]


def main():
    junbi()
    S = mochikomu(u"ms_hito")
    warui = []

    # ── ① 人を指定していない札でも、字幕の人が写った絵が先に来る ──
    #
    # 「#アップ」はどちらの絵にも当たる。前はここで名前順に落ちていた。
    jimaku = [u"ヒトガミには、", u"未来を見る能力があります。",
              u"その能力から、", u"近い将来、"]
    cat = tsukuru([u"ロキシー", u"ヒトガミ"])
    got = hashiru(S, jimaku, cat, u"#アップ")
    eta = [dare(S, cat, g) for g in got]
    ok1 = all((u"ヒトガミ" in e) for e in eta if e)
    say(u"%s ① 人を指定しない札でも、字幕の人が写った絵を選ぶ"
        % (u"○" if ok1 else u"×"))
    for tx, g in zip(jimaku, got):
        say(u"     %-18s → %s （%s）"
            % (tx, (g or u"なし").split(u"/")[-1],
               u"・".join(dare(S, cat, g)) or u"人なし"))
    if not ok1:
        warui.append(u"① 別人の絵が選ばれました")

    # ── ② 別人だけの絵しか無ければ、やはり使う（捨てない）──
    #
    # カタログの説明は外れることがある（3-14-152 が「エリス」など）。
    # だから「別人は使わない」ではなく「後ろに回す」にしてある。
    cat2 = tsukuru([u"ロキシー"])
    got2 = hashiru(S, jimaku, cat2, u"#アップ")
    ok2 = all(g for g in got2)
    say(u"%s ② 別人だけしか無いときは、それでも絵を出す（空にしない）"
        % (u"○" if ok2 else u"×"))
    if not ok2:
        warui.append(u"② 候補が別人だけのときに絵が出ませんでした")

    # ── ③ 絵に人が書かれていなければ責めない ──
    cat3 = dict((k, u"一人 アップ") for k in tsukuru([u"だれか"]))
    got3 = hashiru(S, jimaku, cat3, u"#アップ")
    ok3 = all(g for g in got3)
    say(u"%s ③ 絵に人が書かれていなくても、そのまま出す"
        % (u"○" if ok3 else u"×"))
    if not ok3:
        warui.append(u"③ カタログに人が無い絵が出ませんでした")

    # ── ④ 老デウス＝ルーデウス の別名が効く ──
    #
    # 本人の 1・2・7番が老デウスの絵。カタログは「ルーデウス」と
    # 書いてあることも「老デウス」と書いてあることもある。
    jimaku4 = [u"老デウスの歩んできた人生が、", u"壮絶すぎた。",
               u"いわゆる老デウスの壮絶な人生が明らかとなったとともに、"]
    cat4 = tsukuru([u"ロキシー", u"ルーデウス"])
    got4 = hashiru(S, jimaku4, cat4, u"#アップ")
    eta4 = [dare(S, cat4, g) for g in got4]
    ok4 = all((u"ルーデウス" in e) for e in eta4 if e)
    say(u"%s ④ 老デウスの話に、ルーデウスの絵を当てる（同じ人）"
        % (u"○" if ok4 else u"×"))
    for tx, g in zip(jimaku4, got4):
        say(u"     %-26s → %s （%s）"
            % (tx[:26], (g or u"なし").split(u"/")[-1],
               u"・".join(dare(S, cat4, g)) or u"人なし"))
    if not ok4:
        warui.append(u"④ 別名（老デウス＝ルーデウス）が効いていません")

    # ── ⑤ 名前が字幕に無くても、前後から読んで合わせる ──
    #
    # 本人が手で直した 22・23・26番がこの形。
    jimaku5 = [u"そしてララが一人でヒトガミを倒すわけではありません。",
               u"龍神オルステッドと手を組み、ヒトガミを完全に封じ込めてしまう。",
               u"それが、",
               u"ヒトガミにとっていちばん見たくない未来だったというわけです。"]
    cat5 = tsukuru([u"エリス", u"ヒトガミ", u"オルステッド"])
    got5 = hashiru(S, jimaku5, cat5, u"#アップ")
    eta5 = [dare(S, cat5, g) for g in got5]
    ok5 = all((u"エリス" not in e) for e in eta5 if e)
    say(u"%s ⑤ 名前が字幕に無い「それが、」でも、エリスを選ばない"
        % (u"○" if ok5 else u"×"))
    for tx, g in zip(jimaku5, got5):
        say(u"     %-30s → %s （%s）"
            % (tx[:30], (g or u"なし").split(u"/")[-1],
               u"・".join(dare(S, cat5, g)) or u"人なし"))
    if not ok5:
        warui.append(u"⑤ 前後を読んでいません（エリスが出た）")

    try:
        shutil.rmtree(SAGYOU)
    except Exception:
        pass
    say(u"")
    if warui:
        say(u"落ちました。%d件:" % len(warui))
        for w in warui:
            say(u"  ・" + w)
        return 1
    say(u"○ 字幕の人と絵の人は合っています。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
