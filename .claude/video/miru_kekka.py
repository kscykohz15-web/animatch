# -*- coding: utf-8 -*-
u"""できあがった動画を、あとから機械に採点させる道具。

    python miru_kekka.py

動画を作ると 確認用\一覧.txt（何秒に どの絵で 何をしゃべったか）が出ます。
この道具は、その一覧と 画像カタログ.txt を突き合わせて、
「この絵はセリフと合っていない」という場所だけを拾い出します。

できあがるのは 採点.txt の1枚だけ。
それをこちらに貼ってもらえれば、動画を見なくても直す場所が分かります。

■ 使い方
    python miru_kekka.py                      … いつもの場所を自動で探す
    python miru_kekka.py --ichiran 確認用\一覧.txt
    python miru_kekka.py --plan 画像プラン_老デウス.txt

■ 何を見ているか
    ① 同じ絵の使いすぎ      3回以上でたら印
    ② 話数ちがい            @@話数 に無いフォルダの絵
    ③ 人ちがい              セリフの人名が、絵の説明に無い
    ④ 手がかりなし          セリフと絵の説明に共通の言葉がゼロ
    ⑤ 使用不可              出してはいけない絵が混ざっていないか
"""
from __future__ import print_function
import argparse
import io
import os
import re
import sys
import codecs

if sys.version_info[0] >= 3:
    unicode = str

# 画面に出せない字があっても、けっして落ちないようにする。
# PowerShell から結果を受け取る形で呼ばれると、画面の文字コードが
# cp932 になり、罫線などの字で止まってしまうため。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def say(s):
    try:
        print(s)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "ascii"
        try:
            print(s.encode(enc, "replace").decode(enc, "replace"))
        except Exception:
            print(s.encode("ascii", "replace").decode("ascii", "replace"))
    except Exception:
        pass


LOG = []


def note(s):
    u"""採点の本文。ためておいて、最後にファイルへ書く。

    画面に出すのは、ファイルを書き終えたあと。
    こうしておけば、画面の文字コードで転んでも 採点.txt は必ず残る。
    """
    LOG.append(s)


def yomu(path):
    u"""BOM付きUTF-8もそのまま読む。"""
    with io.open(path, "r", encoding="utf-8-sig", errors="replace") as f:
        return f.read()


CHARACTERS = [
    u"ルーデウス", u"ロキシー", u"エリス", u"シルフィエット", u"シルフィ",
    u"フィッツ", u"パウロ", u"ゼニス", u"リーリャ", u"アイシャ", u"ノルン",
    u"ルイジェルド", u"ギレーヌ", u"ナナホシ", u"ザノバ", u"クリフ",
    u"エリナリーゼ", u"ヒトガミ", u"オルステッド", u"アリエル", u"ルーク",
    u"キシリカ", u"ドワーフ", u"老デウス", u"ジュリ",
]
# 「老デウス」は絵の中では「老人」として写る。人ちがい判定では特別扱いする。
IIKAE = {
    u"老デウス": [u"老人", u"ルーデウス"],
    # 老デウスは年をとったルーデウス本人なので、どちらの絵でも間違いではない。
    u"ルーデウス": [u"老デウス", u"老人"],
    u"シルフィ": [u"シルフィエット"],
    u"フィッツ": [u"シルフィエット"],
    u"シルフィエット": [u"フィッツ"],
}

# セリフの言葉と、絵につく言葉のつなぎ。
# 「日記」と書いてあっても、絵には「本」としか書かれていない。
DOUGI = {
    u"日記": [u"本"],
    u"手紙": [u"本", u"手紙"],
    u"自室": [u"室内"],
    u"部屋": [u"室内"],
    u"家": [u"室内"],
    u"病": [u"悲しい", u"室内"],
    u"墓": [u"墓", u"悲しい"],
    u"クーデター": [u"戦闘", u"城"],
    u"炎": [u"魔法", u"戦闘", u"火"],
    u"魔法": [u"魔法", u"戦闘", u"本", u"室内"],
    u"研究": [u"本", u"室内"],
    u"焼き": [u"魔法", u"戦闘"],
    u"本": [u"本", u"室内"],
    u"王国": [u"城"],
    u"都": [u"街", u"城"],
}

# セリフと絵をつなぐ「手がかりになる言葉」。ここに無い言葉は数えない。
TEGAKARI = [
    u"夜", u"朝", u"昼", u"夕方", u"雨", u"雪", u"空", u"森", u"海", u"川",
    u"室内", u"屋外", u"街", u"村", u"城", u"家", u"部屋", u"宿",
    u"迷宮", u"洞窟", u"戦闘", u"剣", u"槍", u"魔法", u"杖", u"鎧", u"馬車",
    u"本", u"手紙", u"日記", u"食事", u"笑顔", u"涙", u"悲しい", u"驚き",
    u"会話", u"アップ", u"子供", u"大人", u"老人", u"赤ちゃん",
    u"結婚", u"家族", u"墓", u"血", u"炎", u"火", u"光る目", u"転移",
]


def load_person_rules(path):
    """人物ルール.txt を読む。  名前 <タブ> 必要なタグ"""
    out = []
    if not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read() \
            .replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s or s.startswith(u"#") or u"\t" not in s:
            continue
        name, cond = s.split(u"\t", 1)
        name = name.strip()
        if name == u"代わり":
            continue          # 「絵の無い人の代わり」の行。人物ルールではない
        # 頭に - を付けると「その名前を取り消す」規則になる。
        # カタログに書き込まれてしまった誤りを、見直さずに消すため。
        kesu = name.startswith(u"-")
        if kesu:
            name = name[1:].strip()
        need, deny, anyof = [], [], []
        for w in cond.split():
            if w.startswith(u"!"):
                deny.append(w[1:])
            elif u"|" in w:
                anyof.append([x for x in w.split(u"|") if x])
            else:
                need.append(w)
        if name and (need or anyof):
            out.append((name, need, deny, anyof, kesu))
    return out


def apply_person_rules(tags, rules):
    """見た目のタグから人物名を足す。

    絵を見直さずに人物の判定をやり直せるようにするための仕組み。
    画像カタログ.txt には髪の色や年齢がそのまま入っているので、
    人物ルール.txt を直すだけで、1万枚の判定がやり直せる。
    """
    if not rules:
        return tags
    tsuita, keshita = 0, 0
    for k in tags:
        words = tags[k].split()
        w = set(words)
        add, rm = [], set()
        for name, need, deny, anyof, kesu in rules:
            if any(x not in w for x in need):
                continue
            if any(x in w for x in deny):
                continue
            if any(not (set(g) & w) for g in anyof):
                continue
            if kesu:
                rm.add(name)
            elif name not in w and name not in add:
                add.append(name)
        if rm:
            n0 = len(words)
            words = [x for x in words if x not in rm]
            if len(words) != n0:
                keshita += 1
            add = [x for x in add if x not in rm]
        if add:
            # 同じ絵に何人も付くと絞り込めないので、先頭2人まで
            words = add[:2] + words
            tsuita += 1
        tags[k] = u" ".join(words)
    if tsuita:
        say(u"人物ルール: %d枚に名前を付けました" % tsuita)
    if keshita:
        say(u"人物ルール: %d枚から、合わない名前を外しました" % keshita)
    return tags


def load_catalog(path):
    u"""目印 -> 説明 の辞書。"""
    tags = {}
    for line in yomu(path).split(u"\n"):
        line = line.rstrip(u"\r")
        if not line or line.lstrip().startswith(u"#"):
            continue
        if u"\t" not in line:
            continue
        k, v = line.split(u"\t", 1)
        tags[k.strip()] = v.strip()
    # 画像プランと同じ目で見るため、人物ルール.txt をここでも当てる。
    # （当てないと「絵に誰もいない」と誤って報告してしまう）
    rules = load_person_rules(u"人物ルール.txt")
    if rules:
        say(u"人物ルール.txt を %d行 使います" % len(rules))
    return apply_person_rules(tags, rules)


def cat_lookup(tags, name):
    u"""一覧.txt の「フォルダ/001_xxxx.jpg」から、カタログの説明を引く。

    カタログの目印は「無職転生 第1話/001_」のように後ろが切れていることが
    あるので、前方一致でも探す。
    """
    if name in tags:
        return tags[name]
    base = name
    # 拡張子を外した形でも試す
    stem = re.sub(u"\\.(jpg|jpeg|png|webp)$", u"", base, flags=re.I)
    if stem in tags:
        return tags[stem]
    # 前方一致（カタログ側の目印が短い）
    for k in tags:
        if stem.startswith(k) or k.startswith(stem):
            return tags[k]
    return None


JIKOKU = [u""]


def load_ichiran(path):
    u"""番号 開始 尺 画像 セリフ の表を読む。"""
    hashira = {}      # 見出しの行から覚える「どの列が何か」
    rows = []
    for line in yomu(path).split(u"\n"):
        line = line.rstrip(u"\r")
        if not line:
            continue
        if line.startswith(u"# 時刻表の作り方:"):
            JIKOKU[0] = line.split(u":", 1)[1].strip()
            continue
        if line.startswith(u"#"):
            continue
        parts = line.split(u"\t")
        if len(parts) < 5:
            continue
        if parts[0].strip() in (u"番号",):
            # 見出しの行から、どの列が何かを覚える。
            # 列を足したときに、位置決め打ちだと黙って別の列を読みます
            # （「絵の話数」を足したとき、セリフの代わりに話数を読みかけた）。
            for i2, nm in enumerate(parts):
                hashira[nm.strip()] = i2
            continue
        def hiku(nm, kitei):
            i2 = hashira.get(nm, kitei)
            return parts[i2] if i2 < len(parts) else u""
        no, hajime, shaku = parts[0], parts[1], parts[2]
        gazou = hiku(u"画像", 3)
        serifu = hiku(u"セリフ", len(parts) - 1)
        daihon = hiku(u"台本の話数", -1)
        try:
            shaku_f = float(shaku)
        except ValueError:
            continue
        rows.append({
            u"no": no.strip(),
            u"start": hajime.strip(),
            u"sec": shaku_f,
            u"img": gazou.strip(),
            u"text": serifu.strip(),
            u"daihon": [x.strip() for x in daihon.split(u"/") if x.strip()],
        })
    return rows


CODE_RE = re.compile(r"^([123])\s*[-_. ]\s*(\d{1,2})\s*[-_. ]\s*(\d{1,3})$")


def code_of(img):
    u"""絵の名前 → 短い番号（3-11-056）。make_slideshow.py と同じ決め方。"""
    if not img or u"/" not in img:
        return u""
    fol, name = img.split(u"/", 1)
    ki = 3 if u"Ⅲ" in fol else (2 if u"Ⅱ" in fol else 1)
    m1 = re.search(r"第\s*(\d+)\s*話", fol)
    m2 = re.match(r"(\d+)", os.path.basename(name))
    if not m1 or not m2:
        return u""
    return u"%d-%02d-%03d" % (ki, int(m1.group(1)), int(m2.group(1)))


def code_hyou(rows):
    u"""この動画に出てくる絵の「番号 → 絵の名前」の表。"""
    out = {}
    for r in rows:
        c = code_of(r.get(u"img") or u"")
        if c:
            out.setdefault(c, r[u"img"])
    return out


def code_naosu(f, hyou):
    u"""短い番号で書かれていたら、絵の名前に読みかえる。"""
    m = CODE_RE.match((f or u"").strip())
    if not m:
        return f
    return hyou.get(u"%d-%02d-%03d"
                    % (int(m.group(1)), int(m.group(2)), int(m.group(3))), f)


def load_plan_tebiki(path, hyou=None):
    u"""画像プランにファイル名か絵の番号で直接書かれた絵を集める。

    それは人が見て選んだ絵なので、話数ちがい・人ちがいで責めない。

    ■ 絵の番号(3-05-035)も読む（2026-10-05）
    挨拶の絵を番号で固定したら、採点がそれを「話数ちがい」と3回責めた。
    プランに書いてあるのに、名前が違うので手びきと分からなかった。
    **手で選んだ絵の例外は、採点もその1つ。**
    """
    out = set()
    if not path or not os.path.exists(path):
        return out
    for line in yomu(path).split(u"\n"):
        line = line.strip()
        if not line or line.startswith(u"#") or line.startswith(u"@@"):
            continue
        if u"\t" not in line:
            continue
        for f in line.split(u"\t", 1)[1].split(u","):
            f = f.strip()
            if f and not f.startswith(u"#") and not f.startswith(u"@"):
                out.add(code_naosu(f, hyou or {}))
    return out


def load_sashikae_ban(path):
    u"""その他/差し替え.txt で本人が番号指定した所を集める（番号の集合）。

    ここも「手で選んだ絵」。機械の判定より本人が上なので、責めない。
    番号は 確認用/一覧.txt と同じ通し番号。
    """
    out = set()
    if not path or not os.path.exists(path):
        return out
    for line in yomu(path).split(u"\n"):
        t = line.strip()
        if not t or t.startswith(u"#"):
            continue
        m = re.match(r"^(\d+)[\s\t]", t)
        if m:
            out.add(int(m.group(1)))
    return out


def load_plan_episodes(path):
    u"""画像プランの @@話数 行から、使ってよいフォルダを拾う。"""
    if not path or not os.path.exists(path):
        return []
    for line in yomu(path).split(u"\n"):
        line = line.strip()
        if line.startswith(u"@@話数"):
            rest = line.split(u"\t", 1)
            if len(rest) < 2:
                rest = line.split(None, 1)
            if len(rest) < 2:
                continue
            return [x.strip() for x in rest[1].split(u",") if x.strip()]
    return []


def folder_of(img):
    if u"/" in img:
        return img.rsplit(u"/", 1)[0]
    if u"\\" in img:
        return img.rsplit(u"\\", 1)[0]
    return u""


def is_zuhyou(img):
    base = img.rsplit(u"/", 1)[-1].rsplit(u"\\", 1)[-1]
    return base.startswith(u"図_") or base.startswith(u"図表_")


def chars_in(text):
    out = []
    for c in CHARACTERS:
        if c in text and c not in out:
            out.append(c)
    # シルフィエット を拾ったら シルフィ は重複なので落とす
    if u"シルフィエット" in out and u"シルフィ" in out:
        out.remove(u"シルフィ")
    return out


def tegakari_in(text):
    out = [w for w in TEGAKARI if w in text]
    for k in DOUGI:
        if k in text and k not in out:
            out.append(k)
    return out


# ---------------------------------------- 文脈（誰の話かを前後から読む）
#
# ここは **採点（miru_kekka）と、絵の選びかた（直す.py）の両方が使う。**
# 片方だけ直すと、採点が「人ちがい」と言い、直すが「合っている」と言い出す。

# 絵の無い人を、誰で代えるか（人物ルール.txt の「代わり」の行）。
# ララのように、まだアニメに出ていない人は、絵が1枚も無い。
KAWARI = {}


def load_kawari(path=u"人物ルール.txt"):
    u"""「代わり <タブ> 絵の無い人 <タブ> 代わりに写す人たち」を読む。"""
    out = {}
    if not os.path.exists(path):
        return out
    for line in yomu(path).split(u"\n"):
        c = [x.strip() for x in line.strip().split(u"\t")]
        if len(c) >= 3 and c[0] == u"代わり" and c[1]:
            out[c[1]] = [x for x in c[2].split() if x]
    return out


# 文脈の重み。**本人の直し 29〜37番の理由から決めた**（2026-10-06）。
#
#   その行に名前がある                      1.00
#   指示語（この子供）の指す先              0.95
#   同じ文の中                              0.85
#   指示語だけの断片（それが、）が指す前の文 0.90
#   前後1行                                 0.70
#   前後2行                                 0.50
#
OMO_JIBUN, OMO_SASHI, OMO_BUN, OMO_MAEBUN = 1.00, 0.95, 0.85, 0.90
OMO_TONARI, OMO_FUTATSU = 0.70, 0.50

# 絵の無い人（ララ）の代わりに写す人は、本人より少し下げる。
#
#   30「ララといいます。」        → ララしかいない → 親（ルーデウス・ロキシー）
#   31「そしてララが一人でヒトガミを倒すわけではありません。」
#                                → ヒトガミは絵がある → **ヒトガミ**
#
# つまり「代わりの人」は、絵のある人がいれば負ける。だから 1.0 より下げる。
KAWARI_BIKI = 0.8

# 「〜を」で受けている人を下げる割合。
#
#   本人の 33番「ヒトガミを完全に封じ込めてしまう。」
#     →「ヒトガミの画像(やられる顔)**もしくは**、オルステッドの画像」
#   本人の 34番「それが、」→「オルステッドの画像」
#
# 「〜を」で受けている人は、やられている側。やられ顔の絵が要る。
# それが無いなら、**やる側**（オルステッド）を出すほうが合う。
# ただし下げるのは「同じ文の中に、絵のある“やる側”がいるとき」だけ。
#   31番は「ララが（絵が無い）ヒトガミを倒す」なので、下げない。
#   （下げると、出せる人が1人もいなくなる）
WO_BIKI = 0.6

# 指示語だけでできた短い断片（「それが、」「これは、」）
SASHI_DAKE = re.compile(u"^(それ|これ|あれ|そう|こう)[がはをに、]")


# 「やられている顔」に当たるタグ。
#
# 本人の 33番の直し（2026-10-06）
#   「ヒトガミを完全に封じ込めてしまう。」
#     →「ヒトガミの画像(**やられる顔**)もしくは、オルステッドの画像」
#
# 「〜を」で受けている人は、やられている側。その顔の絵があればそれがいちばん合う。
# ここは**いま付いているタグだけ**で見る（絵に説明を付け直さなくて済むように）。
# 「苦痛」は入れていない。いま絵に付くタグに無い言葉なので、書いても
# 一度も当たらない（人物ルール検査.py が、この並びも調べている）。
YARARE = [u"恐怖", u"悲しい", u"泣く", u"緊迫"]


def yarare_kao(w):
    u"""絵の説明(集合)が「やられている顔」かどうか。"""
    return any(x in w for x in YARARE)


def wo_ukeru(tx):
    u"""その行で「〜を」で受けられている人たち（やられている側）。"""
    return [c for c in hitobito(tx or u"") if kaku_wo(tx or u"", c)]


def hitobito(tx):
    u"""その文に出てくる人の名前。**絵の無い人（ララ）も拾う。**

    miru_kekka.CHARACTERS には、絵が1枚も無い人は入っていない
    （入れると採点が「人ちがい」と言い出す）。
    けれど文脈を読むときには、名前が出たこと自体が手がかりになる。
    """
    out = list(chars_in(tx or u""))
    for na in (KAWARI or {}):
        if na and na in (tx or u"") and na not in out:
            out.append(na)
    return out


def kaku_wo(tx, na):
    u"""その人が「〜を」で受けられているか（やられている側か）。"""
    return (na + u"を") in (tx or u"")


def bun_han(rows):
    u"""行ごとに「その行が入っている文」の範囲 (始まり, 終わり) を返す。

    「。」「！」「？」で終わる行が、文の終わり。
    """
    owari = [n for n, r in enumerate(rows)
             if (r[u"text"] or u"").rstrip().endswith((u"。", u"！", u"？"))]
    han, s0 = [None] * len(rows), 0
    for e in owari:
        for n in range(s0, e + 1):
            han[n] = (s0, e)
        s0 = e + 1
    for n in range(s0, len(rows)):
        han[n] = (s0, len(rows) - 1)
    return han


def sashi_moto(rows, i):
    u"""「この子供」「その能力」の指す先の行を探す。

    ■ なぜ要るか（本人の理由・29番）
        「**この子供**という言葉から、前後の文章から
          ルーデウスとロキシーの子供であるとわかるため、
          二人が写った画像が望ましい」

    「この子供」だけを見ても誰も写っていない。
    **前の文の「ルーデウスとロキシーのその子供が、」が答え。**

    やり方: 指示語のうしろの言葉を、長いほうから短いほうへ切って、
            前の行に同じ言葉があるか探す。
            「この子供には名前があって、」→ 子供 → 前の行が見つかる。
    """
    tx = rows[i][u"text"] or u""
    for m in re.finditer(u"[こそあ]の", tx):
        ato = tx[m.end():]
        for n in range(6, 1, -1):
            go = ato[:n]
            if len(go) < n or re.search(u"[、。！？\s]", go):
                continue
            mitsuketa = None
            for j in range(i - 1, max(-1, i - 30), -1):
                if go in (rows[j][u"text"] or u""):
                    if mitsuketa is None:
                        mitsuketa = j
                    if hitobito(rows[j][u"text"]):
                        return j            # 人が写っている行が、いちばん良い
            if mitsuketa is not None:
                return mitsuketa
    return None


def bunmyaku(rows, i, mae=2, ato=2, han=None):
    u"""その区切りの「誰の話か」を、台本の前後から読む。{人物: 重み}

    ■ なぜ要るか（本人の指摘・2026-10-06）

      29「この子供という言葉から、**前後の文章から**ルーデウスとロキシーの
          子供であるとわかるため、二人が写った画像が望ましい」
      34「それが、」→ オルステッドの画像

    「この子供」「それが、」だけを見ても、誰の話か分からない。
    **1行しか見ていなかったのが、外れていた理由。**

    読む順（重みは上の OMO_* ）
      ① その行の名前
      ② 指示語（この子供）の指す先の行
      ③ 同じ文の中（前は「。」まで、後ろは「。」まで）
      ④ 指示語だけの断片なら、**直前の文ぜんぶ**（それが＝前の出来事）
      ⑤ 前後1行・前後2行
      ⑥ 「〜を」で受けている人を下げる（やられ顔が要るので）
      ⑦ 絵の無い人を、代わりの人に置きかえる（少し下げて）
    """
    if han is None:
        han = bun_han(rows)
    out = {}

    def tasu(j, omo):
        tx = rows[j][u"text"] or u""
        if not tx:
            return
        s0, e0 = han[j] if han[j] else (j, j)
        # ⑥ 同じ文の中に「絵のある“やる側”」がいるときだけ、「〜を」を下げる
        yaru = False
        for n in range(s0, e0 + 1):
            t2 = rows[n][u"text"] or u""
            for c in hitobito(t2):
                if c not in (KAWARI or {}) and not kaku_wo(t2, c):
                    yaru = True
        for c in hitobito(tx):
            o = omo * (WO_BIKI if (yaru and kaku_wo(tx, c)) else 1.0)
            if out.get(c, 0) < o:
                out[c] = o

    tasu(i, OMO_JIBUN)

    # ② 指示語の指す先
    moto = sashi_moto(rows, i)
    if moto is not None:
        tasu(moto, OMO_SASHI)

    # ③ 同じ文の中
    s0, e0 = han[i] if han[i] else (i, i)
    for j in range(s0, e0 + 1):
        if j != i:
            tasu(j, OMO_BUN)

    # ④ 「それが、」のような指示語だけの断片は、**直前の文**を指す。
    #    うしろ（同じ文の残り）は、その断片についての説明なので、半分にする。
    sashi_dake = bool(SASHI_DAKE.match((rows[i][u"text"] or u"").strip()))         and len((rows[i][u"text"] or u"").strip()) <= 8
    if sashi_dake and s0 - 1 >= 0:
        p0, p1 = han[s0 - 1] if han[s0 - 1] else (s0 - 1, s0 - 1)
        for j in range(p0, p1 + 1):
            tasu(j, OMO_MAEBUN)
        # うしろを半分にしてやり直す（③で入れたぶんを薄める）
        saki = {}
        for j in range(i + 1, e0 + 1):
            tt = rows[j][u"text"] or u""
            for c in hitobito(tt):
                saki[c] = max(saki.get(c, 0), OMO_BUN * 0.5)
        for c, o in saki.items():
            # ③ で OMO_BUN のまま入っていて、ほかに根拠が無いものだけ下げる
            if abs(out.get(c, 0) - OMO_BUN) < 1e-9:
                out[c] = o

    # ⑤ 前後の行
    for d in range(1, max(mae, ato) + 1):
        if d <= mae and i - d >= 0:
            tasu(i - d, OMO_TONARI if d == 1 else OMO_FUTATSU)
        if d <= ato and i + d < len(rows):
            tasu(i + d, OMO_TONARI if d == 1 else OMO_FUTATSU)

    # ⑦ 絵の無い人は、代わりの人たちに置きかえる（ララ → ルーデウス・ロキシー）
    for na, kawari in (KAWARI or {}).items():
        if na in out:
            omo = out.pop(na) * KAWARI_BIKI
            for k in kawari:
                out[k] = max(out.get(k, 0), omo)
    return out


# 時間帯の言葉。絵に時間帯が1つも書かれていないときは、
# 「合っていない」ではなく「分からない」なので、責めない。
JIKAN = [u"夜", u"朝", u"昼", u"夕方"]


def tegakari_ok(w, tags):
    u"""セリフの手がかり w が、絵の説明(tags)で満たされているか。"""
    if w in tags:
        return True
    if w in JIKAN and not any(x in tags for x in JIKAN):
        return True                       # 絵に時間帯の記載が無い
    return any(x in tags for x in DOUGI.get(w, []))


def youi(path):
    u"""書き出し先のフォルダが無ければ作る。"""
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        try:
            os.makedirs(d)
        except OSError:
            pass
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ichiran", default=None, help=u"確認用/一覧.txt")
    ap.add_argument("--catalog", default=u"画像カタログ.txt")
    ap.add_argument("--plan", default=None, help=u"画像プラン_*.txt")
    ap.add_argument("--out", default=os.path.join(u"確認用", u"採点.txt"))
    ap.add_argument("--kurikaeshi", type=int, default=3, help=u"何回以上で使いすぎとするか")
    a = ap.parse_args()

    # ---- 一覧.txt を探す
    ich = a.ichiran
    if not ich:
        for c in [os.path.join(u"確認用", u"一覧.txt"), u"一覧.txt",
                  os.path.join(u"動画", u"分割版", u"一覧.txt"),
                  os.path.join(u"出力", u"確認用", u"一覧.txt")]:
            if os.path.exists(c):
                ich = c
                break
    if not ich or not os.path.exists(ich):
        say(u"× 一覧.txt が見つかりません。")
        say(u"  動画を作るとき「2 動画 + 1枚ずつの確認用」を選ぶと出ます。")
        say(u"  場所が違うときは  --ichiran <パス>  で教えてください。")
        return 1

    if not os.path.exists(a.catalog):
        say(u"× %s が見つかりません。" % a.catalog)
        return 1

    # ---- プランを探す
    plan = a.plan
    if not plan:
        cands = [f for f in os.listdir(u".") if f.startswith(u"画像プラン") and f.endswith(u".txt")
                 and u"旧" not in f]
        if cands:
            plan = sorted(cands)[0]

    rows = load_ichiran(ich)
    tags = load_catalog(a.catalog)
    kyoka = load_plan_episodes(plan)
    tebiki = load_plan_tebiki(plan, code_hyou(rows))
    sashi = load_sashikae_ban(os.path.join(u"その他", u"差し替え.txt"))

    note(u"=== 動画の採点 ===")
    note(u"一覧      : %s  (%d か所)" % (ich, len(rows)))
    note(u"カタログ  : %s  (%d枚ぶんの説明)" % (a.catalog, len(tags)))
    note(u"プラン    : %s" % (plan or u"（無し）"))
    if JIKOKU[0]:
        note(u"時刻表    : %s" % JIKOKU[0])
        if JIKOKU[0].startswith(u"③"):
            note(u"")
            note(u"  ⚠⚠ 字幕と音声がずれています。絵の問題ではありません。")
            note(u"     台本を直したのに音声が古いままです。1 で音声を作り直してください。")
            note(u"")
    if tebiki or sashi:
        note(u"手で選んだ絵: 画像プラン %d枚 / 差し替え %d か所 "
             u"（人ちがい・話数ちがいでは責めません）" % (len(tebiki), len(sashi)))
        note(u"  ただし【使用不可】の絵だけは、選ばれていても必ずお知らせします。")
    if kyoka:
        note(u"使ってよい話数: %s" % u", ".join(kyoka))
    note(u"")

    if not rows:
        say(u"× 一覧.txt の中身が読めませんでした。")
        return 1

    # ---- ① 同じ絵の使いすぎ
    tsukai = {}
    for r in rows:
        tsukai.setdefault(r[u"img"], []).append(r[u"no"])
    sugi = [(len(v), k, v) for k, v in tsukai.items() if len(v) >= a.kurikaeshi]
    sugi.sort(reverse=True)

    # ---- 1か所ずつ調べる
    # 対象話数の中に、その人の絵が1枚でもあるか。
    nai_hito = set()
    nai_tsukatta = {}
    if kyoka:
        aru = set()
        for k, d in tags.items():
            fol = folder_of(k)
            if fol and fol in kyoka:
                for c in CHARACTERS:
                    if c in d:
                        aru.add(c)
        for c in CHARACTERS:
            if c not in aru:
                nai_hito.add(c)

    warui = []      # (重さ, 番号, 種類, 説明)
    mikoshi = []    # 絵で表せる言葉が無いセリフ
    nashi = 0       # カタログに無い
    KAWARI.update(load_kawari(u"人物ルール.txt"))
    han = bun_han(rows)          # 文の範囲は1回だけ計算する
    for ri, r in enumerate(rows):
        img = r[u"img"]
        tx = r[u"text"]
        # 章タイトルのカード(@@card00 など)は、こちらが作った絵なので採点しない。
        # カタログに載っているはずがなく、11か所ぜんぶ「説明がありません」と
        # 出て、直しようのない指摘で埋まっていた。
        if img.startswith(u"@@"):
            continue
        desc = cat_lookup(tags, img) if not is_zuhyou(img) else u"（図表スライド）"
        riyuu = []
        omosa = 0

        if desc is None:
            nashi += 1
            riyuu.append(u"カタログにこの絵の説明がありません")
            omosa += 2
            desc = u""

        # 画像プランにファイル名で直接書いた絵は、人が選んだもの。
        # 話数や使用不可で責めない（本人の指定が上）。
        erabi = (img in tebiki) or (r[u"no"] in sashi)

        # ⑤ 使用不可
        #
        # ここだけは、本人が選んだ絵でも必ず言う。
        # 文字あり・実写・きわどい画面は、本人が見落としていると困るもの
        # （権利の話なので、好みの問題ではない）。
        if u"使用不可" in desc.split():
            if erabi:
                riyuu.append(u"本人が選んだ絵ですが【使用不可】です"
                             u"（文字あり・実写など）。別の絵をおすすめします")
            else:
                riyuu.append(u"【使用不可】の絵が出てしまっています")
            omosa += 10

        # ② 話数ちがい
        #
        # その行の章が「アニメの何話か」で見る。一覧.txt の「台本の話数」の列。
        # 前は画像プランのいちばん最初の @@話数 だけを「使ってよい話数」として
        # 全行に当てていた。章ごとに話数を変えるようにしたとたん、
        # 2話目以降の章が全部ちがい扱いになり、170か所・39点になった。
        # （実際に台本と食いちがっていたのは 278行のうち14行だけ）
        yurusu = r.get(u"daihon") or kyoka
        fol = folder_of(img)
        if yurusu and fol and not is_zuhyou(img) and not erabi:
            if fol not in yurusu:
                riyuu.append(u"話数ちがい（この章は %s の話）" % u" / ".join(yurusu))
                omosa += 6

        # ③ 人ちがい
        #
        # **その1行だけでは決められない。**（本人の直し 33番・2026-10-06）
        #   「ヒトガミを完全に封じ込めてしまう。」
        #     → 本人は「ヒトガミのやられる顔 **もしくは** オルステッド」。
        #   行だけ見ると、オルステッドの絵は「人ちがい」になってしまう。
        # だから、直す.py と同じ文脈の見方で「出してよい人」を広げる。
        # 行に名前がある人は重み 1.0 なので、ここが緩むのは文脈があるときだけ。
        hito = chars_in(tx)
        omomi = bunmyaku(rows, ri, han=han)
        yoi = [c for c in omomi if omomi[c] >= 0.5]
        if hito and desc and not is_zuhyou(img) and not erabi:
            w = set(desc.split())
            atta = []
            for c in (hito + [x for x in yoi if x not in hito]):
                kouho = [c] + IIKAE.get(c, [])
                if any(x in w for x in kouho):
                    atta.append(c)
            if not atta:
                # 対象話数に1枚も絵が無い人は、責めても直しようがない。
                inai = [c for c in hito if c in nai_hito]
                hokano = [c for c in CHARACTERS if c in w]
                if len(inai) == len(hito):
                    for c in inai:
                        nai_tsukatta.setdefault(c, []).append(r[u"no"])
                elif hokano:
                    riyuu.append(u"人ちがい: セリフは【%s】／絵は【%s】"
                                 % (u"・".join(hito), u"・".join(hokano[:3])))
                    omosa += 8
                else:
                    riyuu.append(u"人ちがい: セリフは【%s】／絵にその人はいません"
                                 % u"・".join(hito))
                    omosa += 5

        # ④ 情景ちがい / 手がかりなし
        muchi = False
        if desc and not is_zuhyou(img) and not riyuu and not erabi:
            w = set(desc.split())
            mochi = tegakari_in(tx)          # セリフ側にある「絵で表せる言葉」
            kyoutsuu = [x for x in mochi if tegakari_ok(x, w)]
            if hito:
                pass                          # 人が合っているならそれでよい
            elif mochi and not kyoutsuu:
                riyuu.append(u"情景ちがい: セリフは【%s】／絵は【%s】"
                             % (u"・".join(mochi[:4]),
                                u"・".join([x for x in TEGAKARI if x in w][:4]) or u"不明"))
                omosa += 4
            elif not mochi:
                # 絵で表せる言葉が1つも無いセリフ。割り当ての失敗ではない。
                # ここは話数さえ合っていればよく、直すなら台本かプラン。
                muchi = True

        # ① 使いすぎ（印だけ。重さは軽く）
        n = len(tsukai.get(img, []))
        if n >= a.kurikaeshi:
            riyuu.append(u"同じ絵を%d回使っています" % n)
            omosa += 1

        if muchi:
            mikoshi.append(r)
        if riyuu:
            warui.append((omosa, r, riyuu, desc))

    # ---- まとめ
    warui.sort(key=lambda x: (-x[0], x[1][u"no"]))
    ten = 100
    if rows:
        warui_n = len([x for x in warui if x[0] >= 3])
        ten = int(round(100.0 * (len(rows) - warui_n) / len(rows)))
    hidoi = [x for x in warui if x[0] >= 5]
    chuu = [x for x in warui if 3 <= x[0] < 5]
    note(u"── 結果 ──")
    note(u"ちゃんと合っていそう     : %d か所" % (len(rows) - len(warui)))
    note(u"ひどい (人・話数ちがい)  : %d か所" % len(hidoi))
    note(u"中くらい (情景ちがい)    : %d か所" % len(chuu))
    note(u"使いすぎだけ             : %d か所" % (len(warui) - len(hidoi) - len(chuu)))
    note(u"絵で表せる言葉が無い     : %d か所 （台本しだい。割り当ての失敗ではない）"
         % len(mikoshi))
    note(u"おおよその点数           : %d 点 / 100" % ten)
    if nashi:
        note(u"※ カタログに説明が無い絵が %d か所ありました（採点できていません）" % nashi)
    note(u"")

    if sugi:
        note(u"── ① 同じ絵の使いすぎ（%d回以上） ──" % a.kurikaeshi)
        for n, k, v in sugi[:20]:
            note(u"  %2d回  %s" % (n, k))
            note(u"        番号: %s" % u", ".join(v))
        note(u"")

    if nai_tsukatta:
        note(u"── 対象話数に絵が無い人 ──")
        note(u"（この人たちは、今回の話数には一度も写っていません。")
        note(u"  別の話数を許すか、図表に置きかえるか、台本から外すかの 3つです）")
        for c in sorted(nai_tsukatta):
            note(u"  %-10s 番号: %s" % (c, u", ".join(nai_tsukatta[c])))
        note(u"")

    if mikoshi:
        note(u"── 絵で表せる言葉が無いセリフ ──")
        note(u"（人の名前も、場所や時間の言葉も入っていない所。"
             u"ここは話数さえ合っていれば大きな失敗にはなりません）")
        note(u"  番号: %s" % u", ".join(r[u"no"] for r in mikoshi))
        note(u"")

    note(u"── あやしい場所（ひどい順） ──")
    if not warui:
        note(u"  ありません。")
    for omosa, r, riyuu, desc in warui:
        note(u"[%s] %s  %.2f秒  (重さ%d)" % (r[u"no"], r[u"start"], r[u"sec"], omosa))
        note(u"  セリフ: %s" % r[u"text"])
        note(u"  絵    : %s" % r[u"img"])
        note(u"  絵の中: %s" % (desc if desc else u"（不明）"))
        for x in riyuu:
            note(u"  → %s" % x)
        note(u"")

    # ---- 直し方の下ごしらえ（そのままプランに貼れる形）
    note(u"── そのまま 画像プラン に貼れる下書き ──")
    note(u"# ↓ここから下を 画像プラン_*.txt の @@話数 のすぐ下に貼ると、")
    note(u"#   その場所だけ絵を指定し直せます（絵は自分で選び直してください）")
    dashita = set()
    for omosa, r, riyuu, desc in warui:
        if omosa < 5:
            continue
        atama = r[u"text"]
        atama = re.split(u"[、。！？]", atama)[0]
        atama = atama[:18]
        if not atama or atama in dashita:
            continue
        dashita.add(atama)
        hito = chars_in(r[u"text"])
        if hito:
            c = hito[0]
            sagashi = IIKAE.get(c, [c])[0]
            note(u"%s\t#%s, #%s" % (atama, sagashi, c))
        else:
            note(u"%s\t#" % atama)
    note(u"")
    note(u"=== ここまで ===")

    with io.open(youi(a.out), "w", encoding="utf-8") as f:
        f.write(u"\n".join(LOG))
        f.write(u"\n")
    # ここまで来ればファイルは残っている。画面表示は、落ちても構わない。
    for line in LOG:
        say(line)
    say(u"")
    say(u"-> %s に書き出しました。このファイルを貼ってください。" % a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
