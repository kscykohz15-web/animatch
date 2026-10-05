# -*- coding: utf-8 -*-
u"""話数を学ぶ ─ 本人が直した絵から、章ごとの「アニメ何話か」を学び直す

本人の指定（2026-10-05）:
  「27番目までの私が割り当てた画像から、割り当ての法則を解き明かし、
    それ以外の部分も作り直してください」

いちばん効く法則は、27件からはっきり出ていた。

  本人が選んだ話数   Ⅲ12・Ⅲ11・Ⅲ14・Ⅲ8
  機械が使った話数   Ⅲ13 を9枚   ← 本人は27件で一度も選んでいない

絵が合うかどうかは、**その章をどの話数から探すか**でほぼ決まる。
そこが外れていると、どんなに賢く選んでも外れたままになる（メモリ 14.56）。

この道具は、`その他/差し替え.txt` に書かれた本人の直しを「正解」として、
章ごとに**本人が実際に選んだ話数の順**を数え、`画面表示.txt` の
章の行の4列目を書きかえる。

  ・直しが増えるほど賢くなる。27件でも、200件でも同じように効く
  ・本人が一度も選ばなかった話数は、後ろに下げる（消しはしない）
  ・直しの無い章は、いまの設定をそのまま残す

使い方:
    python 話数を学ぶ.py            … 何が変わるかを見るだけ
    python 話数を学ぶ.py --書く     … 画面表示.txt を書きかえる
"""
from __future__ import print_function
import argparse
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

KI_KIGOU = ((u"Ⅲ", 3), (u"Ⅱ", 2), (u"III", 3), (u"II", 2))


def yomu(p):
    return io.open(p, encoding="utf-8-sig", errors="replace").read() \
        .replace(u"\r\n", u"\n")


def fol_code(fol):
    ki = 1
    for kigou, n in KI_KIGOU:
        if kigou in fol:
            ki = n
            break
    m = re.search(r"第\s*(\d+)\s*話", fol)
    return (ki, int(m.group(1))) if m else None


def img_code(img):
    if not img or u"/" not in img:
        return u""
    fol, name = img.split(u"/", 1)
    ke = fol_code(fol)
    m = re.match(r"(\d+)", os.path.basename(name))
    if not ke or not m:
        return u""
    return u"%d-%02d-%03d" % (ke[0], ke[1], int(m.group(1)))


def code_norm(t):
    u = (t or u"").strip()
    for kigou, n in KI_KIGOU:
        if u.startswith(kigou):
            u = u"%d%s" % (n, u[len(kigou):])
            break
    kazu = re.findall(r"\d+", u)
    if len(kazu) == 3:
        ki, wa, no = (int(x) for x in kazu)
    elif len(kazu) == 2 and u[:1].isdigit() and len(kazu[0]) >= 3:
        ki, wa, no = int(kazu[0][0]), int(kazu[0][1:]), int(kazu[1])
    else:
        return None
    return (ki, wa, no) if ki in (1, 2, 3) and wa <= 99 else None


def load_ichiran(path):
    u"""確認用/一覧.txt → [(番号, 画像, セリフ)]"""
    hashira, rows = {}, []
    for line in yomu(path).split(u"\n"):
        if not line.strip() or line.startswith(u"#"):
            continue
        c = line.split(u"\t")
        if len(c) < 5:
            continue
        if c[0].strip() == u"番号":
            for i, nm in enumerate(c):
                hashira[nm.strip()] = i
            continue
        try:
            no = int(c[0].strip())
        except ValueError:
            continue

        def hiku(nm, kitei):
            i = hashira.get(nm, kitei)
            return c[i].strip() if 0 <= i < len(c) else u""
        rows.append((no, hiku(u"画像", 3), hiku(u"セリフ", len(c) - 1)))
    return rows


def load_sashikae(path, codes):
    u"""差し替え.txt → {番号: 話数フォルダ}。絵の番号からフォルダを引く。"""
    out = {}
    if not os.path.exists(path):
        return out
    for line in yomu(path).split(u"\n"):
        t = line.strip()
        if not t or t.startswith(u"#"):
            continue
        c = [x for x in re.split(r"[\t　 ]{1,}", t)
             if x and x.strip() not in (u"タブ", u"TAB", u"tab", u"\\t")]
        if len(c) < 2:
            continue
        try:
            no = int(c[0])
        except ValueError:
            continue
        ke = code_norm(u" ".join(c[1:]))
        if not ke:
            continue
        fol = codes.get(u"%d-%02d" % (ke[0], ke[1]))
        if fol:
            out[no] = fol
    return out


def load_overlay(path):
    u"""画面表示.txt の章の行を、行番号つきで読む。"""
    gyou = yomu(path).split(u"\n")
    shou = []
    for i, line in enumerate(gyou):
        c = line.split(u"\t")
        if len(c) >= 3 and c[0].strip() == u"章":
            eps = [x.strip() for x in c[3].split(u",")] if len(c) > 3 else []
            shou.append({u"i": i, u"key": c[1].strip(), u"na": c[2].strip(),
                         u"eps": [e for e in eps if e]})
    return gyou, shou


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(u"--一覧", dest="ichiran", default=os.path.join(u"確認用", u"一覧.txt"))
    ap.add_argument(u"--差し替え", dest="sashi", default=os.path.join(u"その他", u"差し替え.txt"))
    ap.add_argument(u"--画面表示", dest="overlay", default=u"画面表示.txt")
    ap.add_argument(u"--書く", dest="kaku", action="store_true")
    a = ap.parse_args()

    for p in (a.ichiran, a.overlay):
        if not os.path.exists(p):
            print(u"× %s がありません。先に動画を1回作ってください。" % p)
            return 1
    rows = load_ichiran(a.ichiran)
    if not rows:
        print(u"× 一覧.txt が読めませんでした。")
        return 1

    # 期-話 → フォルダ名 の対応は、実際に出ている絵から作る
    codes = {}
    for (_no, img, _tx) in rows:
        if u"/" in img:
            ke = fol_code(img.split(u"/")[0])
            if ke:
                codes[u"%d-%02d" % ke] = img.split(u"/")[0]

    sashi = load_sashikae(a.sashi, codes)
    if not sashi:
        print(u"差し替え.txt に、絵の番号で書かれた直しがありません。")
        print(u"（本人の直しが無いと、学ぶものがありません）")
        return 0

    gyou, shou = load_overlay(a.overlay)
    if not shou:
        print(u"× 画面表示.txt に章の行がありません。")
        return 1

    # どの番号がどの章に属するか。章は「そのキーワードが最初に出る所」から
    kiri, tsukatta = {}, set()
    for s in shou:
        for (no, _img, tx) in rows:
            if s[u"na"] in tsukatta or not s[u"key"]:
                continue
            if s[u"key"] in tx:
                kiri[no] = s[u"na"]
                tsukatta.add(s[u"na"])
                break
    kugiri = sorted(kiri)

    def shou_no(no):
        na = None
        for k in kugiri:
            if k <= no:
                na = kiri[k]
            else:
                break
        return na or (shou[0][u"na"] if shou else None)

    # 章ごとに、本人が選んだ話数を数える
    kazoe = {}
    for no, fol in sorted(sashi.items()):
        na = shou_no(no)
        if na:
            kazoe.setdefault(na, {}).setdefault(fol, 0)
            kazoe[na][fol] += 1

    print(u"本人の直し %d件 を、章ごとに数えました" % len(sashi))
    print(u"")
    kaeta = 0
    for s in shou:
        k = kazoe.get(s[u"na"])
        if not k:
            continue
        erabi = sorted(k, key=lambda f: (-k[f], f))
        # 本人が選んだ話数を前に、もとからあって選ばれなかったものを後ろに
        nokori = [e for e in s[u"eps"] if e not in erabi]
        atarashii = erabi + nokori
        onaji = atarashii == s[u"eps"]
        print(u"── %s  （直し %d件）" % (s[u"na"].replace(u"\\N", u" "), sum(k.values())))
        print(u"   本人が選んだ: " + u", ".join(u"%s×%d" % (f, k[f]) for f in erabi))
        print(u"   いま        : " + (u", ".join(s[u"eps"]) or u"（指定なし）"))
        if onaji:
            print(u"   → 変えるところはありません")
        else:
            print(u"   → " + u", ".join(atarashii))
            erabarezu = [e for e in s[u"eps"] if e not in erabi]
            if erabarezu:
                print(u"      （%s は一度も選ばれていないので後ろに下げます）"
                      % u", ".join(erabarezu))
            kaeta += 1
            c = gyou[s[u"i"]].split(u"\t")
            while len(c) < 4:
                c.append(u"")
            c[3] = u", ".join(atarashii)
            gyou[s[u"i"]] = u"\t".join(c[:4])
        print(u"")

    if not kaeta:
        print(u"学んだ結果、変えるところはありませんでした。")
        return 0
    if not a.kaku:
        print(u"%d章ぶん変わります。書きかえるには --書く を付けてください。" % kaeta)
        return 0
    io.open(a.overlay, "w", encoding="utf-8-sig", newline="\r\n") \
        .write(u"\n".join(gyou).replace(u"\n", u"\r\n"))
    print(u"%d章ぶん書きかえました: %s" % (kaeta, a.overlay))
    print(u"「はじめる.bat」→ 2 → 1 で作り直すと、学んだ話数で選び直します。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
