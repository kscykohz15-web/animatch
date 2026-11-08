# -*- coding: utf-8 -*-
u"""公開中の掲示板の中の台本だけを入れ替え、パック版と字数も合わせる。

    python3 -I 掲示板の台本を差し替える.py <掲示板のHTML> <版> [--掲示板 osusume|mushoku]

■ なぜ要るか（2026-11-08）
  `掲示板から台本を取り戻す.py` で**出す**側はあったのに、**入れる**側が
  手作業だった。台本を直すたびに手で貼ると、必ずどこかを貼り忘れる。

■ なぜ作り直さず差し替えるのか（メモリ 69-3）
  いまの渡し方は「公開中の掲示板を読んで、変えたブロックだけ差し替える」。
  絵も控えも掲示板の中にあるので、作り直すと中身が消える。

■ 何を入れ替えるか
  ① <script type="text/plain" id="doc-<印>-sub">…</script> の中身
  ② 同じく -tts
  ③ var PACK_VERSION = "vNNN";
  ④ SCRIPTS の一覧にある chars（字数）と min（分）
     ※ 字数・分は台本から数え直す。6.46字/秒（実測）。

■ 包み方（メモリ 69-4）
  `出す前の確認.py` は前後の改行を1つずつ外して取り出すので、
  中身は `>\\n` ＋ 本文 ＋ `\\n</script>` と**改行で包む**。
"""
import html
import io
import os
import re
import sys

V = os.path.join(os.path.dirname(os.path.abspath(__file__)), u"")
MOJI_PER_SEC = 6.46


def yomu_ichiran():
    u"""印 → (名前, 字幕用の道, 読み上げ用の道, 掲示板)。"""
    out = {}
    for ln in io.open(V + u"動画一覧.txt", encoding="utf-8-sig"):
        t = ln.rstrip(u"\n").replace(u"\r", u"")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) >= 6:
            out[c[0]] = (c[1], c[2], c[3], c[5])
    return out


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) < 3:
        print(u"使い方: python3 -I 掲示板の台本を差し替える.py <HTML> <版> [--掲示板 osusume]")
        return 1
    p, ban = sys.argv[1], sys.argv[2]
    dono = None
    if u"--掲示板" in sys.argv:
        dono = sys.argv[sys.argv.index(u"--掲示板") + 1]

    # 台本は作業場所（scratchpad）にある。HTML の場所からたどる
    B = os.environ.get("CLAUDE_SCRATCHPAD")
    if not B:
        d = os.path.dirname(os.path.abspath(p))
        while d and d != os.path.dirname(d):
            if os.path.basename(d) == u"scratchpad":
                B = d
                break
            d = os.path.dirname(d)
    if not B:
        import glob
        k = sorted(glob.glob(u"/tmp/claude-*/*animatch*/*/scratchpad"))
        B = k[0] if k else u"."
    print(u"台本を探す場所: %s" % B)

    s = io.open(p, encoding="utf-8", errors="replace").read()
    ichiran = yomu_ichiran()
    kaeta, tobashita = [], []

    for shirushi, (na, sub, tts, keiji) in sorted(ichiran.items()):
        if dono and keiji != dono:
            continue
        for shurui, michi in ((u"sub", sub), (u"tts", tts)):
            f = os.path.join(B, michi.replace(u"/", os.sep))
            if not os.path.isfile(f):
                tobashita.append(u"%s-%s（台本が無い）" % (shirushi, shurui))
                continue
            honbun = io.open(f, encoding="utf-8-sig").read().replace(u"\r\n", u"\n")
            naka = html.escape(honbun.strip(u"\n"), quote=False)
            ana = re.compile(
                u'(<script type="text/plain" id="doc-%s-%s">)(.*?)(</script>)'
                % (re.escape(shirushi), shurui), re.S)
            if not ana.search(s):
                tobashita.append(u"%s-%s（掲示板に枠が無い）" % (shirushi, shurui))
                continue
            mae = ana.search(s).group(2)
            s = ana.sub(lambda m: m.group(1) + u"\n" + naka + u"\n" + m.group(3), s, count=1)
            if mae.strip() != naka.strip():
                kaeta.append(u"%s-%s（%d→%d文字）"
                             % (shirushi, shurui, len(mae), len(naka)))

        # SCRIPTS の字数と分を合わせる
        f = os.path.join(B, sub.replace(u"/", os.sep))
        if os.path.isfile(f):
            honbun = io.open(f, encoding="utf-8-sig").read().replace(u"\r\n", u"\n")
            ji = len(re.sub(u"\\s", u"", honbun))
            fun = ji / MOJI_PER_SEC / 60.0
            # SCRIPTS の書式は  yohaku:{name:"…", chars:6626, min:"17.1",
            # `id:"yohaku"` ではない（そう思って書いたら1つも当たらなかった）。
            # min は引用符つき、chars は裸の数字。
            for k, atai in ((u"chars", u"%d" % ji), (u"min", u"%.1f" % fun)):
                ana = re.compile(u'(\\b%s:\\s*\\{[^{}]*?\\b%s:\\s*"?)([0-9.]+)("?)'
                                 % (re.escape(shirushi), k), re.S)
                m = ana.search(s)
                if m and m.group(2) != atai:
                    s = ana.sub(lambda mm: mm.group(1) + atai + mm.group(3), s, count=1)
                    kaeta.append(u"%s の %s（%s→%s）" % (shirushi, k, m.group(2), atai))

    n = len(re.findall(u'var PACK_VERSION = "v\\d+";', s))
    if n != 1:
        print(u"[中断] PACK_VERSION が %d個です（1個でないので止めます）" % n)
        return 1
    mae_ban = re.search(u'var PACK_VERSION = "(v\\d+)";', s).group(1)
    s = re.sub(u'var PACK_VERSION = "v\\d+";',
               u'var PACK_VERSION = "%s";' % ban, s)
    if mae_ban != ban:
        kaeta.append(u"パック版（%s→%s）" % (mae_ban, ban))

    io.open(p, "w", encoding="utf-8", newline="").write(s)
    print(u"\n○ %s を書きかえました" % os.path.basename(p))
    if kaeta:
        print(u"  変えたもの %d件:" % len(kaeta))
        for x in kaeta:
            print(u"    ・" + x)
    else:
        print(u"  変わったものはありませんでした")
    if tobashita:
        print(u"  飛ばしたもの %d件:" % len(tobashita))
        for x in tobashita:
            print(u"    ・" + x)
    print(u"\n次は 出す前の確認.py に通してから出してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
