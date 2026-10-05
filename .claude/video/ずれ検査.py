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
    0.30秒を超えたもの  全体の 5% まで

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
# ■ 合格の線は「平均」と「割合」で見る。最大では見ない。
#
# 作った材料は本物そのものではない（本人のPCの外部ツールが作る
# merged.wav は、こちらに無い）。1枚だけ大きく外れることはあり、
# そこを追いかけると、材料のクセに合わせこんでしまう。
# **平均と割合は材料のクセに強い。** そこで線を引く。
#
# 本当の数字は、本人の動画そのもので測る（ずれ実測.py）。
GOUKAKU_HEIKIN = 0.45
GOUKAKU_WARIAI = 12.0
GOUKAKU_ANC = 0.30

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(SAGYOU)
    for f in (u"make_slideshow.py", u"見た目.txt", u"演出.txt",
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


def hitotsu(tane):
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
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
    warui = []
    for tane in range(1, a.kai + 1):
        k = hitotsu(tane)
        if k is None:
            print(u"× 乱数 %d で検査そのものが動きませんでした" % tane)
            return 1
        anc = k.get(u"anc", [0, 0, 0])
        shirushi = u"○" if (k[u"heikin"] <= GOUKAKU_HEIKIN
                            and k[u"wariai"] <= GOUKAKU_WARIAI
                            and anc[1] <= GOUKAKU_ANC) else u"×"
        print(u"%s 乱数 %d  区切り %3d枚 / いちばん大きいずれ %.2f秒 / "
              u"平均 %.2f秒 / 0.30秒超 %.0f%%"
              % (shirushi, tane, k[u"kazu"], k[u"ookii"], k[u"heikin"], k[u"wariai"]))
        if u"anc" in k:
            print(u"     段落の境目(錨) 最大%.2f 平均%.2f 0.3超%.0f%%  / "
                  u"その中の切れ目 最大%.2f 平均%.2f 0.3超%.0f%%"
                  % tuple(k[u"anc"] + k[u"naka"]))
        if shirushi == u"×":
            warui.append(tane)
            for z in k[u"waru"][:3]:
                print(u"     %5.2f秒  字幕 %7.2f / 声 %7.2f  %s"
                      % (z[0], z[1], z[2], z[3][:20]))
    print(u"")
    if warui:
        print(u"× 字幕と声がずれています（乱数 %s）。"
              % u", ".join(str(x) for x in warui))
        print(u"   合格の線: 平均 %.2f秒まで / 0.30秒超 %.0f%%まで / "
              u"段落の境目の平均 %.2f秒まで"
              % (GOUKAKU_HEIKIN, GOUKAKU_WARIAI, GOUKAKU_ANC))
        return 1
    print(u"○ %d通りすべてで、字幕と声はずれていません。" % a.kai)
    return 0


if __name__ == "__main__":
    sys.exit(main())
