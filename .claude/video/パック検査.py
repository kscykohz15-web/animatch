# -*- coding: utf-8 -*-
u"""パック検査 ─ 道具が「4か所」ぜんぶに入っているか

■ なぜ要るか

道具を1つ足すとき、入れる所が4つある。

  ① board.src.html の <script id="py-○○">     … 中身の置き場所
  ② sync_py.py の PAIRS                        … ファイル→置き場所の同期
  ③ exportAllPack の pys                       … ZIPに入れる側
  ④ menu.ps1 の Prepare                        … 作業フォルダへコピーする側

**片方だけだと、黙って消える。** ③だけ忘れるとZIPに入らず、
④だけ忘れると作業フォルダに来ない。どちらも「動かない」としか分からない。
この事故を3回やっている（メモリ 0.5）。

ここで4つを突き合わせ、1つでも欠けたら落とす。
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


def yomu(p):
    return io.open(p, encoding="utf-8", errors="replace").read()


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    oya = os.path.dirname(os.path.dirname(here))      # scratchpad の親
    src = os.path.join(oya, u"board.src.html")
    syn = os.path.join(oya, u"sync_py.py")
    for p in (src, syn):
        if not os.path.exists(p):
            print(u"× %s がありません" % p)
            return 1
    s, y = yomu(src), yomu(syn)

    oki = set(re.findall(r'<script type="text/plain" id="(py-[^"]+)">', s))
    def esc(t):
        u"""sync_py.py は日本語を \\uXXXX で書いてあるので、戻してから比べる。"""
        try:
            return t.encode("ascii", "backslashreplace").decode("unicode_escape")
        except Exception:
            return t
    pairs = dict((m.group(1), esc(m.group(2)))
                 for m in re.finditer(r'\("(py-[^"]+)",\s*u?"([^"]+)"\)', y))
    m = re.search(r"var pys = \[(.*?)\];", s, re.S)
    zip_ = dict((a, b) for (a, b) in re.findall(r'\["(py-[^"]+)","([^"]+)"\]',
                                                m.group(1) if m else u""))
    # Prepare のコピー一覧（menu.ps1 の中。JSの文字列の中にある）
    #
    # foreach は何か所もあり、変数で組み立てている所もある。
    # **ぜんぶ集めて束ねる。** 1つ目だけ見ると、変数の所に当たって空になる。
    prep = set()
    for m2 in re.finditer(r"foreach \(\$f in @\((.{0,3000}?)\)\)", s, re.S):
        prep |= set(re.findall(r"'([^']+\.py)'", m2.group(1)))

    warui = []

    def shirabe(na, ok, mi=u""):
        print(u"%s %s%s" % (u"○" if ok else u"×", na, (u" … " + mi) if mi else u""))
        if not ok:
            warui.append(na)

    shirabe(u"① 置き場所と ② 同期の表が同じ", oki == set(pairs),
            u"置き場所%d / 同期%d" % (len(oki), len(pairs)))
    for k in sorted(oki - set(pairs)):
        print(u"   置き場所はあるが、sync_py.py に無い: " + k)
    for k in sorted(set(pairs) - oki):
        print(u"   sync_py.py にあるが、置き場所が無い: " + k)

    shirabe(u"② 同期の表と ③ ZIPに入れる側が同じ", set(pairs) == set(zip_),
            u"同期%d / ZIP%d" % (len(pairs), len(zip_)))
    for k in sorted(set(pairs) - set(zip_)):
        print(u"   ZIPに入れ忘れ: %s (%s)" % (k, pairs[k]))
    for k in sorted(set(zip_) - set(pairs)):
        print(u"   ZIPにあるが同期していない: " + k)

    chigau = [k for k in pairs if k in zip_ and pairs[k] != zip_[k]]
    shirabe(u"名前が同じ", not chigau,
            u" / ".join(u"%s: %s≠%s" % (k, pairs[k], zip_[k]) for k in chigau)
            or u"ぜんぶ一致")

    nai = sorted(set(zip_.values()) - prep)
    shirabe(u"③ ZIPの中身が ④ Prepare にも入っている", not nai,
            u"%d個" % len(zip_))
    for f in nai:
        print(u"   Prepare に入れ忘れ（作業フォルダに来ません）: " + f)

    # 実体のファイルがあるか
    nai2 = [f for f in pairs.values() if not os.path.exists(os.path.join(here, f))]
    shirabe(u"ファイルが実際にある", not nai2, u" / ".join(nai2) or u"ぜんぶあります")

    print(u"")
    if warui:
        print(u"× パックへの入れ忘れがあります。")
        return 1
    print(u"○ 道具 %d個は、4か所ぜんぶに入っています。" % len(pairs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
