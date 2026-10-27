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

    # ── ⑦ 道具どうしで「絵ではないフォルダ」が食いちがっていないか
    #       （2026-10-27・本人の付け直しログから）
    #
    # 画像フォルダには絵でないものも入っている（一覧シート 327枚）。
    #   make_slideshow.py … 外していた
    #   miru.py           … **外していなかった**
    # その結果 6697枚 対 6370枚 で、miru.py は動画に使われない
    # 一覧シートを説明づけし、カタログも汚していた。
    # **どちらが候補にする絵かが、道具で違っていた。**
    # 一覧は 置き場所.py に1回だけ置いてある。3つがそろっているか見る。
    _sp2 = _iu.spec_from_file_location(u"m_oki", os.path.join(HERE, u"置き場所.py"))
    _ok = _iu.module_from_spec(_sp2)
    sys.modules[u"m_oki"] = _ok
    _sp2.loader.exec_module(_ok)
    iu(u"一覧" in _ok.tsukawanai_fol(),
       u"置き場所.py が「絵ではないフォルダ」を持っている（%s）"
       % u"・".join(_ok.tsukawanai_fol()))
    iu(tuple(_mi.TSUKAWANAI_FOL) == tuple(_ok.tsukawanai_fol()),
       u"miru.py が置き場所と同じ一覧を見ている")
    iu(tuple(ms.TSUKAWANAI_FOL) == tuple(_ok.tsukawanai_fol()),
       u"make_slideshow.py が置き場所と同じ一覧を見ている")

    # ── ⑧ **髪の色の言葉**が道具どうしで食いちがっていないか（2026-10-27）
    #
    # 「2人目を描写していない絵」を選ぶ側（miru.py の read_futari）と、
    # 「2人目が書かれたか」を数える側（make_slideshow.py の知らせ）で
    # 色の一覧が違うと、
    #   miru.py           … 2色目を書いたつもり
    #   make_slideshow.py … 1色しか数えない
    # となり、**どちらも黙って通る。** 置き場所.py に1回だけ置いてある。
    iu(len(_ok.kami_iro()) >= 8 and u"茶髪" in _ok.kami_iro(),
       u"置き場所.py が髪の色を持っている（%d色）" % len(_ok.kami_iro()))
    iu(set(_mi.KAMI_IRO) == set(_ok.kami_iro()),
       u"miru.py が置き場所と同じ色を見ている")
    iu(set(ms.KAMI_IRO) == set(_ok.kami_iro()),
       u"make_slideshow.py が置き場所と同じ色を見ている")
    iu(set(_mi.JP_HAIR.values()) == set(_ok.kami_iro()),
       u"miru.py が絵に書き込む色と、数える色がそろっている")

    # ── ⑨ **大勢の絵で ルーデウス が落ちないか**（2026-10-27）
    #
    # 人物ルール.txt は「見分けやすい人」を上に置いてあるので、
    # ルーデウス は17番目 ── 髪の色だけで当たる規則ではいちばん後ろ。
    # 2人目の髪の色が入ると当たる規則が増えるので、「先頭2人まで」だと
    #
    #   大勢 茶髪 青髪 紫髪 大人
    #     → ザノバ(紫髪 大人)・ロキシー(青髪) で枠が埋まり、
    #       **台本でいちばん名前が出る ルーデウス が入らなかった。**
    #
    # 本人の付け直し（2人目の色を足す）で当たる規則が増えるため、
    # この落ち方は**付け直すほど増える。**
    _ru = ms.load_person_rules(os.path.join(HERE, u"人物ルール.txt"))
    iu(len(_ru) >= 20, u"人物ルール.txt を読めた（%d行）" % len(_ru))
    _na = set(ms.CHARACTERS) | set(r[0] for r in _ru)

    def _namae_no(setsu):
        t = {u"x/1.png": setsu}
        ms.TARAZU_IUTA[0] = True          # 知らせは出さない
        ms.apply_person_rules(t, _ru)
        return set(x for x in _na if x in set(t[u"x/1.png"].split()))

    _g = _namae_no(u"大勢 茶髪 青髪 紫髪 大人 長い髪 室内")
    iu(u"ルーデウス" in _g,
       u"大勢の絵で ルーデウス が落ちない（%s）" % u"・".join(sorted(_g)))
    iu(len(_g) >= 3,
       u"大勢の絵は3人まで名前が付く（%d人）" % len(_g))

    # 二人の絵は2人のまま（**ゆるめていない**）
    _g2 = _namae_no(u"二人 茶髪 青髪 長い髪 少年少女 室内 昼")
    iu(_g2 == set([u"ルーデウス", u"ロキシー"]),
       u"二人の絵は2人のまま（%s）" % u"・".join(sorted(_g2)))

    # ── ⑩ **足りない絵を、直し方で2つに分けて数えるか**（2026-10-27）
    #
    # 「名前が1人以下」には直し方の違う2種類が混ざっていた。
    #   髪の色が1つだけ    → カタログ側。miru.py --二人だけ で直る
    #   色は2つあるのに    → 人物ルール.txt 側。**付け直しても減らない**
    # 1つの数で出していたので、1時間半かけた付け直しが効いたのかどうかが
    # ログから分からなかった。
    _mo = io.open(os.path.join(HERE, u"make_slideshow.py"),
                  encoding="utf-8").read()
    iu(u"髪の色が1つだけ" in _mo and u"2つ以上あるのに名前が1人以下" in _mo,
       u"知らせが「カタログ側」と「人物ルール側」に分かれている")
    _t2 = {
        u"F1/a.png": u"二人 ロキシー 青髪 長い髪 帽子 室内",
        u"F2/c.png": u"二人 黒髪 橙の髪 大人 室内",
        u"F2/d.png": u"二人 黒髪 橙の髪 大人 街",
        u"F4/g.png": u"二人 茶髪 青髪 長い髪 少年少女",
    }
    ms.TARAZU_IUTA[0] = False
    _dame = []
    _moto_say = ms.say
    try:
        ms.say = lambda *a, **k: _dame.append(
            u" ".join(unicode(x) if str is bytes else str(x) for x in a))
        ms.apply_person_rules(_t2, _ru)
    finally:
        ms.say = _moto_say
    _zen = u"\n".join(_dame)
    iu(u"髪の色が1つだけ 1枚" in _zen,
       u"カタログ側を 1枚 と数えた")
    iu(u"2つ以上あるのに名前が1人以下 2枚" in _zen,
       u"人物ルール側を 2枚 と数えた")
    iu(u"橙の髪+黒髪" in _zen,
       u"どの色の組で落ちているかを出す（ゆるめる規則が分かる）")

    # ── ⑪ **割り当てと採点が、同じ絵に同じ名前を出すか**（2026-10-27）
    #
    # 人物ルールを当てる所は make_slideshow.py と miru_kekka.py の
    # **2か所にある**（採点は1本で動くので借りられない）。
    # 片方だけ直すと
    #   割り当て … 大勢の絵に ルーデウス も付いた（全員そろった）
    #   採点     … ルーデウス が無い → 「人が足りない」
    # となり、**直したのに採点が落とす。**
    # 本人の決めごと（CLAUDE.md）:
    # 「割り当てと採点の両方がこの線。片方だけ直すと、また黙って通る」
    M2 = mochikomu(u"mk_onaji", os.path.join(HERE, u"miru_kekka.py"))
    _ru2 = M2.load_person_rules(os.path.join(HERE, u"人物ルール.txt"))
    iu(len(_ru2) == len(_ru),
       u"2つの道具が同じ人物ルールを読む（%d行 / %d行）"
       % (len(_ru), len(_ru2)))
    _tameshi = [
        u"大勢 茶髪 青髪 紫髪 大人 長い髪 室内",
        u"大勢 茶髪 緑髪 大人 戦闘",
        u"二人 茶髪 青髪 長い髪 少年少女 室内 昼",
        u"二人 エリス 赤髪 茶髪 鎧 剣 長い髪 大人 戦闘",
        u"一人 茶髪 少年少女 室内",
        u"大勢 金髪 桃色の髪 白髪 大人 城",
    ]
    _chigau = []
    for _se in _tameshi:
        _a = {u"x/1.png": _se}
        _b = {u"x/1.png": _se}
        ms.TARAZU_IUTA[0] = True
        ms.apply_person_rules(_a, _ru)
        _moto2 = M2.say
        try:
            M2.say = lambda *a, **k: None
            M2.apply_person_rules(_b, _ru2)
        finally:
            M2.say = _moto2
        if _a[u"x/1.png"].split() != _b[u"x/1.png"].split():
            _chigau.append((_se, _a[u"x/1.png"], _b[u"x/1.png"]))
    for _se, _x, _y in _chigau:
        print(u"      %s" % _se)
        print(u"        割り当て %s" % _x)
        print(u"        採点     %s" % _y)
    iu(not _chigau,
       u"割り当てと採点が、%d通りぜんぶで同じ名前を出す" % len(_tameshi))

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
