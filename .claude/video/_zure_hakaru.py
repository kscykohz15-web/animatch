# -*- coding: utf-8 -*-
u"""字幕ずれ検査 ─ 出来た割り当て表と「正解」を突き合わせて測る"""
import io, json, sys

# 「超えた」と数える線。本人の ずれ実測.py と同じ 0.45秒。
# 字幕は設計上 LEAD=0.12秒ぶん先に出すので、完璧に合っていても0.24秒前後は出る。
# 0.30秒はそのすぐ上で、ほぼ合っているものまで赤にしていた。
SHIKII = 0.45

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

# ■ 突き合わせは「順番」で行う（2026-10-05）
#
# 前は本文で引いていたので、**同じ文字列が2回出ると別の場所に当たり**、
# 7秒といった偽のずれが出ていた（328個中 9個が重複）。
# それに合わせて決め方を直しかけた。測り方の誤りを直すのが先。
# いまは「前に当てた所から少し先」だけを見る。
# ■ 突き合わせは「背番号」で一対一にする（2026-10-06）
#
# 前は本文で引いていた。同じ文字列が出ると別の場所に当たり、
# 「本文が合わない」が1枚出たとたん**そこから先が1つずつ食いちがって**、
# 2.66秒・2.37秒といった**偽のずれ**が並んだ。
# それを本物のずれだと思って決め方を直しかけた（2回目）。
#
# いまは材料のほうが、かたまり1つ1つに重ならない背番号を付けている。
# 一対一で決まるので、**出た数字は全部本物**。
# 一対一にならなかったら、ずれではなく **検査の失敗** として落とす。
if len(hyou) != len(bun):
    print(u"× 材料のかたまりに重なりがあります（%d個中 ちがう本文は %d個）。"
          u"背番号が効いていません。" % (len(bun), len(hyou)))
    sys.exit(1)

# ■ くっつけた字幕も突き合わせられるようにする（2026-10-07）
#
# 「声が止まっていない「、」では切らない」ようにしたので、
# 1枚の字幕が **正解の切れはし2つ以上** を含むようになった。
# 本文をまるごと突き合わせる作りでは一致せず、
# 「本文が合わない」が 16枚 → 67枚 に増えた。
# **測れていないぶんが悪い所かもしれない**ので、このままでは数字を信じられない。
#
# 背番号は切れはしの先頭3文字なので、**字幕の先頭3文字**で引けば、
# くっついていてもその字幕が始まる切れはしが分かる。
atama3 = {}
for i, (tx2, _) in enumerate(zip(bun, seikai)):
    atama3.setdefault(tx2.strip()[:3], []).append(i)

zure, mitsukaranai = [], 0
for (st, du, tx) in rows:
    k = tx.strip()
    hits = hyou.get(k, [])
    if len(hits) != 1:
        hits = atama3.get(k[:3], [])
    if len(hits) != 1:
        mitsukaranai += 1
        continue
    i = hits[0]
    honto = seikai[i][0]
    zure.append((abs(st - honto), st, honto, k, i))

# ■ ずれを「どの仕組みのせいか」で分ける（2026-10-06）
#
#   段落の頭 → kugiri_awase（1行ずつの音声の境目。ここは実測なので合う）
#   文の頭   → place_in_chunk（かたまりの中の文の切れ目）
#   それ以外 → koma_awase（「、」の切れ目）
#
# どこが悪いか分からないまま数字だけ見て、関係ない所を触るのを防ぐ。
atama = set(sei.get(u"atama", []))
bun_atama = set(sei.get(u"bun_atama", [])) - atama
anc = [z for z in zure if z[4] in atama]
naka = [z for z in zure if z[4] not in atama]
bun_s = [z for z in zure if z[4] in bun_atama]
ten_s = [z for z in zure if z[4] not in atama and z[4] not in bun_atama]

zure.sort(reverse=True)
n = len(zure)
if u"--json" in sys.argv:
    import json
    ookii = [z for z in zure if z[0] > SHIKII]
    def matome(v):
        if not v:
            return [0.0, 0.0, 0.0]
        return [round(max(x[0] for x in v), 2), round(sum(x[0] for x in v) / len(v), 2),
                round(100.0 * sum(1 for x in v if x[0] > SHIKII) / len(v), 0)]
    print(json.dumps({u"kazu": len(rows), u"ookii": round(zure[0][0], 3) if zure else 0.0,
                      u"anc": matome(anc), u"naka": matome(naka),
                      u"bun": matome(bun_s), u"ten": matome(ten_s),
                      u"heikin": round(sum(z[0] for z in zure) / max(1, n), 3),
                      u"wariai": round(100.0 * len(ookii) / max(1, n), 1),
                      u"waru": [[round(z[0], 2), round(z[1], 2), round(z[2], 2), z[3]]
                                for z in zure[:5]]}, ensure_ascii=False))
    sys.exit(0)
if not n:
    print(u"× 突き合わせられませんでした"); sys.exit(1)
heikin = sum(z[0] for z in zure) / n
ookii = [z for z in zure if z[0] > SHIKII]
# ■ 句読点の無い所で切った字幕を数える（2026-10-09）
# 本人の第6回では13枚あって、0.45秒超の上位7件を全部作っていた。
# 声は「ルーデウスは」で止まらない。止まらない所に合わせ先の「間」は無い。
_hon = [r for r in rows if r[2].strip()]
KUTEN_NASHI = sum(1 for i, r in enumerate(_hon)
                  if i < len(_hon) - 1 and r[2].strip()[-1] not in u"。！？、")
print(u"区切り %d枚 / 突き合わせ %d枚 / 本文が合わない %d枚" % (len(rows), n, mitsukaranai))
print(u"句読点の無い所で切った字幕 : %d枚%s"
      % (KUTEN_NASHI, u"" if not KUTEN_NASHI else u"  ← ここは必ずずれます"))
print(u"いちばん大きいずれ : %.2f秒" % zure[0][0])
print(u"平均のずれ         : %.2f秒" % heikin)
print(u"%.2f秒を超えたもの : %d枚 (%.0f%%)" % (SHIKII, len(ookii), 100.0 * len(ookii) / n))
print(u"0.50秒を超えたもの : %d枚" % sum(1 for z in zure if z[0] > 0.50))
print(u"")
print(u"")
print(u"── どの仕組みのせいか ──")
def shu(na, v):
    if not v:
        print(u"  %-28s なし" % na); return
    print(u"  %-28s %3d枚 / 最大 %.2f / 平均 %.2f / 0.3超 %d枚"
          % (na, len(v), max(x[0] for x in v), sum(x[0] for x in v) / len(v),
             sum(1 for x in v if x[0] > SHIKII)))
shu(u"段落の頭 (kugiri_awase)", anc)
shu(u"文の頭   (place_in_chunk)", bun_s)
shu(u"「、」   (koma_awase)", ten_s)
print(u"")
print(u"── ずれの大きい順 ──")
for (d, st, honto, k, i) in zure[:8]:
    print(u"  %5.2f秒  字幕 %7.2f / 声 %7.2f   %s" % (d, st, honto, k[:22]))
