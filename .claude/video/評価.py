# -*- coding: utf-8 -*-
u"""作品の点数を計算し、本人の物差しからずれていないか見張る。

    python 評価.py                    … 点数表.txt を読んで総合点を出す
    python 評価.py --くせ              … 本人の17本と散らばりを比べる

**お金はかからない。ただの足し算。** OpenAI も Ollama も使わない。
点数そのものを決めるのは人（またはチャットのこちら）で、この道具は
「足し算」と「本人の癖から外れていないかの見張り」だけをする。

点数表.txt の書き方（タブ区切り）
    作品名 <タブ> シナリオ <タブ> 作画 <タブ> 世界観 <タブ> 心 <タブ> テンポ <タブ> 音楽 <タブ> ひとこと
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OMOMI = (0.25, 0.10, 0.20, 0.25, 0.10, 0.10)   # シナリオ 作画 世界観 心 テンポ 音楽
NA = (u"シナリオ", u"作画", u"世界観", u"心", u"テンポ", u"音楽")

# 本人の17本（評価基準.txt と同じ。ここが物差し）
HONNIN = [
    (u"進撃の巨人", 10, 9, 8, 8, 7, 8), (u"オッドタクシー", 10, 6, 9, 7, 7, 6),
    (u"葬送のフリーレン", 8, 9, 10, 9, 8, 7), (u"コードギアス", 10, 7, 8, 9, 7, 8),
    (u"ソードアート・オンライン", 7, 8, 7, 7, 8, 7), (u"庶民サンプル", 5, 4, 7, 5, 6, 5),
    (u"NARUTO", 9, 6, 8, 10, 7, 8), (u"神のみぞ知るセカイ", 6, 5, 6, 8, 8, 6),
    (u"凪のあすから", 8, 9, 10, 9, 6, 8), (u"ハイキュー!!", 7, 6, 6, 10, 8, 6),
    (u"シュタインズ・ゲート", 10, 6, 8, 9, 6, 7), (u"彼方のアストラ", 10, 7, 7, 9, 9, 6),
    (u"僕のヒーローアカデミア", 8, 9, 7, 9, 7, 7), (u"Re:CREATORS", 6, 8, 7, 5, 5, 9),
    (u"アルドノア・ゼロ", 9, 8, 6, 8, 7, 10), (u"86", 9, 8, 10, 9, 7, 9),
    (u"デス・パレード", 6, 6, 9, 7, 8, 7),
]


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))


def sogo(t):
    return sum(t[i] * OMOMI[i] for i in range(6))


def chirabari(rows, i):
    v = [r[1 + i] for r in rows]
    m = sum(v) / float(len(v))
    return (min(v), m, max(v), (sum((x - m) ** 2 for x in v) / float(len(v))) ** 0.5)


def yomu(path):
    out = []
    if not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8-sig", errors="replace") \
            .read().replace("\r\n", "\n").split("\n"):
        t = line.rstrip()
        if not t or t.startswith(u"#"):
            continue
        p = t.split(u"\t")
        if len(p) < 7:
            say(u"[注意] 列が足りません: " + t[:40])
            continue
        try:
            n = [float(x) for x in p[1:7]]
        except ValueError:
            say(u"[注意] 点数が数字ではありません: " + t[:40])
            continue
        for x in n:
            # ■ 0 は「未評価」であって「最低点」ではない（本人の決め）。
            #   0 を書くと総合点が黙って下がるので、ここで止める。
            if x < 0.1 or x > 10.0:
                say(u"[注意] 0.1〜10.0 の外です（0は未評価なので書かない）: " + p[0])
                break
        else:
            out.append(tuple([p[0]] + n + ([p[7]] if len(p) > 7 else [u""])))
    return out


def mihari(rows):
    u"""本人の癖から外れていないかを見る。外れたら理由つきで言う。"""
    warui = []
    # ① 10.0 を出しすぎていないか（新基準では「この1本しかない」ときだけ）
    for i in range(6):
        n = len([r for r in rows if r[1 + i] >= 10.0])
        if n > max(1, len(rows) // 20):
            warui.append(u"%s に 10.0 が %d本。新基準では 10.0 はほぼ出さない"
                         u"（本人は進撃のシナリオでも 9.5）" % (NA[i], n))
    # ② 作画とテンポに 10 を出していないか（本人は17本で一度も出していない）
    for i in (1, 4):
        n = len([r for r in rows if r[1 + i] >= 10.0])
        if n:
            warui.append(u"%s に 10.0 が %d本。本人は17本で一度も出していない" % (NA[i], n))
    # ③ 散らばりが本人より小さくないか（「点数がばらけない」が本人の不満）
    for i in range(6):
        if len(rows) < 8:
            break
        _, _, _, sd = chirabari(rows, i)
        _, _, _, hsd = chirabari(HONNIN, i)
        if sd < hsd * 0.6:
            warui.append(u"%s のばらつき %.2f が本人の %.2f より小さい。"
                         u"差を付けられていない" % (NA[i], sd, hsd))
    # ④ 平均が高すぎないか
    if rows:
        m = sum(sogo(r[1:7]) for r in rows) / float(len(rows))
        if m > 8.0:
            warui.append(u"総合点の平均が %.2f。本人の17本でも 7.78、"
                         u"新基準なら 7.6 あたり。甘い" % m)
    return warui


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if "--くせ" in sys.argv or "--kuse" in sys.argv:
        say(u"── 本人の17本の癖 ──")
        say(u"  %-8s %5s %5s %5s %7s" % (u"軸", u"最低", u"平均", u"最高", u"ばらつき"))
        for i in range(6):
            lo, m, hi, sd = chirabari(HONNIN, i)
            say(u"  %-8s %5.1f %5.2f %5.1f %7.2f （重み %.0f%%）"
                % (NA[i], lo, m, hi, sd, OMOMI[i] * 100))
        say(u"")
        for d in sorted(HONNIN, key=lambda x: -sogo(x[1:])):
            say(u"  %5.2f  %s" % (sogo(d[1:]), d[0]))
        return 0

    path = os.path.join(HERE, u"点数表.txt")
    rows = yomu(path)
    if not rows:
        say(u"点数表.txt がありません（または中身が空）: " + path)
        say(u"書き方: 作品名<タブ>シナリオ<タブ>作画<タブ>世界観<タブ>心<タブ>テンポ<タブ>音楽<タブ>ひとこと")
        return 1

    say(u"── 総合点の高い順（%d本）──" % len(rows))
    for r in sorted(rows, key=lambda x: -sogo(x[1:7])):
        say(u"  %5.2f  %-26s %s  %s"
            % (sogo(r[1:7]), r[0][:24],
               u" ".join(u"%4.1f" % x for x in r[1:7]), r[7]))

    m = sum(sogo(r[1:7]) for r in rows) / float(len(rows))
    say(u"")
    say(u"  平均 %.2f（本人の17本 7.78 ／ 新基準の目安 7.6）" % m)

    w = mihari(rows)
    say(u"")
    if w:
        say(u"── 本人の癖から外れています ──")
        for x in w:
            say(u"  × " + x)
        return 1
    say(u"○ 本人の癖から外れていません。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
