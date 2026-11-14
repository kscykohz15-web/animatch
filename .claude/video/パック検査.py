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
    # ■ まず自分の隣（git のもの）を見る（2026-10-18）
    #
    # 前は scratchpad の親だけを見ていた。board.src.html と sync_py.py は
    # そのあと git（.claude/video/）に入ったので、そちらが本物。
    # **作業場所(/tmp)は消えるが、リポジトリは消えない。**
    # コンテナが作り直されたとき、ここが「ありません」で落ちた。
    here = os.path.dirname(os.path.abspath(__file__))
    oya = os.path.dirname(os.path.dirname(here))      # scratchpad の親
    def sagasu(nm):
        for c in (os.path.join(here, nm), os.path.join(oya, nm)):
            if os.path.exists(c):
                return c
        return None
    src, syn = sagasu(u"board.src.html"), sagasu(u"sync_py.py")
    if not src or not syn:
        nai = [n for n, c in ((u"board.src.html", src), (u"sync_py.py", syn))
               if not c]
        print(u"… %s が無いので、パックの検査は飛ばします"
              u"（落ちたのではなく、見ていません）" % u" / ".join(nai))
        return 0
    s, y = yomu(src), yomu(syn)

    # ■ その board.src.html が、本当に「型」かどうかを先に見る（2026-10-29）
    #
    #   v165 で、控えの board.src.html が**出来上がった掲示板で上書き**された。
    #   そのまま v179 まで気づかなかった（2.4MB → 4.7MB）。
    #   出来上がったほうにも道具の一覧は入っているので、この検査は通ってしまう。
    #   ところが型ではないので
    #     ・@@DOUGA_DAIHON@@ が無い   → build.py が台本を流し込めない
    #     ・osusume の節が無い        → おすすめの掲示板が二度と作れない
    #   になる。実際に、おすすめアニメ紹介の掲示板が20版ぶん取り残された。
    #
    #   **出す物（board.html）と型（board.src.html）を、同じ名前で置かない。**
    #   見分け方は「印が入っているか」「doc- の中身が展開されていないか」。
    kata = []
    if u"@@DOUGA_DAIHON@@" not in s:
        kata.append(u"@@DOUGA_DAIHON@@ が無い")
    if u"@@DOUGA_SETTEI@@" not in s:
        kata.append(u"@@DOUGA_SETTEI@@ が無い")
    if u'data-board="osusume"' not in s:
        kata.append(u"osusume の節が無い")
    if re.search(r'<script type="text/plain" id="doc-', s):
        kata.append(u"doc- が展開済み（出来上がった掲示板です）")
    if kata:
        print(u"× これは掲示板の「型」ではありません: %s" % src)
        for k in kata:
            print(u"   ・" + k)
        print(u"   出来上がった board.html を board.src.html に上書きしていませんか。")
        print(u"   型として生きている版を git の履歴から戻してください。")
        return 1
    print(u"○ board.src.html は型です（印と osusume の節があります）")

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

    # 設定ファイルの改行。Windows 側で読むものなので CRLF でそろえる。
    #
    # 一度やらかしている（2026-10-06）: 人物ルール.txt に「代わり」の行を
    # 書き足したとき、CRLF の文字列をさらに CRLF で足して `\r\r\n` になった。
    # 読む側が .replace("\r\n","\n") だけなので、行のうしろに `\r` が残る。
    # strip() でたまたま消えていたが、タブで割る所に来れば黙って壊れる。
    # 見るのは video フォルダの .txt ぜんぶ（設定も台本の下書きも Windows で開く）。
    # sync_py.py の表だけを見ると .py しか入っておらず、
    # **1つも調べない検査**になる（いちど実際にそうなった）。
    yogore, mita = [], 0
    for f in sorted(os.listdir(here)):
        if not f.endswith(u".txt"):
            continue
        b = io.open(os.path.join(here, f), "rb").read()
        if not b:
            continue
        mita += 1
        if re.search(b"\r\r", b) or re.search(b"\r(?!\n)", b):
            yogore.append(f)
    shirabe(u"設定の改行が CRLF でそろっている", (not yogore) and mita >= 10,
            u" / ".join(yogore) or (u"%d個ぜんぶそろっています" % mita))

    print(u"")
    if warui:
        print(u"× パックへの入れ忘れがあります。")
        return 1
    print(u"○ 道具 %d個は、4か所ぜんぶに入っています。" % len(pairs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
