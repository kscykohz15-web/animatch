# -*- coding: utf-8 -*-
u"""YouTubeの概要欄（説明文）の下書きを作る。

    python 説明文.py

本人の決めごと：**「とくに説明文テンプレを元とし台本作成を行っています」。**
だから説明文は、台本と同じくらい大事な成果物です。

出るもの   確認用/説明文.txt
読むもの   画面表示.txt        … 章の名前と、作品ごとの引用元(5列目)
           確認用/一覧.txt     … 動画を作ったあとにできる。目次の時刻をここから取る
           台本_字幕用.txt     … 各作品の本文を、章ごとに切って下敷きにする

動画を作る前に回しても、目次の時刻が空のまま出ます。
動画を作ったあとにもう一度回すと、時刻が入ります。

形は 紹介の型.txt の「5. 説明文」のとおり。
"""
from __future__ import print_function
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OVERLAY = u"画面表示.txt"
SCRIPT = u"台本_字幕用.txt"
ICHIRAN = os.path.join(u"確認用", u"一覧.txt")
OUT = os.path.join(u"確認用", u"説明文.txt")

# 章の名前の頭に付く通し番号。目次では外す。
MARU = u"①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
# 作品ではない章。目次には出さない。
HAZUSU = (u"はじめに", u"おわりに", u"まとめ")


def say(t):
    try:
        print(t)
    except UnicodeEncodeError:
        print(t.encode("utf-8", "replace").decode("ascii", "replace"))


def yomu(path):
    if not os.path.exists(path):
        return u""
    return io.open(path, encoding="utf-8-sig", errors="replace") \
        .read().replace("\r\n", "\n")


def shou_yomu(path):
    u"""画面表示.txt の章を (キーワード, 名前, 作品フォルダ, 引用元) で返す。"""
    out, kitei = [], u""
    for line in yomu(path).split("\n"):
        if not line.strip() or line.lstrip().startswith(u"#"):
            continue
        c = line.split(u"\t")
        atama = c[0].strip() if c else u""
        if atama in (u"引用", u"credit") and len(c) >= 2:
            kitei = c[1].strip()
        elif atama in (u"章", u"chapter") and len(c) >= 3:
            out.append((c[1].strip(), c[2].strip(),
                        c[3].strip() if len(c) >= 4 else u"",
                        c[4].strip() if len(c) >= 5 else u""))
    return kitei, out


def hira(namae):
    u"""①\\Nこの素晴らしい\\N世界に祝福を！ → この素晴らしい世界に祝福を！

    \\N はカードの中での折り返しなので、題名としては**詰めて**戻す。
    空白を入れると「この素晴らしい 世界に祝福を！」になってしまう。
    """
    t = namae.replace(u"\\N", u"").replace(u"\\n", u"")
    t = t.lstrip(MARU).strip()
    return re.sub(r"\s+", u" ", t)


def jikoku(path, chaps):
    u"""一覧.txt から、章のキーワードが最初に出る行の開始時刻を取る。

    一覧.txt の列: 番号 開始 尺 画像 絵の話数 台本の話数 ちがい セリフ
    """
    honbun = yomu(path)
    if not honbun:
        return {}
    gyou = []
    for line in honbun.split("\n"):
        c = line.split(u"\t")
        if len(c) >= 8 and re.match(r"^\d+$", c[0].strip()):
            gyou.append((c[1].strip(), c[7]))
    out, tsukatta = {}, set()
    for (key, namae, _f, _c) in chaps:
        for i, (toki, serifu) in enumerate(gyou):
            if i not in tsukatta and key and key in serifu:
                out[namae] = toki
                tsukatta.add(i)
                break
    return out


def honbun_wake(script, chaps):
    u"""台本を章ごとに切る。説明文の本文の下敷きにする。"""
    dan = [x.strip() for x in yomu(script).split("\n") if x.strip()]
    kiri, tsukatta = {}, set()
    for (key, namae, _f, _c) in chaps:
        for i, d in enumerate(dan):
            if i not in tsukatta and key and key in d:
                kiri[i] = namae
                tsukatta.add(i)
                break
    out, ima = {}, None
    for i, d in enumerate(dan):
        if i in kiri:
            ima = kiri[i]
            out.setdefault(ima, [])
        if ima:
            out[ima].append(d)
    return out


def main():
    base = os.getcwd()
    ov = OVERLAY if os.path.exists(OVERLAY) else os.path.join(HERE, OVERLAY)
    if not os.path.exists(ov):
        say(u"[中断] %s がありません。作業フォルダで回してください。" % OVERLAY)
        return 1
    kitei, chaps = shou_yomu(ov)
    if not chaps:
        say(u"[中断] %s に章が1つもありません。" % OVERLAY)
        return 1

    saku = [(k, n, f, c) for (k, n, f, c) in chaps
            if hira(n) not in HAZUSU and not hira(n).startswith(u"型")]
    toki = jikoku(ICHIRAN, chaps)
    honbun = honbun_wake(SCRIPT, chaps)

    t = []
    t.append(u"◆タイトル")
    t.append(u"")
    for (_k, n, _f, _c) in saku:
        t.append(hira(n))
    t.append(u"")
    t.append(u"")
    if toki:
        for (_k, n, _f, _c) in chaps:
            t.append(u"%s %s" % (toki.get(n, u"0:00"), hira(n)))
    else:
        t.append(u"（目次の時刻は、動画を作ったあともう一度 python 説明文.py を回すと入ります）")
        for (_k, n, _f, _c) in chaps:
            t.append(u"      %s" % hira(n))
    t.append(u"")
    t.append(u"")
    t.append(u"◆本文")
    t.append(u"今回の動画の内容は、〜計%d作品ご紹介します。" % len(saku))
    t.append(u"皆さんが思う◯◯がありましたら、コメント欄で教えていただけると幸いです。")
    t.append(u"")
    for (_k, n, f, c) in saku:
        t.append(u"")
        t.append(u"「（キャッチコピー）」")
        t.append(hira(n))
        t.append(u"制作：")
        t.append(c or kitei)
        for d in honbun.get(n, [])[1:]:
            t.append(d)
    t.append(u"")
    t.append(u"")
    t.append(u"今回の動画は以上となります。")
    t.append(u"最後に今回ご紹介した作品が視聴できる配信サービスをこちらにまとめております。")
    t.append(u"ご参考になれば幸いです。")
    t.append(u"ご視聴ありがとうございました。")

    fol = os.path.dirname(OUT)
    if fol and not os.path.isdir(fol):
        os.makedirs(fol)
    io.open(OUT, "w", encoding="utf-8-sig", newline="\r\n").write(u"\n".join(t) + u"\n")

    say(u"%s を書きました（作品 %d本 / 章 %d本）" % (OUT, len(saku), len(chaps)))
    nai = [hira(n) for (_k, n, _f, c) in saku if not c]
    if nai:
        say(u"")
        say(u"引用元(©)が入っていない作品が %d本あります。" % len(nai))
        say(u"画面表示.txt の章の行の5列目に書くと、画面にもここにも入ります:")
        for x in nai[:24]:
            say(u"   " + x)
    if not toki:
        say(u"")
        say(u"目次の時刻はまだ入りません。動画を作ったあと、もう一度回してください。")
    say(u"")
    say(u"この 説明文.txt を、YouTubeの概要欄に貼ってください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
