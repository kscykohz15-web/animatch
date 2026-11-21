# -*- coding: utf-8 -*-
u"""ずれ実測.py を、作った材料で**最後まで走らせる**検査。

    python _実測テスト.py

■ なぜ要るか（2026-10-18・本人のパソコンで2版続けて落ちた）

`ずれ実測.py` は本人に配る道具で、動画のあとに必ず走る。
ところが**検査がこの道具を1度も走らせていなかった。**
そのため、

    v160  mato を4つ組にしたのに1か所を3つで受けていた
    v161  それを直したが、**同じ形の別の行**を見落とした（zure は7つ組）

と、2版続けて本人のパソコンで `ValueError: too many values to unpack`
を出した。どちらも1行で直る種類の壊れ方で、**1回走らせれば捕まった。**

ここでは 音声/merged.wav と 確認用/一覧.txt を作って実際に走らせる。
**わざと 0.45秒 を超えるずれを混ぜる。** そうしないと最後の
「⚠ …ずれている所が N枚」の枝に入らず、v161 で落ちた行を通らない。
（前の2回とも、落ちたのは「ずれがあったときだけ通る行」だった）
"""
from __future__ import print_function
import io
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SAGYOU = os.path.join(HERE, u"_実測テスト")

# (尺, ずらす秒, のばす秒, セリフ)
#   ずらす秒 > 0 … 声がその分あとから始まる（字幕が先に進む）
#   のばす秒 > 0 … 声が字幕の終わりを**その分またぐ**
#                   ＝「字幕が出ているあいだに次の声が始まる」を作る
#   ずらす秒 None … 章カード（merged.wav には入らない）
#
# **3つの枝ぜんぶを通すように作ってある。**
# 通らない枝は、そこが壊れても分からない（v160・v161 がそれだった）。
KOMA = [
    (2.80, 0.00, 0.00, u"老デウスの歩んできた人生が、壮絶すぎた。"),
    (2.00, 0.00, 0.00, u"どうもこんにちは、かさです。"),
    (2.40, 0.90, 0.00, u"ということで今回の動画は、"),       # 大きくずらす
    (3.60, 0.00, 0.00, u"ヒトガミの目的と、今までの助言について考察していきます。"),
    (1.50, None, 0.00, u""),                                  # 章カード
    (2.20, 0.00, 0.00, u"まずヒトガミの目的。"),
    (3.00, 0.70, 0.00, u"これはヒトガミ自身の死を回避することで、"),  # 大きくずらす
    (2.60, 0.00, 0.80, u"その手段として、子供を誕生させないことを目標にしていました。"),
    (1.80, 0.00, 0.00, u"ということなんですね。"),            # ↑ 声が境目をまたぐ
    (2.40, 0.00, 0.00, u"それでは早速みていきます。"),
]


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))
    sys.stdout.flush()


def ff(args):
    r = subprocess.run([u"ffmpeg", u"-hide_banner", u"-loglevel", u"error", u"-y"]
                       + args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        say(r.stdout.decode("utf-8", "replace")[-700:])
        raise SystemExit(u"ffmpeg が失敗しました")


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(os.path.join(SAGYOU, u"音声"))
    os.makedirs(os.path.join(SAGYOU, u"確認用"))

    # ── 確認用/一覧.txt（本物と同じ列・同じ見出し）
    gyou = [u"# 時刻表の作り方: ① 音声＋subtitle.srt(本文一致) ＝ ずれません",
            u"\t".join([u"番号", u"開始", u"尺", u"画像", u"絵の話数",
                        u"台本の話数", u"ちがい", u"セリフ"])]
    t = 0.0
    for i, (du, zure, nobasu, tx) in enumerate(KOMA, 1):
        card = (zure is None)
        img = u"@@card00" if card else u"てすと 第1話/%03d_x.png" % i
        gyou.append(u"\t".join([
            u"%03d" % i, u"%d:%02d" % (int(t) // 60, int(t) % 60),
            u"%.2f" % du, img,
            u"" if card else u"てすと 第1話",
            u"てすと 第1話", u"", tx]))
        t += du
    io.open(os.path.join(SAGYOU, u"確認用", u"一覧.txt"), "w",
            encoding="utf-8-sig", newline="\r\n").write(u"\r\n".join(gyou) + u"\r\n")

    # ── 音声/merged.wav
    #
    # 章カードぶんの無音は merged.wav には**入らない**（動画側で挿す）。
    # だから声の時刻は「カードの尺を抜いた並び」で作る。
    # ずれ実測.py もそこを引き算して比べるので、ここを間違えると
    # 検査のほうが嘘をつく。
    aida, koe = 0.0, []
    for (du, zure, nobasu, tx) in KOMA:
        if zure is None:          # 章カード。merged.wav には無い
            continue
        hajime = aida + (zure or 0.0)
        # のばす>0 のときは、声が字幕の終わりをまたぐ（無音を置かない）
        owari = aida + du + (nobasu or 0.0) - (0.0 if nobasu else 0.25)
        if owari > hajime + 0.3:
            koe.append((hajime, owari))
        aida += du
    zentai = aida + 1.0
    shiki = u"+".join(u"between(t,%.3f,%.3f)" % (a, b) for (a, b) in koe)
    ff([u"-f", u"lavfi", u"-i",
        u"sine=frequency=280:duration=%.2f,"
        u"volume='if(%s,0.5,0)':eval=frame" % (zentai, shiki),
        u"-ar", u"44100", u"-ac", u"1",
        os.path.join(SAGYOU, u"音声", u"merged.wav")])
    return len(koe)


def main():
    if not shutil.which(u"ffmpeg"):
        say(u"… ffmpeg が無いので、この検査はとばします")
        return 0
    kazu = junbi()
    shutil.copy(os.path.join(HERE, u"ずれ実測.py"),
                os.path.join(SAGYOU, u"ずれ実測.py"))
    say(u"材料を作りました: 字幕 %d枚（章カード1枚をふくむ）/ 声 %d本"
        % (len(KOMA), kazu))

    r = subprocess.run([sys.executable, u"ずれ実測.py"], cwd=SAGYOU,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    out = r.stdout.decode("utf-8", "replace")
    warui = []
    if r.returncode != 0:
        say(out[-1800:])
        warui.append(u"ずれ実測.py が最後まで走りません（本人のパソコンで落ちます）")
    else:
        # **ずれのある枝を本当に通ったか**を確かめる。
        # ここを見ないと「落ちなかった」だけで通してしまい、
        # v161 と同じ見落としをくり返す。
        if u"秒を超えてずれている所が" not in out:
            warui.append(u"ずれのある枝を通っていません"
                         u"（材料のずれが小さすぎます。KOMA を見直すこと）")
        for shirushi, nani in ((u"いちばん大きいずれ", u"いちばん大きいずれが出ません"),
                               (u"0.45秒を超えたもの", u"0.45秒超の数が出ません"),
                               (u"先に進む", u"向き（先に進む/居座る）が出ません"),
                               (u"声の途中で切り替わっている所",
                                u"声の途中で切り替わりが出ません")):
            if shirushi not in out:
                warui.append(nani)
        zf = os.path.join(SAGYOU, u"確認用", u"ずれ.txt")
        if not os.path.exists(zf):
            warui.append(u"確認用/ずれ.txt が書かれません")

    for ln in out.split(u"\n"):
        t = ln.rstrip()
        if t and not t.startswith(u"  くわしくは"):
            say(u"   " + t)

    shutil.rmtree(SAGYOU, ignore_errors=True)
    say(u"")
    if warui:
        for x in warui:
            say(u"× " + x)
        return 1
    say(u"○ ずれ実測.py は、ずれのある材料でも最後まで走ります")
    return 0


if __name__ == "__main__":
    sys.exit(main())
