# -*- coding: utf-8 -*-
u"""放送年・季・話数・原作の種類・制作会社を **AniList から引いて** 放送情報.txt に貯める。

    python 放送情報を引く.py                  … 作品一覧.txt の作品を全部引く
    python 放送情報を引く.py "デスノート" "氷菓"   … 名前を指定して引く
    python 放送情報を引く.py --足りないだけ        … まだ引いていないものだけ

■ なぜ要るか（2026-11-05・本人の指定）
  本人から「放送年や話数、原作等は間違えないように調査しながら進めて」。
  **こちらの記憶で書かない。** 台本に数字を書く前に、必ずここを通す。

■ お金はかからない
  AniList の GraphQL は無料で、鍵も要らない。OpenAI も Ollama も使わない。

■ urllib ではなく curl を使う
  AniList の前段(Cloudflare)が urllib の署名を弾いて 403 を返す。
  curl だと 200 で返るので、curl を呼ぶ。**ここを urllib に戻さないこと。**

放送情報.txt の形（タブ区切り）
  作品名 <タブ> 年 <タブ> 季 <タブ> 話数 <タブ> 原作 <タブ> 制作 <タブ> 続編数 <タブ> 向こうの題名
  引けなかったものは 年に「？」が入る。**？の作品を台本に書かない。**
"""
import io
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, u"放送情報.txt")
ICHIRAN = os.path.join(HERE, u"作品一覧.txt")

Q = (u"query ($s: String) { Page(perPage: 10) { media(search: $s, type: ANIME, "
     u"sort: SEARCH_MATCH) { format episodes status source "
     u"title { romaji native } startDate { year month } "
     u"studios(isMain: true) { nodes { name } } "
     u"relations { edges { relationType node { type } } } } } }")

SEASON = {1: u"冬", 2: u"冬", 3: u"冬", 4: u"春", 5: u"春", 6: u"春",
          7: u"夏", 8: u"夏", 9: u"夏", 10: u"秋", 11: u"秋", 12: u"秋"}
MOTO = {u"MANGA": u"漫画", u"LIGHT_NOVEL": u"ライトノベル", u"NOVEL": u"小説",
        u"ORIGINAL": u"オリジナル", u"VIDEO_GAME": u"ゲーム",
        u"VISUAL_NOVEL": u"ゲーム", u"WEB_NOVEL": u"ウェブ小説",
        u"OTHER": u"その他", u"MULTIMEDIA_PROJECT": u"企画", u"DOUJINSHI": u"同人",
        u"ANIME": u"アニメ", u"PICTURE_BOOK": u"絵本", u"LIVE_ACTION": u"実写",
        u"COMIC": u"漫画", u"GAME": u"ゲーム"}


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))
    sys.stdout.flush()


# ■ そのままでは当たらない作品の、検索に使う名前
BETSUMEI = {
    u"エルゴプラクシー": u"Ergo Proxy",
    u"サカモトデイズ": u"SAKAMOTO DAYS",
    u"Re:ゼロから始める異世界生活 第3期": u"Re:Zero kara Hajimeru Isekai Seikatsu 3rd Season",
    u"チ。地球の運動について": u"Chi. Chikyuu no Undou ni Tsuite",
    u"幽☆遊☆白書": u"Yuu Yuu Hakusho",
    u"怪獣8号": u"Kaiju No. 8",
    u"ぼっち・ざ・ろっく！": u"Bocchi the Rock!",
    u"かぐや様は告らせたい": u"Kaguya-sama wa Kokurasetai",
}


def narasu(t):
    u"""名前をそろえる。全角と半角、記号、空白、大文字小文字の違いを消す。"""
    if not t:
        return u""
    t = t.lower()
    z = u"０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ"
    h = u"0123456789abcdefghijklmnopqrstuvwxyz"
    t = t.translate({ord(a): b for a, b in zip(z, h)})
    t = re.sub(u"[\\s　・･:：!！?？~〜～\\-－—‐、。,.'\"「」『』【】\\[\\]()（）]", u"", t)
    return t


def hiku(na):
    u"""1作品引く。curl を使う（urllib は 403 になる）。"""
    sagasu = BETSUMEI.get(na, na)
    body = json.dumps({"query": Q, "variables": {"s": sagasu}})
    for i in range(4):
        try:
            r = subprocess.run(
                ["curl", "-sS", "--max-time", "25", "-X", "POST",
                 "https://graphql.anilist.co",
                 "-H", "Content-Type: application/json",
                 "-H", "Accept: application/json",
                 "-d", body],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            d = json.loads(r.stdout.decode("utf-8"))
            ms = d.get("data", {}).get("Page", {}).get("media") or []
            if not ms:
                return None
            # ■ **題名が一致するものを選ぶ**（2026-11-05・3回作り直した）
            #
            #   最初は先頭を取っていた → 暗殺教室が2013年のOVAに当たった
            #   テレビを優先した       → サカモトデイズが2027年の第2期に当たった
            #                            （第1期が配信なので）
            #   続編を外した           → ワンパンマンと魔法科が変な配信版に
            #                            当たった。**テレビ第1期のほうに
            #                            「前作あり」が付いていた**（OVAなどが
            #                            前作として登録されている）ので、
            #                            正解を捨てていた。
            #
            #   前作の有無では決まらない。**頼んだ名前と題名が一致するか**で
            #   選ぶ。一致が無いときだけ、形と古さで選ぶ。
            RUI = ("TV", "TV_SHORT", "ONA")
            nokori = [m for m in ms if m.get("format") in RUI] or ms
            pitari = [m for m in nokori
                      if narasu(m["title"].get("native")) == narasu(sagasu)
                      or narasu(m["title"].get("romaji")) == narasu(sagasu)]
            if pitari:
                nokori = pitari
            nokori.sort(key=lambda m: (
                RUI.index(m["format"]) if m.get("format") in RUI else 9,
                m["startDate"].get("year") or 9999,
                m["startDate"].get("month") or 99))
            return nokori[0]
        except Exception:
            if i == 3:
                return None
            time.sleep(2 * (i + 1))


def yomu():
    out = {}
    if not os.path.exists(OUT):
        return out
    for ln in io.open(OUT, encoding="utf-8-sig", errors="replace"):
        t = ln.rstrip(u"\n")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) >= 8:
            out[c[0]] = c
    return out


def kaku(d):
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(u"# 放送情報 ─ AniList から引いたもの（放送情報を引く.py）\n")
        f.write(u"# **こちらの記憶で書かない。台本の数字はここと合わせる。**\n")
        f.write(u"# 年が ？ のものは引けなかった。台本に数字を書かない。\n")
        f.write(u"# 作品名\t年\t季\t話数\t原作\t制作\t続編数\t向こうの題名\t形式\n")
        for k in sorted(d):
            f.write(u"\t".join(d[k]) + u"\n")


def sakuhin_ichiran():
    out = []
    if not os.path.exists(ICHIRAN):
        return out
    for ln in io.open(ICHIRAN, encoding="utf-8-sig", errors="replace"):
        c = ln.rstrip(u"\n").split(u"\t")
        if len(c) == 3 and c[0] != u"題" and c[2] not in out:
            out.append(c[2])
    return out


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    arg = [a for a in sys.argv[1:] if not a.startswith("--")]
    tarinai = ("--足りないだけ" in sys.argv) or ("--missing" in sys.argv)
    mochi = yomu()
    hoshii = arg or sakuhin_ichiran()
    if tarinai:
        hoshii = [x for x in hoshii if x not in mochi]
    if not hoshii:
        say(u"引くものがありません。")
        return 0

    say(u"%d作品を AniList から引きます（1作品に1秒ほど）" % len(hoshii))
    hikenai = []
    for i, na in enumerate(hoshii):
        m = hiku(na)
        if not m or not m.get("startDate", {}).get("year"):
            hikenai.append(na)
            mochi[na] = [na, u"？", u"？", u"？", u"？", u"？", u"0", u"引けませんでした", u"？"]
        else:
            st = u"／".join(n["name"] for n in m["studios"]["nodes"]) or u"？"
            zoku = len([e for e in m["relations"]["edges"]
                        if e["relationType"] == "SEQUEL"
                        and e["node"]["type"] == "ANIME"])
            mochi[na] = [na,
                         u"%d" % m["startDate"]["year"],
                         SEASON.get(m["startDate"].get("month") or 0, u"？"),
                         u"%s" % (m.get("episodes") or u"？"),
                         MOTO.get(m.get("source") or u"", m.get("source") or u"？"),
                         st, u"%d" % zoku,
                         (m["title"].get("native") or m["title"].get("romaji") or u""),
                         m.get("format") or u"？"]
        if (i + 1) % 20 == 0:
            say(u"  %d / %d" % (i + 1, len(hoshii)))
            kaku(mochi)
        time.sleep(0.8)
    kaku(mochi)

    say(u"")
    say(u"放送情報.txt に %d作品ぶん入っています。" % len(mochi))
    hen = [v for v in mochi.values()
           if len(v) > 8 and v[8] not in (u"TV", u"TV_SHORT", u"ONA", u"？")]
    if hikenai or hen:
        say(u"")
        if hikenai:
            say(u"[注意] %d作品が引けませんでした。**台本に数字を書かないこと。**"
                % len(hikenai))
            for x in hikenai:
                say(u"   " + x)
        if hen:
            say(u"[注意] %d作品が、テレビでも配信でもないものに当たっています。"
                u"**別名を足して引き直すこと。**" % len(hen))
            for v in hen:
                say(u"   %-24s %s年 %s話 [%s] %s" % (v[0], v[1], v[3], v[8], v[7]))
        return 1
    say(u"○ 全部引けました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
