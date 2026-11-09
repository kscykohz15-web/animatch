# -*- coding: utf-8 -*-
u"""台本に書いた **放送年・季・話数** が 放送情報.txt と合っているか見る。

    python 放送情報検査.py ../../final/実は最強アニメ20選_字幕用_最終版.txt

■ なぜ要るか（2026-11-05・本人の指定）
  「放送年や話数、原作等は間違えないように調査しながら進めてください」。
  調べるだけでは足りない。**書いたあとに突き合わせる所まで機械にする。**
  見ていない所は必ず壊れる。

台本の中の、作品名を名乗る段落の次の「本作は…」の段落を見る。
    本作は2006年の秋に放送された全37話の…   → 2006 / 秋 / 37
放送情報.txt の同じ作品の行とくらべ、違っていたら落とす。
放送情報.txt に無い作品、年が ？ の作品も落とす（数字を書いてはいけないので）。
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# 台本のカタカナ表記と、AniList の英字表記の対応。
# **ここに無い制作会社を台本に書いたら落ちる。** 書く前にここへ足すこと。
SEISAKU = {
    u"マッドハウス": u"MADHOUSE", u"サンライズ": u"Sunrise", u"ボンズ": u"bones",
    u"ラルケ": u"Lerche", u"ゼクシズ": u"ZEXCS", u"ブリッジ": u"Bridge",
    u"シルバーリンク": u"SILVER LINK.", u"ネクサス": u"Nexus", u"シーツーシー": u"C2C",
    u"クローバーワークス": u"CloverWorks", u"ウィットスタジオ": u"WIT STUDIO",
    u"J.C.スタッフ": u"J.C.STAFF", u"スタジオ五組": u"Studio Gokumi",
    u"オー・エル・エム": u"OLM", u"東宝アニメーションスタジオ": u"TOHO animation STUDIO",
    u"ピー・エー・ワークス": u"P.A. WORKS", u"京都アニメーション": u"Kyoto Animation",
    u"シャフト": u"Shaft", u"マッパ": u"MAPPA", u"ユーフォーテーブル": u"ufotable",
    u"ワイト": u"WIT STUDIO", u"プロダクション・アイジー": u"Production I.G",
    u"エイワンピクチャーズ": u"A-1 Pictures", u"トリガー": u"TRIGGER",
    u"ぴえろ": u"Studio Pierrot", u"サイエンスサル": u"Science SARU",
    u"ホワイトフォックス": u"WHITE FOX", u"動画工房": u"Doga Kobo",
    u"キネマシトラス": u"Kinema Citrus", u"デイヴィッドプロダクション": u"David Production",
    u"トムス・エンタテインメント": u"TMS Entertainment", u"エイトビット": u"8-bit",
    u"東映アニメーション": u"Toei Animation", u"フィール": u"feel.",
    u"エイトビット": u"8-bit", u"エー・シー・ジー・ティー": u"A.C.G.T.",
    u"亜細亜堂": u"Ajiado",
    # 2026-11-09 に足した分。
    # **ローマ字から当て字せず、その会社の記事で見た名前。**
    #   ジーベック … XEBEC の日本語名（ja.wikipedia の記事名）
    #   パインジャム … PINE JAM の記事は パインジャム へ転送される
    #   アニメインターナショナルカンパニー … 俺妹の第1期。AIC の内部スタジオ名が AIC Build
    # ■ 行末に # でコメントを書いたら、同じ行にあった2社を飲み込んだ（その場で検査が捕まえた）。
    #   **この表では行末コメントを書かない。**
    u"ジーベック": u"Xebec",
    u"パインジャム": u"PINE JAM",
    u"アニメインターナショナルカンパニー": u"AIC Build",
    u"アートランド": u"Artland",
    u"アスリード": u"Asread",
    u"ビブリーアニメーションスタジオ": u"Bibury Animation Studios",
    u"ブレインズ・ベース": u"Brain's Base",
    u"サイゲームスピクチャーズ": u"CygamesPictures",
    u"エッグファーム": u"EGG FIRM", u"エンジ": u"ENGI", u"エニシヤ": u"ENISHIYA",
    u"フェリックスフィルム": u"Felix Film", u"ジーエークルー": u"GA-CREW",
    u"ガイナックス": u"GAINAX", u"ゴンゾ": u"GONZO", u"月光": u"Gekkou",
    u"ジェノスタジオ": u"Geno Studio", u"イマジン": u"Imagin",
    u"ライデンフィルム": u"LIDENFILMS", u"マングローブ": u"Manglobe",
    u"オレンジ": u"Orange", u"ピクス": u"P.I.C.S.", u"ラディクス": u"Radix",
    u"サテライト": u"Satelight", u"シンエイ動画": u"Shin-Ei Animation",
    u"シグナル・エムディー": u"Signal.MD", u"スタジオスリーハーツ": u"Studio 3Hz",
    u"スタジオバインド": u"Studio Bind", u"スタジオディーン": u"Studio DEEN",
    u"カラー": u"Studio Khara", u"タツノコプロ": u"Tatsunoko Production",
    u"テレコム・アニメーションフィルム": u"Telecom Animation Film",
    u"手塚プロダクション": u"Tezuka Productions",
    u"トライアングルスタッフ": u"Triangle Staff",
    u"つむぎ秋田アニメラボ": u"Tsumugi Akita Anime Lab",
    u"ボンズフィルム": u"bones film", u"パッショーネ": u"Passione",
    u"エンジ": u"ENGI", u"エニシヤ": u"ENISHIYA",
}
# 台本の言い方と、AniList の原作の種類
GENSAKU = {u"漫画": u"漫画", u"ライトノベル": u"ライトノベル", u"小説": u"小説",
           u"オリジナル": u"オリジナル", u"ゲーム": u"ゲーム",
           u"ウェブ小説": u"ウェブ小説"}
JOHO = os.path.join(HERE, u"放送情報.txt")

TSUNAGI = (u"最初にご紹介する作品は|一番最初にご紹介する作品は|続いての作品は|"
           u"続く作品は|続いては|次の作品は|最後にご紹介する作品は")


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))


def narasu(x):
    u"""突き合わせ用に空白と大小文字をそろえる。
    AniList は「P.A.WORKS」、こちらの表は「P.A. WORKS」。空白1つで落ちていた。"""
    return re.sub(u"[\\s\u3000]+", u"", x).lower()


def narasu2(x):
    u"""掲載誌の突き合わせ用。感嘆符・中黒・空白・大小文字をそろえる。
    台本では「月刊スピリッツ」、ウィキでは「月刊!スピリッツ」。"""
    return re.sub(u"[\\s\\u3000!！?？・\\-ー—–+＋☆・:：;；]+", u"", x).lower()


def yomu_joho():
    out = {}
    if not os.path.exists(JOHO):
        return out
    for ln in io.open(JOHO, encoding="utf-8-sig", errors="replace"):
        t = ln.rstrip(u"\n")
        if not t or t.startswith(u"#"):
            continue
        c = t.split(u"\t")
        if len(c) >= 8:
            out[c[0]] = {u"年": c[1], u"季": c[2], u"話数": c[3],
                         u"原作": c[4], u"制作": c[5],
                         u"掲載誌": c[9] if len(c) >= 10 else u"",
                         u"なろう": c[10] if len(c) >= 11 else u""}
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
    if len(sys.argv) < 2:
        say(u"使い方: python 放送情報検査.py <台本_字幕用.txt>")
        return 1
    joho = yomu_joho()
    if not joho:
        say(u"放送情報.txt がありません。先に 放送情報を引く.py を回してください。")
        return 1

    p = dan(sys.argv[1])
    warui, mita = [], 0
    for i, x in enumerate(p):
        m = re.search(u"(?:%s)、?(.+)$" % TSUNAGI, x)
        if not m:
            continue
        na = m.group(1).strip()
        if i + 1 >= len(p) or not p[i + 1].startswith(u"本作は"):
            warui.append(u"%s … 次の段落が「本作は」で始まっていません" % na)
            continue
        h = p[i + 1]
        mita += 1

        # 放送情報.txt のどの行か（題名そのまま → 前方一致 の順）
        key = na if na in joho else None
        if key is None:
            kouho = [k for k in joho if na.startswith(k) or k.startswith(na)]
            key = kouho[0] if len(kouho) == 1 else None
        if key is None:
            warui.append(u"%s … 放送情報.txt にありません。**調べてから書くこと**" % na)
            continue
        j = joho[key]
        if j[u"年"] == u"？":
            warui.append(u"%s … 引けていません。**数字を書かないこと**" % na)
            continue

        mt = re.search(u"(\\d{4})年", h)
        if mt and mt.group(1) != j[u"年"]:
            warui.append(u"%s … 年が台本 %s／調べ %s" % (na, mt.group(1), j[u"年"]))
        ms = re.search(u"\\d{4}年の(春|夏|秋|冬)", h)
        if ms and ms.group(1) != j[u"季"]:
            warui.append(u"%s … 季が台本 %s／調べ %s" % (na, ms.group(1), j[u"季"]))
        mw = re.search(u"全(\\d+)話", h)
        if mw and j[u"話数"] != u"？" and mw.group(1) != j[u"話数"]:
            warui.append(u"%s … 話数が台本 %s／調べ %s" % (na, mw.group(1), j[u"話数"]))

        # 制作会社（台本に「制作は◯◯」と書いたとき）
        mc = (re.search(u"制作は([^、。]+?)のオリジナル作品", h)
              or re.search(u"制作は([^、。]+)", h))
        if mc:
            # 「制作はマッドハウスです。」の「です」を落とす
            moto = re.sub(u"(です|でした|になります)$", u"", mc.group(1))
            kaku = [x for x in re.split(u"と|／|/", moto) if x]
            shirabe = [narasu(x) for x in j[u"制作"].split(u"／")]
            for k in kaku:
                k = k.strip()
                if k not in SEISAKU:
                    warui.append(u"%s … 制作「%s」が対応表にありません。"
                                 u"**放送情報検査.py の SEISAKU に足すこと**" % (na, k))
                elif narasu(SEISAKU[k]) not in shirabe:
                    warui.append(u"%s … 制作が台本 %s(%s)／調べ %s"
                                 % (na, k, SEISAKU[k], j[u"制作"]))

        # 原作の種類（台本に「◯◯が原作となっています」と書いたとき）
        mg = re.search(u"(漫画|ライトノベル|小説|ゲーム)が原作", h)
        if mg:
            kaku = mg.group(1)
            shirabe = j[u"原作"]
            # 「小説」はライトノベルも小説も通す
            ok = (kaku == shirabe
                  or (kaku == u"小説" and shirabe in (u"ライトノベル", u"ウェブ小説")))
            if not ok:
                warui.append(u"%s … 原作が台本 %s／調べ %s" % (na, kaku, shirabe))
        if u"オリジナル" in h and j[u"原作"] != u"オリジナル":
            warui.append(u"%s … オリジナルと書いていますが、調べでは %s"
                         % (na, j[u"原作"]))
        # 「小説家になろう発」は、**引いて確かめたものだけ**通す
        # （2026-11-05）。前は一律で落としていたが、なろう系の回では
        # 1本ずつ言うことになるので、なろうを引く.py が入れた11列目を見る。
        # オーバーロードは別の投稿サイト発で、そこを間違えていた。
        if u"なろう" in h:
            if j.get(u"なろう") != u"はい":
                warui.append(u"%s … 「なろう」と書いていますが、調べでは %s です。"
                             u"**なろうを引く.py で「はい」のものだけ書くこと**"
                             % (na, j.get(u"なろう") or u"未確認"))

        # 掲載誌／レーベル（台本に「◯◯連載の漫画が」「◯◯のライトノベルが」）
        # **引けていないものを書いたら落とす。** 原作者名の代わりに出す所なので、
        # ここを記憶で書くと、読み間違いと同じ事故になる（紹介の型 9節①）。
        mk = (re.search(u"([^、。]+?)連載の(?:漫画|ライトノベル|小説)が原作", h)
              or re.search(u"、([^、。]+?)の(?:ライトノベル|小説)が原作", h))
        if mk and u"なろう" not in mk.group(1):
            kaita = mk.group(1).strip()
            shirabe = j[u"掲載誌"].strip()
            if not shirabe or shirabe in (u"？", u"－"):
                warui.append(u"%s … 掲載誌「%s」は放送情報.txt に入っていません。"
                             u"**掲載誌を引く.py で引けたものだけ書くこと**"
                             % (na, kaita))
            elif narasu2(kaita) not in [narasu2(x)
                                        for x in shirabe.split(u"｜")]:
                warui.append(u"%s … 掲載誌が台本 %s／調べ %s"
                             % (na, kaita, shirabe))

    say(u"作品 %d本を見ました（放送情報.txt は %d本ぶん）" % (mita, len(joho)))
    if warui:
        say(u"")
        say(u"── 合っていません ──")
        for w in warui:
            say(u"  × " + w)
        return 1
    say(u"○ 台本の年・季・話数は、調べたものと全部合っています。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
