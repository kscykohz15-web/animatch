# -*- coding: utf-8 -*-
u"""切れ目が「間の右端」に乗るかを確かめる（2026-10-21）

■ なぜ要るか

本人に6回「音ズレ駄目」と言われた原因は、**切れ目が間の真ん中に
置かれていた**こと。間そのものは合っていた。

本人の道具(ずれ実測.py)はこう測る。

    moto = 字幕の開始 + LEAD   ← その字幕の声が出るはずの時刻
    c    = 次の声が実際に出た時刻（無音の終わり）

だから切れ目は「間の終わり − LEAD」に無いとずれ 0 にならない。
間の真ん中に置くと、右端までの距離がそのままずれになり、
**必ず「字幕と絵が先に進む」側に出る**（本人の53枚中52枚がそれ）。

ここでは ffmpeg を使わず、手で作った間と切れ目で
ma_no_migibata の決まりだけを確かめる。速いので毎回走らせられる。

■ もう1つ見張るもの ─ こちらの物差しの床

`_zure_hakaru.py` は LEAD を足さずに引き算していたので、
**完璧に合っていても 0.12秒**と出た。その 0.15秒を見て
「もう合っています」と6回申し上げた。LEAD を足す形に戻っているかも見る。
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


def main():
    os.environ.pop(u"MS_MIGIBATA", None)
    import importlib
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        u"ms", os.path.join(HERE, u"make_slideshow.py"))
    ms = importlib.util.module_from_spec(spec)
    sys.modules[u"ms"] = ms
    spec.loader.exec_module(ms)

    L = ms.LEAD
    iu(abs(L - 0.12) < 1e-9, u"LEAD は 0.12秒（本人の道具と同じ）")

    # ── ① 間の真ん中に置かれた切れ目が、右端へ動くか
    #   声  0.0-2.0 / 間 2.0-2.8 / 声 2.8-5.0 / 間 5.0-5.3 / 声 5.3-7.0
    sils = [(2.0, 2.8), (5.0, 5.3)]
    slots = [(0.0, 2.4, u"あ"), (2.4, 2.75, u"い"), (5.15, 1.85, u"う")]
    out, ugoita, ichiban = ms.ma_no_migibata(slots, sils)
    iu(ugoita == 2, u"真ん中の切れ目 2つが動いた（動いた数 %d）" % ugoita)
    iu(abs(out[1][0] - (2.8 - L)) < 1e-6,
       u"1つめの切れ目が 間の終わり−LEAD = %.2f に乗った（いま %.4f）"
       % (2.8 - L, out[1][0]))
    iu(abs(out[2][0] - (5.3 - L)) < 1e-6,
       u"2つめの切れ目が 間の終わり−LEAD = %.2f に乗った（いま %.4f）"
       % (5.3 - L, out[2][0]))
    iu(all(out[i][0] < out[i + 1][0] for i in range(len(out) - 1)),
       u"順番は守られている")
    iu(abs(sum(d for (_s, d, _t) in out)
           - sum(d for (_s, d, _t) in slots)) < 1e-6,
       u"ぜんぶの尺の合計は変わらない")

    # ── ② もう右端にあるものは動かさない
    slots2 = [(0.0, 2.68 - 0.0, u"あ"), (2.68, 5.18 - 2.68, u"い"),
              (5.18, 1.82, u"う")]
    out2, ug2, _i2 = ms.ma_no_migibata(slots2, sils)
    iu(ug2 == 0, u"すでに右端にある切れ目は動かさない（動いた数 %d）" % ug2)

    # ── ③ **声の中にある切れ目は動かさない**（またがせない）
    #   ここを動かすと、3回失敗した「遠くの間に吸い寄せられる」に戻る。
    slots3 = [(0.0, 3.5, u"あ"), (3.5, 1.65, u"い"), (5.15, 1.85, u"う")]
    out3, ug3, _i3 = ms.ma_no_migibata(slots3, sils)
    iu(abs(out3[1][0] - 3.5) < 1e-9,
       u"声の中（3.50秒）の切れ目は動かさない（いま %.4f）" % out3[1][0])
    iu(ug3 == 1, u"動いたのは間の中の1つだけ（動いた数 %d）" % ug3)

    # ── ③-2 **前の声の端にわずかにかかっている切れ目も動かす**
    #
    # 本人の第6回で 0.45秒を超えて残った4か所のうち3か所がこれだった。
    # 字幕の開始は無音の手前（前の声の中）だが、
    # **開始+LEAD は無音の中**。本人の道具はそこを見る。
    #   声 0.0-2.0 / 間 2.0-2.8 / 声 2.8-…
    #   切れ目 1.95 … 開始は声の中だが 1.95+0.12=2.07 は間の中
    slots32 = [(0.0, 1.95, u"あ"), (1.95, 3.20, u"い"), (5.15, 1.85, u"う")]
    out32, ug32, _i32 = ms.ma_no_migibata(slots32, sils)
    iu(abs(out32[1][0] - (2.8 - L)) < 1e-6,
       u"開始が間の手前でも、開始+LEAD が間の中なら右端へ動かす"
       u"（%.2f を待つところ、いま %.4f）" % (2.8 - L, out32[1][0]))
    iu(out32[1][0] - 1.95 <= (2.8 - 2.0) + 1e-6,
       u"動く幅は、その間の長さまでで止まる（%.4f秒 動いた）"
       % (out32[1][0] - 1.95))

    # ── ④ 間が LEAD より短いときは、間からはみ出させない
    sils4 = [(2.0, 2.08)]
    slots4 = [(0.0, 2.02, u"あ"), (2.02, 3.0, u"い")]
    out4, _u4, _i4 = ms.ma_no_migibata(slots4, sils4)
    iu(2.0 - 0.001 <= out4[1][0] <= 2.08 + 0.001,
       u"LEAD より短い間でも、間の中に収まる（いま %.4f）" % out4[1][0])

    # ── ⑤ 旗で切れる（A/B を測れる）
    os.environ[u"MS_MIGIBATA"] = u"0"
    ms.MIGIBATA[0] = False
    out5, ug5, _i5 = ms.ma_no_migibata(slots, sils)
    iu(ug5 == 0 and out5 is slots, u"MS_MIGIBATA=0 で切れる")
    ms.MIGIBATA[0] = True

    # ── ⑤-2 声の途中の切れ目を、別の「、」へずらせるか
    #
    # 本人の第6回 5:23 と同じ形。つなぐと68文字で2行に入らないが、
    # 切り口を1つうしろの「、」へずらせば 30+38文字で両方入る。
    hidari = u"つまり二つ目の助言は、「路地裏を探せ」と言いながら、"
    migi = u"その実、ロキシーのいる方向からルーデウスを引き剥がす一手だったということになります。"
    # 声 0.0-3.0（「その実、」まで）/ 間 3.0-3.5 / 声 3.5-8.0
    sils7 = [(3.0, 3.5)]
    slots7 = [(0.0, 2.5, hidari), (2.5, 5.5, migi)]
    out7, zu7, _i7 = ms.ten_wo_zurasu(slots7, sils7, 44, mijika=6.0)
    iu(zu7 == 1, u"声の途中の切れ目を1か所ずらした（ずらした数 %d）" % zu7)
    if zu7:
        iu(abs(out7[1][0] - (3.5 - L)) < 1e-6,
           u"切れ目が 間の右端 %.2f に乗った（いま %.4f）" % (3.5 - L, out7[1][0]))
        iu(out7[0][2] + out7[1][2] == hidari + migi,
           u"**字幕の文字はひとつも変わっていない**")
        iu(out7[0][2].endswith(u"その実、"),
           u"切り口が次の「、」へ移った（%s）" % out7[0][2][-6:])
        iu(abs(out7[0][0] - 0.0) < 1e-9
           and abs((out7[1][0] + out7[1][1]) - 8.0) < 1e-6,
           u"前後の始まりと終わりは動いていない")
        iu(max(ms.disp_len(out7[0][2]), ms.disp_len(out7[1][2])) <= 44,
           u"両方とも2行の上限に収まっている（%d / %d文字）"
           % (ms.disp_len(out7[0][2]), ms.disp_len(out7[1][2])))

    # ── ⑤-3 入らないときは、ずらさない（3:09 と同じ形）
    h2 = u"と考えますが、よくよく考えてみると、ヒトガミの助言はすべて、"
    m2 = u"ルーデウスとロキシーの再会を邪魔するものであったということが分かりましたので、"
    out8, zu8, _i8 = ms.ten_wo_zurasu([(0.0, 3.5, h2), (3.5, 5.3, m2)],
                                      sils7, 44, mijika=6.0)
    iu(zu8 == 0, u"どこで切っても2行に入らないときは、ずらさない（ずらした数 %d）" % zu8)

    # ── ⑤-4 文をまたぐ切れ目はずらさない
    out9, zu9, _i9 = ms.ten_wo_zurasu(
        [(0.0, 2.5, u"これはひとつめの文です。"), (2.5, 5.5, migi)],
        sils7, 44, mijika=6.0)
    iu(zu9 == 0, u"「。」で終わっている所はずらさない（ずらした数 %d）" % zu9)

    # ── ⑥ こちらの物差しが LEAD を足しているか
    h = io.open(os.path.join(HERE, u"_zure_hakaru.py"), encoding="utf-8").read()
    iu(u"(st + _LEAD) - honto" in h,
       u"_zure_hakaru.py は LEAD を足して比べている（床 0.12秒が無い）")

    print(u"")
    if warui:
        print(u"× %d件 落ちました" % len(warui))
        return 1
    print(u"○ ぜんぶ通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
