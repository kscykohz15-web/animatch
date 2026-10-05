# -*- coding: utf-8 -*-
u"""字幕ずれ検査 ─ 本物と同じ形の材料を作る

ねらい:
  本人のPCでしか起きない「字幕と音声のずれ」を、こちらで再現して測る。
  絵は関係ないので、音声・台本・subtitle.srt だけ本物そっくりに作る。

本物の形（第6回の実測）:
  1行ずつの音声 54個 / 実測 540.81秒 → merged.wav 534.44秒（0.9882倍）
  文 102 → 字幕 180 → 区切り 267枚

本物は「、」で細かく割れて 267枚になる。**そこが肝心**なので、
文の中に「、」を入れ、**読点のかたまり1つ1つに正解の時刻を持たせる**。

  54個の音声 × 2文 × 2〜3かたまり ＝ 約270枚（本物と同じ形）

読む速さは かたまりごとに ±25% ばらつかせる。
文字数の比で割る方法は、ここで必ず外れる。
"""
import io, os, re, struct, wave, random, math, json, shutil

SR = 44100
import sys
random.seed(int(sys.argv[1]) if len(sys.argv)>1 else 20261005)

KANA = u"アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロ"
GO = [u"ヒトガミ", u"ルーデウス", u"ロキシー", u"エリス", u"オルステッド", u"シルフィエット",
      u"老デウス", u"ララ", u"助言", u"運命", u"未来", u"転移", u"結婚", u"子供", u"妊娠",
      u"魔大陸", u"ラノア魔法大学", u"ベガリット", u"ウェンポート", u"路地裏"]


def kotoba(n):
    t = u""
    while len(t) < n:
        t += random.choice(GO) if random.random() < 0.45 else random.choice(KANA)
    return t[:n]


def bun():
    u"""「、」で2〜3つに割れる文を1つ作る。かたまりの並びで返す。"""
    k = random.choice([2, 2, 3, 3, 4])
    out = []
    for i in range(k):
        n = random.choice([5, 7, 9, 11, 14, 17, 20])
        out.append(kotoba(n) + (u"。" if i == k - 1 else u"、"))
    return out


def tone(sec, hz=440.0, vol=0.35):
    u"""声のかわりの音。長さは秒で指定。"""
    k = int(round(sec * SR))
    return [int(32767 * vol * math.sin(2 * math.pi * hz * i / SR)
                * (0.6 + 0.4 * math.sin(2 * math.pi * 3.1 * i / SR)))
            for i in range(k)]


def mu(sec):
    return [0] * int(round(sec * SR))


def kaku(path, data):
    w = wave.open(path, "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(struct.pack("<%dh" % len(data), *data))
    w.close()


def main():
    for d in (u"output", u"確認用", u"その他"):
        if os.path.isdir(d):
            shutil.rmtree(d)
    os.makedirs(u"output")

    PARTS = 54
    bunretsu, dan = [], []      # かたまりの並び / 段落（＝1行ずつの音声）の中身
    for p in range(PARTS):
        dan.append([])
        for _ in range(random.choice([1, 2, 2, 3])):
            for kt in bun():
                dan[-1].append(kt)
                bunretsu.append(kt)

    # 1行ずつの音声を作る。読む速さは 6.46字/秒 を中心に ±25% ばらつかせる。
    # ばらつかせるのが肝心：文字数の比で割る方法は、ここで必ず外れる。
    seikai = []                 # merged.wav での (開始, 終了)
    merged, moto_kei = [], 0.0
    for p, bs in enumerate(dan):
        atama, oshiri = 0.25, 0.35          # VOICEPEAK が付ける前後の無音
        oto = mu(atama)
        naka = []
        for i, t in enumerate(bs):
            hayasa = 6.46 * random.uniform(0.75, 1.25)
            byou = len(t) / hayasa
            naka.append((len(oto) / float(SR), byou))
            oto += tone(byou)
            if i < len(bs) - 1:
                # 「、」のあとは短い息継ぎ、「。」のあとは長めの間。
                # 短いほうは無音の判定(0.22秒)に引っかからない＝合わせ先が無い。
                oto += mu(random.choice([0.06, 0.10, 0.15, 0.20, 0.25])
                          if t.endswith(u"、") else
                          random.choice([0.30, 0.40, 0.55, 0.70, 0.85]))
        oto += mu(oshiri)
        kaku(os.path.join(u"output", u"%03d.wav" % (p + 1)), oto)
        moto_kei += len(oto) / float(SR)

        # merged.wav は前後の無音を削ってつなぐ（本物がそうなっている）
        hajime = len(merged) / float(SR)
        kezuru_a = int(round(atama * SR))
        kezuru_b = int(round(oshiri * SR))
        nakami = oto[kezuru_a:len(oto) - kezuru_b]
        for (st, du) in naka:
            s2 = hajime + (st - atama)
            seikai.append((s2, s2 + du))
        merged += nakami
        if p < PARTS - 1:
            merged += mu(0.12)      # つなぎ目に残る短い間
    kaku(u"merged.wav", merged)

    # subtitle.srt（本文を合わせるためだけに使われる。時刻は雑でよい）
    def mmss(t):
        return u"%02d:%02d:%02d,%03d" % (t // 3600, (t % 3600) // 60, t % 60,
                                         int((t - int(t)) * 1000))
    srt, t0 = [], 0.0
    for i, bs in enumerate(dan):
        d0 = sum(seikai[j][1] - seikai[j][0] for j in range(
            sum(len(x) for x in dan[:i]), sum(len(x) for x in dan[:i + 1])))
        srt.append(u"%d\n%s --> %s\n%s\n" % (i + 1, mmss(t0), mmss(t0 + d0),
                                             u"".join(bs)))
        t0 += d0
    io.open(u"subtitle.srt", "w", encoding="utf-8").write(u"\n".join(srt))

    io.open(u"台本_字幕用.txt", "w", encoding="utf-8").write(
        u"\n".join(u"".join(bs) for bs in dan) + u"\n")
    io.open(u"台本_読み上げ用.txt", "w", encoding="utf-8").write(
        u"\n".join(u"".join(bs) for bs in dan) + u"\n")

    io.open(u"正解.json", "w", encoding="utf-8").write(
        json.dumps({u"bun": bunretsu, u"seikai": seikai,
                    u"moto": moto_kei, u"merged": len(merged) / float(SR)},
                   ensure_ascii=False))
    print(u"文 %d個 / 1行ずつの音声 %d個" % (len(bunretsu), PARTS))
    print(u"実測 %.2f秒 → merged.wav %.2f秒 (%.4f倍)"
          % (moto_kei, len(merged) / float(SR), len(merged) / float(SR) / moto_kei))


if __name__ == "__main__":
    main()
