# -*- coding: utf-8 -*-
u"""台本から 画像プラン.txt の下書きを作る。

字幕1枚ずつを本番と同じ切り方で取り出し、当て方.txt に書いた言葉の
うち「いちばん長く当たったもの」の絵を割り当てます。
章ごとに @@話数 を切り替えるので、話の場面が動く台本でも、
その場面の話数の中から絵を探しに行きます。

  python プラン下書き.py 台本_字幕用.txt 画面表示.txt 出したい名前.txt

章ごとの話数は 章話数.txt に書きます（無ければ全体で1つ）。
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_slideshow as M

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ATAMA = u"""﻿# ─────────────────────────────
# 画像プラン ─ %s
#
# プラン下書き.py が 当て方.txt をもとに作りました。
# 手で直したところは、いちばん上の「手で選んだ絵」の枠に書いてください。
# その枠の絵は、話数の外でも、使用不可でも、そのまま使われます。
#
# 書式:  キーワード <タブ> 画像1, 画像2, ...
#   ・上の行から順に照合し、当たった行のうち「いちばん長いキーワード」が勝ちます
#   ・カンマは「見つからなければ次」です。左から順に試します
#   ・#指定 は、まず @@話数 の中だけで探します
#
# 直したら必ず:
#   python plan_check.py %s %s
# ─────────────────────────────

# ══════════════════════════════════════════
# 手で選んだ絵（ここが always 勝ちます）
# 「7番の絵をこれにして」と言われたら、ここに1行足してください。
# ══════════════════════════════════════════

"""


def load_atekata(path):
    u"""当て方.txt を読む。長い言葉から先に見たいので、長さ順に並べる。"""
    out = []
    for line in io.open(path, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t or t.startswith(u"#") or u"\t" not in t:
            continue
        k, v = t.split(u"\t", 1)
        k = k.strip()
        v = [x.strip() for x in v.split(u",") if x.strip()]
        if k and v:
            out.append((k, v))
    out.sort(key=lambda x: -len(x[0]))
    return out


def cues_of(script):
    out = []
    for dan in io.open(script, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        if dan.strip():
            out.extend(M.kugiri(dan.strip()))
    return out


def key_of(cue):
    u"""字幕から、その字幕にだけ当たるキーワードを作る。

    おしりの「、」「。」を落とすだけ。字幕そのものなので必ず当たる。
    """
    return cue.strip().rstrip(u"、。！？")


def tsukuru(script, overlay, out, midashi, shou_wasuu=None, kitei=None):
    ate = load_atekata(os.path.join(HERE, u"当て方.txt"))
    cues = cues_of(script)
    _credit, chaps = M.load_overlay(overlay) if os.path.exists(overlay) else (u"", [])
    shou_wasuu = shou_wasuu or {}
    kitei = kitei or [u"#穏やか", u"#室内", u"#立ち姿"]

    # 章の切り替わる字幕の番号を出す
    kiri = {}
    tsukatta = set()
    for (key, title) in chaps:
        for i, c in enumerate(cues):
            if i not in tsukatta and key in c:
                kiri[i] = title
                tsukatta.add(i)
                break

    gyou, atta = [], 0
    ima_wasuu = None
    for i, c in enumerate(cues):
        if i in kiri:
            title = kiri[i]
            hira = title.replace(u"\\N", u" ")
            gyou.append(u"")
            gyou.append(u"# ══ %s ══" % hira)
            w = shou_wasuu.get(title)
            if w and w != ima_wasuu:
                gyou.append(u"@@話数\t" + u", ".join(w))
                ima_wasuu = w
        k = key_of(c)
        if not k:
            continue
        best, blen = None, -1
        for (word, specs) in ate:
            if word in c and len(word) > blen:
                best, blen = specs, len(word)
        if best is None:
            best = kitei
        else:
            atta += 1
        gyou.append(u"%s\t%s" % (k, u", ".join(best)))

    nm = os.path.basename(out)
    body = ATAMA % (midashi, nm, os.path.basename(script))
    body += u"\n".join(gyou) + u"\n\n"
    body += u"# 何にも当たらなかったとき\n*\t" + u", ".join(kitei) + u"\n"
    io.open(out, "w", encoding="utf-8", newline="\n").write(body)
    return len(cues), atta


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    n, a = tsukuru(sys.argv[1], sys.argv[2], sys.argv[3],
                   os.path.basename(sys.argv[3]))
    print(u"%s  字幕%d枚 / 当て方が効いた %d枚 (%.0f%%)"
          % (sys.argv[3], n, a, 100.0 * a / max(1, n)))
