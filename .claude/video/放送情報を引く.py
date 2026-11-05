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
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, u"放送情報.txt")
ICHIRAN = os.path.join(HERE, u"作品一覧.txt")

Q = (u"query ($s: String) { Page(perPage: 1) { media(search: $s, type: ANIME, "
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


def hiku(na):
    u"""1作品引く。curl を使う（urllib は 403 になる）。"""
    body = json.dumps({"query": Q, "variables": {"s": na}})
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
            return ms[0] if ms else None
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
        f.write(u"# 作品名\t年\t季\t話数\t原作\t制作\t続編数\t向こうの題名\n")
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
            mochi[na] = [na, u"？", u"？", u"？", u"？", u"？", u"0", u"引けませんでした"]
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
                         (m["title"].get("native") or m["title"].get("romaji") or u"")]
        if (i + 1) % 20 == 0:
            say(u"  %d / %d" % (i + 1, len(hoshii)))
            kaku(mochi)
        time.sleep(0.8)
    kaku(mochi)

    say(u"")
    say(u"放送情報.txt に %d作品ぶん入っています。" % len(mochi))
    if hikenai:
        say(u"")
        say(u"[注意] %d作品が引けませんでした。**台本に数字を書かないこと。**" % len(hikenai))
        for x in hikenai:
            say(u"   " + x)
        return 1
    say(u"○ 全部引けました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
