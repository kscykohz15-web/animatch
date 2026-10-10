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

■ 手本も一緒に残す（2026-10-10・本人の指定）

  「私が指定したものは完璧と考え、それ以外のあなたが自動で割り当てた
    ものを私が指定したものくらいの精度にあげたい」
  「…必要な情報を蓄積できるようにしてください」

本人の直しは `その他/差し替え.txt` に溜まるが、**その動画の中でしか効かない。**
次の動画では0から。そこでこの道具は、直しを `手本.tsv` に写して残す。

残すのは番号だけではない。**その絵に何が写っていたか**（カタログの説明）と、
**機械は誰だと思っていたか**（前後の文を読んだ重み）も一緒に残す。
外した理由がそこに出るので、次に直す所がすぐ分かる。

そして「当て方.txt に足せる行」を提案する。当て方.txt は全動画で共通なので、
ここが厚くなるほど、これから書く台本にも自動で効く。

使い方:
    python 話数を学ぶ.py            … 何が変わるかを見るだけ
    python 話数を学ぶ.py --書く     … 画面表示.txt と 手本.tsv を書きかえる
"""
from __future__ import print_function
import argparse
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

TEHON = u"手本.tsv"
# 当て方に足す行を出すのに要る、手本の数。
# 1件だけだと「その動画だけの事情」かどうか分からない。
URAZUKE = 2


def mochikomu(nm):
    u"""同じフォルダの道具を読み込む。"""
    import importlib.util
    p = os.path.join(HERE, nm + u".py")
    if not os.path.exists(p):
        p = nm + u".py"
    spec = importlib.util.spec_from_file_location(nm, p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def tehon_michi():
    u"""手本.tsv の置き場所。**動画ごとにばらけさせない。**

    動画の作業フォルダごとに道具が置かれるので、HERE を使うと
    手本が動画ごとに分かれてしまい、**蓄積にならない。**
    置き場所.txt の「おおもと」に1つだけ置く
    （道は置き場所.txt にだけ書く、という決まりに合わせる）。
    """
    try:
        import 置き場所
        return os.path.join(置き場所.oomoto(), TEHON)
    except Exception:
        return os.path.join(HERE, TEHON)


def load_sashikae_kumi(path):
    u"""差し替え.txt → {番号: 書かれた指定}（絵の番号でもファイル名でも）"""
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
        out[no] = u" ".join(c[1:]).strip()
    return out


def tehon_yomu(path):
    u"""手本.tsv を読む。戻り値 (見出しの行たち, {(動画,番号): 行})"""
    atama, naka = [], {}
    if not os.path.exists(path):
        return atama, naka
    for line in yomu(path).split(u"\n"):
        if line.startswith(u"#"):
            atama.append(line)
            continue
        if not line.strip():
            continue
        c = line.split(u"\t")
        if len(c) < 4:
            continue
        naka[(c[0].strip(), c[1].strip())] = c
    return atama, naka


# 指示語は、**この4つの形だけ**。
#
# ■ ゆるく取ると、鍵がゴミになる（2026-10-10）
#
# はじめは `[こそあど][のれ]?[ぁ-んァ-ヶ一-龠]{1,6}` で拾っていた。
# ところが「あ」「そ」は文の頭によく出るひらがななので、
#
#     「ではありません。」      → 「ありません」
#     「そしてララが一人で…」  → 「そしてララが一」
#     「これは少しネタバレ…」  → 「これは少しネタバ」
#
# が鍵として出てきた。**当て方.txt にこれを入れたら害になる**
# （「あって」→ #ルーデウス ロキシー になってしまう）。
# 指示語は形を決め打ちし、続きは**漢字だけ**に限る。
SASHI = (u"この", u"その", u"あの", u"どの")

# 中身を持たない言葉。鍵にしてはいけない。
TOMERU = set(u"""
こと もの ため とき よう わけ はず 場合 自分 本当 今回 動画 内容 部分
以上 以下 一部 最後 最初 今後 実際 結果 理由 意味 感じ 時点 以外 全部
注意 説明 紹介 解説 話数 番目 一つ 二つ 三つ 四つ
""".split())


def kotoba(tx):
    u"""字幕から、当て方の鍵になりそうな言葉を取る。

    形態素解析は使わない（お金も外の道具も使わない方針）。
    拾うのは2つだけ ── 決め打ちの指示語＋漢字、と、漢字のかたまり。
    """
    out = []
    for s2 in SASHI:
        for m in re.finditer(s2 + u"([一-龠]{1,4})", tx):
            if m.group(1) not in TOMERU:
                out.append(m.group(0))
    for m in re.finditer(u"[一-龠]{2,6}", tx):
        w = m.group(0)
        if w not in TOMERU:
            out.append(w)
    # 長いものを先に（当て方は「いちばん長く当たったもの」を採る）
    return sorted(set(out), key=lambda x: (-len(x), x))


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


def tehon_atsumeru(a):
    u"""本人が手で選んだ絵を、動画をまたいで残す（手本.tsv）。"""
    douga = a.douga or os.path.basename(os.path.abspath(os.getcwd()))
    if not os.path.exists(a.ichiran):
        print(u"× %s がありません。先に動画を1回作ってください。" % a.ichiran)
        return 1
    sashi = load_sashikae_kumi(a.sashi)
    if not sashi:
        print(u"差し替え.txt に本人の直しがありません。集めるものがありません。")
        return 0

    M = mochikomu(u"miru_kekka")
    try:
        M.KAWARI.update(M.load_kawari(os.path.join(HERE, u"人物ルール.txt")))
    except Exception:
        pass
    rows = M.load_ichiran(a.ichiran)
    tags = M.load_catalog(a.cat) if os.path.exists(a.cat) else {}
    if not tags:
        print(u"（%s が無いので、絵の中身は空のままにします）" % a.cat)
    han = M.bun_han(rows)
    ban = dict((int(r[u"no"]), n) for n in range(len(rows))
               for r in [rows[n]] if str(r[u"no"]).strip().isdigit())

    atama, naka = tehon_yomu(a.tehon)
    atarashii, machigai = 0, []
    print(u"── 本人が選んだ絵の中身 ──")
    print(u"")
    kazoe = {}
    for no in sorted(sashi):
        i = ban.get(no)
        if i is None:
            continue
        tx = rows[i][u"text"] or u""
        img = rows[i][u"img"] or u""
        fol = img.split(u"/")[0] if u"/" in img else u""
        setsu = (M.cat_lookup(tags, img) or u"") if tags else u""
        omomi = M.bunmyaku(rows, i, han=han)
        kikai = u"・".join(sorted(omomi, key=lambda c: -omomi[c])[:3])
        print(u"%3d番「%s」" % (no, tx[:34]))
        print(u"     選んだ絵: %-12s %s" % (sashi[no], fol or u"(不明)"))
        if setsu:
            print(u"     絵の中身: %s" % setsu)
        if kikai:
            print(u"     機械は  : %s" % kikai)
        key = (douga, unicode_str(no))
        c = [douga, unicode_str(no), tx, sashi[no], fol, setsu, kikai]
        if key not in naka:
            atarashii += 1
        naka[key] = c
        print(u"")

    # ■ 数えるのは**溜まった手本ぜんぶ**。今回ぶんだけではない（2026-10-10）
    #
    # はじめは今回の直しだけを数えていた。手本.tsv は 14件に増えているのに
    # 「まだ1件ずつしか無い」と出て、**蓄積の意味がまるごと無くなっていた。**
    # 動画をまたいで同じ言葉が出たときに初めて法則になるのだから、
    # ここは必ず溜まったぜんぶを見る。
    for c in naka.values():
        tx2 = c[2] if len(c) > 2 else u""
        fol2 = c[4] if len(c) > 4 else u""
        setsu2 = c[5] if len(c) > 5 else u""
        for k in kotoba(tx2):
            e = kazoe.setdefault(k, {u"話数": {}, u"中身": {}, u"件": 0})
            e[u"件"] += 1
            e[u"話数"][fol2] = e[u"話数"].get(fol2, 0) + 1
            for w in setsu2.split():
                e[u"中身"][w] = e[u"中身"].get(w, 0) + 1

    print(u"── 当て方.txt に足せる行（手本 %d件以上で裏が取れたもの）──" % URAZUKE)
    print(u"   そのまま当て方.txt に貼れる形で出します。")
    print(u"")
    deta = 0
    for k in sorted(kazoe, key=lambda x: (-kazoe[x][u"件"], -len(x))):
        e = kazoe[k]
        if e[u"件"] < URAZUKE:
            continue
        if deta >= 40:
            print(u"  …（ほか %d語。手本が増えるほどここが増えます）"
                  % (sum(1 for x in kazoe if kazoe[x][u"件"] >= URAZUKE) - deta))
            break
        # その言葉のとき、本人の絵に何回も写っていたもの
        nakami = [w for w in sorted(e[u"中身"], key=lambda w: -e[u"中身"][w])
                  if e[u"中身"][w] >= URAZUKE]
        wa = sorted(e[u"話数"], key=lambda f: -e[u"話数"][f])
        if nakami:
            print(u"  %s\t#%s" % (k, u" ".join(nakami[:3])))
            print(u"     （手本 %d件 / 写っていたもの %s / 話数 %s）"
                  % (e[u"件"],
                     u" ".join(u"%s×%d" % (w, e[u"中身"][w]) for w in nakami[:5]),
                     u" ".join(u"%s×%d" % (f or u"?", e[u"話数"][f]) for f in wa)))
        else:
            print(u"  %-14s 手本 %d件あるが、写っているものが毎回ちがう"
                  % (k, e[u"件"]))
            print(u"     （話数 %s）"
                  % u" ".join(u"%s×%d" % (f or u"?", e[u"話数"][f]) for f in wa))
        deta += 1
    if not deta:
        print(u"  （まだ 1件ずつしか無いので、足せる行はありません）")
    print(u"")
    print(u"今回の直し %d件（うち新しいもの %d件） / 溜まった手本 ぜんぶで %d件"
          % (len(sashi), atarashii, len(naka)))
    if not a.kaku:
        print(u"書き足すには --書く を付けてください: %s" % a.tehon)
        return 0
    if not atama:
        atama = [u"# 手本 ─ 本人が手で選んだ絵。動画をまたいで残します。",
                 u"# 動画\t番号\t字幕\t絵の番号\t話数フォルダ\tカタログの説明\t機械の見立て"]
    gyou = list(atama)
    for key in sorted(naka, key=lambda x: (x[0], int(x[1]) if x[1].isdigit() else 0)):
        gyou.append(u"\t".join(naka[key]))
    io.open(a.tehon, "w", encoding="utf-8", newline="\n") \
        .write(u"\n".join(gyou) + u"\n")
    print(u"書き足しました: %s （ぜんぶで %d件）" % (a.tehon, len(naka)))
    return 0


def unicode_str(x):
    try:
        return unicode(x)          # noqa: F821  (Python2 のとき)
    except NameError:
        return str(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(u"--一覧", dest="ichiran", default=os.path.join(u"確認用", u"一覧.txt"))
    ap.add_argument(u"--差し替え", dest="sashi", default=os.path.join(u"その他", u"差し替え.txt"))
    ap.add_argument(u"--画面表示", dest="overlay", default=u"画面表示.txt")
    ap.add_argument(u"--カタログ", dest="cat", default=u"画像カタログ.txt")
    ap.add_argument(u"--手本", dest="tehon", default=u"")
    ap.add_argument(u"--動画", dest="douga", default=u"")
    ap.add_argument(u"--書く", dest="kaku", action="store_true")
    a = ap.parse_args()
    if not a.tehon:
        a.tehon = tehon_michi()

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
    # 話数を学ぶ前に、**手本をぜんぶ残す**（動画をまたいで効かせるため）
    print(u"")
    tehon_atsumeru(a)
    print(u"")

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
    # ■ 学んだ印を必ず入れる（2026-10-10）
    #
    # 本人のログの L の1行目がこれだった。
    #
    #     新しい 画面表示.txt に差し替えました (前のものは _前の設定 へ)
    #
    # **Prepare が、前に学んだ話数を毎回パックのものに戻していた。**
    # 学んでも次の回には消えていたということ。
    # 印が入っていれば Prepare はそのまま残す（menu.ps1 側で見ている）。
    SHIRUSHI = u"# 学んだ話数が入っています（話数を学ぶ.py）。Prepare は上書きしません。"
    if not any(x.strip() == SHIRUSHI for x in gyou):
        gyou = [SHIRUSHI] + gyou
    io.open(a.overlay, "w", encoding="utf-8-sig", newline="\r\n") \
        .write(u"\n".join(gyou).replace(u"\n", u"\r\n"))
    print(u"%d章ぶん書きかえました: %s" % (kaeta, a.overlay))
    print(u"「はじめる.bat」→ 2 → 1 で作り直すと、学んだ話数で選び直します。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
