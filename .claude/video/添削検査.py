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

    # ③ 魅力の体言止め（20選の形のときだけ）
    if nijussen:
        mi = re.findall(u"本作の魅力は、([^。]*)。", t)
        if len(mi) != 20:
            warui.append(u"「本作の魅力は、」が %d本（20本のはず）" % len(mi))
        for s in mi:
            if re.search(u"(ことです|方です|点です|ところです|のです)$", s):
                warui.append(u"魅力が名詞に逃げています「%s」。**体言止めにすること**" % s)
            elif re.search(u"(です|ます)$", s):
                warui.append(u"魅力が体言止めではありません「%s」" % s)

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
        for g in d:
            for s in re.split(u"(?<=。)", g):
                if len(s) > 100:
                    warui.append(u"%d字の文があります: %s" % (len(s), s[:40]))

    # ⑦ 段落（20選の形のときだけ）
    if nijussen and len(d) != 109:
        warui.append(u"段落が %d本（109本のはず：導入4＋20×5＋締め5）" % len(d))

    # ⑦-2 1作品の尺（本人の指定・2026-11-10）
    #
    #   > できれば動画の尺は作品一つの説明に対し30秒から50秒の間に収めてください。
    #   > 説明が淡々としているため、長すぎると見ていて飽きます。
    #
    #   読み上げ 6.46字/秒 なので 30秒=194字 / 50秒=323字。
    #   5段落（つなぎ・情報・あらすじ・魅力・締め）を合わせて数える。
    if nijussen:
        TS2 = (u"最初にご紹介する作品は|一番最初にご紹介する作品は|続いての作品は|"
               u"続く作品は|続いては|次の作品は|最後にご紹介する作品は")
        nagai, mijikai = [], []
        for i, g in enumerate(d):
            m2 = re.search(u"(?:%s)、?(.+)$" % TS2, g)
            if not m2 or i + 4 >= len(d):
                continue
            ji2 = sum(len(re.sub(u"\\s", u"", d[i + k])) for k in range(5))
            byou = ji2 / 6.46
            na2 = re.sub(u"、制作は.*$", u"", m2.group(1)).strip()
            if byou > 50:
                nagai.append(u"%s %.0f秒" % (na2[:16], byou))
            elif byou < 30:
                mijikai.append(u"%s %.0f秒" % (na2[:16], byou))
        if nagai:
            warui.append(u"50秒を超える作品が %d本: %s"
                         % (len(nagai), u" / ".join(nagai[:6])))
        if mijikai:
            warui.append(u"30秒に足りない作品が %d本: %s"
                         % (len(mijikai), u" / ".join(mijikai[:6])))

    # ⑧ 混ざりもの
    if u"**" in t:
        warui.append(u"強調の星印が混ざっています")
    if re.search(u"[Ѐ-ӿ]", t):
        warui.append(u"キリル文字が混ざっています")

    ji = len(t.replace(u"\n", u"").replace(u" ", u""))
    return warui, len(d), ji


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
    say(u"")
    say(u"落ちた台本 %d／%d本" % (dame, len(shu)))
    return 1 if dame else 0


if __name__ == "__main__":
    sys.exit(main())
