# -*- coding: utf-8 -*-
u"""video/ の .py を board.src.html の <script id="py-*"> に流し込む。

**手で貼らない。** 貼り忘れると、直したのにパックに入りません。
道具を1つ足すときに触る所は4つあります（パック検査.py が突き合わせます）。

  ① board.src.html の <script id="py-○○">   … 中身の置き場所
  ② このファイルの PAIRS                     … ファイル→置き場所
  ③ board.src.html の exportAllPack の pys    … ZIPに入れる側
  ④ board.src.html の menu.ps1 の Prepare     … 作業フォルダへコピーする側

    python sync_py.py
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
V = os.path.join(HERE, "scratchpad", "video")
SRC = os.path.join(HERE, "board.src.html")

# (置き場所の id, video/ の中のファイル名)
PAIRS = [
    ("py-slideshow", u"make_slideshow.py"),
    ("py-contact",   u"make_contact.py"),
    ("py-shiboru",   u"shiboru.py"),
    ("py-extract",   u"extract_frames.py"),
    ("py-shindan",   u"shindan.py"),
    ("py-miru",      u"miru.py"),
    ("py-short",     u"short.py"),
    ("py-kaku",      u"kaku.py"),
    ("py-tate",      u"tate.py"),
    ("py-kekka",     u"miru_kekka.py"),
    ("py-shiken",    u"shiken.py"),
    ("py-mane",      u"mane.py"),
    ("py-ichiran",   u"画像一覧.py"),
    ("py-manabu",    u"話数を学ぶ.py"),
    ("py-zure",      u"ずれ実測.py"),
    ("py-naosu",     u"直す.py"),
]


def main():
    if not os.path.exists(SRC):
        print(u"[中断] board.src.html がありません: " + SRC)
        return 1
    s = io.open(SRC, encoding="utf-8").read()
    kaeta, onaji = 0, 0
    for (ident, name) in PAIRS:
        path = os.path.join(V, name)
        if not os.path.exists(path):
            print(u"[中断] %s がありません（%s の中身）" % (name, ident))
            return 1
        body = io.open(path, encoding="utf-8-sig").read().replace("\r\n", "\n")
        if u"</script" in body:
            print(u"[中断] %s に </script が入っています。そのままでは貼れません。" % name)
            return 1
        atarashii = u'<script type="text/plain" id="%s">\n%s</script>' \
            % (ident, body if body.endswith(u"\n") else body + u"\n")
        pat = re.compile(r'<script type="text/plain" id="%s">.*?</script>' % re.escape(ident),
                         re.S)
        m = pat.search(s)
        if not m:
            print(u"[中断] board.src.html に <script id=\"%s\"> がありません。" % ident)
            print(u"       道具を足したときは、置き場所・PAIRS・pys・Prepare の4か所です。")
            return 1
        if m.group(0) == atarashii:
            onaji += 1
        else:
            s = s[:m.start()] + atarashii + s[m.end():]
            kaeta += 1
    io.open(SRC, "w", encoding="utf-8", newline="\n").write(s)
    print(u"道具 %d個を同期しました（直した %d / そのまま %d）"
          % (len(PAIRS), kaeta, onaji))
    return 0


if __name__ == "__main__":
    sys.exit(main())
