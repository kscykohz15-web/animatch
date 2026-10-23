# -*- coding: utf-8 -*-
u"""閉じた検査 ─ **本人の ずれ実測.py そのもので**、作った材料を測る

■ なぜこれを作ったのか（2026-10-21・本人に6回目の「駄目」を言われて）

これまでの検査（ずれ検査.py）は、こちらが書いた `_zure_hakaru.py` で測って
いた。正解.json と突き合わせる作りなので、**段落の境目が合っているか**は
よく分かる。けれど本人が見ている数字は

    python ずれ実測.py

が出すもので、こちらはそれを**一度も材料に当てたことがなかった。**
だから「こちらの物差しでは直った」ものを6回出して、6回とも
「音ズレ駄目」と言われた。物差しが違っていた。

ここでは本人の ずれ実測.py を**1文字も変えずに**使う。
材料を作り、--plan で割り当てを出し、割り当て表から 一覧.txt を作り、
本人の道具に測らせる。出る数字は本人の画面に出るものと同じ種類。

■ 一覧.txt を割り当て表から作る理由

本物の 一覧.txt は mp4 を作りきったあとに書かれる。材料で毎回 mp4 を
焼くと何分もかかって、回して直すことができない。
割り当て表(その他/画像割り当て.tsv)には 尺 がそのまま入っているので、
そこから同じ形の表を組み立てれば、測るのに足りる。

使い方:
    python _閉じ検査.py              … 乱数 1〜4 で測る
    python _閉じ検査.py --tane 2     … 1つだけ
    python _閉じ検査.py --nokosu     … 作業フォルダを消さない
"""
from __future__ import print_function
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SAGYOU = os.path.join(HERE, os.environ.get(u"TOJI_BASHO", u"_閉じ検査"))
TANE = [1, 2, 3, 4]

# 合格の線。**本人の回(第6回)で出ている数字を超えないこと**が最低条件。
#   本人 v164: 最大 0.80 / 平均 0.15 / 0.45超 6枚 / 声の途中 4枚 (192枚)
# 材料は「、」の27%で息を継がない作りなので、本物より苦しい。
# だから線は本物よりゆるく置き、**前の版より悪くなったら落ちる**ようにする。
GOUKAKU_OOKII = 4.50
GOUKAKU_HEIKIN = 0.33
GOUKAKU_WARIAI = 9.0        # 0.45秒超の割合(%)
GOUKAKU_NAKA = 8.0          # 声の途中で切り替わる割合(%)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def junbi():
    u"""作業フォルダを作り、道具と材料用の絵をそろえる。"""
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(SAGYOU)
    for f in (u"make_slideshow.py", u"置き場所.py", u"見た目.txt", u"演出.txt",
              u"_zure_tsukuru.py", u"_zure_hakaru.py", u"ずれ実測.py"):
        p = os.path.join(HERE, f)
        if os.path.exists(p):
            shutil.copy(p, os.path.join(SAGYOU, f))
        elif f in (u"make_slideshow.py", u"_zure_tsukuru.py", u"ずれ実測.py"):
            print(u"× %s が見つかりません。" % f)
            return None
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


ATAMA = u"番号\t開始\t尺\t画像\t絵の話数\t台本の話数\tちがい\tセリフ"


def ichiran_tsukuru(folder):
    u"""割り当て表から 確認用/一覧.txt を組み立てる（本物と同じ列の並び）。

    本物の列: No 開始 尺 mm:ss 画像 セリフ 絵の番号
    ずれ実測.py は見出しの行から列を引くので、名前だけ合っていればよい。
    """
    src = os.path.join(folder, u"その他", u"画像割り当て.tsv")
    if not os.path.exists(src):
        return 0
    dst_d = os.path.join(folder, u"確認用")
    if not os.path.isdir(dst_d):
        os.makedirs(dst_d)
    out, n = [ATAMA], 0
    for ln in io.open(src, encoding="utf-8-sig", errors="replace").read() \
            .replace(u"\r\n", u"\n").split(u"\n"):
        if not ln.strip() or ln.startswith(u"#"):
            continue
        c = ln.split(u"\t")
        if c[0].strip() in (u"No", u"番号"):
            continue
        if len(c) < 6:
            continue
        try:
            no, st, du = int(c[0]), float(c[1]), float(c[2])
        except ValueError:
            continue
        n += 1
        out.append(u"%03d\t%d:%02d\t%.2f\t%s\t\t\t\t%s"
                   % (no, int(st // 60), int(st % 60), du,
                      c[4].strip(), c[5].strip().replace(u"\t", u" ")))
    io.open(os.path.join(dst_d, u"一覧.txt"), "w",
            encoding="utf-8-sig", newline="").write(u"\r\n".join(out) + u"\r\n")
    return n


KAZU = [
    (u"ookii", re.compile(u"いちばん大きいずれ\s*:\s*([0-9.]+)")),
    (u"heikin", re.compile(u"平均のずれ\s*:\s*([0-9.]+)")),
]


def yomu(out):
    u"""ずれ実測.py の画面を読んで、数字だけ取り出す。"""
    d = {}
    for (k, pat) in KAZU:
        m = pat.search(out)
        if m:
            d[k] = float(m.group(1))
    m = re.search(u"秒を超えたもの\s*:\s*(\d+)枚\s*\((\d+)%\)", out)
    if m:
        d[u"koe"] = int(m.group(1))
        d[u"koe_wari"] = float(m.group(2))
    m = re.search(u"声の途中で切り替わっている所\s*:\s*(\d+)枚\s*/\s*(\d+)枚\s*\((\d+)%\)", out)
    if m:
        d[u"naka"] = int(m.group(1))
        d[u"mai"] = int(m.group(2))
        d[u"naka_wari"] = float(m.group(3))
    elif u"切り替わりはすべて" in out:
        d[u"naka"], d[u"naka_wari"] = 0, 0.0
    m = re.search(u"比べた字幕\s*:\s*(\d+)枚", out)
    if m:
        d[u"mai"] = int(m.group(1))
    return d


def hitotsu(tane, nokosu=False, honban=True):
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    # 本人の回と同じ形（突き合わせが通る材料）か、きつい形か。
    env[u"ZURE_HONBAN"] = u"1" if honban else u"0"
    env[u"ZURE_KEZURU_BARA"] = u"0" if honban else u"1"
    env[u"ZURE_TSUMARU"] = u"0" if honban else u"1"
    env[u"ZURE_TSUGIME_SEMAI"] = u"0" if honban else u"1"
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
    if not ichiran_tsukuru(SAGYOU):
        print(u"× 割り当て表から 一覧.txt を作れませんでした。")
        return None
    r = subprocess.run([sys.executable, u"ずれ実測.py"],
                       cwd=SAGYOU, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=env)
    out = r.stdout.decode("utf-8", "replace")
    if r.returncode != 0:
        print(out[-2000:])
        return None
    d = yomu(out)
    d[u"gamen"] = out
    if nokosu:
        io.open(os.path.join(SAGYOU, u"ずれ_%d.txt" % tane), "w",
                encoding="utf-8").write(out)
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tane", type=int, action="append")
    ap.add_argument("--nokosu", action="store_true")
    ap.add_argument("--kuwashiku", action="store_true", help=u"画面もそのまま出す")
    a = ap.parse_args()
    tane = a.tane or TANE
    if junbi() is None:
        return 1
    print(u"■ 本人の ずれ実測.py で、作った材料を測ります")
    print(u"   （こちらの物差しではなく、本人が見る数字です）")
    print(u"")
    print(u"乱数  字幕  最大ずれ   平均   0.45超      声の途中")
    kekka, ochita = [], []
    for t in tane:
        d = hitotsu(t, nokosu=a.nokosu or a.kuwashiku)
        if d is None:
            print(u"%4d  × 測れませんでした" % t)
            ochita.append(t)
            continue
        kekka.append((t, d))
        print(u"%4d  %4d  %6.2f秒  %5.2f秒  %3d枚(%4.1f%%)  %3d枚(%4.1f%%)"
              % (t, d.get(u"mai", 0), d.get(u"ookii", -1), d.get(u"heikin", -1),
                 d.get(u"koe", -1), d.get(u"koe_wari", -1),
                 d.get(u"naka", -1), d.get(u"naka_wari", -1)))
        if a.kuwashiku:
            print(d[u"gamen"])
    if not kekka:
        return 1
    print(u"")
    oo = max(d.get(u"ookii", 99) for (_t, d) in kekka)
    he = sum(d.get(u"heikin", 9) for (_t, d) in kekka) / len(kekka)
    wa = max(d.get(u"koe_wari", 99) for (_t, d) in kekka)
    nk = max(d.get(u"naka_wari", 99) for (_t, d) in kekka)
    print(u"いちばん悪い乱数で  最大 %.2f秒 / 平均 %.2f秒 / 0.45超 %.1f%% / 声の途中 %.1f%%"
          % (oo, he, wa, nk))
    warui = []
    if oo > GOUKAKU_OOKII:
        warui.append(u"最大ずれ %.2f秒 > %.2f秒" % (oo, GOUKAKU_OOKII))
    if he > GOUKAKU_HEIKIN:
        warui.append(u"平均 %.2f秒 > %.2f秒" % (he, GOUKAKU_HEIKIN))
    if wa > GOUKAKU_WARIAI:
        warui.append(u"0.45超 %.1f%% > %.1f%%" % (wa, GOUKAKU_WARIAI))
    if nk > GOUKAKU_NAKA:
        warui.append(u"声の途中 %.1f%% > %.1f%%" % (nk, GOUKAKU_NAKA))
    if ochita:
        warui.append(u"測れなかった乱数 %s" % ochita)
    if warui:
        print(u"")
        print(u"× 落ちました: " + u" / ".join(warui))
        return 1
    print(u"○ 通りました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
