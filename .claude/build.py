# -*- coding: utf-8 -*-
u"""board.src.html に中身を流し込んで board.html を作る。

    python build.py

board.src.html に書いてある印を、本物のファイルで置きかえます。

  @@DOUGA_DAIHON@@      動画一覧.txt の全部ぶん  doc-<印>-sub / -tts
  @@DOUGA_SETTEI@@      同じく                   plan-<印> / over-<印>
  @@FILE:video/○○.txt@@  共通の設定
  @@B64:video/効果音/○@@  音（base64）

■ 動画を1本足すときに触る所は、動画一覧.txt と board.src.html の SCRIPTS だけ。
  台本・画面表示・画像プランのブロックは、ここが自動で並べます。
  SCRIPTS を足し忘れたら、ここで落とします（掲示板に出てから気づかないように）。

■ 台本に BOM は付けない。
  VOICEPEAK に渡す本人のスクリプトが、先頭の見えない文字ごと
  表示しようとして cp932 で落ちます。実際に落ちました。
  掲示板に残っていた v141 では、読み上げ用8本すべてに BOM が付いていました。
"""
from __future__ import print_function
import base64
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, "scratchpad")
V = os.path.join(B, "video")
SRC = os.path.join(HERE, "board.src.html")
OUT = os.path.join(HERE, "board.html")
YOMI_SOKUDO = 6.46
sys.path.insert(0, V)


def shinu(t):
    print(u"")
    print(u"[中断] " + t)
    sys.exit(1)


def yomu(path):
    u"""**流し込む中身**を読む。BOM は落とす（掲示板側で付けるので二重になる）。"""
    if not os.path.exists(path):
        shinu(u"%s がありません" % path)
    s = io.open(path, encoding="utf-8-sig").read().replace("\r\n", "\n")
    if u"</script" in s:
        shinu(u"%s に </script が入っています。そのままでは貼れません。" % path)
    return s


def kata():
    u"""型(board.src.html)を読む。こちらは </script> を含むのが当たり前。"""
    if not os.path.exists(SRC):
        shinu(u"board.src.html がありません: " + SRC)
    return io.open(SRC, encoding="utf-8").read()


def block(ident, body):
    return u'<script type="text/plain" id="%s">\n%s</script>' \
        % (ident, body if body.endswith(u"\n") else body + u"\n")


def main():
    import 動画一覧 as D
    douga = D.yomu()
    s = kata()

    # ── ① SCRIPTS の印が、動画一覧.txt と合っているか
    m = re.search(r"var SCRIPTS = \{(.*?)\n  \};", s, re.S)
    if not m:
        shinu(u"board.src.html に var SCRIPTS が見つかりません")
    aru = set(re.findall(r"^    ([A-Za-z0-9_]+):\{name:", m.group(1), re.M))
    hoshii = set(v.shirushi for v in douga)
    if aru != hoshii:
        tari = u" ".join(sorted(hoshii - aru))
        amari = u" ".join(sorted(aru - hoshii))
        shinu(u"SCRIPTS と 動画一覧.txt が合っていません。\n"
              u"       SCRIPTS に足りない: %s\n"
              u"       動画一覧.txt に無い: %s"
              % (tari or u"なし", amari or u"なし"))
    print(u"○ SCRIPTS と 動画一覧.txt は %d本ぶん合っています" % len(hoshii))

    # ── ② 台本（BOMは落とす）
    daihon = []
    for v in douga:
        for (suf, path) in ((u"sub", v.sub), (u"tts", v.tts)):
            daihon.append(block(u"doc-%s-%s" % (v.shirushi, suf), yomu(path)))
    s = s.replace(u"@@DOUGA_DAIHON@@", u"\n".join(daihon))

    # ── ③ 動画ごとの設定
    settei = []
    for v in douga:
        settei.append(block(u"plan-%s" % v.shirushi, yomu(v.plan)))
        settei.append(block(u"over-%s" % v.shirushi, yomu(v.overlay)))
    s = s.replace(u"@@DOUGA_SETTEI@@", u"\n".join(settei))

    # ── ④ SCRIPTS の 字数と分を、本物の台本から数え直す
    for v in douga:
        ji = len(u"".join(x.strip() for x in yomu(v.sub).split(u"\n") if x.strip()))
        fun = ji / YOMI_SOKUDO / 60.0
        pat = re.compile(r"(    %s:\{name:\"[^\"]*\", chars:)\d+(, min:\")[^\"]*(\")"
                         % re.escape(v.shirushi))
        s, k = pat.subn(lambda mm: mm.group(1) + str(ji) + mm.group(2)
                        + ("%.1f" % fun) + mm.group(3), s)
        if k != 1:
            shinu(u"SCRIPTS の %s の chars/min を直せませんでした（%d か所）"
                  % (v.shirushi, k))

    # ── ⑤ 共通の設定
    def hameru(mm):
        return yomu(os.path.join(B, mm.group(1)))
    s, n5 = re.subn(r"@@FILE:([^@]+)@@", hameru, s)

    # ── ⑥ 音
    def oto(mm):
        p = os.path.join(B, mm.group(1))
        if not os.path.exists(p):
            shinu(u"%s がありません（演出.txt が名前を出している音）" % p)
        return base64.b64encode(io.open(p, "rb").read()).decode("ascii")
    s, n6 = re.subn(r"@@B64:([^@]+)@@", oto, s)

    nokori = re.findall(r"@@[A-Z0-9_]+(?::[^@]*)?@@", s)
    if nokori:
        shinu(u"埋められなかった印が残っています: " + u" ".join(sorted(set(nokori))))

    # ── ⑦ 台本に BOM が残っていないか（最後にもう一度見る）
    for mm in re.finditer(r'<script type="text/plain" id="doc-[^"]+">\n(.)', s):
        if mm.group(1) == u"\ufeff":
            shinu(u"台本に BOM が残っています。yomu() が utf-8-sig で読めていません。")

    io.open(OUT, "w", encoding="utf-8", newline="\n").write(s)
    print(u"○ 台本 %d本 / 設定 %d個 / 音 %d個 を入れました"
          % (len(douga) * 2, n5, n6))
    m = re.search(r'PACK_VERSION = "(v\d+)"', s)
    print(u"board.html ができました（パック %s・%.1fMB）"
          % (m.group(1) if m else u"?", len(s.encode("utf-8")) / 1048576.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
