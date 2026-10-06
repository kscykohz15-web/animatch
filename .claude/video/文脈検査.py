# -*- coding: utf-8 -*-
u"""文脈検査 ─ 「台本の前後から誰の話か読む」が、本人の直しと同じになるか

■ なぜこの検査が要るか

  本人が 2026-10-06 に、29〜37番の絵を直し、**理由を全部書いてくれた**。
  理由を読むと、直した理由はぜんぶ「その1行だけでは分からないこと」だった。

    29 「この子供という言葉から、前後の文章からルーデウスとロキシーの
         子供であるとわかるため、二人が写った画像が望ましい」
    30 「ララはまだアニメで生まれていないので、
         ルーデウスとロキシーの二人が写った画像が望ましい」
    31 ヒトガミの画像
    32 オルステッドの画像
    33 ヒトガミの画像(やられる顔) もしくは オルステッドの画像
    34 オルステッドの画像
    35 ヒトガミの画像
    36 ヒトガミの画像
    37 未来を創造させる描写

  この9個を、**機械だけで同じ答えにする**のが目標（本人の工数を0にする）。
  通らなければ board.html を作らない。

■ 材料

  字幕は**本物**（第6回 ヒトガミの正体・24〜39番）。ここを作りかえては意味が無い。
  絵は色だけの画像でよい（機械が見るのは説明の言葉なので）。
  人ごとに絵を用意して、「どの人の絵を選んだか」だけを見る。
"""
from __future__ import print_function
import importlib.util
import io
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SAGYOU = os.path.join(HERE, u"_文脈検査")

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# 本物の字幕（第6回・24〜39番）。**書きかえないこと。**
# 台本:「急にまだ登場もしていない人間が出てきますが、ヒトガミいわく、…」
JIMAKU = [
    (24, u"急にまだ登場もしていない人間が出てきますが、"),
    (25, u"ヒトガミいわく、"),
    (26, u"ルーデウスとロキシーのその子供が、"),
    (27, u"将来ヒトガミを殺しにきてしまうとのことなのです。"),
    (28, u"これは少しネタバレになりますが、"),
    (29, u"この子供には名前があって、"),
    (30, u"ララといいます。"),
    (31, u"そしてララが一人でヒトガミを倒すわけではありません。"),
    (32, u"龍神オルステッドと手を組み、"),
    (33, u"ヒトガミを完全に封じ込めてしまう。"),
    (34, u"それが、"),
    (35, u"ヒトガミにとっていちばん見たくない未来だったというわけです。"),
    (36, u"ヒトガミには、"),
    (37, u"未来を見る能力があります。"),
    (38, u"その能力から、"),
    (39, u"近い将来、"),
]

# 本人の答え。**どれか1人が写っていれば合格**（33番は「もしくは」なので2人）。
SEIKAI = {
    29: [u"ルーデウス", u"ロキシー"],
    30: [u"ルーデウス", u"ロキシー"],
    31: [u"ヒトガミ"],
    32: [u"オルステッド"],
    33: [u"ヒトガミ", u"オルステッド"],
    34: [u"オルステッド"],
    35: [u"ヒトガミ"],
    36: [u"ヒトガミ"],
    37: [u"ヒトガミ"],
}
# 29・30番は「二人が写った画像が望ましい」。二人そろっているかも見る。
FUTARI = (29, 30)

WA = [u"無職転生Ⅲ 第11話", u"無職転生Ⅲ 第12話", u"無職転生Ⅲ 第14話"]
HITO = [u"ヒトガミ", u"ルーデウス", u"ロキシー", u"オルステッド", u"エリス"]


def junbi():
    u"""人ごとの絵をそろえる。どの人でも同じだけ用意して、えこひいきを消す。"""
    from PIL import Image
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(os.path.join(SAGYOU, u"確認用"))
    os.makedirs(os.path.join(SAGYOU, u"その他"))
    for f in (u"直す.py", u"miru_kekka.py", u"make_slideshow.py", u"人物ルール.txt"):
        shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    root = os.path.join(SAGYOU, u"画像")
    cat = [u"# 目印\t説明"]
    for w, wa in enumerate(WA):
        os.makedirs(os.path.join(root, wa))
        n = 0
        for h, hito in enumerate(HITO):
            for k in range(6):
                n += 1
                nm = u"%03d_%s%d_x2.png" % (n, hito, k)
                Image.new("RGB", (480, 270),
                          (30 + w * 50, 40 + h * 40, 60 + k * 30)) \
                    .save(os.path.join(root, wa, nm))
                # 6枚のうち2枚は「やられている顔」にする
                # （33番「ヒトガミを完全に封じ込めてしまう」で、
                #   「〜を」で受けている人のやられ顔が選ばれるかを見る）
                kao = u" 恐怖" if k in (4, 5) else u" 穏やか"
                cat.append(u"%s/%s\t%s 室内%s" % (wa, nm, hito, kao))
        # 二人が写っている絵も用意する（29・30番の「二人が写った画像」）
        for (a, b) in ((u"ルーデウス", u"ロキシー"), (u"ヒトガミ", u"オルステッド")):
            for k in range(3):
                n += 1
                nm = u"%03d_%s%s%d_x2.png" % (n, a, b, k)
                Image.new("RGB", (480, 270), (200, 40 + k * 30, 90)) \
                    .save(os.path.join(root, wa, nm))
                cat.append(u"%s/%s\t%s %s 二人 室内" % (wa, nm, a, b))
        # 名前が片方しか付いていない絵（本物のカタログではこれがふつう）。
        # 「ロキシー 二人」は、ルーデウスとロキシーの絵かもしれない。
        for (fuda, kazu) in ((u"katahou_futari", u"二人"),
                             (u"katahou_hitori", u"一人")):
            n += 1
            nm = u"%03d_%s_x2.png" % (n, fuda)
            Image.new("RGB", (480, 270), (90, 90, 200)).save(
                os.path.join(root, wa, nm))
            cat.append(u"%s/%s\tロキシー %s 室内 穏やか" % (wa, nm, kazu))
    io.open(os.path.join(SAGYOU, u"画像カタログ.txt"), "w",
            encoding="utf-8", newline="\r\n").write(u"\r\n".join(cat) + u"\r\n")
    out = [u"番号\t開始\t尺\t画像\tセリフ\t台本の話数"]
    for n, (no, tx) in enumerate(JIMAKU, 1):
        out.append(u"%d\t%.2f\t2.00\t%s/001_%s0_x2.png\t%s\t%s"
                   % (no, no * 2.0, WA[0], HITO[0], tx, u" / ".join(WA)))
    io.open(os.path.join(SAGYOU, u"確認用", u"一覧.txt"), "w",
            encoding="utf-8", newline="\r\n").write(u"\r\n".join(out) + u"\r\n")


def mochikomu(nm, path):
    spec = importlib.util.spec_from_file_location(nm, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    try:
        from PIL import Image  # noqa
    except ImportError:
        print(u"Pillow が要ります（pip install pillow）")
        return 1
    junbi()
    moto = os.getcwd()
    os.chdir(SAGYOU)
    try:
        sys.path.insert(0, u".")
        M = mochikomu("mk_b", u"miru_kekka.py")
        N = mochikomu("na_b", u"直す.py")
        N.KAWARI.update(N.load_kawari(u"人物ルール.txt"))
        if not N.KAWARI:
            print(u"× 人物ルール.txt の「代わり」の行が読めていません")
            return 1

        rows = M.load_ichiran(os.path.join(u"確認用", u"一覧.txt"))
        tags = M.load_catalog(u"画像カタログ.txt")
        zenbu = N.walk_images(u"画像")
        ban = {int(r[u"no"]): n for n, r in enumerate(rows)}

        def dare(k):
            w = set((M.cat_lookup(tags, k) or u"").split())
            return [c for c in HITO if c in w]

        atari, ng = 0, []
        for no in sorted(SEIKAI):
            i = ban[no]
            omomi = N.bunmyaku(rows, i)
            kouho = N.kouho_erabu(rows[i], rows, i, tags, zenbu, {}, kazu=1)
            if not kouho:
                ng.append((no, u"候補が出ませんでした", omomi, []))
                continue
            eta = dare(kouho[0])
            ok = any(c in SEIKAI[no] for c in eta)
            if ok and no in FUTARI:
                # 「二人が写った画像が望ましい」。両方そろっていること。
                ok = all(c in eta for c in SEIKAI[no])
            if ok:
                atari += 1
                print(u"○ %2d番「%s」  → %s" % (no, rows[i][u"text"], u"・".join(eta)))
            else:
                ng.append((no, u"・".join(eta) or u"(人なし)", omomi, SEIKAI[no]))
        for (no, eta, omomi, nozomi) in ng:
            i = ban[no]
            print(u"× %2d番「%s」" % (no, rows[i][u"text"]))
            print(u"     望み: %s / 選んだ絵: %s" % (u"・".join(nozomi), eta))
            print(u"     文脈: %s" % u" ".join(
                u"%s%.2f" % (c, omomi[c])
                for c in sorted(omomi, key=lambda x: -omomi[x])[:5]))
        # ⑩「〜を」で受けている人は、やられている顔の絵が選ばれるか
        #    33番「ヒトガミを完全に封じ込めてしまう。」
        i33 = ban[33]
        kao_ok, kao_mi = None, u""
        hiroi = N.kouho_erabu(rows[i33], rows, i33, tags, zenbu, {}, kazu=40)
        hito_no = [k for k in hiroi if u"ヒトガミ" in dare(k)]
        if hito_no:
            w = set((M.cat_lookup(tags, hito_no[0]) or u"").split())
            kao_ok = M.yarare_kao(w)
            kao_mi = u"ヒトガミの絵のうち1番目 = %s" % u" ".join(sorted(w))
        else:
            kao_mi = u"ヒトガミの絵が候補に出ませんでした"
        print(u"%s ⑩ 「〜を」で受けている人は、やられ顔が先に出る … %s"
              % (u"○" if kao_ok else u"×", kao_mi))

        # ⑪ 名前が片方しか付いていない絵でも、「二人」が「一人」より上に来るか
        #    （本物のカタログでは、二人写っていても名前は1人しか付かない）
        i30 = ban[30]
        hiroi2 = N.kouho_erabu(rows[i30], rows, i30, tags, zenbu, {}, kazu=200)
        jun = {}
        for n2, k in enumerate(hiroi2):
            if u"katahou_futari" in k:
                jun[u"二人"] = n2
            if u"katahou_hitori" in k:
                jun[u"一人"] = n2
        futa_ok = (u"二人" in jun and u"一人" in jun
                   and jun[u"二人"] < jun[u"一人"])
        print(u"%s ⑪ 片方しか名前が無い絵でも「二人」が先に来る … %s"
              % (u"○" if futa_ok else u"×",
                 u"二人 %s番目 / 一人 %s番目"
                 % (jun.get(u"二人", u"-"), jun.get(u"一人", u"-"))))

        print(u"")
        print(u"当たり %d / %d" % (atari, len(SEIKAI)))
        if not futa_ok:
            print(u"× 「二人」の手がかりが働いていません。")
            return 1
        if not kao_ok:
            print(u"× やられ顔の選びかたが働いていません。")
            return 1
        if atari < len(SEIKAI):
            print(u"× 本人の直し（29〜37番）を、機械だけでは再現できていません。")
            return 1
        print(u"○ 本人の直し 29〜37番を、機械だけで全部あてました。")
        return 0
    finally:
        os.chdir(moto)


if __name__ == "__main__":
    sys.exit(main())
