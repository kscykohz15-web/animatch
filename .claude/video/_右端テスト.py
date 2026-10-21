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
