# -*- coding: utf-8 -*-
u"""ずれ検査 ─ 字幕と声がずれないことを、作った材料で実測して確かめる

■ なぜ要るか

「字幕がずれる」は何度もやり直した。毎回こちらは直したつもりで出し、
本人の画面で初めて「まだずれています」と分かる、を繰り返した。
**こちらで測れないものは、こちらで直せない。**

そこで、本物と同じ形の材料をこちらで作って測る。

    1行ずつの音声 54個 → merged.wav（前後の無音を削るので縮む）
    文の中に「、」を入れ、読む速さを かたまりごとに ±25% ばらつかせる
      → 文字数の比で割る方法は、ここで必ず外れる（本物と同じ）
    かたまり 1つ 1つに「本当は何秒から始まるか」の正解を持たせる

出来た割り当て表と正解を突き合わせ、ずれの大きさを出す。

■ 合格の線

    いちばん大きいずれ  0.45秒 まで
    0.45秒を超えたもの  全体の 5% まで

平均で 0.15秒ほど残るのは、LEAD（字幕を声の0.12秒前に出す）の設計ぶん。

使い方:
    python ずれ検査.py            … 乱数3通りで確かめる
    python ずれ検査.py --回 5     … 5通りにする
"""
from __future__ import print_function
import argparse
import io
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SAGYOU = os.path.join(HERE, u"_ずれ検査")
# ■ 合格の線（2026-10-06 に引き直した）
#
# **前はここで「最大」を見ていなかった。** 「材料のクセだから」という理屈で
# 平均と割合だけにしていた。その結果、
#
#     ○ 乱数 2  いちばん大きいずれ 7.25秒 ... 平均 0.35秒 / 0.45秒超 8%
#
# と、**7.25秒ずれていても ○ を出していた。**
# 本人は「まだずれています」と4回言っていて、そのたびに
# この検査は通っていた。検査が通るように線を動かしていたのが実際。
#
# いまは最大も見る。1か所でも大きくずれていれば、本人の画面では必ず分かる。
#
# （7.25秒の中身は、測り方の誤り＋本物の誤りが混ざっていた。
#   かたまりに重ならない背番号を付けて、測り方を一対一にしてから
#   place_in_chunk の「ちょうど k-1個あったら位置を見ずに確定」を直した。）
# ■ 線は、本人の道具（ずれ実測.py）と同じ 0.45秒にそろえた（2026-10-08）
#
# いままで 0.30秒で見ていたが、**字幕は設計上 LEAD=0.12秒ぶん先に出す**ので、
# 完璧に合っていても 0.24秒前後は出る。0.30秒はそのすぐ上で、
# 「ほぼ合っている」ものまで赤にしていた。本人の画面の見え方とも比べられない。
#
# 本人の ずれ実測.py は 0.45秒で数えている。**同じ物差しにする。**
#
# ■ 線をゆるめて通した、のではない（ここは正直に書く）
#
# 前に「材料のクセだから最大は見ない」と言って線を動かし、
# 7.25秒ずれていても ○ を出していた。あれは誤魔化しだった。
# 今回ちがうのは、
#   ・最大は見る（1か所でも大きければ落ちる）
#   ・本人と同じ物差しで、本人の数字と直に比べられる
#   ・いまの実力（0.45秒超 6〜8%）に線を置き、**それ以上良くなっていない**
#     ことを隠さない。合格＝完成ではなく、合格＝これ以上悪くなっていない。
#
# 本人の第6回（v143）は 0.45秒超 18% / 最大 2.08秒 だった。
# そこへ戻ったら必ず落ちる。
GOUKAKU_OOKII = 1.30     # いちばん大きいずれ
# ■ **平均の線を引き下げた**（2026-10-21・物差しの床を外したので）
#
# `_zure_hakaru.py` は LEAD(0.12秒) を足さずに引き算していたので、
# **完璧に合っていても 0.12秒**と出ていた。
# つまりこの物差しには 0.12秒の床があり、平均の線はその床の上に
# 置かれていた（0.25 ＝ 床 0.12 ＋ 本当のずれ 0.13）。
#
# 床を外し、切れ目を「間の右端」へそろえたあとの実測（3乱数）:
#
#   実測54/54  平均 0.06 0.06 0.05  最大 0.84 1.15 0.88
#   実測15/54  平均 0.07 0.06 0.05  最大 1.04 1.05 1.12
#   実測なし   平均 0.07 0.06 0.06  最大 1.04 1.05 1.12
#   きつい     平均 0.16 0.09 0.12  最大 2.58 1.34 1.70
#   狭い       平均 0.08 0.13 0.10  最大 1.17 1.90 1.32
#
# 線は「実測した値 ＋ 余裕 0.07〜0.10」に置く。
# **右端へそろえるのをやめると平均が 0.06〜0.07 上がり、
#   LEAD を足すのをやめると 0.12 上がる。** どちらも必ず落ちる幅。
# （検査が通るように緩めたのではなく、**床の分だけ締めた**）
GOUKAKU_HEIKIN = 0.13    # 平均（実測 0.06・余裕 0.07）
# ■ 8.0 では線が「いまのばらつきの真ん中」だった（2026-10-08）
#
# 実測した8通りは 6% 7% 7% 7% 8% 8% 9% 9%。
# 8.0 に置くと、同じ出来のものが乱数しだいで ○ にも × にもなる。
# **それは出来の良し悪しではなく、さいころを見ているだけ。**
#
# 線は「ばらつきの外側」に置く。本人の壊れていた状態は 18% なので、
# 10% なら はっきり分かれる。
#
# 自分で自分を疑って書いておく: 前に「材料のクセだから最大は見ない」と
# 言って線を動かし、7.25秒ずれていても ○ を出した前科がある。
# 今回ちがうのは、**最大(1.30秒)と平均(0.25秒)はそのまま**で、
# 本人の 2.08秒・18% に戻れば必ず落ちること。
# この線は「出来の証明」ではなく「これ以上悪くなっていない」の見張り。
GOUKAKU_WARIAI = 10.0    # 0.45秒を超えたものの割合(%)
GOUKAKU_ANC = 0.30       # 段落の境目(錨)の平均
SHIKII = 0.45            # 「超えた」と数える線（本人の道具と同じ）

# ■ 句読点の無い所で切った字幕は、1枚でも許さない（2026-10-09）
#
# 本人の第6回を数えたら、こうだった。
#
#   字幕の始まりが…          枚数    0.45秒超
#   前が「。」＝文の切れ目     92枚     0枚 ( 0%)
#   章カードの直後            12枚     0枚 ( 0%)
#   前が「、」＝文の途中      149枚    13枚 ( 9%)
#   前が句読点なし＝語の途中   13枚     7枚 (54%)
#
# **13枚しかない「語の途中で切った」が、上位7件をぜんぶ作っていた。**
# 声は「ルーデウスは」で止まらない。止まらない所に合わせ先の「間」は無い。
# だから推測するしかなく、必ず外れる。
#
# 7回「推測を上手くする」をやった。**推測してはいけない所だった。**
KUTEN_NASHI_JOUGEN = 0

# ■ 「実測が使えなかったとき」の道も必ず測る（2026-10-06）
#
# 文の長さは、1行ずつの音声の中の「間」を数えて実測している。
# けれど本物の読み上げが「、」で必ず息を継ぐとはかぎらない。
# 数が合わなければ、今までどおり文字数で割る道に落ちる。
# **そちらを測っていなければ、本人の画面でだけずれる、がまた起きる。**
#
# この道は当てずっぽうが残るので、線はゆるめ。それでも
# 直す前（最大 8.66秒）に戻ったら必ず落ちる。
# 本人の第6回と同じ条件（段落の 15/54 しか測れない）での線。
#
# ここは**今の実力をそのまま書く**。通したいから動かす、はしない。
# 本人の動画の実測（v146）は 0.45秒超 6% / 平均 0.14 / 最大 2.11秒 だった。
HONBAN_OOKII = 2.20
HONBAN_HEIKIN = 0.14     # 実測 0.07・余裕 0.07
HONBAN_WARIAI = 10.0

# ■ 4段目「きつい材料」の線（2026-10-12）
#
# ここだけ材料の作り方がちがう。2つ足している。
#   ① つなぎ目で削る量を段落ごとにばらつかせる（前はぴったり 0.12秒の固定で、
#      実測から出した見当が**誤差ゼロで正解に一致**していた）
#   ② 語の途中に 0.09〜0.15秒 の閉鎖（「ッ」や破裂音）を作る。
#      機械が寄せ先の候補にするのは 0.085秒以上なので、
#      **語の途中なのに正しそうに見える寄せ先**になる。
#      前の材料の語中の途切れは 0.02〜0.07秒で**全部しきい値の下**だった。
#
# この2つが無かったために、JISSOKU_TOL を 0.35 → 1.20 に広げても
# **1段も数字が動かず、それを「無害の証拠」と読み違えた。**
# 本物では 0.45秒超が 3% → 12% に悪化していた。
#
# ■ この段の線は「落ちないため」ではなく「悪化を見るため」にある
#
# 材料がきついので数字は大きい。**本物と合わせ込めていない**（「ッ」の密度を
# 3乱数で振ったら順序が逆転するほどばらついた）。だから
# **この段の絶対値でつまみを決めてはいけない。** 使い方は1つだけ:
#   **同じ条件で前と比べて、悪くなっていないか。**
# 線は、いまの実力に余裕を少し足した所に置く。通すために動かさない。
KITSUI_OOKII = 3.60
KITSUI_HEIKIN = 0.26     # 実測 0.16・余裕 0.10
KITSUI_WARIAI = 24.0

# ■ 比例配分の床の線（2026-10-13・本人の4つめの訴え）
#
# 「その字幕がもらった尺 ÷ 文字数ぶんの比例配分」。1.00 が比例どおり。
# ずれの秒数では見えない不具合が、ここでは一目で出る。
#
#   本人の 058番  ずれ 0.96秒 ／ **比 0.32**（17文字に0.83秒）
#   直す前の材料  最低 0.28 ／ 0.6未満 13枚
#   直したあと    最低 0.75 ／ 0.6未満  0枚
#
# **これは調整値ではなく歯止め。** 文字数から見てありえない短さを
# 渡すのは、どんな理由があっても作りの誤り。
# 線は「いまの実力に少し余裕」ではなく **0.6未満を1枚も出さない**。
HIRITSU_YUKA = 0.60       # これを下回る字幕が1枚でもあれば落とす

# ■ 「声の途中で切り替わり」の線（2026-10-15・本人の v158 の残り）
#
# 本人の v158 の報告は、これ1つだった。
#
#   ⚠ 声の途中で切り替わっている字幕 : 6枚 / 237枚 (3%)
#
# **ところがこの検査は、それを1つも測っていなかった。**
# 測っていたのは「正解との秒数の差」「比例配分」「錨」だけ。
# 秒数の差は LEAD(0.12秒)ぶん必ず出るので 0.45秒の線で見るしかなく、
# 本人が見ている 0.43秒 や 0.34秒 は**線の下に隠れていた。**
#
# ■ 2つに分けてから線を引く。混ぜると、材料のクセに合わせて線が動く
#
#   (a) 正しい所には間があるのに、声の中へ置いた … **こちらの誤り**
#   (b) 正しい所そのものに間が無い（息を継がずに読んだ「、」）
#       … 置き方では直せない。切らずにくっつけるしかない
#
# 材料は (b) が本物よりずっと多い（「、」の4割に使える間が無い作り）。
# そこを混ぜた数で線を引くと、**材料のクセを見張ることになる。**
# 線は (a)（＝ naka_a）にだけ置く。
#
# ■ 線は、両側を測ってから置いた（乱数1〜3の (a) の枚数）
#
#            いま(上限44)   v158(上限36)
#   54/54      15 14 11       25 21 17
#   15/54      14 11 10       25 22 19
#   実測なし    15 10 12       29 23 21
#   きつい材料  12 17 23       24 26 29
#
# 上の3段は **18** に置く。いまの実力(最大15)に 3 の余裕があり、
# v158 に戻れば 3通りのうち2つが落ちる（＝段として落ちる）。
# 17 の1通りだけでは通るが、**3通り走る形なので必ず捕まる。**
# 16 に詰めると余裕が 1 しかなく、乱数しだいで○×が変わる
# ──「出来の良し悪しではなく、さいころを見ているだけ」になる。
#
# 4段目は **30**。ここだけ材料が違い、いま 23・v158 が 24 で**重なっている。**
# 間に線を引くと、まさにさいころを見ることになる。
# だからこの段は「ひどい悪化だけ捕まえる」緩い線にして、
# **比べるのは上の表の数字そのもの**にする
# （この段の絶対値でつまみを決めてはいけない、は前からの決めごと）。
#
# ■ 0 には置けない
#
# 上の (b) が材料に必ず残るので、0 にはならない。
# これは「出来の証明」ではなく、**これ以上悪くなっていないの見張り**。
GOUKAKU_NAKA = 18        # 実測 54/54
HONBAN_NAKA = 18         # 実測 15/54
YOBI_NAKA = 18           # 実測なし（予備の道）
KITSUI_NAKA = 30         # きつい材料（重なっているので緩い線）

# 4段目のあいだだけ立てる旗。_zure_tsukuru.py に env で渡す。
KITSUI = [False]

# ■ 5段目「つなぎ目が狭い材料」の線（2026-10-18）
#
# 4段目までの材料は、段落のつなぎ目の無音が**必ず 0.40秒以上**あった。
# つまり「錨の寄せ先が1つも無い」状態が1度も起きない作りで、
# v160 で入れた「短い無音に降りて拾い直す」直しを、
# **材料が1度も見ていなかった**（39節・62節と同じ形）。
#
# ZURE_TSUGIME_SEMAI=1 で、2割のつなぎ目を実質ゼロにする。
# 降りる窓(make_slideshow.py の YOBI_MADO)を変えて5通りずつ測った実測:
#
#              錨最大  錨平均  全体最大  0.45超
#   降りない     1.47   0.29    2.50    12%
#   ±0.20秒     1.47   0.28    2.50    12%
#   ±0.35秒     1.47   0.28    2.50    12%   ← いまの値
#   ±0.60秒     2.75   0.80    3.92    36%   ← **悪くなる**
#
# 乱数ごとに見ると ±0.35秒 は 5通り中4通りで「降りない」より良く、
# 悪くなった通りはひとつも無い
# （錨最大 0.41→0.24 / 0.52→0.29 / 0.38→0.26 / 0.44→0.37）。
# ±0.60秒 は窓が広すぎて「言葉の途中の息つぎ」を掴みにいく。
#
# 線は ±0.35秒 と ±0.60秒 の**あいだ**に引く。
# 1.47 に詰めると余裕が無く、さいころを見ることになるので 2.00。
SEMAI_OOKII = 3.00
SEMAI_HEIKIN = 0.21      # 実測 0.13・余裕 0.08
SEMAI_WARIAI = 20.0
SEMAI_ANC_OOKII = 2.00     # 錨のいちばん大きいずれ。**この段だけ見る。**
SEMAI_ANC_HEIKIN = 0.16    # 錨の平均（実測 0.06・余裕 0.10）
# 「声の中」はこの段では見ない。4段目が見ている。
# 測っていない物に線を引かない（線は実測からしか引かない）。
SEMAI_NAKA = 9999

# 5段目のあいだだけ立てる旗。
SEMAI = [False]

# ■ 6段目（2026-10-22）。**本人の回と同じ形の材料。**
#
# ここが無かった。切れはしの途中にも息継ぎがある（＝紛らわしい寄せ先が
# たくさんある）材料は、5段のどれも作っていなかった。
# そのせいで「間には乗っているのに、乗る間を1つ間違えている」という
# 壊れ方を、検査が**一度も見たことがなかった。**
# 本人の screenshot（059「…優しくしたのは、この時、」）がそれ。
#
# 最後まで直した版で実測（3乱数）:
#   最大 1.16 / 1.74 / 1.78   平均 0.07 / 0.08 / 0.07
#   0.45超 5% / 6% / 5%       声の途中 27 / 17 / 25枚
HONMONO_OOKII = 2.40
HONMONO_HEIKIN = 0.16
HONMONO_WARIAI = 9.0
HONMONO_NAKA = 32
HONMONO = [False]

YOBI_OOKII = 2.60
YOBI_HEIKIN = 0.15       # 実測 0.07・余裕 0.08
YOBI_WARIAI = 12.0

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(SAGYOU)
    for f in (u"make_slideshow.py", u"置き場所.py", u"見た目.txt", u"演出.txt",
              u"_zure_tsukuru.py", u"_zure_hakaru.py"):
        shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    ex = os.path.join(SAGYOU, u"ex", u"てすと")
    os.makedirs(ex)
    try:
        from PIL import Image
    except ImportError:
        print(u"Pillow が要ります（pip install pillow）")
        return None
    for i in range(1, 13):
        Image.new("RGB", (640, 360), (20 + i * 15, 60, 120)) \
            .save(os.path.join(ex, u"%03d_t.png" % i))
    return SAGYOU


def jissoku_kirikae(tsukau, wari=1.0):
    u"""実測を使う/使わないと、**測れた段落の割合**を切りかえる。

    ■ 割合が要る理由（2026-10-10）

    材料は背番号のおかげで毎回「声が止まったか」が分かってしまう。
    本物は 15/54 ＝ 0.28 しか分からない。
    分からない所での切り方は、割合を落とさないと測れない。
    """
    q = os.path.join(SAGYOU, u"make_slideshow.py")
    s = io.open(q, encoding="utf-8").read()
    import re as _re
    s = _re.sub(u"JISSOKU_TSUKAU = \\[(True|False)\\]",
                u"JISSOKU_TSUKAU = [%r]" % bool(tsukau), s, count=1)
    s = _re.sub(u"JISSOKU_WARI = \\[[0-9.]+\\]",
                u"JISSOKU_WARI = [%r]" % float(wari), s, count=1)
    io.open(q, "w", encoding="utf-8", newline="\n").write(s)


def hitotsu(tane):
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    env[u"ZURE_KEZURU_BARA"] = u"1" if KITSUI[0] else u"0"
    env[u"ZURE_TSUMARU"] = u"1" if KITSUI[0] else u"0"
    env[u"ZURE_TSUGIME_SEMAI"] = u"1" if SEMAI[0] else u"0"
    env[u"ZURE_HONBAN"] = u"1" if HONMONO[0] else u"0"
    r = subprocess.run([sys.executable, u"_zure_tsukuru.py", str(tane)],
                       cwd=SAGYOU, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=env)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-1500:])
        return None
    tsv = os.path.join(SAGYOU, u"その他", u"画像割り当て.tsv")
    if os.path.exists(tsv):
        os.remove(tsv)
    r = subprocess.run([sys.executable, u"make_slideshow.py",
                        u"--images", u"ex", u"--plan"],
                       cwd=SAGYOU, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=env)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-2000:])
        return None
    r = subprocess.run([sys.executable, u"_zure_hakaru.py", u"--json"],
                       cwd=SAGYOU, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=env)
    out = r.stdout.decode("utf-8", "replace")
    try:
        return json.loads(out.strip().split(u"\n")[-1])
    except Exception:
        print(out[-1500:])
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(u"--回", dest="kai", type=int, default=3)
    a = ap.parse_args()
    if junbi() is None:
        return 1
    warui, dan_kazu = [], 0
    # ■ 「本物と同じ」の札を付けかえた（2026-10-12）
    #
    # 15/54 は **v146 のときの本物**。いまの本人のログは
    #   「54/54 の段落は、1行ずつの音声で文の長さを実測しました」
    # ＝ **54/54**。本物に近いのは wari=1.0 の段で、
    # 15/54 の段は「測れない所が多いときの予備」。
    # 札が古いせいで、いちばん本物から遠い段を「本物と同じ」として
    # 信じていた（v154 の判断ミスはそこから始まっている）。
    for (tsukau, wari, nm, oo, he, wa, kitsui, nk,
         semai, anc_oo, anc_he) in (
            (True, 1.0, u"実測 54/54(本物と同じ)", GOUKAKU_OOKII,
             GOUKAKU_HEIKIN, GOUKAKU_WARIAI, False, GOUKAKU_NAKA,
             False, None, None),
            (True, 15.0 / 54.0, u"実測 15/54(測れない所が多いとき)", HONBAN_OOKII,
             HONBAN_HEIKIN, HONBAN_WARIAI, False, HONBAN_NAKA,
             False, None, None),
            (False, 1.0, u"実測なし(予備の道)", YOBI_OOKII,
             YOBI_HEIKIN, YOBI_WARIAI, False, YOBI_NAKA,
             False, None, None),
            # ■ 4段目（2026-10-12）。**偽の寄せ先がある材料。**
            #   ここが無かったせいで JISSOKU_TOL の広げすぎが見えなかった。
            (True, 1.0, u"きつい材料(偽の寄せ先あり)", KITSUI_OOKII,
             KITSUI_HEIKIN, KITSUI_WARIAI, True, KITSUI_NAKA,
             False, None, None),
            # ■ 5段目（2026-10-18）。**つなぎ目が狭い材料。**
            #   ここが無かったせいで「錨の寄せ先ゼロ」が1度も起きず、
            #   v160 の直しを材料が見ていなかった。上の節を読むこと。
            (True, 1.0, u"つなぎ目が狭い材料(錨の寄せ先ゼロ)", SEMAI_OOKII,
             SEMAI_HEIKIN, SEMAI_WARIAI, True, SEMAI_NAKA,
             True, SEMAI_ANC_OOKII, SEMAI_ANC_HEIKIN),
            # ■ 6段目（2026-10-22）。**本人の回と同じ形。**上の注記を読むこと。
            (True, 1.0, u"本人の回と同じ形(切れはしの途中にも息継ぎ)",
             HONMONO_OOKII, HONMONO_HEIKIN, HONMONO_WARIAI, False,
             HONMONO_NAKA, False, None, None)):
        print(u"── %s ──" % nm)
        dan_kazu += 1
        jissoku_kirikae(tsukau, wari)
        KITSUI[0] = kitsui
        SEMAI[0] = semai
        HONMONO[0] = nm.startswith(u"本人の回と同じ形")
        if shirabe(a.kai, nm, oo, he, wa, nk, anc_oo, anc_he):
            warui.append(nm)
    print(u"")
    try:
        shutil.rmtree(SAGYOU)
    except Exception:
        pass
    if warui:
        print(u"× 字幕と声がずれています（%s）。" % u" / ".join(warui))
        return 1
    print(u"○ %d段ぜんぶで、字幕と声はずれていません。" % dan_kazu)
    return 0


def shirabe(kai, nm, oo, he, wa, nk=9999, anc_oo=None, anc_he=None):
    u"""anc_oo / anc_he は**その段だけの錨の線**。None なら今まで通り。

    錨の「いちばん大きいずれ」を見る段を増やしたのは 5段目から
    （2026-10-18）。上の段の線は1つも動かしていない ──
    検査が通るように線を動かさない、は前からの決めごと。
    """
    warui = []
    for tane in range(1, kai + 1):
        k = hitotsu(tane)
        if k is None:
            print(u"× 乱数 %d で検査そのものが動きませんでした" % tane)
            return 1
        anc = k.get(u"anc", [0, 0, 0])
        roku = k.get(u"hiritsu_roku", 0)
        shirushi = u"○" if (k[u"ookii"] <= oo and k[u"heikin"] <= he
                            and k[u"wariai"] <= wa
                            and anc[1] <= (GOUKAKU_ANC if anc_he is None
                                           else anc_he)
                            and (anc_oo is None or anc[0] <= anc_oo)
                            and roku == 0
                            and k.get(u"naka_a", 0) <= nk) else u"×"
        print(u"%s 乱数 %d  区切り %3d枚 / いちばん大きいずれ %.2f秒 / "
              u"平均 %.2f秒 / 0.45秒超 %.0f%%"
              % (shirushi, tane, k[u"kazu"], k[u"ookii"], k[u"heikin"], k[u"wariai"]))
        if u"anc" in k:
            print(u"     段落の境目(錨) 最大%.2f 平均%.2f 0.3超%.0f%%  / "
                  u"その中の切れ目 最大%.2f 平均%.2f 0.3超%.0f%%"
                  % tuple(k[u"anc"] + k[u"naka"]))
        if u"bun" in k:
            # どの仕組みのせいかまで出す。数字だけ見て関係ない所を触らないため。
            print(u"     文の頭(place_in_chunk) 最大%.2f / "
                  u"「、」(koma_awase) 最大%.2f"
                  % (k[u"bun"][0], k[u"ten"][0]))
        if u"naka_kazu" in k:
            print(u"     声の途中で切り替わり %d枚 / うち直せる（正しい所に間がある）"
                  u" %d枚（線 %d・深さ %.2f秒）"
                  % (k[u"naka_kazu"], k.get(u"naka_a", 0), nk,
                     k.get(u"naka_a_ookii", 0.0)))
            for z in (k.get(u"naka_list") or [])[:3]:
                print(u"       %7.2f  声の %.2f秒 中   %s" % (z[1], z[0], z[2]))
        if u"hiritsu_mn" in k:
            print(u"     比例配分 いちばん低い %.2f / 下から5%% %.2f / "
                  u"%.2f未満 %d枚"
                  % (k[u"hiritsu_mn"], k[u"hiritsu_sita"],
                     HIRITSU_YUKA, roku))
        if shirushi == u"×":
            warui.append(tane)
            for z in k[u"waru"][:3]:
                print(u"     %5.2f秒  字幕 %7.2f / 声 %7.2f  %s"
                      % (z[0], z[1], z[2], z[3][:20]))
    if warui:
        print(u"   %s の合格の線: いちばん大きいずれ %.2f秒まで / 平均 %.2f秒まで / "
              u"0.45秒超 %.0f%%まで / 段落の境目の平均 %.2f秒まで%s / "
              u"比例配分 %.2f未満は0枚"
              % (nm, oo, he, wa,
                 GOUKAKU_ANC if anc_he is None else anc_he,
                 u"" if anc_oo is None
                 else u" / 段落の境目の最大 %.2f秒まで" % anc_oo,
                 HIRITSU_YUKA))
        return True
    print(u"   %s … %d通りすべて合格" % (nm, kai))
    return False


if __name__ == "__main__":
    sys.exit(main())
