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

# ■ もう1つの測り方 ─ 「比例配分の何割をもらったか」（2026-10-13）
#
# 本人の言葉:
#   「字幕に対して次の字幕のセリフを五つか六つくらいは言葉を発してから
#     切り替わる部分があります。ただ、その後ろのセリフは音ずれが発生しない」
#
# 本人の動画を数えたら、原因が数字で出た。
#
#   前 057  3.33秒 / 18文字 =  5.4字/秒   ← 余裕がありすぎる
#      058  0.83秒 / 17文字 = 20.5字/秒   ← **物理的に不可能**
#      合計 4.16秒 / 35文字 = 8.4字/秒    ← 合計は正しい。割り方だけ
#
# **17文字を0.83秒で読むことはできない。** これは「ずれ」として
# 測るより、「その字幕がもらった尺 ÷ 文字数ぶんの比例配分」で測るほうが
# まっすぐ出る。比が 1.0 なら比例どおり、0.3 なら7割食われている。
#
# ずれの秒数では 0.96秒 しか見えないが、この比では 0.32 と出る。
# **前の測り方では見えなかった不具合が、こちらでは一目で出る。**
import unicodedata as _ud


def _haba(t):
    return sum(2 if _ud.east_asian_width(c) in u"FWA" else 1 for c in (t or u"")) / 2.0


_hi = []
_kei_du = sum(max(0.001, r[1]) for r in rows)
_kei_mj = sum(_haba(r[2]) for r in rows)
if _kei_du > 0.01 and _kei_mj > 0.01:
    _hayasa = _kei_mj / _kei_du            # この動画の実際の字/秒
    for (_st, _du, _tx) in rows:
        _mj = _haba(_tx)
        if _mj > 0.01 and _du > 0.001:
            _hi.append((_du / (_mj / _hayasa), _tx))
_hi.sort()
_hi_mn = round(_hi[0][0], 2) if _hi else 1.0
_hi_sita = round(_hi[max(0, len(_hi) // 20)][0], 2) if _hi else 1.0
_hi_roku = sum(1 for (x, _t) in _hi if x < 0.6)

# ■ 本人が見ているものを、材料でも測る（2026-10-15・ここが抜けていた）
#
# 本人の v158 の残りは、これ1つだった。
#
#   ⚠ 声の途中で切り替わっている字幕 : 6枚 / 237枚 (3%)
#      3:09  声の 0.54秒 中で切り替え   ルーデウスとロキシーの再会を…
#      4:44  声の 0.43秒 中で切り替え   お礼にと魔眼を、それも相手の…
#
# **ところがこの検査は、それを1つも測っていなかった。**
# 測っていたのは「正解との秒数の差」「比例配分」「錨」だけ。
# 秒数の差は LEAD(0.12秒) ぶん必ず出るので 0.45秒の線で見るしかなく、
# **0.43秒 や 0.34秒 の「声の途中」は線の下に隠れる。**
# 本人の画面では、0.3秒でも喋っている最中に切り替われば分かる。
#
# ここは本人の ずれ実測.py と**同じ測り方**にする（-35dB / 0.12秒）。
# 無音の中に入っていれば ○、声の中に入っていれば ×。
# 取りちがえようがない測り方なので、線は「0枚」に置ける。
import os as _os
import re as _re
import subprocess as _sp

_LEAD = 0.12


def _koe_sagasu():
    for n in (_os.path.join(u"音声", u"merged.wav"), u"merged.wav"):
        if _os.path.exists(n):
            return n
    return None


def _muon(path):
    r = _sp.run([u"ffmpeg", u"-hide_banner", u"-nostats", u"-i", path,
                 u"-af", u"silencedetect=noise=-35dB:d=0.12",
                 u"-f", u"null", u"-"],
                stdout=_sp.PIPE, stderr=_sp.STDOUT)
    log = r.stdout.decode("utf-8", "replace")
    out, st = [], None
    for m in _re.finditer(r"silence_(start|end):\s*(-?[0-9.]+)", log):
        if m.group(1) == u"start":
            st = float(m.group(2))
        elif st is not None:
            out.append((st, float(m.group(2))))
            st = None
    out.sort()
    return out


def _shaberi_chuu(t, muon):
    u"""その時刻は声の途中か。途中なら、どれだけ入り込んでいるかを返す。"""
    for (a1, b1) in muon:
        if a1 - 0.02 <= t <= b1 + 0.02:
            return 0.0
    mae = [b1 for (a1, b1) in muon if b1 <= t]
    return (t - max(mae)) if mae else t


# ■ 「声の中」を2つに分ける。**混ぜると直せない。**（2026-10-15）
#
#   (a) 正しい所には間があるのに、声の中へ置いてしまった … **こちらの誤り**
#   (b) 正しい所そのものに間が無い（息を継がずに読んだ「、」）
#       … 置き方では直せない。切らずにくっつけるしかない
#
# 材料は正解を持っているので、この2つを取りちがえずに分けられる。
# 線を置くのは (a) だけ。(b) を混ぜた数で線を引くと、
# **材料のクセに合わせて線を動かすことになる**（前にやった失敗）。
_naka, _naka_a = [], []
_koe = _koe_sagasu()
_mu = _muon(_koe) if _koe else []
if _mu:
    for (_d0, _st, _honto, _k0, _i0) in zure:
        _f = _shaberi_chuu(_st + _LEAD, _mu)
        if _f <= 0.15:
            continue
        # 正解の位置に間があるか（LEAD を足した「声が出る時刻」で見る）
        _tadashii = _shaberi_chuu(_honto, _mu) <= 0.15
        _naka.append((round(_f, 2), round(_st, 2), _k0, _tadashii))
        if _tadashii:
            _naka_a.append((round(_f, 2), round(_st, 2), _k0))
_naka.sort(reverse=True)
_naka_a.sort(reverse=True)
_naka_ookii = _naka[0][0] if _naka else 0.0
_naka_a_ookii = _naka_a[0][0] if _naka_a else 0.0

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
                      u"hiritsu_mn": _hi_mn, u"hiritsu_sita": _hi_sita,
                      u"hiritsu_roku": _hi_roku,
                      u"naka_kazu": len(_naka),
                      u"naka_ookii": _naka_ookii,
                      u"naka_a": len(_naka_a),
                      u"naka_a_ookii": _naka_a_ookii,
                      u"naka_list": [[x[0], x[1], x[2][:24]] for x in _naka_a[:5]],
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
print(u"── 比例配分の何割をもらったか（1.00 が比例どおり）──")
print(u"いちばん低い       : %.2f" % _hi_mn)
print(u"下から5%%          : %.2f" % _hi_sita)
print(u"0.60 を下回るもの  : %d枚" % _hi_roku)
for (x, t) in _hi[:5]:
    if x < 0.80:
        print(u"  %.2f  %s" % (x, (t or u"")[:34]))
print(u"")
if _koe is None:
    print(u"（merged.wav が見つからないので、声の途中かどうかは測れていません）")
elif _naka:
    print(u"声の途中で切り替わっている字幕 : %d枚 / %d枚  いちばん深い %.2f秒"
          % (len(_naka), len(rows), _naka_ookii))
    print(u"  うち **正しい所には間があるのに声の中へ置いた** : %d枚（深さ %.2f秒）"
          % (len(_naka_a), _naka_a_ookii))
    for (f2, t2, x2) in _naka_a[:6]:
        print(u"   %7.2f  声の %.2f秒 中で切り替え   %s" % (t2, f2, (x2 or u"")[:28]))
    print(u"  のこりは、正しい所そのものに間が無い所"
          u"（息を継がずに読んだ「、」。切らずにくっつけるしかない）")
else:
    print(u"○ 切り替わりはすべて、声の切れ目（無音）で起きています")
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
