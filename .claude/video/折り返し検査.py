# -*- coding: utf-8 -*-
u"""字幕の折り返しが、言葉の途中で切れていないか全部調べる。

  「それぞれを直 / 接どうこうすることはできない。」
  のように、熟語の真ん中(直|接)で改行されるのを見つけます。

本番と同じ切り方・同じ幅で全台本を折り返し、
  ・漢字と漢字の間で切った   （熟語の途中の可能性が高い）
  ・カタカナの途中で切った   （ほぼ確実に語の途中）
を数えます。

  python 折り返し検査.py
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_slideshow as M

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

W, H = 1920, 1080
SC = [
    u"../final/老デウス_壮絶な人生年表_字幕用_最終版.txt",
    u"../第0弾_ターニングポイント全解説_字幕用_v4段落整理版.txt",
    u"../final/第1回_人生年表_字幕用_最終版.txt",
    u"../final/第3回_伏線7選_字幕用_最終版.txt",
    u"../final/第4回_謎7選_字幕用_最終版.txt",
    u"../final/第5回_3人が一度いなくなる理由_字幕用_最終版.txt",
    u"../final/第6回_ヒトガミの正体_字幕用_最終版.txt",
    u"../final/第7回_オルステッドの正体_字幕用_最終版.txt",
]


def cues_of(p):
    out = []
    for dan in io.open(p, encoding="utf-8-sig").read() \
            .replace("\r\n", "\n").split("\n"):
        if dan.strip():
            out.extend(M.kugiri(dan.strip()))
    return out


def warui_tsugime(mae, ato):
    u"""この2文字の間で切ると、言葉の途中になりそうか。

    「・」「…」などの区切り記号のあとは、切ってよい場所なので数えない。
    """
    if mae in M.STRONG or mae in M.MEDIUM:
        return None
    a, b = M.kind_of(mae), M.kind_of(ato)
    if a == "kanji" and b == "kanji":
        return u"漢字＋漢字"
    if a == "kata" and b == "kata":
        return u"カタカナの途中"
    return None


def main():
    mi, _ = M.load_mitame(os.path.join(HERE, u"見た目.txt"))
    size = max(24, int(round(min(W, H) / max(6.0, mi[u"字幕の大きさ"]))))
    gyou = max(1, int(mi[u"字幕の行数"]))
    side = int(W * 0.04)
    n = warui = 0
    rei = []
    for p in SC:
        for c in cues_of(os.path.join(HERE, p)):
            tx = c.strip()
            if not tx:
                continue
            n += 1
            room = W - side * 2 - size * 0.25
            lines, _fs = M.fit_to_box(tx, room, size, gyou)
            for i in range(1, len(lines)):
                mae, ato = lines[i - 1][-1:], lines[i][:1]
                if not mae or not ato:
                    continue
                w = warui_tsugime(mae, ato)
                if w:
                    warui += 1
                    if len(rei) < 12:
                        rei.append((w, u" / ".join(lines)))
    print(u"字幕 %d枚 / 言葉の途中で切ったもの %d枚 (%.2f%%)"
          % (n, warui, 100.0 * warui / max(1, n)))
    for (w, s) in rei:
        print(u"  × %-8s %s" % (w, s))
    return 1 if warui else 0


if __name__ == "__main__":
    sys.exit(main())
