# -*- coding: utf-8 -*-
u"""台本1本から、X・ブログ・ショート・読み上げ用を作る。

    python kaku.py --script 台本_字幕用.txt --all
    python kaku.py --script 台本_字幕用.txt --yomi     読み上げ用に変換
    python kaku.py --script 台本_字幕用.txt --x        X投稿の下書き
    python kaku.py --script 台本_字幕用.txt --blog     ブログ記事の下書き
    python kaku.py --script 台本_字幕用.txt --short    ショートの切り出し案
    python kaku.py --script 台本_字幕用.txt --check    台本の健康診断

この道具は「書く」のではなく「割る・数える・形に流し込む」。
文章そのものはチャットで仕上げる。ここが下書きの土台になる。

考え方の根拠は 台本の知恵.txt に書いてある。
"""

import argparse
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

MOJI_PER_SEC = 6.46          # 読み上げ速度（実測: 毎分330字）
X_LIMIT = 280               # Xの上限
HOOK_LIMIT = 80             # 掴みに使ってよい文字数（15秒）
OPEN_LIMIT = 180            # 導入全体の上限（30秒）

CREDIT = u"©理不尽な孫の手／MFブックス／「無職転生Ⅲ」製作委員会"

LOG = []
LOGGING = [False]


def say(t):
    if LOGGING[0]:
        LOG.append(t)
    try:
        print(t)
    except UnicodeEncodeError:
        print(t.encode("utf-8", "replace").decode("ascii", "replace"))
    sys.stdout.flush()


def die(t):
    say(u"")
    say(u"!! " + t)
    sys.exit(1)


def log_start():
    del LOG[:]
    LOGGING[0] = True


def log_save(path):
    u"""控えは Python が自分で書く。PowerShell に渡すと日本語がこわれる。"""
    LOGGING[0] = False
    try:
        io.open(path, "w", encoding="utf-8-sig", newline="").write(
            u"\r\n".join(LOG) + u"\r\n")
        say(u"")
        say(u"%s に保存しました。" % path)
    except Exception as e:
        say(u"控えを保存できませんでした: %s" % e)


# ══════════════════════════════ 台本を読む

def read_script(path):
    u"""台本を段落の並びとして読む。# で始まる行は章の見出し。"""
    if not os.path.exists(path):
        die(u"%s がありません。" % path)
    paras, chaps = [], {}
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read() \
            .replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s:
            continue
        if s.startswith(u"#"):
            chaps[len(paras)] = s.lstrip(u"#").strip()
            continue
        paras.append(s)
    if not paras:
        die(u"中身が読めませんでした: " + path)
    return paras, chaps


def byo(t):
    u"""この文字数なら何秒か。"""
    return len(t) / MOJI_PER_SEC


def bun(p):
    u"""段落を文に割る。"""
    out = [x for x in re.split(u"(?<=[。！？])", p) if x.strip()]
    return out or [p]


# ══════════════════════════════ 読み上げ用に変える

DEFAULT_YOMI = [
    (u"邂逅", u"カイコウ"),
]

# 「は」を「ワ」にしない語。読み辞書.txt で足せる
KEEP_HA = [u"はっきり", u"はず", u"はじ", u"はだか", u"やはり", u"実は",
           u"では", u"はたし", u"はるか", u"はさ"]

# 「では」に見えるが、助詞の「は」なので変える語。KEEP_HA より強い
FORCE_HA = [u"までは", u"ほどは", u"のちは", u"まではな"]


def load_yomi_dict(path):
    u"""読み辞書.txt を読む。  書式:  元の語 <タブ> 読み"""
    dic = list(DEFAULT_YOMI)
    keep = list(KEEP_HA)
    if not os.path.exists(path):
        return dic, keep
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read() \
            .replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if not s or s.startswith(u"#"):
            continue
        if s.startswith(u"は:"):
            keep.append(s[2:].strip())
            continue
        if u"\t" in s:
            a, b = s.split(u"\t", 1)
            if a.strip():
                dic.append((a.strip(), b.strip()))
    return dic, keep


def to_yomi(t, dic, keep):
    u"""字幕用を読み上げ用に変える。

    実測で確かめた規則（台本の知恵.txt 6章）:
      ・助詞の「は」→「ワ」
      ・「第N話」「N話」→「ワ」
      ・難読語はカタカナに
    「では」や「はっきり」のように語の一部になっているものは変えない。
    """
    for a, b in dic:
        t = t.replace(a, b)
    t = re.sub(u"([0-9０-９])話", u"\\1ワ", t)

    # 変えてはいけない「は」の位置に印をつける
    mamoru = set()
    for w in keep:
        i = t.find(w)
        while i >= 0:
            for k in range(i, i + len(w)):
                if k < len(t) and t[k] == u"は":
                    mamoru.add(k)
            i = t.find(w, i + 1)

    # 「までは」のように、「では」を含むが助詞であるものは印を外す
    for w in FORCE_HA:
        i = t.find(w)
        while i >= 0:
            for k in range(i, i + len(w)):
                mamoru.discard(k)
            i = t.find(w, i + 1)

    out, kaeta = [], 0
    for i, c in enumerate(t):
        if c == u"は" and i not in mamoru:
            out.append(u"ワ")
            kaeta += 1
        else:
            out.append(c)
    return u"".join(out), kaeta


# ══════════════════════════════ 台本の健康診断

def check(paras, chaps):
    u"""台本の知恵.txt の数え方で、台本を測る。"""
    body = u"".join(paras)
    say(u"")
    say(u"══════ 台本の健康診断 ══════")
    say(u"  段落 %d / %d字 / 読み上げ およそ %.1f分"
        % (len(paras), len(body), byo(body) / 60.0))
    say(u"")

    # 1. 導入の長さ
    # 導入 = 冒頭から「ネタバレの断り」を含む段落まで。
    # そこまでが、見るか閉じるかを決められている時間。
    owari = 0
    for i, p in enumerate(paras[:3]):
        if re.search(u"(ネタバレ|放送された範囲|扱うのは|この先へ)", p):
            owari = i
            break
    aisatsu = u"".join(paras[:owari + 1])
    n = len(aisatsu)
    mark = u"○" if n <= OPEN_LIMIT else u"×"
    say(u"  %s 導入の長さ  %d字 = %.0f秒  (%d字=30秒 まで)"
        % (mark, n, byo(aisatsu), OPEN_LIMIT))
    if n > OPEN_LIMIT:
        say(u"      %d字ぶん長い。見るか閉じるかを決める30秒を" % (n - OPEN_LIMIT))
        say(u"      前置きに使い切っています。")

    # 2. 掴みに具体があるか
    hook = paras[0][:HOOK_LIMIT]
    nige = [u"整理します", u"紹介します", u"掘り下げます", u"まとめます", u"見ていきます"]
    warui = [w for w in nige if w in paras[0][:60]]
    kazu = re.findall(u"[0-9０-９]+", hook)
    mark = u"×" if warui and not kazu else u"○"
    say(u"  %s 掴みの中身  最初の%d字(15秒)" % (mark, HOOK_LIMIT))
    say(u"      %s" % hook[:56])
    if warui:
        say(u"      「%s」＝目次の読み上げです。" % warui[0])
        say(u"      ここには、その回でいちばん強い『事実』を置きます。")

    # 3. ネタバレの断りの長さ
    for p in paras[:3]:
        m = re.search(u"(扱うのは|アニメで放送|ネタバレ)", p)
        if m:
            bs = [b for b in bun(p) if re.search(u"(扱うのは|放送された範囲|ネタバレ|ご注意)", b)]
            t = u"".join(bs)
            if t:
                mark = u"○" if len(t) <= 30 else u"×"
                say(u"  %s ネタバレの断り  %d字 (30字まで)" % (mark, len(t)))
                if len(t) > 30:
                    say(u"      %s" % t[:52])
                    say(u"      → 「アニメ放送済みの範囲だけ、ネタバレは含みます。」(23字)")
            break

    # 4. 主張が終盤に埋まっていないか
    tsuyoi = []
    for i, p in enumerate(paras):
        if re.search(u"(というの|つまり|構造になって|だから|面白いところ|見えてきます|傾向があります)", p):
            tsuyoi.append(i + 1)
    if tsuyoi:
        oso = [i for i in tsuyoi if i > len(paras) * 0.8]
        # 終盤の主張が、冒頭にも出ているなら「先出しして証明した」形なので良い
        saki = False
        if oso:
            ato = paras[oso[0] - 1]
            atama = u"".join(paras[:2])
            for j in range(0, max(0, len(ato) - 6)):
                if ato[j:j + 6] in atama:
                    saki = True
                    break
        warui = bool(oso) and not saki and not [i for i in tsuyoi if i <= 2]
        say(u"  %s 主張の位置  段落 %s%s"
            % (u"×" if warui else u"○",
               u", ".join(str(i) for i in tsuyoi[:6]),
               u"  (冒頭で先出し済み)" if saki else u""))
        if warui:
            say(u"      いちばん強い一文が %d%%地点にあります。"
                % int(100.0 * oso[0] / len(paras)))
            say(u"      段落%d: %s" % (oso[0], paras[oso[0] - 1][:44]))
            say(u"      → これを冒頭に持ってきて、残り全部で証明します。")

    # 5. 中盤の引き留め
    mid = range(int(len(paras) * 0.3), int(len(paras) * 0.6) + 1)
    hiki = [i + 1 for i in mid if i < len(paras) and len(paras[i]) < 40]
    mark = u"○" if hiki else u"×"
    say(u"  %s 中盤の引き留め  %s"
        % (mark, (u"段落%d にあります" % hiki[0]) if hiki
           else u"ありません"))
    if not hiki:
        say(u"      40%%地点(段落%d あたり)に、後半の予告を一文置きます。"
            % max(1, int(len(paras) * 0.4)))

    # 6. 固有名詞
    koyu = set(re.findall(u"第[0-9０-９]+期|第[0-9０-９]+話|[ァ-ヴ]{3,}", body))
    mark = u"○" if len(koyu) >= 3 else u"×"
    say(u"  %s 固有名詞  %d種類" % (mark, len(koyu)))

    # 7. 章（画面表示.txt 側で区切っていることもあるので、注意までに留める）
    if chaps:
        say(u"  ○ 章の区切り  %d個" % len(chaps))
    else:
        say(u"  ・ 章の区切り  台本には無し")
        say(u"      画面表示.txt で区切っているなら、これで構いません。")
    say(u"")


# ══════════════════════════════ X の投稿

def make_x(paras, chaps, title):
    u"""台本から、Xの投稿の下書きを作る。

    1本の動画から3〜5投稿に割る。全部を使い切らないこと。
    """
    say(u"")
    say(u"══════ X投稿の下書き ══════")
    say(u"280字まで。リンクは本文に入れず、リプライに置きます。")
    say(u"画像つきが有利なので、図表スライドを付けてください。")
    say(u"")

    def dasu(n, kind, honbun, e=u""):
        t = honbun.strip()
        say(u"───── %d. %s  (%d字)" % (n, kind, len(t)))
        if len(t) > X_LIMIT:
            say(u"  ※ %d字オーバー。削ってください" % (len(t) - X_LIMIT))
        say(u"")
        for line in t.split(u"\n"):
            say(u"  " + line)
        if e:
            say(u"")
            say(u"  [画像] " + e)
        say(u"")

    n = 0
    # ① 結論だけを言い切る
    ketsuron = None
    for p in reversed(paras):
        if re.search(u"(つまり|構造になって|面白いところ|傾向があります|見えてきます|わけです|ということです)", p) and len(p) > 40:
            # 「まとめます。」のような前置きは飛ばして、中身のある文を取る
            for b in bun(p):
                if len(b) > 16:
                    ketsuron = b
                    break
            if ketsuron:
                break
    if ketsuron:
        n += 1
        dasu(n, u"結論だけ言い切る型", ketsuron.strip() +
             u"\n\nなぜそう言えるのかは、動画で1つずつ確かめています。\n\n#無職転生", u"図表の総括スライド")

    # ② 数字で驚かせる
    kazu = []
    for p in paras:
        for m in re.finditer(u"[^。]*[0-9０-９]+(歳|年|話|つ|人|回)[^。]*。", p):
            s = m.group(0).strip()
            if 20 < len(s) < 90:
                kazu.append(s)
    if kazu:
        n += 1
        dasu(n, u"数字で止める型", kazu[0] +
             u"\n\n並べてみると、偶然ではない形が出てきます。\n\n#無職転生 #アニメ考察", u"年表スライド")

    # ③ 問いかけ
    nazo = [p for p in paras if re.search(u"(なぜ|何者|分かっていない|明かされていません)", p)]
    if nazo:
        s = bun(nazo[0])[0].strip()
        n += 1
        dasu(n, u"問いかけ型", s +
             u"\n\n分かっていることと、分かっていないことを分けて整理しました。\n\n#無職転生", u"該当キャラの1枚")

    # ④ 各章から1つずつ
    for i in sorted(chaps)[:2]:
        if i < len(paras):
            s = bun(paras[i])[0].strip()
            if len(s) > 15:
                n += 1
                dasu(n, u"章から抜く型（%s）" % chaps[i], s +
                     u"\n\n続きは動画で。\n\n#無職転生", u"その章の1枚")

    say(u"───── 全投稿の末尾に")
    say(u"  " + CREDIT)
    say(u"")
    say(u"※ この下書きは台本の文をそのまま抜いたものです。")
    say(u"   Xは口調が違うので、チャットで整えてから出してください。")


# ══════════════════════════════ ブログ記事

def make_blog(paras, chaps, title):
    u"""ゆるオタの部屋の型に流し込んだ、考察記事の下書き。"""
    say(u"")
    say(u"══════ ブログ記事の下書き ══════")
    say(u"ゆるオタの部屋（kasa-yuruotablog.com）の考察記事の型です。")
    say(u"既存の『作品紹介』の型ではなく、考察用に新しく作ったものです。")
    say(u"理由は 台本の知恵.txt の4章にあります。")
    say(u"")

    ketsu = None
    for p in reversed(paras):
        if re.search(u"(つまり|構造になって|面白いところ|傾向があります|見えてきます)", p) and len(p) > 40:
            ketsu = p
            break

    say(u"H1  無職転生・%s【アニメ放送分のみ／ネタバレあり】" % title)
    say(u"")
    say(u"    (リード文 150字ほど。動画の掴みをそのまま使えます)")
    say(u"    " + paras[0][:70] + u"…")
    say(u"")
    say(u"H2  結論")
    if ketsu:
        say(u"    " + ketsu[:150])
    else:
        say(u"    (この回でいちばん強い一文を、ここに先に書く)")
    say(u"")
    say(u"H2  そう言える根拠")
    if chaps:
        for i in sorted(chaps):
            say(u"  H3  %s" % chaps[i])
            if i < len(paras):
                say(u"      " + paras[i][:80] + u"…")
    else:
        for i, p in enumerate(paras[2:-2][:7]):
            say(u"  H3  (%s)" % bun(p)[0][:30])
            say(u"      " + p[:80] + u"…")
    say(u"")
    say(u"H2  まだ分かっていないこと")
    nazo = [p for p in paras if re.search(u"(分かっていない|明かされていません|まだ)", p)]
    for p in nazo[:3]:
        say(u"    ・" + bun(p)[0][:70])
    if not nazo:
        say(u"    (断定できない点を正直に並べる。ここが信頼になる)")
    say(u"")
    say(u"H2  動画でも話しています")
    say(u"    (YouTube埋め込み)")
    say(u"")
    say(u"H2  関連記事")
    say(u"    ・無職転生の他の考察記事へのリンク")
    say(u"    ・作品紹介記事（受け皿）へのリンク")
    say(u"")
    say(u"記事末")
    say(u"    " + CREDIT)
    say(u"")
    n = len(u"".join(paras))
    say(u"目安の文字数: 台本が%d字なので、記事は%d〜%d字になります。"
        % (n, int(n * 1.2), int(n * 1.8)))
    say(u"既存記事は作品紹介3,500字／まとめ6,000〜10,400字でした。")


# ══════════════════════════════ ショート

def make_short(paras, chaps, title):
    u"""15〜30秒に収まる段落を探して、ショートの案を出す。"""
    say(u"")
    say(u"══════ ショートの切り出し案 ══════")
    say(u"伸びるのは15〜30秒。冒頭1〜2秒で結論を出し切ります。")
    say(u"音声は本編のものをそのまま使うので、録り直しは要りません。")
    say(u"")

    kouho = []
    for i, p in enumerate(paras):
        s = byo(p)
        if 12 <= s <= 34:
            ten = 0.0
            if re.search(u"(つまり|実は|ですが|しかし|なぜ)", p):
                ten += 2.0
            if re.search(u"[0-9０-９]+(歳|年|話|つ|人)", p):
                ten += 1.5
            if re.search(u"(死|失|別れ|殺|裏切|正体|秘密)", p):
                ten += 1.5
            if 15 <= s <= 26:
                ten += 1.0
            kouho.append((ten, i, s, p))
    kouho.sort(key=lambda x: (-x[0], x[1]))

    if not kouho:
        say(u"15〜30秒に収まる段落がありませんでした。")
        say(u"段落が長すぎます。--from-slot / --to-slot で絵の番号を指定して")
        say(u"short.py で切ってください。")
        return

    for n, (ten, i, s, p) in enumerate(kouho[:5]):
        say(u"───── 案%d  段落%d  %.0f秒  (強さ %.1f)" % (n + 1, i + 1, s, ten))
        say(u"")
        say(u"  [冒頭1.5秒に出す文字＝結論。読み上げは入りません]")
        say(u"    " + (bun(p)[0][:26].rstrip(u"。") or title))
        say(u"")
        say(u"  [本編から切り出す中身]")
        for b in bun(p):
            say(u"    " + b[:52])
        say(u"")
        say(u"  切り出し方:")
        say(u"    python short.py --from-slot ? --to-slot ? \\")
        say(u"      --hook \"%s\"" % (bun(p)[0][:22].rstrip(u"。")))
        say(u"    （絵の番号は  python short.py --list  で確認）")
        say(u"")


# ══════════════════════════════

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", default=u"台本_字幕用.txt")
    ap.add_argument("--title", default=u"")
    ap.add_argument("--dict", default=u"読み辞書.txt")
    ap.add_argument("--yomi", action="store_true", help=u"読み上げ用に変換する")
    ap.add_argument("--x", action="store_true", help=u"X投稿の下書き")
    ap.add_argument("--blog", action="store_true", help=u"ブログ記事の下書き")
    ap.add_argument("--short", action="store_true", help=u"ショートの切り出し案")
    ap.add_argument("--check", action="store_true", help=u"台本の健康診断")
    ap.add_argument("--all", action="store_true", help=u"全部やる")
    a = ap.parse_args()

    # 台本を先に見つけてから移動する。相対パスで呼ばれても動くように
    if not os.path.exists(a.script):
        cand = os.path.join(HERE, a.script)
        if os.path.exists(cand):
            a.script = cand
    a.script = os.path.abspath(a.script)
    if os.path.isdir(HERE):
        os.chdir(HERE)
    if not (a.yomi or a.x or a.blog or a.short or a.check or a.all):
        a.all = True

    paras, chaps = read_script(a.script)
    title = a.title or os.path.basename(a.script) \
        .replace(u"_字幕用", u"").replace(u".txt", u"").replace(u"台本", u"").strip(u"_") \
        or u"無職転生"

    if a.yomi:
        # 読み上げ用は控えではなく、本物のファイルを書く
        dic, keep = load_yomi_dict(a.dict)
        out = a.script.replace(u"字幕用", u"読み上げ用")
        if out == a.script:
            out = re.sub(u"\\.txt$", u"_読み上げ用.txt", a.script)
        lines, zen = [], 0
        for line in io.open(a.script, encoding="utf-8-sig", errors="replace").read() \
                .replace("\r\n", "\n").split("\n"):
            if line.strip().startswith(u"#"):
                continue
            t, n = to_yomi(line, dic, keep)
            zen += n
            lines.append(t)
        io.open(out, "w", encoding="utf-8-sig", newline="").write(
            u"\r\n".join(lines).strip() + u"\r\n")
        say(u"%s を書きました。" % out)
        say(u"「は」を %d か所、「ワ」に変えました。" % zen)
        say(u"")
        say(u"※ 実測の一致率は93.8%です。残りは判断が要るので、")
        say(u"   おかしな所があれば 読み辞書.txt に足してください。")
        say(u"     書式:  は:実は        … この語の「は」は変えない")
        say(u"            邂逅<タブ>カイコウ … この語をこう読ませる")
        return

    log_start()
    say(u"台本: %s" % a.script)
    say(u"段落 %d / %d字 / 読み上げ およそ %.1f分"
        % (len(paras), len(u"".join(paras)), byo(u"".join(paras)) / 60.0))

    if a.check or a.all:
        check(paras, chaps)
    if a.x or a.all:
        make_x(paras, chaps, title)
    if a.blog or a.all:
        make_blog(paras, chaps, title)
    if a.short or a.all:
        make_short(paras, chaps, title)

    log_save(u"下書き_%s.txt" % re.sub(u"[\\\\/:*?\"<>|]+", u"", title)[:30])


if __name__ == "__main__":
    main()
