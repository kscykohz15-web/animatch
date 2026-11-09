# -*- coding: utf-8 -*-
u"""台本のあらすじを、作品メモ.txt（調べて確かめた中身）と突き合わせる。

    python3 -I 作品メモ検査.py <台本_字幕用.txt> ...

■ なぜ要るか（2026-11-09・本人の指定）
  「作品について調査した内容は今後もデータベースとして保管することで
    次回以降も間違いのないデータが使えます」

  数字は 放送情報.txt / 続編情報.txt / 点数表.txt が持っていて、
  放送情報検査.py と 事実検査.py が見張っている。
  **見張られていなかったのは「中身」** ── 人物の立場と筋。
  本人の添削11件とこちらの10件は、ほとんどがそこだった。

■ 見るもの（×は落とす／!は注意）
  × ① 禁句     … 作品メモの「言わない」に書いた言い方が台本に出ている
                  （実際に間違えた言い方そのもの。二度と黙って戻らないように）
  ! ② 人物名   … メモの主人公・ヒロインの名前が、その作品の段落に出てこない
                  （役どころだけで書く回もあるので、落とさず人に見せる）
  … ③ 控えなし … 台本にあるのにメモに行が無い（1行にまとめて出す。落とさない）

■ 禁句の書き方
  「言わない」は**台本に出たままの字**で書く。たとえば

      雛人形の衣装を作れる主人公
      幽霊を信じる主人公の高倉健
      亡国の皇子

  言い換えを網羅しようとしない。**実際に出た形だけ**を入れる。
  それ以上は人が読む（添削の手順.txt の2周目）。
"""
import io
import os
import re
import sys

V = os.path.join(os.path.dirname(os.path.abspath(__file__)), u"")
MEMO = V + u"作品メモ.txt"

TSUNAGI = (u"最初にご紹介する作品は|一番最初にご紹介する作品は|続いての作品は|"
           u"続く作品は|続いては|次の作品は|最後にご紹介する作品は")


def say(m):
    try:
        print(m)
    except Exception:
        print(m.encode("utf-8", "replace"))


def yomu_memo():
    out = {}
    if not os.path.isfile(MEMO):
        return out
    for ln in io.open(MEMO, encoding="utf-8-sig"):
        t = ln.rstrip(u"\n").replace(u"\r", u"")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) < 6:
            continue
        out[c[0]] = {u"主人公": c[1], u"ヒロイン": c[2], u"筋": c[3],
                     u"禁句": [x for x in c[4].split(u"｜") if x and x != u"－"],
                     u"日": c[5]}
    return out


def namae(t):
    u"""「五条新菜（雛人形の…）」から 五条新菜 を取る。／ で複数名もある。"""
    if not t or t == u"－":
        return []
    out = []
    for x in t.split(u"／"):
        x = re.sub(u"（.*", u"", x).strip()
        x = x.replace(u"*", u"").strip()
        if x and x != u"－":
            out.append(x)
    return out


def dan(path):
    return [x.strip() for x in
            io.open(path, encoding="utf-8-sig").read().replace("\r\n", "\n").split("\n")
            if x.strip()]


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    hikisu = [x for x in sys.argv[1:] if not x.startswith(u"--")]
    if not hikisu:
        say(u"使い方: python3 -I 作品メモ検査.py <台本_字幕用.txt> ...")
        return 1
    memo = yomu_memo()
    if not memo:
        say(u"作品メモ.txt がありません。")
        return 1

    ochita = 0
    for path in hikisu:
        p = dan(path)
        warui, chui, nai, mita = [], [], [], 0
        for i, x in enumerate(p):
            m = re.search(u"(?:%s)、?(.+)$" % TSUNAGI, x)
            if not m:
                continue
            na = m.group(1).strip()
            # 作品の5段落（つなぎ・情報・あらすじ・魅力・締め）
            waku = u"\n".join(p[i:i + 5])
            mita += 1

            key = na if na in memo else None
            if key is None:
                kouho = [k for k in memo if na.startswith(k) or k.startswith(na)]
                key = kouho[0] if len(kouho) == 1 else None
            if key is None:
                nai.append(na)
                continue
            mm = memo[key]

            # ① 禁句
            for ng in mm[u"禁句"]:
                if ng in waku:
                    warui.append(u"%s … 禁句「%s」が出ています（%s に直したもの）"
                                 % (na, ng, mm[u"日"]))

            # ② 人物名
            for yaku in (u"主人公", u"ヒロイン"):
                na2 = namae(mm[yaku])
                if not na2:
                    continue
                if not any(x in waku for x in na2):
                    chui.append(u"%s … %s の名前（%s）が段落に出てきません"
                                % (na, yaku, u"／".join(na2)))

        na = os.path.basename(path).replace(u"_字幕用_最終版.txt", u"")
        say(u"── %s（作品 %d本／控えあり %d本）" % (na, mita, mita - len(nai)))
        for w in warui:
            say(u"  × %s" % w)
        for c in chui:
            say(u"  ! %s" % c)
        if nai:
            # **1行にまとめる。** 1作品ずつ出すと、控えが揃うまで毎回20行鳴って
            # 本物の×が埋まる（2026-11-09 に実際に埋まった）
            say(u"  … 控えがまだ無い %d本: %s%s"
                % (len(nai), u" / ".join(x[:18] for x in nai[:5]),
                   u" ほか" if len(nai) > 5 else u""))
        if not warui:
            say(u"  ○ 禁句は出ていません" + (u"（注意 %d件）" % len(chui) if chui else u""))
        else:
            ochita += 1
    say(u"")
    say(u"落ちた台本 %d／%d本" % (ochita, len(hikisu)))
    return 1 if ochita else 0


if __name__ == "__main__":
    sys.exit(main())
