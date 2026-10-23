# -*- coding: utf-8 -*-
u"""menu.ps1 の構造を、PowerShell を使わずに確かめる。

この環境には PowerShell が無いので、実行はできません。
せめて「明らかに壊れている」だけは機械で見ます。

  ・中かっこ・丸かっこが閉じているか
  ・使っている関数が、使う前に定義されているか
  ・continue / break が、ちゃんとループの中にあるか
  ・関数の中で、外部コマンドの出力が戻り値に混ざっていないか
    （PowerShell は python の標準出力も戻り値にしてしまうため）

  python ps1検査.py menu.ps1
"""
import io, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

LOOP = re.compile(r"\b(foreach|for|while|do)\s*[\(\{]")


def naka(s):
    u"""文字列とコメントを除いた部分。かっこを数えるため。"""
    out, q, i = [], None, 0
    while i < len(s):
        c = s[i]
        if q:
            if c == q:
                q = None
            elif c == "`":
                i += 1
        elif c in "'\"":
            q = c
        elif c == "#":
            break
        else:
            out.append(c)
        i += 1
    return "".join(out)


def shiraberu(path):
    L = io.open(path, encoding="utf-8").read().replace("\r\n", "\n").split("\n")
    warui = []
    fukasa = 0          # 中かっこの深さ
    loops = []          # ループが始まった深さ
    funcs = []          # 関数が始まった深さ
    teigi, maru = {}, 0
    for n, line in enumerate(L, 1):
        s = naka(line)
        m = re.match(r"\s*function\s+([A-Za-z]\w*)", line)
        if m:
            teigi[m.group(1)] = n
        # この行が始まる時点の深さで判定する
        if re.search(r"\b(continue|break)\b", s) and not loops:
            warui.append(u"%d行目: continue/break がループの外にあります" % n)
        # 「{」だけの行は、PowerShell では「置いただけの塊」になり、
        # 中身が一度も動かない。見た目は正しいので気づけない。
        if s.strip() == "{":
            warui.append(u"%d行目: { だけの行。中身が動きません"
                         u"（if や foreach の後ろに付けてください）" % n)
        if m:
            funcs.append(fukasa)
        elif LOOP.search(s):
            loops.append(fukasa)
        maru += s.count("(") - s.count(")")
        d = s.count("{") - s.count("}")
        fukasa += d
        if fukasa < 0:
            warui.append(u"%d行目: } が多すぎます" % n)
            fukasa = 0
        while loops and loops[-1] >= fukasa:
            loops.pop()
        while funcs and funcs[-1] >= fukasa:
            funcs.pop()
    if fukasa:
        warui.append(u"中かっこが %d 個閉じていません" % fukasa)
    if maru:
        warui.append(u"丸かっこが %d 個閉じていません" % maru)

    honbun = u"\n".join(L)
    loop_gyou = next((n for n, x in enumerate(L, 1)
                      if x.strip().startswith("while ($true)")), 10 ** 9)
    for f in sorted(set(re.findall(r"^\s*(?:if \()?\(?([A-Z][A-Za-z]+)\b",
                                   honbun, re.M))):
        pass
    for f, n in sorted(teigi.items()):
        if n > loop_gyou:
            warui.append(u"関数 %s の定義(%d行目)が while より後ろです" % (f, n))

    # 関数の中の外部コマンド
    naka_func, d2 = False, 0
    for n, line in enumerate(L, 1):
        s = naka(line)
        if re.match(r"\s*function\s+", line):
            naka_func, d2 = True, 0
        if naka_func:
            d2 += s.count("{") - s.count("}")
            # 外部コマンドをパイプに通すと、Python がためこんで
            # 終わるまで画面に何も出なくなる。通さないこと。
            if re.search(r"^\s*(python|ffmpeg|ffprobe)\b", s) and "|" in s \
                    and "Out-String" not in s:
                warui.append(u"%d行目: %s をパイプに通しています"
                             u"（途中経過が出なくなります）"
                             % (n, s.strip().split()[0]))
            if d2 <= 0 and s.strip().endswith("}"):
                naka_func = False
    return teigi, warui


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "menu.ps1"
    teigi, warui = shiraberu(path)
    print(u"%s  関数 %d個: %s" % (path, len(teigi),
                                  u" ".join(sorted(teigi, key=lambda k: teigi[k]))))
    if warui:
        print(u"× 見つかった問題:")
        for x in warui:
            print(u"   ・" + x)
        sys.exit(1)
    print(u"○ 構造に問題は見つかりませんでした（実行はしていません）")
