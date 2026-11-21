# -*- coding: utf-8 -*-
u"""作品の **掲載誌／レーベル** を日本語版ウィキペディアから引いて、
   放送情報.txt の 10列目に足す。

    python 掲載誌を引く.py            放送情報.txt の空いている所だけ
    python 掲載誌を引く.py 作品名 …   その作品だけ引き直す

■ なぜ要るか（2026-11-05・本人の指定）
  「放送年や話数、原作等は間違えないように調査しながら進めてください」。
  紹介の型 9節①で、原作者名の代わりに **制作会社＋掲載誌／レーベル** を書く。
  記憶で書くと、原作者名を読み間違えるのと同じ事故になる。**引いたものだけ書く。**

■ お金はかからない
  ウィキペディアの ?action=raw を読むだけ。鍵も要らない。
  出口が共有なので 429 が返る。curl の --retry で待つ。

■ つまずいた所（2026-11-05）
  ① 1つの記事に infobox が何個もある（原作小説・漫画版・アニメ）。
     「堀さんと宮村くん」の1つめの 掲載誌 は個人サイト名「読解アヘン」。
     ほしいのは2つめの「月刊Gファンタジー」。
     → **全部拾ってから、雑誌らしい名前だけ通す。**
  ② 原作がラノベの作品で漫画版の掲載誌を拾っていた。
     「とらドラ！」は電撃文庫なのに「月刊電撃コミックガオ!」になった。
     → **原作の種類で、見る欄と物差しを変える。**
  ③ 記事名が作品名と違う（とらドラ！→とらドラ!）。
     → 全角の ！？ を半角にした形でも試す。

引けなかった作品は 10列目を「？」にする。
**「？」の作品の掲載誌は台本に書かないこと**（放送情報検査.py が落とす）。
"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
JOHO = os.path.join(HERE, u"放送情報.txt")

# ウィキペディアの記事名が作品名と違うもの
KIJI = {
    # 「IS」は短すぎて記事にたどり着けない（2026-11-09）
    u"IS": u"IS 〈インフィニット・ストラトス〉",
    u"To LOVEる": u"To LOVEる -とらぶる-",
    u"鋼の錬金術師 FULLMETAL ALCHEMIST": u"鋼の錬金術師",
    u"ホリミヤ": u"堀さんと宮村くん",
    u"DARKER THAN BLACK -黒の契約者-": u"DARKER THAN BLACK",
    u"デスノート": u"DEATH NOTE",
    u"推しの子": u"【推しの子】",
    u"【推しの子】第2期": u"【推しの子】",
    u"チ。地球の運動について": u"チ。-地球の運動について-",
    u"86 エイティシックス": u"86―エイティシックス―",
    u"最凶の支援職【話術士】":
        u"最凶の支援職【話術士】である俺は世界最強クランを従える",
    u"転生したら第七王子だったので":
        u"転生したら第七王子だったので、気ままに魔術を極めます",
}

# 原作がゲームや古典で、掲載誌もレーベルも無いもの
NASHI = (u"CLANNAD", u"CLANNAD AFTER STORY", u"ひぐらしのなく頃に",
         u"平家物語", u"Angel Beats!", u"フリクリ")

# **雑誌らしい名前だけ通す。** 個人サイト名を拾う事故があった。
ZASSHI = re.compile(
    u"週刊|月刊|隔週刊|別冊|季刊|ジャンプ|マガジン|サンデー|チャンピオン|"
    u"ガンガン|アフタヌーン|モーニング|スピリッツ|ヤング|なかよし|りぼん|"
    u"デザート|花とゆめ|マーガレット|ゼロサム|シリウス|エース|ブレイド|"
    u"ファンタジー|GANMA|LaLa|Cheese|ちゃお|コミック|COMIC|Comic|"
    u"オンライン|ONLINE|プラス|＋|ポケット|クロス|ガンマ|ネクスト|ゲッサン")
# 文庫・レーベルらしい名前
BUNKO = re.compile(u"文庫|ブックス|Books|BOOKS|ノベル|NOVEL")
# 誌名が変わったもの（ウィキの infobox は古い名前が先に来る）
KAIMEI = {u"チャンピオンクロス": u"マンガクロス"}
# カテゴリの分類名（雑誌名ではない）
BUNRUI = re.compile(u"作品|原作|アニメ|テレビ|映画|ドラマ|年の|を舞台|"
                    u"シリーズ|小説家になろう|漫画家|声優|カテゴリ")


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))


def quote(s):
    try:
        from urllib.parse import quote as q
    except ImportError:
        from urllib import quote as q
        return q(s.encode("utf-8"), safe="")
    return q(s, safe="")


def kijimei(na):
    u"""記事名の候補を順に出す。

    ・全角の ！？ を半角にした形（とらドラ! の記事名）
    ・続編の「第2期」「3」を落とした形（記事は1本にまとまっている）
    ・「○○ (漫画)」「○○ (小説)」（同じ名前の記事があるとき）
    """
    moto = KIJI.get(na, na)
    out = [moto]

    def tasu(x):
        if x and x not in out:
            out.append(x)

    tasu(moto.replace(u"！", u"!").replace(u"？", u"?")
         .replace(u"：", u":").replace(u"　", u" "))
    # 続編の印を落とす
    moto2 = re.sub(u"[ 　]*第[0-9０-９一二三四五六七八九十]+期$", u"", moto)
    moto2 = re.sub(u"[0-9０-９]$", u"", moto2)
    if moto2 != moto:
        tasu(moto2)
        tasu(moto2.replace(u"！", u"!").replace(u"？", u"?"))
    tasu(moto.split(u" -")[0].split(u"　-")[0])
    for k in (u"漫画", u"小説"):
        tasu(u"%s (%s)" % (moto2, k))
    return out


def hiku(kiji):
    u"""記事の中身を取る。#REDIRECT は1回だけ追う。"""
    t = u""
    for _ in range(2):
        try:
            r = subprocess.run(
                ["curl", "-sS", "-m", "40", "--retry", "5",
                 "--retry-delay", "5", "--retry-all-errors",
                 "-A", "animatch-script-checker/1.0",
                 "https://ja.wikipedia.org/wiki/"
                 + quote(kiji) + "?action=raw"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except Exception as e:
            return u"", u"ひけません（%s）" % e
        t = r.stdout.decode("utf-8", "replace")
        if not t.strip():
            return u"", u"記事がありません"
        # **出口が共有なので 429 が返る。** その時はウィキのエラーページが
        # そのまま来るので、記事と間違えないよう弾く（1回まるごと誤診した）。
        if t.lstrip()[:60].lower().startswith(u"<!doctype html") \
                or u"Wikimedia Error" in t[:400] \
                or u"Too many requests" in t[:400]:
            return u"", u"ウィキが混んでいます（429）。あとでもう一度"
        m = re.match(u"\\s*#(?:REDIRECT|転送)\\s*\\[\\[([^\\]|#]+)", t, re.I)
        if m:
            kiji = m.group(1).strip()
            continue
        # **曖昧さ回避のページは記事ではない**（2026-11-05）。
        # 「涼宮ハルヒの憂鬱」は一覧ページで、本体は「(小説)」のほう。
        # ここで止まっていたので、「無い」と返して次の候補名へ進める。
        if re.search(u"\\{\\{(aimai|Aimai|曖昧さ回避|dabpage)", t):
            return u"", u"曖昧さ回避のページです"
        return t, u""
    return t, u""


def kirei(v):
    u"""ウィキの書き方から名前だけ取り出す。"""
    v = v.split(u"<ref")[0]
    v = re.sub(u"\\{\\{[^{}]*\\}\\}", u"", v)
    v = re.sub(u"<!--.*?-->", u"", v, flags=re.S)
    v = re.sub(u"</?[a-zA-Z][^>]*>", u"", v)
    # 「旧名→今の名」と書いてあるときは **今の名** を取る
    # （僕の心のヤバイやつ は「チャンピオンクロス→マンガクロス」）
    v = v.split(u"→")[-1].split(u"、")[0]
    nakami = re.findall(u"\\[\\[([^\\]]+)\\]\\]", v)
    if nakami:
        # 「[[週刊ヤングジャンプ#となりのヤングジャンプ|となりのヤングジャンプ]]」
        # のように節へのリンクになっているときは、**縦棒の右（表示名）**が
        # 本当の誌名。前は左を取って「週刊ヤングジャンプ」にしていた
        # （ワンパンマンで間違えた・2026-11-05）。
        bu = nakami[0].split(u"|")
        v = bu[-1] if (len(bu) > 1 and u"#" in bu[0]) else bu[0]
    v = v.replace(u"[[", u"").replace(u"]]", u"").replace(u"'''", u"")
    v = v.split(u"#")[0]
    # 記事名の後ろの但し書きと、ウィキの注記を落とす
    v = re.sub(u"[ 　]*[（(](雑誌|漫画|小説|文庫本|レーベル)[）)]", u"", v)
    # 別の版のレーベルは要らない（本好きの下剋上の「児童書版：TOジュニア文庫」）
    if re.match(u"^(児童書版|文庫版|新装版|完全版|ソフトカバー版|愛蔵版)[：:]", v):
        return u""
    v = re.sub(u"^(単行本版)[：:]", u"", v)
    return v.strip().strip(u"-–—").strip()


def kirei_zenbu(raw):
    u"""1つの欄に並んでいる名前を、**並んでいる順のまま**全部返す。

    「少年ジャンプNEXT!<br />週刊少年ジャンプ」のように、
    移った順で並んでいることが多い。
    """
    raw = raw.split(u"<ref")[0]
    raw = re.sub(u"\\{\\{[^{}]*\\}\\}", u"", raw)
    raw = re.sub(u"<!--.*?-->", u"", raw, flags=re.S)
    raw = re.sub(u"<br\\s*/?>", u"\n", raw, flags=re.I)
    raw = re.sub(u"</?[a-zA-Z][^>]*>", u"", raw)
    out = []
    for p in re.split(u"[\n→、]", raw):
        v = kirei(p)
        if v and len(v) <= 30 and v not in out:
            out.append(v)
    return out


def saguru(t, gensaku):
    u"""原作の種類で見る欄を変え、**候補を全部**「｜」で繋いで返す。

    ■ 1つに決めるのをやめた（2026-11-05・4回作り直した）
      1つの欄に雑誌が並ぶとき、どれが本当の掲載誌かは機械では決まらない。

        最初を取る → 斉木楠雄が「少年ジャンプNEXT!」、
                     かぐや様が「ミラクルジャンプ」（どちらも創刊時の掲載誌）
        最後を取る → 進撃の巨人が「別冊少年マガジン」から
                     「週刊少年マガジン」に、推しの子が
                     「週刊ヤングジャンプ」から「少年ジャンプ+」に化けた
        1つだけ通す → 35本が「？」になった。鬼滅も進撃も薬屋も落ちる

      **決めるのは書く側の仕事。** ここは記事が挙げている誌名を全部渡す。
      放送情報検査.py は、台本の誌名が**そのどれかと合っていれば**通す。
      これで「記事に書いていない誌名」だけが落ちる。
    """
    if gensaku in (u"ライトノベル", u"小説", u"ウェブ小説"):
        ran = (u"レーベル", u"レーベル1")
        rashii, dame = BUNKO, None
    else:
        ran = (u"掲載誌", u"掲載誌1", u"雑誌")
        rashii, dame = ZASSHI, BUNKO
    out = []
    for k in ran:
        for m in re.finditer(u"^\\s*\\|\\s*" + k + u"\\s*=\\s*(.*)$", t, re.M):
            for v in kirei_zenbu(m.group(1)):
                if not rashii.search(v) or (dame and dame.search(v)):
                    continue
                v = KAIMEI.get(v, v)
                if v not in out:
                    out.append(v)
    # 小説が原作のときだけ、infobox が無い記事の Category から文庫を拾う。
    # 「ヴァイオレット・エヴァーガーデン」は infobox が無く、
    # [[Category:KAエスマ文庫]] しか手がかりがない。
    # **雑誌側ではやらない。** 分類名を雑誌名と間違える事故は全部そちらで出た
    # （「ハイファンタジー漫画」「BUNCH COMICSのアニメ作品」）。
    if not out and rashii is BUNKO:
        for m in re.finditer(u"\\[\\[Category:([^\\]|]+)\\]\\]", t):
            c = m.group(1).strip()
            if len(c) <= 30 and BUNKO.search(c) and not BUNRUI.search(c):
                out.append(c)
                break
    return u"｜".join(out[:5])


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    gyou = [ln.rstrip(u"\n") for ln in io.open(JOHO, encoding="utf-8-sig")]
    zenbu = u"--全部" in sys.argv or "--all" in sys.argv
    nozomi = [a for a in sys.argv[1:] if not a.startswith("--")]
    kazu = {u"引けた": 0, u"だめ": 0, u"そのまま": 0}
    out = []
    for g in gyou:
        if not g.strip() or g.startswith(u"#"):
            out.append(g)
            continue
        c = g.split(u"\t")
        na = c[0].strip()
        while len(c) < 10:
            c.append(u"")
        ima = c[9].strip()
        if nozomi and na not in nozomi:
            out.append(u"\t".join(c))
            kazu[u"そのまま"] += 1
            continue
        if not nozomi and not zenbu and ima and ima != u"？":
            out.append(u"\t".join(c))
            kazu[u"そのまま"] += 1
            continue
        if c[4].strip() in (u"オリジナル", u"ゲーム") or na in NASHI:
            c[9] = u"－"
            out.append(u"\t".join(c))
            kazu[u"そのまま"] += 1
            continue
        v, err = u"", u""
        for km in kijimei(na):
            t, err = hiku(km)
            v = saguru(t, c[4].strip()) if t else u""
            if v:
                break
        if v:
            c[9] = KAIMEI.get(v, v)
            kazu[u"引けた"] += 1
            say(u"○ %s → %s" % (na, v))
        else:
            # **引けなかったときに前の値を消さない**（2026-11-05）。
            # ウィキが 429 を返すことが多いので、消すと引き直すたびに
            # 入っていた誌名が失われます。
            if ima and ima != u"？":
                c[9] = ima
                kazu[u"そのまま"] += 1
                say(u"… %s → 引けません（前の「%s」を残します） %s"
                    % (na, ima, err))
            else:
                c[9] = u"？"
                kazu[u"だめ"] += 1
                say(u"× %s → 引けません %s" % (na, err))
        out.append(u"\t".join(c))

    io.open(JOHO, "w", encoding="utf-8").write(u"\n".join(out) + u"\n")
    say(u"")
    say(u"引けた %d／だめ %d／そのまま %d" %
        (kazu[u"引けた"], kazu[u"だめ"], kazu[u"そのまま"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
