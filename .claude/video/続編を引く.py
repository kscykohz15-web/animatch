# -*- coding: utf-8 -*-
u"""AniList から「その作品の続編・劇場版が全部で何本あるか」を引いて 続編情報.txt に書く。

    python3 -I 続編を引く.py            （まだ無い作品だけ引く）
    python3 -I 続編を引く.py --全部      （ぜんぶ引き直す）

■ なぜ要るか（2026-11-08・本人の添削）
  `放送情報.txt` は**第一期の**年・季・話数しか持っていない。
  だから台本の「第二期まで放送されています」「第三期と劇場版まで」が
  **誰にも見張られていなかった。** 本人の添削で4本まとめて出た：
    ・100カノ … もう第三期まで放送されている（台本は第二期まで）
    ・僕ヤバ  … 劇場版が公開され、第三期も決まっている（台本は第二期まで）
    ・着せ恋  … 第二期は2025年の夏（台本は年を書いていない）
    ・かぐや様 … そもそも**劇場版は公開されていない**（テレビスペシャルが二本）
  「放送情報.txt にある＝確かめた」と思っていたのが間違いで、
  **確かめていたのは第一期だけだった。**

■ 何を書くか（タブ区切り・3列）
  作品名 <タブ> TVの本数 <タブ> 一覧
  一覧は `形式:年季:話数:題名` を ｜ でつないだもの。例：
    TV:2019冬:12:かぐや様は告らせたい～…｜MOVIE:2026/2:1:劇場版 僕の心のヤバイやつ
  引けなかったものは `？` にして、**前の値を消さない**。
"""
import io
import json
import os
import re
import subprocess
import sys
import time

V = os.path.join(os.path.dirname(os.path.abspath(__file__)), u"")
MOTO = V + u"放送情報.txt"
SAKI = V + u"続編情報.txt"
URL = u"https://graphql.anilist.co"

KI = {1: u"冬", 2: u"冬", 3: u"冬", 4: u"春", 5: u"春", 6: u"春",
      7: u"夏", 8: u"夏", 9: u"夏", 10: u"秋", 11: u"秋", 12: u"秋"}

SAGASU = u"""
query ($s:String) { Page(perPage:10){ media(search:$s, type:ANIME){
  id title{ native romaji }
} } }
"""

HIKU = u"""
query ($id:Int) { Media(id:$id){
  id format episodes status
  title{ native romaji }
  startDate{ year month }
  relations{ edges{ relationType node{
    id format episodes status
    title{ native romaji }
    startDate{ year month }
  } } }
} }
"""


def tataku(q, hensu):
    u"""urllib は 403 になるので curl で叩く（メモリ 98節）。"""
    body = json.dumps({u"query": q, u"variables": hensu})
    for i in range(4):
        p = subprocess.Popen(
            ["curl", "-s", "--max-time", "30", "-X", "POST", URL,
             "-H", "Content-Type: application/json", "-d", body],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, _ = p.communicate()
        try:
            d = json.loads(out.decode("utf-8"))
        except Exception:
            time.sleep(2 + 3 * i)
            continue
        if d.get(u"data"):
            return d[u"data"]
        time.sleep(2 + 3 * i)
    return None


def hitotsu(m):
    st = m.get(u"startDate") or {}
    y, mo = st.get(u"year"), st.get(u"month")
    if y and mo:
        toki = u"%d%s" % (y, KI.get(mo, u"？"))
    elif y:
        toki = u"%d" % y
    else:
        toki = u"？"
    na = (m[u"title"].get(u"native") or m[u"title"].get(u"romaji") or u"？")
    na = na.replace(u"｜", u"|").replace(u"\t", u" ").replace(u":", u"：")
    return u"%s:%s:%s:%s:%s" % (m.get(u"format") or u"？", toki,
                                m.get(u"episodes") or u"？",
                                m.get(u"_tsuzuki") or u"－", na)


def kazoeru(moto_id):
    u"""SEQUEL をたどって本編を並べ、劇場版・特番も拾う。"""
    mita = set()
    tama = [moto_id]
    deta = []
    while tama:
        i = tama.pop(0)
        if i in mita:
            continue
        mita.add(i)
        d = tataku(HIKU, {u"id": i})
        if not d or not d.get(u"Media"):
            continue
        m = d[u"Media"]
        deta.append(m)
        for e in (m.get(u"relations") or {}).get(u"edges") or []:
            n = e[u"node"]
            if n.get(u"format") not in (u"TV", u"TV_SHORT", u"MOVIE", u"SPECIAL", u"ONA"):
                continue
            # 続きと、本編から派生した劇場版・特番だけ。別作品（親・派生元）は追わない
            # SUMMARY は総集編。僕ヤバの劇場版がこれで、拾い忘れていた（2026-11-08）
            if e[u"relationType"] in (u"SEQUEL", u"SIDE_STORY", u"ALTERNATIVE",
                                      u"SPIN_OFF", u"SUMMARY", u"PARENT"):
                n[u"_tsuzuki"] = e[u"relationType"]
                if e[u"relationType"] == u"SEQUEL":
                    tama.append(n[u"id"])
                elif n[u"id"] not in mita:
                    mita.add(n[u"id"])
                    deta.append(n)
        time.sleep(0.4)

    def itsu(m):
        st = m.get(u"startDate") or {}
        return (st.get(u"year") or 9999, st.get(u"month") or 13)
    deta.sort(key=itsu)
    tv = len([m for m in deta if m.get(u"format") in (u"TV", u"TV_SHORT")])
    return tv, u"｜".join(hitotsu(m) for m in deta)


def yomu(p):
    mochi = {}
    if not os.path.isfile(p):
        return mochi
    for ln in io.open(p, encoding="utf-8-sig"):
        t = ln.rstrip(u"\n").replace(u"\r", u"")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) >= 3:
            mochi[c[0]] = c[1:]
    return mochi


def main():
    zenbu = u"--全部" in sys.argv
    hoso = yomu(MOTO)
    mae = yomu(SAKI)
    atarashii = {}
    nokori = [na for na in hoso if zenbu or na not in mae or mae[na][0] == u"？"]
    print(u"放送情報.txt は %d本、引くのは %d本" % (len(hoso), len(nokori)))
    for n, na in enumerate(sorted(nokori), 1):
        mukou = hoso[na][6] if len(hoso[na]) > 6 else na
        d = tataku(SAGASU, {u"s": mukou})
        moto = None
        if d and d.get(u"Page"):
            for m in d[u"Page"][u"media"]:
                if (m[u"title"].get(u"native") or u"") == mukou:
                    moto = m[u"id"]
                    break
            if moto is None and d[u"Page"][u"media"]:
                moto = d[u"Page"][u"media"][0][u"id"]
        if moto is None:
            print(u"  %3d/%d ？ %s（見つからない）" % (n, len(nokori), na))
            continue
        tv, ichiran = kazoeru(moto)
        atarashii[na] = [unicode(tv) if str is bytes else str(tv), ichiran]
        print(u"  %3d/%d ○ %s … TV %d本 / 全 %d本"
              % (n, len(nokori), na, tv, ichiran.count(u"｜") + 1))
        time.sleep(0.4)

    deru = dict(mae)
    deru.update(atarashii)
    with io.open(SAKI, "w", encoding="utf-8", newline="\n") as f:
        f.write(u"# 続編情報 ─ AniList から引いたもの（続編を引く.py）\n")
        f.write(u"# **こちらの記憶で書かない。台本の「第N期まで」「劇場版」はここと合わせる。**\n")
        f.write(u"# 作品名\tTVの本数\t一覧（形式:年季:話数:続柄:題名 を ｜ でつないだもの）\n")
        f.write(u"# 続柄 SUMMARY は総集編。劇場版と書いてよいが「新作」ではない。\n")
        for na in sorted(deru):
            f.write(u"%s\t%s\n" % (na, u"\t".join(deru[na])))
    print(u"\n続編情報.txt に %d本ぶん書きました（新しく引いたのは %d本）"
          % (len(deru), len(atarashii)))


if __name__ == "__main__":
    main()
