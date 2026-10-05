# -*- coding: utf-8 -*-
u"""字幕ずれ検査 ─ 出来た割り当て表と「正解」を突き合わせて測る"""
import io, json, sys

sei = json.load(io.open(u"正解.json", encoding="utf-8"))
bun, seikai = sei[u"bun"], sei[u"seikai"]
hyou = {}
for i, b in enumerate(bun):
    hyou.setdefault(b.strip(), []).append(i)

rows = []
for line in io.open(u"その他/画像割り当て.tsv", encoding="utf-8-sig").read() \
        .replace("\r\n", "\n").split("\n"):
    if not line.strip() or line.startswith(u"#"):
        continue
    c = line.split(u"\t")
    if len(c) < 6 or c[0].strip() == u"No":
        continue
    rows.append((float(c[1]), float(c[2]), c[5].strip()))

tsukatta, zure, mitsukaranai = set(), [], 0
for (st, du, tx) in rows:
    k = tx.strip()
    cand = [i for i in hyou.get(k, []) if i not in tsukatta]
    if not cand:
        mitsukaranai += 1
        continue
    i = cand[0]
    tsukatta.add(i)
    honto = seikai[i][0]
    zure.append((abs(st - honto), st, honto, k, i))

zure.sort(reverse=True)
n = len(zure)
if u"--json" in sys.argv:
    import json
    ookii = [z for z in zure if z[0] > 0.30]
    print(json.dumps({u"kazu": len(rows), u"ookii": round(zure[0][0], 3) if zure else 0.0,
                      u"heikin": round(sum(z[0] for z in zure) / max(1, n), 3),
                      u"wariai": round(100.0 * len(ookii) / max(1, n), 1),
                      u"waru": [[round(z[0], 2), round(z[1], 2), round(z[2], 2), z[3]]
                                for z in zure[:5]]}, ensure_ascii=False))
    sys.exit(0)
if not n:
    print(u"× 突き合わせられませんでした"); sys.exit(1)
heikin = sum(z[0] for z in zure) / n
ookii = [z for z in zure if z[0] > 0.30]
print(u"区切り %d枚 / 突き合わせ %d枚 / 本文が合わない %d枚" % (len(rows), n, mitsukaranai))
print(u"いちばん大きいずれ : %.2f秒" % zure[0][0])
print(u"平均のずれ         : %.2f秒" % heikin)
print(u"0.30秒を超えたもの : %d枚 (%.0f%%)" % (len(ookii), 100.0 * len(ookii) / n))
print(u"0.50秒を超えたもの : %d枚" % sum(1 for z in zure if z[0] > 0.50))
print(u"")
print(u"── ずれの大きい順 ──")
for (d, st, honto, k, i) in zure[:8]:
    print(u"  %5.2f秒  字幕 %7.2f / 声 %7.2f   %s" % (d, st, honto, k[:22]))
