# -*- coding: utf-8 -*-
u"""本人の添削（紹介の型 9節）を、台本ぜんぶに機械でかける。

    python 添削検査.py ../../final/最高のラブコメアニメ20選_字幕用_最終版.txt
    python 添削検査.py                （final の おすすめ台本を全部）

■ なぜ要るか（2026-11-05）
  本人のニセコイの添削で出た4つが、**11本すべてに入っていた。**
  原作者108か所／「〜ことです」66か所／「〜方です」10か所／「効いています」12か所。
  目で読んで直すと必ず残る。**書いたあとに機械で止める。**

見るもの
  ① 挨拶「どうもこんにちわ、かさです。」で始まっているか
  ② 原作者の名前を書いていないか（「◯◯先生」「原作は」「原作者」）
  ③ 「本作の魅力は、」が体言止めか（「〜ことです」「〜方です」「〜点です」）
  ④ 「効いています」を使っていないか
  ⑤ 登場人物に立場が付いているか（主人公・ヒロイン・先輩・友人・敵）
  ⑥ 100字を超える文が無いか
  ⑦ 段落が109本か（導入4＋作品20×5＋締め5）
  ⑧ 強調の星印・キリル文字が混ざっていないか
  ⑫ 「主人公の高校生、」と書いていないか（「高校生の主人公、」に。本人の指定・2026-11-21）
"""
import glob
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FINAL = os.path.normpath(os.path.join(HERE, u"..", u"..", u"final"))

AISATSU = u"どうもこんにちわ、かさです。"
TACHIBA = (u"主人公", u"ヒロイン", u"先輩", u"後輩", u"友人", u"敵",
           u"店長", u"相棒", u"師匠", u"妹", u"兄", u"姉", u"弟", u"母", u"父")


def say(m):
    try:
        print(m)
    except UnicodeEncodeError:
        print(m.encode("utf-8", "replace").decode("ascii", "replace"))


def dan(path):
    t = io.open(path, encoding="utf-8-sig").read().replace(u"\r\n", u"\n")
    return t, [x.strip() for x in t.split(u"\n") if x.strip()]


def miru(path):
    warui = []
    chui_shaku = []
    t, d = dan(path)

    # ■ 形を見分ける（2026-11-08）
    #
    #   仕上げ.py ㉕ に入れたとき、**無職転生の解説台本にも20選の形を当てた。**
    #   挨拶が無い・「本作の魅力は」が0本・段落が42本、と当たり前のことで
    #   7本まとめて落ちた。無職転生は1作品を掘る形で、20選とは別物。
    #   当てる規則を形で分ける。ただし
    #   **原作者の名前・「効いています」・100字・混ざりもの は全部の台本に当てる**
    #   （本人の添削はそこを形の話として言っていない）。
    #   実際、この分け方にしたあと 第1回_人生年表 の「効いてきます」が残った。
    nijussen = (u"ご紹介していきます" in t
                or t.count(u"本作は") >= 10
                or t.count(u"ご紹介する作品は") >= 2)
    if not nijussen:
        say(u"（20選の形ではないので、挨拶・魅力・立場・段落は見ません）")

    # ① 挨拶（20選の形のときだけ）
    if nijussen and (not d or d[0] != AISATSU):
        warui.append(u"挨拶が「%s」で始まっていません（いまは「%s」）"
                     % (AISATSU, d[0] if d else u""))

    # ② 原作者の名前
    for g in d:
        for m in re.finditer(u"([^\\s、。]{1,12})先生", g):
            # 助詞で終わる形は人名ではない（「隠しているのが先生」で
            # 一度誤検知した・2026-11-05）
            if re.search(u"[がはのもでとをにへや]$", m.group(1)):
                continue
            warui.append(u"原作者らしい名前「%s先生」。**制作会社＋掲載誌に"
                         u"置きかえること**" % m.group(1))
        if re.search(u"原作は[^、。]*(先生|さん|氏)", g):
            warui.append(u"「原作は◯◯先生」の形が残っています: " + g[:40])
        if u"原作者" in g:
            warui.append(u"「原作者」と書いています: " + g[:40])

    # ③ 魅力の言い方（20選の形のときだけ）
    #   ■ 体言止めの決めは外した（2026-11-17・本人が書いたニセコイ）
    #     本人の型は「本作の魅力は、ヒロインたちの表情や仕草、その純粋な可愛さで、
    #     …全員キャラが立っており、それぞれの良さがうまく表現されています。」──
    #     1文で言い切る形。前の「体言止めにする」はこちらの決めで、本人の型に負ける。
    #     残すのは「〜ことです」「〜方です」の名詞逃げ（2026-11-05 の本人の添削）だけ。
    if nijussen:
        mi = re.findall(u"本作の魅力は、([^。]*)。", t)
        if len(mi) != 20:
            warui.append(u"「本作の魅力は、」が %d本（20本のはず）" % len(mi))
        for s in mi:
            if re.search(u"(ことです|方です|点です|ところです)$", s):
                warui.append(u"魅力が名詞に逃げています「%s」。何が起きるか・どう可愛いかを書く" % s)

    # ④ 使わない言葉／言いまちがい
    #   「効いています」は本人の添削（2026-11-05）。
    #   それ以外は、こちらが書いて見つかった言いまちがい。見つけたらここに足す。
    for ng in (u"効いています", u"効いてきます", u"効いており"):
        if ng in t:
            warui.append(u"「%s」は使いません（%d か所）" % (ng, t.count(ng)))
    for ng, naoshi in ((u"特質して", u"特に／特筆して"),
                       (u"御座います", u"ございます"),
                       (u"成程", u"なるほど"),
                       (u"熱いです", u"熱い一本です（体言止めに）")):
        if ng in t:
            warui.append(u"「%s」は言いまちがいです → %s（%d か所）"
                         % (ng, naoshi, t.count(ng)))

    # ⑤ 立場（20選の形のときだけ）
    if nijussen:
        for i, g in enumerate(d):
            if not g.startswith((u"物語", u"主人公", u"一言で言えば", u"こちらの作品")):
                continue
            if not any(x in g for x in TACHIBA):
                warui.append(u"あらすじに立場が付いていません: " + g[:46])

    # ⑥ 100字超（20選の形のときだけ）
    #   本人が「100字を超える文は書かない」と言ったのは20選の形の話。
    #   無職転生の解説は1作品を掘る形で、先に作って世に出ている。
    #   いま当てると出ている動画と食い違うので、当てない。
    #   **本人の決定（2026-11-08）：「無職転生はそのままでいいです」。**
    #   第6回の138字と125字はそのまま残す。次のセッションで蒸し返さない。
    if nijussen:
        #   **段落ごとに切る**（2026-11-05）。前は本文をまるごと繋いでから
        #   「。」で切っていたので、句点の無い作品名の行が次の段落と
        #   くっついて、ありもしない107字の文が出ていた。
        #   ■ 本人の書いた文に 102字があった（2026-11-17・インフィニット・ストラトスの締め）。
        #     本人の文が型なので、100字を超えたら知らせ（!）、110字を超えたら落とす。
        for g in d:
            for s in re.split(u"(?<=。)", g):
                if len(s) > 110:
                    warui.append(u"%d字の文があります: %s" % (len(s), s[:40]))
                elif len(s) > 100:
                    chui_shaku.append(u"%d字の文があります（110字までは通します）: %s"
                                      % (len(s), s[:40]))

    # ⑦ 段落（20選の形のときだけ）
    #   ■ 作品は5段落か6段落（2026-11-17）。本人が書いたインフィニット・ストラトスは
    #     締めを2段落に分けていた（「…最高の作品となっています。」「…特におすすめの作品です。」）。
    #     全体の数（前は109本ぴったり）ではなく、導入4・作品20本（各5〜6）・締め5を見る。
    TS0 = (u"最初にご紹介する作品は|一番最初にご紹介する作品は|続いての作品は|"
           u"続く作品は|続いては|次の作品は|最後にご紹介する作品は")
    if nijussen:
        atama0 = [i for i, g in enumerate(d) if re.search(u"^(?:%s)、" % TS0, g)]
        owari0 = [i for i, g in enumerate(d) if g.startswith(u"今回の動画は以上")]
        if len(atama0) != 20 or not owari0:
            warui.append(u"作品の頭が %d本・締めの頭が %d本（20本と1本のはず）"
                         % (len(atama0), len(owari0)))
        else:
            if atama0[0] != 4:
                warui.append(u"導入が %d段落（4段落のはず）" % atama0[0])
            if len(d) - owari0[0] != 5:
                warui.append(u"締めが %d段落（5段落のはず）" % (len(d) - owari0[0]))
            kugiri0 = atama0 + [owari0[0]]
            hen = [u"%d番目 %d段落" % (n + 1, kugiri0[n + 1] - kugiri0[n])
                   for n in range(20) if not 5 <= kugiri0[n + 1] - kugiri0[n] <= 6]
            if hen:
                warui.append(u"作品の段落が5〜6でないもの: " + u" / ".join(hen[:6]))

    # ⑦-2 1作品の尺（本人の指定・2026-11-10）
    #
    #   > できれば動画の尺は作品一つの説明に対し30秒から50秒の間に収めてください。
    #   > 説明が淡々としているため、長すぎると見ていて飽きます。
    #
    #   読み上げ 6.46字/秒 なので 30秒=194字 / 50秒=323字。
    #   作品の頭から、次の作品の頭（最後は締めの頭）までを合わせて数える。
    #   ■ 本人が書いた3作品は 50・59・52秒だった（2026-11-17）。本人の文が型なので、
    #     50秒を超えたら知らせ（!）、60秒を超えたら落とす。前は5段落で決め打ちしていて、
    #     6段落のインフィニット・ストラトスを 54秒と少なく数えていた（本当は 59秒）。
    TS2 = (u"最初にご紹介する作品は|一番最初にご紹介する作品は|続いての作品は|"
           u"続く作品は|続いては|次の作品は|最後にご紹介する作品は")
    if nijussen:
        nagai, mijikai = [], []
        tsugi2 = [i for i, g in enumerate(d)
                  if re.search(u"^(?:%s)、" % TS2, g) or g.startswith(u"今回の動画は以上")]
        for i, g in enumerate(d):
            m2 = re.search(u"(?:%s)、?(.+)$" % TS2, g)
            if not m2 or i + 4 >= len(d):
                continue
            made = min([j for j in tsugi2 if j > i] or [min(len(d), i + 5)])
            ji2 = sum(len(re.sub(u"\\s", u"", d[k])) for k in range(i, made))
            byou = ji2 / 6.46
            na2 = re.sub(u"、制作は.*$", u"", m2.group(1)).strip()
            # 秒は丸めて比べる（出す数字と同じ物差し）。本人のニセコイは 324字＝50.2秒で、
            # 「ニセコイ 50秒」が「50秒を超える」と出ていた（2026-11-17）
            if round(byou) > 60:
                nagai.append(u"%s %.0f秒" % (na2[:16], byou))
            elif round(byou) > 50:
                chui_shaku.append(u"%s %.0f秒（50秒を超えています。60秒までは通します）"
                                  % (na2[:16], byou))
            elif round(byou) < 30:
                mijikai.append(u"%s %.0f秒" % (na2[:16], byou))
        if nagai:
            warui.append(u"60秒を超える作品が %d本: %s"
                         % (len(nagai), u" / ".join(nagai[:6])))
        if mijikai:
            warui.append(u"30秒に足りない作品が %d本: %s"
                         % (len(mijikai), u" / ".join(mijikai[:6])))

    # ⑨⑩⑪ 本人の添削（2026-11-16・ラブコメ20選を見て）
    #
    #   ⑨ > 作品同士のつなぎ目で…「偽の～作品です」までの説明はいらないです。
    #     > 逆に変なので、普通にそのまま「…かと思います。続いての作品は」のように。
    #      → つなぎの段落は「続いての作品は、」などで**始まる**こと（前置きを書かない）
    #   ⑩ > 「作品です。第二期まで放送されています。」の流れでは機械的すぎるため、
    #     > もう少し全体的に話し言葉っぽくしてください。ここだと「作品で、第二期まで…」
    #      → 情報の段落で「作品です。」のすぐあとに続編の文を置かない
    #   ⑪ > 制作会社ならではの良さは一言程度で、あとは作品の雰囲気やキャラの関係性、
    #     > 可愛さ等に触れてください
    #      → 魅力の段落に制作会社の名前が出たら知らせる（落とさない。一言なら良いので）
    if nijussen:
        ZOKU2 = (u"放送", u"続編", u"劇場版", u"公開", u"期", u"完結", u"決まって",
                 u"テレビスペシャル")
        for i, g in enumerate(d):
            m3 = re.search(u"(%s)、" % TS2, g)
            if m3 and m3.start() > 0:
                warui.append(u"つなぎの前に前置きがあります（本人の指定で書かない）: "
                             + g[:m3.start()][:40])
            if m3 and i + 1 < len(d) and d[i + 1].startswith(u"本作は"):
                bun = [b for b in re.split(u"(?<=。)", d[i + 1]) if b]
                # 「作品で、」が中にあるかは見ない。「本作はオリジナル作品で、…全12話の
                # 作品です。続編も…」の14本が、それを理由に黙って通っていた（2026-11-16）
                if len(bun) >= 2 and bun[0].endswith(u"作品です。") \
                        and any(z in bun[1] for z in ZOKU2):
                    warui.append(u"「作品です。%s」は「作品で、%s」に（話し言葉にする）"
                                 % (bun[1][:12], bun[1][:12]))
            if m3 and i + 3 < len(d) and d[i + 3].startswith(u"本作の魅力は"):
                sha = re.search(u"制作は(.+?)。?$", g)
                if sha:
                    seisha = sha.group(1).strip(u"。")
                    yomi = seisha.replace(u"・", u"")
                    if seisha in d[i + 3] or (len(yomi) >= 3 and yomi in d[i + 3]):
                        chui_shaku.append(u"魅力に制作会社（%s）が出ています。一言程度に"
                                          u"して、作品の雰囲気・キャラの関係・可愛さを中心に"
                                          % seisha)

    # ⑫ 本人の添削（2026-11-21・ラブコメ20選の俺妹を見て）
    #   > 台本で「主人公の高校生」とありますが、おそらく正しくは「高校生の主人公」だと思うので
    #   「見た目で怖がられている主人公の高校生、高須竜児と」→「…高校生の主人公、高須竜児と」。
    #   中学生・小学生・大学生も同じ形（11本で23か所あった）
    for m4 in re.finditer(u"主人公の(高校生|中学生|小学生|大学生)、", t):
        warui.append(u"「主人公の%s、」は「%sの主人公、」に（本人の指定・2026-11-21）: …%s"
                     % (m4.group(1), m4.group(1), t[max(0, m4.start() - 12):m4.end() + 6].replace(u"\n", u"")))

    # ⑧ 混ざりもの
    if u"**" in t:
        warui.append(u"強調の星印が混ざっています")
    if re.search(u"[Ѐ-ӿ]", t):
        warui.append(u"キリル文字が混ざっています")

    ji = len(t.replace(u"\n", u"").replace(u" ", u""))
    CHUI[:] = chui_shaku
    return warui, len(d), ji


CHUI = []      # 落とさない知らせ（⑪ 魅力に制作会社）


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if len(sys.argv) > 1:
        shu = sys.argv[1:]
    else:
        shu = sorted(glob.glob(os.path.join(FINAL, u"*_字幕用_最終版.txt")))
        shu = [p for p in shu
               if not re.search(u"(第\\d回|老デウス|人生年表)", os.path.basename(p))]
    if not shu:
        say(u"台本が見つかりません")
        return 1
    dame = 0
    for p in shu:
        na = os.path.basename(p).replace(u"_字幕用_最終版.txt", u"")
        warui, dansu, ji = miru(p)
        say(u"")
        say(u"── %s（段落 %d／%d字／%.1f分）" % (na, dansu, ji, ji / 6.46 / 60))
        if warui:
            dame += 1
            for w in warui[:40]:
                say(u"  × " + w)
            if len(warui) > 40:
                say(u"  … ほか %d件" % (len(warui) - 40))
        else:
            say(u"  ○ 添削の4つ、立場、100字、段落、すべて通りました")
        for c in CHUI[:20]:
            say(u"  ! " + c)
    say(u"")
    say(u"落ちた台本 %d／%d本" % (dame, len(shu)))
    return 1 if dame else 0


if __name__ == "__main__":
    sys.exit(main())
