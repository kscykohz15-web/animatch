# -*- coding: utf-8 -*-
u"""board.src.html に中身を流し込んで、掲示板を2枚作る。

    python build.py

出来るもの

    board.html           無職転生 制作ボード   （動画一覧.txt の mushoku）
    board_osusume.html   おすすめアニメ紹介     （同じく osusume）

型は1枚だけです。menu.ps1・道具16個・共通の設定・効果音は1か所にしかなく、
2枚ともそこから配られます。**同じものを2か所に持たない。**

board.src.html に書いてある印を、本物のファイルで置きかえます。

  @@DOUGA_DAIHON@@      その掲示板の動画ぶん  doc-<印>-sub / -tts
  @@DOUGA_SETTEI@@      同じく                plan-<印> / over-<印>
  @@FILE:video/○○.txt@@  共通の設定
  @@B64:video/効果音/○@@  音（base64）
  @@BOARD@@             mushoku か osusume（JSから見える）

節は data-board で振り分けます。印の無い節は2枚ともに出ます。

■ 動画を1本足すときに触る所は、動画一覧.txt と board.src.html の SCRIPTS だけ。
  SCRIPTS を足し忘れたら、ここで落とします。

■ 台本に BOM は付けない。
  VOICEPEAK に渡す本人のスクリプトが cp932 で落ちます。
  掲示板に残っていた v141 では、読み上げ用8本すべてに付いていました。
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
YOMI_SOKUDO = 6.46
sys.path.insert(0, V)

# 掲示板ごとの、題と出すファイル。掲示板を増やすのはここ1行。
BAN = [
    (u"mushoku", u"board.html",
     u"無職転生 制作ボード", u"かさ【ゆるオタ】 / 無職転生 解説シリーズ"),
    (u"osusume", u"board_osusume.html",
     u"おすすめアニメ紹介", u"かさ【ゆるオタ】 / おすすめアニメ紹介シリーズ"),
]


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


def scripts_wakeru(s):
    u"""var SCRIPTS = {...} を、印ごとの文字列に割る。"""
    m = re.search(r"(  var SCRIPTS = \{\n)(.*?)(\n  \};)", s, re.S)
    if not m:
        shinu(u"board.src.html に var SCRIPTS が見つかりません")
    naka = m.group(2)
    atama = [mm.start() for mm in re.finditer(r"^    [A-Za-z0-9_]+:\{name:", naka, re.M)]
    if not atama:
        shinu(u"SCRIPTS の中身を読めませんでした")
    kire = atama + [len(naka)]
    hako = {}
    for i in range(len(atama)):
        t = naka[kire[i]:kire[i + 1]].rstrip().rstrip(u",")
        shirushi = re.match(r"    ([A-Za-z0-9_]+):", t).group(1)
        hako[shirushi] = t
    return m, hako


def shou_naoshi(t, ji, fun):
    u"""SCRIPTS の1件の chars/min を、本物の台本から数えた値に直す。"""
    t2, k = re.subn(r"(:\{name:\"[^\"]*\", chars:)\d+(, min:\")[^\"]*(\")",
                    lambda mm: mm.group(1) + str(ji) + mm.group(2)
                    + ("%.1f" % fun) + mm.group(3), t, count=1)
    if k != 1:
        shinu(u"SCRIPTS の chars/min を直せませんでした: " + t[:40])
    return t2


def main():
    import 動画一覧 as D
    zenbu = D.yomu()
    moto = kata()
    m_scripts, hako = scripts_wakeru(moto)

    # ① SCRIPTS の印が、動画一覧.txt と合っているか（足し忘れをここで止める）
    aru, hoshii = set(hako), set(v.shirushi for v in zenbu)
    if aru != hoshii:
        shinu(u"SCRIPTS と 動画一覧.txt が合っていません。\n"
              u"       SCRIPTS に足りない: %s\n"
              u"       動画一覧.txt に無い: %s"
              % (u" ".join(sorted(hoshii - aru)) or u"なし",
                 u" ".join(sorted(aru - hoshii)) or u"なし"))
    print(u"○ SCRIPTS と 動画一覧.txt は %d本ぶん合っています" % len(hoshii))

    # ② 節の印が、知らない掲示板を指していないか
    shiru = set(re.findall(r'<section data-board="([^"]+)"', moto))
    shiranai = shiru - set(b[0] for b in BAN)
    if shiranai:
        shinu(u"data-board に知らない掲示板があります: " + u" ".join(sorted(shiranai)))

    dekita = []
    for (ban, out_name, title, eyebrow) in BAN:
        douga = [v for v in zenbu if v.ban == ban]
        if not douga:
            shinu(u"掲示板 %s の動画が1本もありません" % ban)
        s = moto

        # 他の掲示板の節を落とす
        otoshita = [0]

        def otosu(mm):
            if mm.group(1) == ban:
                return mm.group(0)
            otoshita[0] += 1
            return u""
        s = re.sub(r'  <section data-board="([^"]+)"[\s\S]*?\n  </section>\n\n?',
                   otosu, s)

        # JSの中にも「この掲示板だけ」の塊がある。
        # 走らせないだけでは足りない（名乗っていない capability の字が
        # 残っていると、掲示板に出すときに警告が出る）ので、字ごと落とす。
        # 残すときは、印そのものを外す（印が残ると最後の検査で落ちる）。
        def js_otosu(mm):
            if mm.group(1) != ban:
                otoshita[0] += 1
                return u""
            return mm.group(2)
        s = re.sub(r'  /\*@@ONLY:([a-z]+)@@\*/\n([\s\S]*?)  /\*@@END@@\*/\n',
                   js_otosu, s)
        n_otoshita = otoshita[0]

        # SCRIPTS をこの掲示板のぶんだけにする
        mochi = []
        for v in douga:
            ji = len(u"".join(x.strip() for x in yomu(v.sub).split(u"\n") if x.strip()))
            mochi.append(shou_naoshi(hako[v.shirushi], ji, ji / YOMI_SOKUDO / 60.0))
        s = s.replace(m_scripts.group(0),
                      m_scripts.group(1) + u",\n".join(mochi) + m_scripts.group(3))

        # 題と肩書き
        s = s.replace(u"<title>無職転生 制作ボード</title>", u"<title>%s</title>" % title)
        s = re.sub(r'<div class="eyebrow">[^<]*</div>',
                   u'<div class="eyebrow">%s</div>' % eyebrow, s, count=1)
        s = s.replace(u'var BOARD = "@@BOARD@@";', u'var BOARD = "%s";' % ban)

        # 絵と録画の道。置き場所_<掲示板>.txt が、ただ一つの置き場所。
        # menu.ps1 の中にも同じ道が要るので、ここから差し込む。
        basho_file = os.path.join(V, u"置き場所_%s.txt" % ban)
        basho = yomu(basho_file)
        michi = {}
        for line in basho.split(u"\n"):
            t = line.strip()
            if t and not t.startswith(u"#") and u"\t" in t:
                k, v = t.split(u"\t", 1)
                michi[k.strip()] = v.strip()
        for k in (u"おおもと", u"画像", u"録画"):
            if not michi.get(k):
                shinu(u"%s に「%s」の行がありません" % (os.path.basename(basho_file), k))
        # 画像フォルダの1つ上（shiboru.py と一覧シートを置く所）
        imgroot = michi[u"画像"]
        if os.path.basename(imgroot.replace(u"\\", u"/").rstrip(u"/")) == u"高画質":
            imgroot = imgroot.replace(u"\\", u"/").rstrip(u"/").rsplit(u"/", 1)[0] \
                .replace(u"/", u"\\")
        s = s.replace(u"@@BASHO@@", basho)
        # menu.ps1 はJSの文字列の中にあるので、円記号を2つにして入れる
        for shirushi, michi_ in ((u"@@OOMOTO@@", michi[u"おおもと"]),
                                 (u"@@IMGDIR@@", michi[u"画像"]),
                                 (u"@@IMGROOT@@", imgroot)):
            s = s.replace(shirushi, michi_.replace(u"\\", u"\\\\"))

        # 台本（BOMは落とす）
        daihon = []
        for v in douga:
            daihon.append(block(u"doc-%s-sub" % v.shirushi, yomu(v.sub)))
            daihon.append(block(u"doc-%s-tts" % v.shirushi, yomu(v.tts)))
        s = s.replace(u"@@DOUGA_DAIHON@@", u"\n".join(daihon))

        # 動画ごとの設定
        settei = []
        for v in douga:
            settei.append(block(u"plan-%s" % v.shirushi, yomu(v.plan)))
            settei.append(block(u"over-%s" % v.shirushi, yomu(v.overlay)))
        s = s.replace(u"@@DOUGA_SETTEI@@", u"\n".join(settei))

        # 共通の設定と音
        s, n5 = re.subn(r"@@FILE:([^@]+)@@",
                        lambda mm: yomu(os.path.join(B, mm.group(1))), s)

        def oto(mm):
            q = os.path.join(B, mm.group(1))
            if not os.path.exists(q):
                shinu(u"%s がありません（演出.txt が名前を出している音）" % q)
            return base64.b64encode(io.open(q, "rb").read()).decode("ascii")
        s, n6 = re.subn(r"@@B64:([^@]+)@@", oto, s)

        nokori = re.findall(r"@@[A-Z0-9_]+(?::[^@]*)?@@", s)
        nokori += re.findall(r"@@(?:ONLY:[a-z]+|END)@@", s)
        if nokori:
            shinu(u"埋められなかった印が残っています: " + u" ".join(sorted(set(nokori))))

        # 台本に BOM が残っていないか、最後にもう一度見る
        for mm in re.finditer(r'<script type="text/plain" id="doc-[^"]+">\n(.)', s):
            if mm.group(1) == u"﻿":
                shinu(u"台本に BOM が残っています。")

        io.open(os.path.join(HERE, out_name), "w", encoding="utf-8", newline="\n").write(s)
        dekita.append((out_name, title, len(douga), len(s.encode("utf-8")) / 1048576.0))
        print(u"○ %-20s %s … 動画%d本 / 設定%d個 / 音%d個 / 落とした節%d個"
              % (out_name, title, len(douga), n5, n6, n_otoshita))

    m = re.search(r'PACK_VERSION = "(v\d+)"', moto)
    print(u"")
    for (f, t, n, mb) in dekita:
        print(u"%s（%s・%s・%.1fMB）ができました。掲示板に出してください。"
              % (f, t, m.group(1) if m else u"?", mb))
    return 0


if __name__ == "__main__":
    sys.exit(main())
