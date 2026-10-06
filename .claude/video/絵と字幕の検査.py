# -*- coding: utf-8 -*-
u"""絵と字幕の検査 ─ 絵の切り替わりと字幕の切り替わりが同じコマか

■ なぜ要るか（2026-10-06）

本人：「字幕と音声はあっているが、**字幕の切り替わりと画像の切り替わりが
ずれている**」。推測で直すのをやめ、**出来た動画のコマを数えて**確かめる。

  ① 1枚ずつ色の違う絵で短い動画を作る
  ② 1コマずつ色を調べ、絵が何コマ目で変わったかを出す
  ③ 割り当て表から計算した「変わるはずのコマ」と突き合わせる
  ④ 焼き込んだ字幕(burn.ass)の時刻とも突き合わせる

章カードありと無しの両方で見る。カードは尺を 1.5秒 ずらすので、
そこがいちばん狂いやすい。

合格の線: 絵のずれ 0コマ / 字幕と絵のずれ 0.02秒まで（ASSは1/100秒まで）
"""
from __future__ import print_function
import io
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SAGYOU = os.path.join(HERE, u"_絵と字幕")
FPS = 30.0
IRO = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255),
       (0, 255, 255), (255, 128, 0), (128, 0, 255), (0, 128, 128),
       (200, 200, 200), (30, 30, 30), (120, 60, 20), (60, 120, 200),
       (200, 60, 120), (20, 200, 100)]

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def junbi(shou):
    import random
    import math
    import wave
    import struct
    from PIL import Image
    random.seed(5)
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(os.path.join(SAGYOU, u"その他"))
    os.makedirs(os.path.join(SAGYOU, u"ex", u"色"))
    for f in (u"make_slideshow.py", u"見た目.txt", u"演出.txt"):
        shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    N, SR = 30, 44100
    for i in range(1, N + 1):
        Image.new("RGB", (1920, 1080), IRO[(i * 7) % len(IRO)]) \
            .save(os.path.join(SAGYOU, u"ex", u"色", u"%03d_c.png" % i))
    du = [round(random.uniform(0.7, 3.4), 2) for _ in range(N)]
    g, t = [], 0.0
    for i, d in enumerate(du, 1):
        g.append(u"%d\t%.2f\t%.2f\t0:00\t色/%03d_c.png\tこれは%d番の字幕です。"
                 % (i, t, d, i, i))
        t += d
    io.open(os.path.join(SAGYOU, u"その他", u"画像割り当て.tsv"), "w",
            encoding="utf-8-sig", newline="").write(
        u"\r\n".join([u"# format: 3", u"No\t開始\t尺\tmm:ss\t画像\tセリフ"] + g)
        + u"\r\n")
    d2 = []
    for x in du:
        k, on = int(x * SR), int(min(x * 0.6, 0.5) * SR)
        for j in range(k):
            d2.append(int(12000 * math.sin(2 * math.pi * 440 * j / SR))
                      if j < on else 0)
    w = wave.open(os.path.join(SAGYOU, u"merged.wav"), "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(struct.pack("<%dh" % len(d2), *d2)); w.close()
    io.open(os.path.join(SAGYOU, u"台本_字幕用.txt"), "w", encoding="utf-8") \
        .write(u"\n".join(u"これは%d番の字幕です。" % i for i in range(1, N + 1)) + u"\n")
    if shou:
        gy = [u"引用\t©てすと"]
        for k, n in ((5, 1), (12, 2), (19, 3), (25, 4)):
            gy.append(u"章\tこれは%d番の字幕です\t第%d章\t" % (k, n))
        io.open(os.path.join(SAGYOU, u"画面表示.txt"), "w",
                encoding="utf-8-sig", newline="\r\n").write(u"\r\n".join(gy) + u"\r\n")


def iro_no_kawarime(mp4):
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", mp4,
         # **画面全体の平均**で見る。一部だけ見ると、章カードを見落とす
         # （カードは左半分が元の絵なので、そこだけ見ると色が変わらない）。
         "-vf", "scale=1:1", "-f", "rawvideo",
         "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE).stdout
    n = len(out) // 3
    iro = [tuple(out[i * 3:i * 3 + 3]) for i in range(n)]

    def sa(a, b):
        return sum(abs(x - y) for x, y in zip(a, b))
    # しきい値は 8。**高すぎると章カードを見落とす**
    #（カードは左半分が元の絵なので、画面全体の平均でも差が小さい）。
    kaw = [i for i in range(1, n) if sa(iro[i], iro[i - 1]) > 8]
    matome = []
    for k in kaw:
        if matome and k - matome[-1][-1] <= 8:
            matome[-1].append(k)
        else:
            matome.append([k])
    return n, [m[0] for m in matome]


def hitotsu(shou):
    junbi(shou)
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run([sys.executable, u"make_slideshow.py", u"--images", u"ex",
                        u"--render"], cwd=SAGYOU, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=env)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-1500:])
        return None
    mp4 = os.path.join(SAGYOU, u"動画", u"完成.mp4")
    if not os.path.exists(mp4):
        print(u"× 動画ができませんでした")
        return None
    koma, kawari = iro_no_kawarime(mp4)

    # 変わるはずのコマ（一覧.txt の尺を足していく。カードも入っている）
    hashira, du = {}, []
    ich = os.path.join(SAGYOU, u"確認用", u"一覧.txt")
    for line in io.open(ich, encoding="utf-8-sig", errors="replace").read() \
            .replace(u"\r\n", u"\n").split(u"\n"):
        if not line.strip() or line.startswith(u"#"):
            continue
        c = line.split(u"\t")
        if c[0].strip() == u"番号":
            for i, nm in enumerate(c):
                hashira[nm.strip()] = i
            continue
        if len(c) < 5:
            continue
        try:
            du.append((float(c[2]), c[hashira.get(u"画像", 3)].strip(),
                       c[hashira.get(u"セリフ", len(c) - 1)].strip()))
        except ValueError:
            continue
    # ■ **コマ単位で積み上げる**（2026-10-06）
    #   一覧.txt の尺は 0.01秒に丸めてあるので、秒のまま足すと
    #   30枚で 1コマぶん ずれる。それを「本当のずれ」と読みちがえた。
    kitai, f = [], 0
    jimaku_kitai = []
    for (d, img, tx) in du:
        if f > 0:
            kitai.append(f)
        if not img.startswith(u"@@") and tx.strip():
            jimaku_kitai.append(f / FPS)
        f += int(round(d * FPS))

    zure = []
    for k in kitai:
        if not kawari:
            break
        zure.append(abs(min(kawari, key=lambda x: abs(x - k)) - k))

    # 焼き込んだ字幕の時刻
    ass = os.path.join(SAGYOU, u"その他", u"_work", u"burn.ass")
    jz = []
    if os.path.exists(ass):
        ev = []
        for line in io.open(ass, encoding="utf-8", errors="replace").read().split(u"\n"):
            if not line.startswith(u"Dialogue: 0,"):
                continue
            c = line.split(u",", 9)
            if len(c) < 10:
                continue
            h, m2, sec = c[1].strip().split(u":")
            ev.append(int(h) * 3600 + int(m2) * 60 + float(sec))
        ev.sort()
        if len(ev) == len(jimaku_kitai):
            jz = [abs(a - b) for a, b in zip(ev, jimaku_kitai)]
    return {u"koma": koma, u"kitai": len(kitai), u"kawari": len(kawari),
            u"e": max(zure) if zure else -1,
            u"j": max(jz) if jz else -1, u"jn": len(jz)}


def main():
    try:
        from PIL import Image  # noqa
    except ImportError:
        print(u"Pillow が要ります（pip install pillow）")
        return 1
    warui = []
    for shou, na in ((False, u"章カードなし"), (True, u"章カード4枚")):
        k = hitotsu(shou)
        if k is None:
            print(u"× %s … 動きませんでした" % na)
            return 1
        ok_e = (k[u"kawari"] == k[u"kitai"] and k[u"e"] == 0)
        ok_j = (k[u"jn"] > 0 and k[u"j"] <= 0.02)
        print(u"%s %s  絵の切り替わり %d/%d か所・ずれ %s / "
              u"字幕と絵のずれ %s（%d枚）"
              % (u"○" if (ok_e and ok_j) else u"×", na,
                 k[u"kawari"], k[u"kitai"],
                 (u"%dコマ" % k[u"e"]) if k[u"e"] >= 0 else u"測れず",
                 (u"%.3f秒" % k[u"j"]) if k[u"j"] >= 0 else u"測れず", k[u"jn"]))
        if not (ok_e and ok_j):
            warui.append(na)
    print(u"")
    if warui:
        print(u"× 絵と字幕が同じコマで切り替わっていません: " + u" / ".join(warui))
        return 1
    print(u"○ 絵と字幕は、同じコマで切り替わっています。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
