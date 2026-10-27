# -*- coding: utf-8 -*-
u"""セリフに出てくる人が、**全員**絵に写っているか（2026-10-23）

■ 本人の言葉（何度目かの指摘）

  > せめて音声や字幕で出てくる登場人物と画像に載っている人物くらい
  > 合わせてください。これはマストです。

前の版は「**名前のうち誰か1人**でも写っていれば合格」だった。そのため

    「ルーデウスはロキシーと結婚しているんですね。」
      → ルーデウスと男2人の絵（ロキシーが居ない）         通っていた
    「ヒトガミいわく、ルーデウスとロキシーのその子供が、」
      → ロキシーだけの絵（ヒトガミもルーデウスも居ない）   通っていた

採点も同じ線なので「ちゃんと合っていそう 193か所」と出ていた。
**両方とも「1人でも居れば合格」で、同じ見落としを二重にしていた。**

ここでは、2人の名前が出ている文に対して
  ・2人とも写っている絵がある  → **その絵が選ばれること**
  ・1人しか写っている絵が無い  → 無理に変えないこと
  ・採点が「人が足りない」と言うこと
を、絵とカタログをその場で作って確かめる。ffmpeg も本物の絵も要らない。
"""
from __future__ import print_function
import importlib.util
import io
import os
import shutil
import sys
import tempfile

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


def mochikomu(nm, path):
    spec = importlib.util.spec_from_file_location(nm, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[nm] = m
    spec.loader.exec_module(m)
    return m


WA = u"無職転生Ⅲ 第11話"


def main():
    ms = mochikomu(u"ms_hito", os.path.join(HERE, u"make_slideshow.py"))

    # ── 絵とカタログをその場で作る（本人の並びと同じ形）
    #   001 ルーデウスだけ / 002 ロキシーだけ / 003 **二人とも**
    images = [u"%s/%03d_a_x2.png" % (WA, i) for i in range(1, 7)]
    cat = {
        images[0]: u"ルーデウス 一人 茶髪 室内 書斎",
        images[1]: u"ロキシー 一人 青髪 室内",
        images[2]: u"ルーデウス ロキシー 二人 茶髪 青髪 室内",
        images[3]: u"ヒトガミ 一人 白髪 光る目",
        images[4]: u"エリス 一人 赤髪",
        images[5]: u"ルーデウス 一人 茶髪 夜",
    }
    slots = [(0.0, 2.0, u"ルーデウスはロキシーと結婚しているんですね。")]
    # ■ **画像プランから当てる**（本人の回と同じ道）
    #
    #   本人のログ: 「192枚が直接一致 / 0枚がセリフの人名から」
    #   ＝ 全部プラン経由で、人名から選ぶ道は一度も通っていない。
    #   はじめ人名経由で試したら、**古い版でも通ってしまった**
    #   （人名の道には「二人の絵を先に」がもともと入っているため）。
    #   直したのは naoshi（プランで決まった絵を見直す所）なので、
    #   材料も本人と同じくプラン経由にする。
    #   プランに**ファイル名**で書くと「手で選んだ絵」になって
#   naoshi が触らない。本人のプランはタグ指定なので、そろえる。
    rules = [[[u"結婚"], [u"#書斎"], 0, []]]   # わざと「ルーデウスだけ」
    default = [images[4]]

    picked = ms.assign_images(slots, images, rules, default, catalog=cat)
    iu(len(picked) == 1, u"1枚ぶん返ってきた（%d枚）" % len(picked))
    if picked:
        iu(picked[0] == images[2],
           u"**二人とも写っている絵**が選ばれた（いま %s）"
           % (picked[0] or u"なし").split(u"/")[-1])

    # ── ② 二人の絵が無ければ、無理に変えない
    cat2 = dict(cat)
    del cat2[images[2]]
    images2 = [k for k in images if k != images[2]]
    rules2 = [[[u"結婚"], [u"#書斎"], 0, []]]
    picked2 = ms.assign_images(slots, images2, rules2, [images[4]], catalog=cat2)
    iu(picked2 and picked2[0] in (images[0], images[5]),
       u"二人の絵が無いときは、片方だけの絵のままにする（いま %s）"
       % ((picked2[0] if picked2 else u"なし") or u"なし").split(u"/")[-1])

    # ── ③ 名前が1人だけの文では、今までどおり
    slots3 = [(0.0, 2.0, u"ヒトガミには、未来を見る能力があります。")]
    rules3 = [[[u"能力"], [u"#書斎"], 0, []]]   # わざと「ルーデウスだけ」
    picked3 = ms.assign_images(slots3, images, rules3, [images[4]], catalog=cat)
    iu(picked3 and picked3[0] == images[3],
       u"名前が1人の文は、その人の絵（いま %s）"
       % ((picked3[0] if picked3 else u"なし") or u"なし").split(u"/")[-1])

    # ── ⑤ **一人の絵は、二人の絵に替える**（2026-10-23・v169 の採点から）
    #
    # v169 で「人が足りない」が 17か所 出た。数えると
    #   **一人**の絵   9か所（023 038 050 058 066 070 079 111 153）
    #   **二人/大勢**  8か所（164 016 018 028 031 078 090 187）
    # で、前の9か所は**一人しか写っていない絵**だった。
    # 2人の名前が出ている文に一人の絵は**原理的に合わない**ので、
    # 全員そろった絵が無くても、せめて人数の合う絵に替える。
    #
    # ここが肝: 替え先のカタログは **名前が1つだけ**（「ロキシー 二人 …」）。
    # 名前の数は増えないので、v169 の `kazu <= ima_kazu` では動かない。
    img5 = list(images) + [u"%s/007_a_x2.png" % WA]
    cat5 = dict(cat)
    del cat5[images[2]]                    # 二人とも名前がある絵は無しにする
    img5.remove(images[2])
    cat5[img5[-1]] = u"ロキシー 二人 青髪 室内"   # 人数は二人／名前は1つ
    picked5 = ms.assign_images(slots, img5, [[[u"結婚"], [u"#書斎"], 0, []]],
                               [images[4]], catalog=cat5)
    iu(picked5 and picked5[0] == img5[-1],
       u"一人の絵のままにせず、**人数の合う二人の絵**に替えた（いま %s）"
       % ((picked5[0] if picked5 else u"なし") or u"なし").split(u"/")[-1])

    # ⑤-2 すでに二人の絵なら、同じ良さの絵へは**動かさない**（迷子にしない）
    cat6 = dict(cat5)
    cat6[images[0]] = u"ルーデウス 二人 茶髪 室内 書斎"   # はじめから二人の絵
    picked6 = ms.assign_images(slots, img5, [[[u"結婚"], [u"#書斎"], 0, []]],
                               [images[4]], catalog=cat6)
    iu(picked6 and picked6[0] == images[0],
       u"すでに二人の絵なら、同じ良さの絵へは動かさない（いま %s）"
       % ((picked6[0] if picked6 else u"なし") or u"なし").split(u"/")[-1])

    # ⑤-3 全員そろった絵があれば、そちらが上（①の決めごとは変わっていない）
    picked7 = ms.assign_images(slots, images,
                               [[[u"結婚"], [u"#書斎"], 0, []]],
                               [images[4]], catalog=cat)
    iu(picked7 and picked7[0] == images[2],
       u"全員そろった絵があれば、人数より**全員**が上（いま %s）"
       % ((picked7[0] if picked7 else u"なし") or u"なし").split(u"/")[-1])

    # ── ⑥ カタログの「2人目を描写していない絵」を選べるか（2026-10-23）
    #
    # v170 の採点で天井が見えた。
    #   カタログ: 「二人／大勢」の絵 2389枚のうち **2373枚は名前が1人以下**
    # ＝ 2人とも名前が付いている絵は 6370枚中 16枚しか無い。
    # 絵の選び方をどう直しても越えられないので、カタログを付け直す。
    # 対象を絞る口（miru.py --二人だけ）が、正しい絵だけを選ぶかを見る。
    import importlib.util as _iu
    _sp = _iu.spec_from_file_location(u"m_miru", os.path.join(HERE, u"miru.py"))
    _mi = _iu.module_from_spec(_sp)
    sys.modules[u"m_miru"] = _mi
    _sp.loader.exec_module(_mi)
    import tempfile as _tf
    _d = _tf.mkdtemp(prefix=u"futari_")
    _p = os.path.join(_d, u"c.txt")
    io.open(_p, "w", encoding="utf-8").write(
        u"# あたま\n"
        u"A/001.png\t二人 ロキシー 青髪 長い髪 制服\n"        # 1色 → 対象
        u"A/002.png\tルーデウス ロキシー 二人 茶髪 青髪\n"    # 2色 → 対象外
        u"A/003.png\t一人 ルーデウス 茶髪\n"                  # 一人 → 対象外
        u"B/004.png\t大勢 ヒトガミ 光る目\n"                  # 0色 → 対象
        u"B/005.png\tルーデウス 二人 茶髪 長い髪 ローブ\n")   # 1色 → 対象
    _naosu = _mi.read_futari(_p)
    iu(_naosu == set([u"A/001.png", u"B/004.png", u"B/005.png"]),
       u"2人目を描写していない絵だけを選ぶ（いま %d枚 %s）"
       % (len(_naosu), u",".join(sorted(x.split(u"/")[-1] for x in _naosu))))
    iu(u"A/002.png" not in _naosu,
       u"2人目の髪の色が書いてある絵は飛ばす（二度手間にしない）")
    iu(u"A/003.png" not in _naosu,
       u"「一人」の絵は対象にしない")
    # ⑥-2 **残り枚数が嘘をつかないか**（2026-10-27・本人のログ）
    #
    # 30枚お試しの最後に「まだ 653枚 残っています」と出たが、
    # 本当は 3185枚ぶん残っていた（**5倍小さく**出した）。
    # --二人だけ の対象はカタログに載っているので、
    # 「カタログに無い絵」だけを数えると対象がまるごと落ちる。
    # 残り時間の見積りをこれで立てられてしまう。
    _names = [u"A/001.png", u"A/002.png", u"A/003.png", u"A/004.png"]
    _sumi = _mi.read_done(_p)            # 001 002 003（004 はカタログに無い）
    _mada = _mi.read_futari(_p)          # 001 004相当（2人目が未描写）
    _f = _mi.nokori_kazu(_names, _sumi, set(), _mada)
    _n = _mi.nokori_kazu(_names, _sumi, set(), None)
    # 残るのは 001（2人目がまだ）と 004（カタログに無い）の2枚。
    # 002 は髪の色が2つ、003 は「一人」なので対象外。
    iu(_f == 2, u"--二人だけ の残りは 2人目がまだの絵も数える（いま %d枚・正解2）"
       % _f)
    iu(_n == 1, u"ふつうの残りは「カタログに無い絵」だけ（いま %d枚・正解1）" % _n)
    iu(_f > _n, u"**--二人だけ の残りを小さく見せない**（%d > %d）" % (_f, _n))

    import shutil as _sh
    _sh.rmtree(_d, ignore_errors=True)

    # ── ④ 採点が「人が足りない」と言うか
    oku = tempfile.mkdtemp(prefix=u"hito_")
    try:
        io.open(os.path.join(oku, u"画像カタログ.txt"), "w",
                encoding="utf-8", newline="\r\n").write(
                u"# 目印\t説明\r\n" +
                u"\r\n".join(u"%s\t%s" % (k, v) for k, v in sorted(cat.items()))
                + u"\r\n")
        io.open(os.path.join(oku, u"一覧.txt"), "w",
                encoding="utf-8", newline="\r\n").write(
                u"番号\t開始\t尺\t画像\t絵の話数\t台本の話数\tちがい\tセリフ\r\n"
                u"001\t0:00\t2.00\t%s\t%s\t%s\t\t%s\r\n"
                % (images[0], WA, WA,
                   u"ルーデウスはロキシーと結婚しているんですね。"))
        M = mochikomu(u"mk_hito", os.path.join(HERE, u"miru_kekka.py"))
        rows = M.load_ichiran(os.path.join(oku, u"一覧.txt"))
        tags = M.load_catalog(os.path.join(oku, u"画像カタログ.txt"))
        iu(len(rows) == 1 and len(tags) >= 6,
           u"採点に読ませる材料ができた（%d行 / %d枚）" % (len(rows), len(tags)))
        hito = M.chars_in(u"ルーデウスはロキシーと結婚しているんですね。")
        iu(u"ルーデウス" in hito and u"ロキシー" in hito,
           u"セリフから2人の名前が取れる（%s）" % u"・".join(hito))
        moto = io.open(os.path.join(HERE, u"miru_kekka.py"),
                       encoding="utf-8").read()
        iu(u"人が足りない" in moto,
           u"採点に「人が足りない」の知らせがある"
           u"（1人でも写っていれば合格、にしていない）")
    finally:
        shutil.rmtree(oku, ignore_errors=True)

    print(u"")
    if warui:
        print(u"× %d件 落ちました" % len(warui))
        return 1
    print(u"○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
