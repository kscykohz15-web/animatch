# -*- coding: utf-8 -*-
"""
merged.wav + subtitle.srt + 画像フォルダ から スライドショー動画を作ります。

使い方(ふつうはbatから自動で呼ばれます):
    python make_slideshow.py              … 割り当て表を作り、そのまま動画まで作る
    python make_slideshow.py --plan       … 割り当て表(画像割り当て.tsv)だけ作る
    python make_slideshow.py --render     … 既にある割り当て表で動画だけ作り直す

主なオプション:
    --images "C:\\...\\画像フォルダ"   画像の置き場所を変える
    --sec 3.0                          1枚あたりの目安の長さ(秒)
    --fit blur|contain|cover           余白の埋め方(既定 blur = 背景ぼかし)
    --size 1920x1080                   出力サイズ
    --no-sub                           字幕を焼き込まない(既定は焼き込む)
    --font "Meiryo"                    字幕のフォント
    --sub-size 54                      字幕の大きさ(px)
    --sub-chars 20                     字幕1行の文字数(既定は自動)
    --credit "©…"                      左上に出す引用元
    --preview                          字幕の見え方を1枚のPNGで確認する
    --out 完成.mp4                     出力ファイル名

同じフォルダに 画像プラン.txt があると、セリフのキーワードを見て
自動で絵を割り当てます(書式は 画像プラン.txt の冒頭コメント参照)。
画面表示.txt があると、左上に引用元、右上にチャプター名を出します。
"""
import argparse
import hashlib
import io
import os
import re
import shutil
import subprocess
import time
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
IMGDIR_DEFAULT = u"C:\\Youtube動画\\無職転生\\画像\\高画質"
EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
# ── フォルダの分け方（2026-10-02 本人の指定）──────────────
#   音声/    … merged.wav / subtitle.srt / 音声のもと.txt
#   動画/    … 完成した mp4。1枚ずつは 動画/分割版/
#   確認用/  … チャットに貼る txt（一覧・採点・編集のクセ）
#   その他/  … 作る途中でできるもの（割り当て表・画像一覧・_work など）
# 台本と設定ファイルは、本人が直すものなので、いちばん上に置いたまま。
OTO_DIR = u"音声"
DOUGA_DIR = u"動画"
BUNKATSU_DIR = os.path.join(u"動画", u"分割版")
KAKUNIN_DIR = u"確認用"
SONOTA_DIR = u"その他"


def ass_path(p):
    u"""字幕ファイルの場所を、ffmpeg のフィルタに渡せる形にする。

    Windows の「C:\\…」はフィルタの中では「C\\:\\…」と書かないと、
    「:」が引数の区切りとみなされて落ちる。
    """
    q = os.path.relpath(p, HERE).replace("\\", "/")
    return q.replace(":", "\\:")


def shitaku():
    u"""4つのフォルダを作っておく。無ければ作るだけ。"""
    for d in (OTO_DIR, DOUGA_DIR, BUNKATSU_DIR, KAKUNIN_DIR, SONOTA_DIR):
        p = os.path.join(HERE, d)
        if not os.path.isdir(p):
            try:
                os.makedirs(p)
            except OSError:
                pass


def sagasu(name, *folders):
    u"""入力ファイルを探す。新しいフォルダ → いちばん上 の順。

    VOICEPEAK など、こちらで直せない道具は いちばん上に書き出すので、
    どちらにあっても拾えるようにしておく。
    """
    if os.path.isabs(name):
        return name
    for d in folders:
        p = os.path.join(HERE, d, name)
        if os.path.exists(p):
            return p
    return name


PLAN = os.path.join(SONOTA_DIR, u"画像割り当て.tsv")
IMGLIST = os.path.join(SONOTA_DIR, u"画像一覧.txt")
IMGPLAN = u"画像プラン.txt"
FIGDIR = u"図表"
LEAD = 0.12          # 字幕を声の何秒前に出すか
PLAN_FORMAT = 3
OVERLAY = u"画面表示.txt"
MITAME_FILE = u"見た目.txt"     # 下の MITAME(人物の逃げ道)と別物。名前がぶつかっていた
CATALOG = u"画像カタログ.txt"
EPMAP = u"話数マップ.txt"


# ---------------------------------------------------------------- 小道具
LOG = []          # 控えをとるとき、ここに文字がたまる
LOGGING = [False]


def say(msg):
    if LOGGING[0]:
        LOG.append(msg)
    try:
        print(msg)
    except UnicodeEncodeError:
        # 画面の文字コードでは出せない字がある。画面だけ諦めて、
        # ファイルの控えには正しい字が残るようにしておく。
        # 画面の文字コードに合わせて置きかえる。ascii に直すと
        # 置きかえ文字そのものが出せず、二度目の失敗になるため。
        enc = getattr(sys.stdout, "encoding", None) or "ascii"
        try:
            print(msg.encode(enc, "replace").decode(enc, "replace"))
        except Exception:
            print(msg.encode("ascii", "replace").decode("ascii", "replace"))
    except Exception:
        pass
    try:
        sys.stdout.flush()
    except Exception:
        pass


def log_start():
    """この先の表示を控えておく。"""
    del LOG[:]
    LOGGING[0] = True


def log_save(path):
    """控えをファイルに書く。

    PowerShell に画面の文字を渡して保存させると、文字コードの違いで
    日本語が全部こわれることがある。だから Python が自分で書く。
    """
    LOGGING[0] = False
    try:
        io.open(path, "w", encoding="utf-8-sig", newline="").write(
            u"\r\n".join(LOG) + u"\r\n")
        say(u"")
        say(u"%s に保存しました。これをチャットに貼ってください。" % path)
    except Exception as e:
        say(u"控えを保存できませんでした: %s" % e)


def die(msg):
    say(u"")
    say(u"[中断] " + msg)
    sys.exit(1)


def need(tool):
    p = shutil.which(tool)
    if not p:
        die(u"%s が見つかりません。PowerShellで  winget install --id Gyan.FFmpeg -e  を実行し、"
            u"ウィンドウを開き直してからもう一度お試しください。" % tool)
    return p


def run(cmd):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        say(r.stdout.decode("utf-8", "replace")[-3000:])
        die(u"ffmpeg がエラーを返しました。")
    return r.stdout


def _run_quiet(cmd):
    u"""並べて走らせる用。うまくいけば None、だめなら出力を返す。"""
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        return r.stdout.decode("utf-8", "replace")
    return None


def run_soft(cmd):
    """失敗しても止めたくないとき用。うまくいったら True。"""
    try:
        r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    except Exception:
        return False
    return r.returncode == 0


def run_live(cmd):
    """進捗をそのまま画面に出したいとき用。"""
    r = subprocess.run(cmd)
    if r.returncode != 0:
        die(u"ffmpeg がエラーを返しました。")


def mmss(t):
    t = int(round(t))
    return u"%d:%02d" % (t // 60, t % 60)


def natkey(name):
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r"(\d+)", name)]


# ---------------------------------------------------------------- 入力
def audio_duration(path):
    out = subprocess.run(
        [need("ffprobe"), "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout
    try:
        return float(out.decode("utf-8", "replace").strip().split()[0])
    except Exception:
        die(u"merged.wav の長さを読めませんでした。")


def parse_srt(path):
    """[(start, end, text), ...] を返す。"""
    raw = io.open(path, encoding="utf-8-sig", errors="replace").read()
    pat = re.compile(
        r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)")
    cues = []
    block = []
    for line in raw.replace("\r\n", "\n").split("\n") + [""]:
        if line.strip() == "":
            if block:
                head = None
                body = []
                for b in block:
                    m = pat.search(b)
                    if m and head is None:
                        head = m
                    elif head is not None:
                        body.append(b.strip())
                if head:
                    g = [int(x) for x in head.groups()]
                    st = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000.0
                    en = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000.0
                    cues.append((st, en, u" ".join([b for b in body if b])))
                block = []
        else:
            block.append(line)
    return cues


def ass_time(t):
    if t < 0:
        t = 0.0
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    sec, cs = divmod(cs, 100)
    return u"%d:%02d:%02d.%02d" % (h, m, sec, cs)


# 禁則処理用
NO_START = u"、。，．,.・：；:;？！?!ー〜…ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ」』）］｝〉》"
NO_END = u"「『（［｛〈《"
STRONG = u"、。！？!?"
MEDIUM = u"」』）・…，．,."


def disp_len(text):
    """全角=1.0、半角=0.55 として見た目の長さを返す。"""
    n = 0.0
    for c in text:
        n += 0.55 if ord(c) < 0x2E80 else 1.0
    return n


def _ok_break(text, i):
    if i <= 0 or i >= len(text):
        return False
    if text[i] in NO_START:
        return False
    if text[i - 1] in NO_END:
        return False
    if text[i - 1].isdigit() or text[i].isdigit():   # 「第11|話」「19|歳」を割らない
        return False
    # カタカナの続きの途中では切らない。「ルー|デウス」のような
    # 名前の分断は、文字を少し小さくしてでも避ける。
    if _kind(text[i - 1]) == "kata" and _kind(text[i]) == "kata":
        return False
    # 開きカギ括弧のすぐ後ろでは切らない(「地|下室 のような分断を防ぐ)
    for k in range(max(0, i - 4), i):
        if text[k] in u"「『（":
            return False
        if text[k] in u"」』）":
            break
    return True


def _break_score(text, i):
    c = text[i - 1]
    if c in STRONG:
        return 3
    if c in MEDIUM:
        return 2
    return 1


def _widths(text):
    acc = [0.0]
    for c in text:
        acc.append(acc[-1] + (0.55 if ord(c) < 0x2E80 else 1.0))
    return acc


def kind_of(c):
    u"""外から使うための別名（折り返し検査.py が使う）。"""
    return _kind(c)


def _kind(c):
    o = ord(c)
    if 0x3040 <= o <= 0x309F:
        return "hira"
    if 0x30A0 <= o <= 0x30FF:
        return "kata"
    if 0x4E00 <= o <= 0x9FFF or o == 0x3005:
        return "kanji"
    if o < 0x2E80:
        return "ascii"
    return "other"


# 「かな→漢字」のように語の変わり目らしいほど小さい。
#
# ここは一度まちがえていた。漢字＋漢字(0.60)を、ひらがな＋ひらがな(1.00)より
# 安いコストにしていたせいで、「直接」の真ん中で改行されていた。
# 熟語やカタカナ語の真ん中で切るのは、いちばんやってはいけない切り方なので、
# そこを大きくしてある。
_TRANS = {
    # 語の変わり目になりやすい（切ってよい）
    ("hira", "kanji"): 0.30, ("hira", "kata"): 0.30, ("hira", "ascii"): 0.35,
    ("kata", "kanji"): 0.45, ("ascii", "kanji"): 0.40,
    ("kanji", "kata"): 0.50, ("ascii", "kata"): 0.45,
    ("kanji", "ascii"): 0.45, ("kata", "ascii"): 0.45,
    # 送りがななど。切れることもあるが、あまり良くない
    ("kata", "hira"): 0.60, ("kanji", "hira"): 0.80, ("ascii", "hira"): 0.80,
    ("hira", "hira"): 1.00,
    # 語の真ん中になりやすい（切ってはいけない）
    ("kanji", "kanji"): 4.00,     # 直|接 / 年|表 / 処|刑
    ("kata", "kata"): 6.00,       # ルー|デウス のような、名前の途中
}


def _cut_penalty(text, i):
    """i の直前で改行したときの読みにくさ。小さいほど良い。"""
    sc = _break_score(text, i)
    if sc == 3:
        return 0.0
    if sc == 2:
        return 30.0
    return 120.0 * _TRANS.get((_kind(text[i - 1]), _kind(text[i])), 0.85)


def split_lines(text, budget, n, want_cost=False):
    """text を n 行に分ける最良の分け方。入らなければ None。"""
    acc = _widths(text)
    L = len(text)
    total = acc[L]
    if n == 1:
        if total > budget:
            return None
        return ([text], 0.0) if want_cost else [text]
    target = total / float(n)
    INF = float("inf")
    dp = [[INF] * (L + 1) for _ in range(n + 1)]
    back = [[0] * (L + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for k in range(1, n + 1):
        for i in range(1, L + 1):
            if k == n and i != L:
                continue
            for j in range(0, i):
                if dp[k - 1][j] == INF:
                    continue
                wl = acc[i] - acc[j]
                if wl > budget:
                    continue
                if j > 0 and not _ok_break(text, j):
                    continue
                cost = dp[k - 1][j] + abs(wl - target) ** 1.5
                if wl < budget * 0.30:
                    cost += 60.0
                if j > 0:
                    cost += _cut_penalty(text, j)
                if cost < dp[k][i]:
                    dp[k][i] = cost
                    back[k][i] = j
    if dp[n][L] == INF:
        return None
    cuts, i = [], L
    for k in range(n, 0, -1):
        j = back[k][i]
        cuts.append((j, i))
        i = j
    cuts.reverse()
    lines = [text[j:i] for (j, i) in cuts]
    return (lines, dp[n][L]) if want_cost else lines


def fit_lines(text, budget, max_lines):
    """budget に収まり、いちばん読みやすい折り返しを返す。"""
    text = u" ".join(text.split())
    best, best_sc = None, None
    for n in range(1, max_lines + 1):
        got = split_lines(text, budget, n, want_cost=True)
        if not got:
            continue
        lines, cost = got
        sc = cost + 45.0 * (n - 1)      # 行数は少ないほうが良いが、絶対ではない
        if best_sc is None or sc < best_sc:
            best, best_sc = lines, sc
    if best:
        return best
    total = disp_len(text)
    got = split_lines(text, total / float(max_lines) * 1.35, max_lines)
    return got or [text]


def wrap_ja(text, per_line, max_lines):
    return fit_lines(text, per_line, max_lines)


def fit_to_box(text, usable, size, max_lines):
    """必ず usable(px) に収まる (行, 文字サイズ) を返す。

    まず行を増やして入れられないか試し、それでも無理なときだけ縮める。
    """
    text = u" ".join(text.split())
    if not text:
        return [text], size
    # 1) その大きさのまま、行数を増やして入るか
    for n in range(1, max_lines + 1):
        got = split_lines(text, usable / float(size), n)
        if got:
            return got, size
    # 2) 1行だけ余分に許す
    got = split_lines(text, usable / float(size), max_lines + 1)
    if got:
        return got, size
    # 3) それでも無理なら、入る大きさまで縮める(はみ出させない)
    n = max_lines + 1
    best = split_lines(text, disp_len(text) / float(n) * 1.25, n)
    if not best:
        step = max(1, int(round(len(text) / float(n))))
        best = [text[i:i + step] for i in range(0, len(text), step)]
    longest = max(disp_len(l) for l in best)
    return best, max(20, int(usable / longest))


def kaigyou_naosu(t):
    u"""名前の中の改行の書き方を \\N にそろえる。

    本人向けの説明には \\N と書いてありますが、実際の 画面表示_*.txt には
    小文字の \\n が 17か所まじっていました（こちらが書いたもの）。
    小文字のままだと、どこでも改行として扱われず、_esc が円記号だけ消すので
    画面には「シルフィエットn別れ方は」と n が出てしまいます。
    どちらで書いても同じ意味になるように、ここでそろえます。
    """
    return t.replace(u"\\n", u"\\N")


def load_overlay(path):
    """左上の引用と、右上のチャプターを読む。"""
    credit, chaps = u"", []
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.lstrip().startswith(u"#"):
            continue
        c = [x.strip() for x in line.split(u"\t")]
        c = [x for x in c if x != u""]
        if len(c) >= 2 and c[0] in (u"引用", u"credit"):
            credit = c[1]
        elif len(c) >= 3 and c[0] in (u"章", u"chapter"):
            # 4列目は「この章はアニメの何話の内容か」。カンマ区切りで複数可。
            # 絵をその話数から選ぶのと、章カードの絵を選ぶのに使います。
            eps = [x.strip() for x in c[3].replace(u"、", u",").split(u",")
                   if x.strip()] if len(c) >= 4 else []
            chaps.append((c[1], kaigyou_naosu(c[2]), eps))
    return credit, chaps


TARINAI = []        # 足りない設定。最後にまとめて出し、一覧.txt にも残す。


def kakete_iru(a, mi_aru, ov_aru, credit, chaps, spans):
    u"""指定したはずの設定が抜けていないか調べる。

    ここが黙っていたせいで、老デウス以外の動画が
    引用も章もフォント指定も無いまま出来上がっていた。
    足りないものは必ず名前で言う。
    """
    n = []
    if not mi_aru:
        n.append(u"見た目.txt が無い（フォントと文字の大きさが既定のまま）")
    if not ov_aru:
        n.append(u"画面表示.txt が無い（左上の引用と右上の章が出ない）")
    else:
        if not credit:
            n.append(u"画面表示.txt に「引用」の行が無い（左上が空のまま）")
        if not chaps:
            n.append(u"画面表示.txt に「章」の行が無い（右上が空のまま）")
        elif not spans:
            n.append(u"章のキーワードが台本に1つも当たらない（右上が空のまま）")
    if not os.path.exists(a.imageplan):
        n.append(u"画像プラン.txt が無い（絵が字幕の中身に合わない）")
    return n


def font_shirabe(font):
    u"""フォントが入っていなければ、足りないものとして返す。"""
    if font_aru(font) is False:
        return [u"フォント「%s」が入っていない（別のフォントで描かれています）" % font]
    return []


MITAME_KITEI = {
    u"フォント": u"Yu Gothic UI",
    u"字幕の大きさ": 12.0, u"字幕の1行": 0.0, u"字幕の行数": 2.0,
    u"字幕の色": u"FFFFFF", u"字幕のふち色": u"000000", u"字幕のふち": 0.115,
    u"字幕の最短": 0.0, u"同じ絵の上限": 3.0, u"書き出しの速さ": u"faster",
    u"引用の大きさ": 38.0, u"引用の色": u"FFFFFF",
    u"章の大きさ": 24.0, u"章の色": u"FFFFFF",
    # 絵をゆっくり横に動かす（はい/いいえ）と、そのための拡大率
    u"画像を動かす": u"はい", u"画像の拡大": 1.10, u"動きの速さ": 0.75,
}


def load_mitame(path):
    u"""見た目.txt を読む。フォント・文字の大きさ・色。

    無くても既定値で動くが、「無い」ことは呼び出し側に伝える。
    黙って既定で作ってしまうと、指定したはずの見た目が消えるため。
    """
    mi = dict(MITAME_KITEI)
    if not os.path.exists(path):
        return mi, False
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read() \
            .replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t or t.startswith(u"#") or u"\t" not in t:
            continue
        c = [x.strip() for x in t.split(u"\t") if x.strip()]
        if len(c) < 2 or c[0] not in mi:
            continue
        if isinstance(MITAME_KITEI[c[0]], float):
            try:
                mi[c[0]] = float(c[1])
            except ValueError:
                pass
        else:
            mi[c[0]] = c[1]
    return mi, True


def font_aru(name):
    u"""そのフォントが本当に入っているか調べる。

    入っていないと libass は黙って別のフォントで描く。
    「フォントの指定が無視された」に見える原因がこれなので、先に言う。
    分からないときは None を返し、何も言わない（嘘の警告を出さないため）。
    """
    if not name:
        return None
    try:
        if os.name == "nt":
            try:
                import winreg
            except ImportError:
                import _winreg as winreg
            mise = name.lower()
            for hive, key in (
                    (winreg.HKEY_LOCAL_MACHINE,
                     r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
                    (winreg.HKEY_CURRENT_USER,
                     r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")):
                try:
                    k = winreg.OpenKey(hive, key)
                except OSError:
                    continue
                i = 0
                while True:
                    try:
                        nm = winreg.EnumValue(k, i)[0]
                    except OSError:
                        break
                    i += 1
                    if mise in nm.lower():
                        winreg.CloseKey(k)
                        return True
                winreg.CloseKey(k)
            return False
        fc = shutil.which("fc-list")
        if not fc:
            return None
        out = subprocess.run([fc, ":family"], stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL).stdout
        return name.lower() in out.decode("utf-8", "replace").lower()
    except Exception:
        return None


def ass_iro(rrggbb, kitei=u"FFFFFF"):
    u"""RRGGBB を ASS の &H00BBGGRR に直す。書き方が変でも既定に戻す。"""
    s = (rrggbb or u"").strip().lstrip(u"#").upper()
    if len(s) != 6 or any(ch not in u"0123456789ABCDEF" for ch in s):
        s = kitei
    return u"&H00%s%s%s" % (s[4:6], s[2:4], s[0:2])


def chapter_spans(cues, chaps, total):
    """キーワードが最初に出てくるキューを、その章の開始にする。"""
    marks = []
    used = set()
    for (key, title, _eps) in chaps:
        for i, (st, _en, tx) in enumerate(cues):
            if i in used or key not in tx:
                continue
            marks.append([st, title])
            used.add(i)
            break
    marks.sort(key=lambda m: m[0])
    if marks and marks[0][0] > 0.05:
        marks[0][0] = 0.0
    spans = []
    for i, (st, title) in enumerate(marks):
        en = marks[i + 1][0] if i + 1 < len(marks) else total
        if en > st:
            spans.append((st, en, title))
    return spans


def _esc(t):
    return t.replace(u"\\", u"").replace(u"{", u"(").replace(u"}", u")")


def write_ass(cues, path, w, h, font, size, per_line, max_lines,
              credit=u"", chapters=None, total=0.0, safe_bottom=0.062,
              hook_until=0.0, mi=None, cards=None, hidari=0.5):
    # 文字の大きさは「短いほうの辺」を基準にする。
    # 高さ基準にすると、縦動画(1080x1920)で字幕が倍の大きさになってしまう。
    mi = mi or dict(MITAME_KITEI)
    base = min(w, h)
    side = int(w * 0.04)
    usable = w - side * 2 - size * 0.25      # フチの太さぶん余裕を見る
    if not per_line:
        per_line = max(8, int(usable / float(size)))
    csize = max(16, int(round(base / max(6.0, mi[u"引用の大きさ"]))))   # 左上の引用
    chsize = max(20, int(round(base / max(6.0, mi[u"章の大きさ"]))))    # 右上の章
    pad = int(h * 0.022)
    fuchi = max(0.0, min(0.4, mi[u"字幕のふち"]))
    iro = {u"Def": ass_iro(mi[u"字幕の色"]), u"Hook": ass_iro(mi[u"字幕の色"]),
           u"Credit": ass_iro(mi[u"引用の色"]), u"Chap": ass_iro(mi[u"章の色"])}
    fuchi_iro = ass_iro(mi[u"字幕のふち色"], u"000000")

    def style(name, fname, fsize, align, ml, mr, mv):
        return (u"Style: %s,%s,%d,%s,&H000000FF,%s,&H78000000,-1,0,0,0,"
                u"100,100,0,0,1,%.1f,%.1f,%d,%d,%d,%d,1"
                % (name, fname, fsize, iro.get(name, u"&H00FFFFFF"), fuchi_iro,
                   max(3.0, fsize * fuchi),
                   max(1.0, fsize * 0.035), align, ml, mr, mv))

    head = [
        u"[Script Info]",
        u"ScriptType: v4.00+",
        u"PlayResX: %d" % w,
        u"PlayResY: %d" % h,
        u"WrapStyle: 0",
        u"ScaledBorderAndShadow: yes",
        u"YCbCr Matrix: TV.709",
        u"",
        u"[V4+ Styles]",
        u"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        u"BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        u"BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        style(u"Def", font, size, 2, side, side, int(h * safe_bottom)),
        style(u"Credit", font, csize, 7, int(w * 0.012), int(w * 0.012), pad),
        style(u"Chap", font, chsize, 9, int(w * 0.012), int(w * 0.012), pad),
        # ショートの冒頭に出す一言。画面の真ん中に大きく置く
        style(u"Hook", font, int(size * 1.35), 5, side, side, 0),
        # 章タイトルのカード。右半分の真ん中に置く
        style(u"Card", font, int(size * 1.15), 5,
              int(w * hidari) + int(w * 0.02), int(w * 0.02), 0),
        u"",
        u"[Events]",
        u"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]

    body = []
    if credit and total > 0:
        body.append(u"Dialogue: 1,%s,%s,Credit,,0,0,0,,%s"
                    % (ass_time(0.0), ass_time(total), _esc(credit)))
    chw = max(6, int((w * 0.46) / float(chsize)))
    for (st, en, title) in (chapters or []):
        lines = []
        for part in _esc(title.replace(u"\\N", u"\x00")).split(u"\x00"):
            if part.strip():
                lines.extend(wrap_ja(part.strip(), chw, 2))
        body.append(u"Dialogue: 1,%s,%s,Chap,,0,0,0,,%s"
                    % (ass_time(st), ass_time(en), u"\\N".join(lines[:3])))

    # 章タイトルのカード。右半分に、折り返して置く。
    #
    # 幅で折り返すだけだと、長い章の名前が右半分からはみ出します
    # (「オルステッドが二百年を百回くり返したという説の検証」で実際にはみ出した)。
    # 字幕と同じ fit_to_box を使い、入らなければ文字のほうを小さくします。
    cardsz = int(size * 1.15)
    cardroom = w * (1.0 - hidari) - w * 0.04 - cardsz * 0.25
    for (st, en, title) in (cards or []):
        gyou, fs = [], cardsz
        for part in _esc(title.replace(u"\\N", u"\x00")).split(u"\x00"):
            if not part.strip():
                continue
            lines, sz = fit_to_box(part.strip(), cardroom, cardsz, 3)
            gyou.extend(lines)
            fs = min(fs, sz)
        if not gyou:
            continue
        pre = u"{\\fs%d}" % fs if fs != cardsz else u""
        body.append(u"Dialogue: 2,%s,%s,Card,,0,0,0,,%s%s"
                    % (ass_time(st), ass_time(en), pre, u"\\N".join(gyou[:4])))

    for (st, en, tx) in cues:
        tx = _esc(tx)
        if not tx.strip():
            continue
        hook = st < hook_until - 0.01
        base_size = int(size * 1.35) if hook else size
        room = w - side * 2 - base_size * 0.25
        lines, fs = fit_to_box(tx, room, base_size, 3 if hook else max_lines)
        pre = u"{\\fs%d}" % fs if fs != base_size else u""
        body.append(u"Dialogue: 0,%s,%s,%s,,0,0,0,,%s%s"
                    % (ass_time(st), ass_time(en),
                       u"Hook" if hook else u"Def", pre, u"\\N".join(lines)))

    io.open(path, "w", encoding="utf-8", newline="\n").write(
        u"\n".join(head + body) + u"\n")
    return len([b for b in body if b.startswith(u"Dialogue: 0")])


def _walk_images(root):
    """話数フォルダなど、下の階層もたどって画像を集める。"""
    out = []
    for cur, dirs, files in os.walk(root):
        dirs.sort(key=natkey)
        rel = os.path.relpath(cur, root)
        rel = u"" if rel == "." else rel.replace(os.sep, u"/")
        for n in sorted([x for x in files if x.lower().endswith(EXTS)], key=natkey):
            out.append(((rel + u"/" + n) if rel else n, os.path.join(cur, n)))
    return out


def list_images(d, extra=None):
    """画像フォルダ(話数フォルダを含む)と図表フォルダを見る。

    名前は「無職転生 第11話/0012.jpg」のようにフォルダ名つきで扱う。
    重ならなければ、ファイル名だけでも指定できる。
    """
    if not os.path.isdir(d):
        die(u"画像フォルダが見つかりません: " + d)
    found = _walk_images(d)
    if not found:
        die(u"画像フォルダに画像がありません: " + d)
    names = [k for (k, _v) in found]
    where = dict(found)

    base = {}
    for (k, _v) in found:
        base.setdefault(k.split(u"/")[-1], []).append(k)
    for (bn, ks) in base.items():
        if len(ks) == 1 and bn not in where:
            where[bn] = where[ks[0]]

    subs = sorted(set(k.rsplit(u"/", 1)[0] for k in names if u"/" in k), key=natkey)
    if subs:
        say(u"画像 %d枚 (%d フォルダ)" % (len(names), len(subs)))
        for sb in subs:
            say(u"    %-30s %d枚" % (sb, sum(1 for k in names if k.startswith(sb + u"/"))))
        loose = sum(1 for k in names if u"/" not in k)
        if loose:
            say(u"    %-30s %d枚" % (u"(直下)", loose))

    figs = []
    if extra and os.path.isdir(extra):
        figs = sorted([n for n in os.listdir(extra) if n.lower().endswith(EXTS)], key=natkey)
        for n in figs:
            where[n] = os.path.join(extra, n)
        if figs:
            say(u"図表を %d枚 読み込みました (%s)" % (len(figs), extra))
    return names + figs, where


# ---------------------------------------------------------------- 割り当て
def split_text_by_time(text, st, en, pieces):
    """text を pieces(文などの断片)に分け、文字数の比で時間を割り振る。"""
    total_chars = float(sum(len(x) for x in pieces)) or 1.0
    out, t = [], st
    span = en - st
    for i, piece in enumerate(pieces):
        d = span * (len(piece) / total_chars)
        e = en if i == len(pieces) - 1 else t + d
        out.append((t, e, piece))
        t = e
    return out


SENT_END = re.compile(u"(?<=[。！？])")


def detect_silences(path, noise_db, min_len):
    """merged.wav の中の無音区間を拾う。返り値は (開始, 終了) の並び。"""
    r = subprocess.run(
        [need("ffmpeg"), "-hide_banner", "-nostats", "-i", path,
         "-af", "silencedetect=noise=%ddB:d=%.2f" % (noise_db, min_len),
         "-f", "null", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = r.stdout.decode("utf-8", "replace")
    outs, st = [], None
    for m in re.finditer(r"silence_(start|end):\s*(-?[0-9.]+)", log):
        if m.group(1) == "start":
            st = float(m.group(2))
        elif st is not None:
            outs.append((st, float(m.group(2))))
            st = None
    return outs


def _snap_pass(bounds, centers, tol, lengths, total):
    """各切れ目をいちばん近い「間」に合わせる。合わせられなかった所は
    前後の合った所から、文字数の比で埋め直す。"""
    n = len(bounds)
    anchor = [None] * n
    prev = -1e9
    for i in range(n):
        cand = [c for c in centers if abs(c - bounds[i]) <= tol and c > prev + 0.30]
        if cand:
            best = min(cand, key=lambda c: abs(c - bounds[i]))
            anchor[i] = best
            prev = best
    # 合わなかった区間を、両隣の確定値のあいだに文字数比で配る
    out = list(bounds)
    i = 0
    while i < n:
        if anchor[i] is not None:
            out[i] = anchor[i]
            i += 1
            continue
        j = i
        while j < n and anchor[j] is None:
            j += 1
        lo = out[i - 1] if i > 0 else 0.0
        hi = anchor[j] if j < n else (total if total > lo else None)
        if hi is None:
            i = j
            continue
        seg = lengths[i:j + 1]
        tot = float(sum(seg)) or 1.0
        acc = 0.0
        for k in range(i, j):
            acc += lengths[k]
            out[k] = lo + (hi - lo) * (acc / tot)
        i = j
    # 単調性を保つ
    for i in range(1, n):
        if out[i] <= out[i - 1]:
            out[i] = out[i - 1] + 0.30
    return out, sum(1 for x in anchor if x is not None)


def speech_runs(sils, total, pad):
    """無音の裏返し = 実際に声が出ている区間。"""
    runs, t = [], 0.0
    for (a, b) in sils:
        if a - t > 0.12:
            runs.append((t, a))
        t = b
    if total - t > 0.12:
        runs.append((t, total))
    return runs


def split_sentences(text):
    return [x.strip() for x in SENT_END.split(u" ".join(text.split())) if x.strip()]


def _speech_map(runs):
    """実時間 <-> 発話だけの時間 を行き来するための表。"""
    spans, acc = [], 0.0
    for (a, b) in runs:
        spans.append((a, b, acc))
        acc += (b - a)
    return spans, acc


def _to_real(spans, x):
    """発話時間 x 秒の地点が、実時間でどこか。"""
    for (a, b, base) in spans:
        if x <= base + (b - a) + 1e-9:
            return a + max(0.0, x - base)
    return spans[-1][1] if spans else 0.0


SPEN = float(os.environ.get("MS_SPEN", "1.2"))   # 文をまとめる時の罰
RPEN = float(os.environ.get("MS_RPEN", "0.08"))  # 区間をまとめる時の罰
FPEN = float(os.environ.get("MS_FPEN", "1.0"))   # 区切り数が合わない時の罰


def align_runs_to_sentences(runs, weights, frags=None, max_s=6, max_r=14):
    """文の並びと発話区間の並びを、群どうしで対応づける(動的計画法)。

    「文k個 ↔ 発話区間r個」をひとつの組として、
        |その組の発話時間 - 文字数から予想される長さ|
    の合計が最小になる分け方を選ぶ。長さで合わせるので、
    途中で読む速さが変わっても誤差が累積しない。

    ・文の中に「間」がある(読点など) → 1文に複数の区間
    ・文の間に「間」がない           → 複数の文で1区間
    どちらも同じ枠組みで扱える。返り値は (文の開始index, 区間の範囲) の並び。
    """
    m, n = len(runs), len(weights)
    if m == 0 or n == 0:
        return None
    dur = [b - a for (a, b) in runs]
    ps = [0.0]
    for d in dur:
        ps.append(ps[-1] + d)
    W = [0.0]
    for w in weights:
        W.append(W[-1] + w)
    rate = (ps[-1] or 1.0) / (W[-1] or 1.0)

    band = max(25, int(m * 0.18))
    lo = [0] * (n + 1)
    hi = [m] * (n + 1)
    for j in range(n + 1):
        c = int(round(m * (W[j] / (W[-1] or 1.0))))
        lo[j] = max(0, c - band)
        hi[j] = min(m, c + band)
    lo[0] = hi[0] = 0
    lo[n] = hi[n] = m

    INF = float("inf")
    dp = [dict() for _ in range(n + 1)]
    bk = [dict() for _ in range(n + 1)]
    dp[0][0] = 0.0
    for j in range(1, n + 1):
        js = range(max(0, j - max_s), j)
        for i in range(lo[j], hi[j] + 1):
            best, barg = INF, None
            for jp in js:
                prev = dp[jp]
                if not prev:
                    continue
                want = rate * (W[j] - W[jp])
                pen = SPEN * (j - jp - 1)
                fwant = sum(frags[jp:j]) if frags else None
                ip_lo = max(lo[jp], i - max_r)
                for ip in range(ip_lo, i + 1):
                    pv = prev.get(ip)
                    if pv is None:
                        continue
                    c = pv + abs((ps[i] - ps[ip]) - want) + pen + RPEN * (i - ip - 1)
                    if fwant is not None:
                        c += FPEN * abs((i - ip) - fwant)
                    if c < best:
                        best, barg = c, (jp, ip)
            if barg is not None:
                dp[j][i] = best
                bk[j][i] = barg
    if m not in dp[n]:
        return None
    groups, j, i = [], n, m
    while j > 0:
        jp, ip = bk[j][i]
        groups.append((jp, j, ip, i))
        j, i = jp, ip
    groups.reverse()
    return groups


def times_from_groups(runs, groups, weights, total):
    """群ごとの時間を、文ごとの (開始, 終了) に配る。"""
    n = len(weights)
    st = [0.0] * n
    en = [0.0] * n
    for (j0, j1, i0, i1) in groups:
        if i1 <= i0:                       # 区間が割り当たらなかった群
            a0 = runs[i0][0] if i0 < len(runs) else total
            b0 = a0
        else:
            a0, b0 = runs[i0][0], runs[i1 - 1][1]
        w = [weights[t] for t in range(j0, j1)]
        tw = float(sum(w)) or 1.0
        acc = 0.0
        for idx, t in enumerate(range(j0, j1)):
            st[t] = a0 + (b0 - a0) * (acc / tw)
            acc += w[idx]
            en[t] = a0 + (b0 - a0) * (acc / tw)
    out = []
    for t in range(n):
        s2 = max(0.0, st[t] - LEAD)
        if out and s2 < out[-1][0] + 0.30:
            s2 = out[-1][0] + 0.30
        out.append([s2, en[t]])
    for t in range(n - 1):
        out[t][1] = max(out[t][0] + 0.30, out[t + 1][0])
    out[n - 1][1] = max(out[n - 1][0] + 0.30, total)
    return out


PAUSE_CHARS = u"、,，"


def _frags(sent):
    """VOICEPEAK が区切って読む数 = 読点の数 + 1。"""
    return 1 + sum(1 for c in sent if c in PAUSE_CHARS)


def _runs_from(sils, total, min_len):
    """無音のうち min_len 以上のものだけを切れ目とみなす。"""
    keep = [(a, b) for (a, b) in sils if (b - a) >= min_len]
    runs, t = [], 0.0
    for (a, b) in keep:
        if a - t > 0.12:
            runs.append((t, a))
        t = b
    if total - t > 0.12:
        runs.append((t, total))
    return runs


def choose_granularity(sils, total, n_sent, n_frag):
    """無音のしきい値を変えながら、台本の構造に一番合う粒度を選ぶ。

    文の数か、読点で区切った数と一致すれば、推測なしで対応が取れる。
    """
    best = None
    for L in (0.06, 0.09, 0.12, 0.15, 0.18, 0.22, 0.26, 0.30, 0.36, 0.45, 0.60, 0.80):
        runs = _runs_from(sils, total, L)
        m = len(runs)
        if m < 2:
            continue
        ds, df = abs(m - n_sent), abs(m - n_frag)
        kind = "sent" if ds <= df else "frag"
        score = min(ds, df)
        key = (score, 0 if score == 0 else 1, abs(L - 0.25))
        if best is None or key < best[0]:
            best = (key, L, runs, kind, score)
    if best is None:
        return None, None, None, None
    return best[1], best[2], best[3], best[4]


def find_part_audio(folder, audio_name):
    """1行ずつの音声ファイルを探す。あれば推測は一切要らなくなる。"""
    base = os.path.basename(audio_name).lower()
    cands = []
    for d in (os.path.join(folder, "output"), os.path.join(folder, "outputs"),
              os.path.join(folder, "wav"), os.path.join(folder, u"音声"),
              os.path.join(folder, u"音声出力"), os.path.join(folder, "voice"),
              os.path.join(folder, "out"), os.path.join(folder, "parts"),
              folder):
        if not os.path.isdir(d):
            continue
        ns = [n for n in os.listdir(d)
              if n.lower().endswith((".wav", ".mp3", ".flac")) and n.lower() != base]
        if len(ns) >= 3:
            ns.sort(key=natkey)
            cands.append((d, ns))
    if not cands:
        return None, []
    cands.sort(key=lambda x: -len(x[1]))
    return cands[0]


def srt_texts(path):
    """subtitle.srt から本文だけを順に取り出す(時刻は使わない)。"""
    raw = io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n")
    out = []
    for b in re.split(r"\n\s*\n", raw):
        lines = [x for x in b.strip().split("\n") if x.strip()]
        if len(lines) < 3:
            continue
        body = u" ".join(lines[2:]).strip().lstrip(u"\ufeff")
        if body:
            out.append(body)
    return out


def _norm(t):
    return u"".join(t.split())


def group_sentences(sents, chunks):
    """台本の文を、音声のかたまり(SRTの各キュー)に振り分ける。"""
    groups, i = [], 0
    for ch in chunks:
        target = _norm(ch)
        acc, took = u"", []
        while i < len(sents):
            nxt = acc + _norm(sents[i])
            if not target.startswith(nxt):
                break
            acc = nxt
            took.append(i)
            i += 1
            if acc == target:
                break
        if not took:
            return None
        groups.append(took)
    if i != len(sents):
        return None
    return groups


def align_boundaries(expected, cands):
    """期待位置の並びを、候補(実際の間)の並びに順番を保って割り当てる。"""
    n, m = len(expected), len(cands)
    if n == 0 or m < n:
        return None, 0
    INF = float("inf")
    prev = [abs(cands[i] - expected[0]) for i in range(m)]
    back = [[0] * m for _ in range(n)]
    for j in range(1, n):
        cur = [INF] * m
        best_v, best_i = INF, 0
        for i in range(m):
            if i >= 1 and prev[i - 1] < best_v:
                best_v, best_i = prev[i - 1], i - 1
            if i >= j and best_v < INF:
                cur[i] = best_v + abs(cands[i] - expected[j])
                back[j][i] = best_i
        prev = cur
    last = min(range(m), key=lambda i: prev[i])
    out = [0.0] * n
    i = last
    for j in range(n - 1, -1, -1):
        out[j] = cands[i]
        i = back[j][i]
    return out, n


def card_basho(rows, chaps):
    u"""章タイトルのカードを、どの行の前に入れるかを求める。

    差し替えの番号合わせと、実際にカードを入れるところの
    **2か所で同じ答えを使う**ために、関数にしてある。
    （別々に数えていたせいで番号が1つずれていた）
    """
    out, tsukatta = [], set()
    for (key, title, _eps) in (chaps or []):
        for i in range(len(rows)):
            if i in tsukatta or key not in rows[i][2]:
                continue
            tsukatta.add(i)
            if i == 0:
                break          # いちばん最初はカードを入れない
            out.append((i, title))
            break
    out.sort()
    return out


def toshi_bangou(rows, kaado):
    u"""本人が見ている通し番号 → 割り当て表の行。

    ■ なぜ要るか（本人の27件の指定が、18番から1つずつずれていた）

    本人が番号を読むのは 確認用/一覧.txt と 確認用/コマ一覧_01.png。
    そこには**章タイトルのカードも1コマとして入っている**（278コマ）。
    ところが差し替えは、カードを入れる前の割り当て表（267行）に
    当てていた。カードが1枚はさまるたびに、そこから先が1つずつずれる。

    本人が18番を空けていたので気づけた（18番＝「ヒトガミの目的」のカード）。

    返り値: {通し番号: 行(0から)}, {通し番号: 章の名前}（カードのぶん）
    """
    basho = dict(kaado or [])
    ban, card_ban, d = {}, {}, 0
    for i in range(len(rows)):
        if i in basho:
            d += 1
            card_ban[d] = basho[i]
        d += 1
        ban[d] = i
    return ban, card_ban


def koma_awase(slots, ikari, sils, tol=0.8, saitan=0.10):
    u"""文字数で割った切れ目を、本物の「間」に寄せ直す。

    ■ なぜ要るか（v130 でもまだ字幕がずれていた）

    時刻表が「① 音声＋subtitle.srt」でも、ずれは残っていた。
    理由は、**合っているのは 1行ずつの音声の境目(54か所)だけ**だから。

        1行ずつの音声     54個   ← 実測。ここは正確
          ↓ refine_cues（文字数で割る）
        字幕             180本   ← ここから推測
          ↓ split_by_kuten（文字数で割る）
        絵と字幕の区切り  267枚   ← ここも推測

    VOICEPEAK は一定の速さで読む、という前提で文字数の比で割っていたが、
    実際には「、」「。」で息を継ぐし、語によって速さも変わる。
    1つの段落の中で 0.5〜1.5秒ずれるので、**段落の頭だけ合っていて、
    途中の字幕が声より早く出たり遅れたりする。**

    ■ 直し方

    実測の境目（錨）は動かさない。その間に入った切れ目だけを、
    merged.wav に本当にある「間」へ寄せる。
    順番は保ち、寄せ先が無い切れ目は文字数の比のまま置く。
    """
    if len(slots) < 2 or not sils:
        return slots, 0, 0.0
    # 切れ目の時刻をならべる
    kugiri = [slots[0][0]]
    for (st, du, _tx) in slots:
        kugiri.append(st + du)
    n = len(kugiri)
    # 錨＝実測から来た切れ目。ここは動かさない
    ik = sorted(ikari or [])

    def is_ikari(t):
        return any(abs(t - x) <= 0.06 for x in ik)

    tomeru = [True] + [is_ikari(kugiri[i]) for i in range(1, n - 1)] + [True]
    # 寄せ先の候補。「間」の終わりの少し手前＝次の声が出る直前
    ma = [max(a + 0.02, b - LEAD) for (a, b) in sils if (b - a) >= saitan]
    ma.sort()
    ugokashi, ichiban = 0, 0.0
    i = 0
    while i < n - 1:
        if not tomeru[i]:
            i += 1
            continue
        j = i + 1
        while j < n and not tomeru[j]:
            j += 1
        if j >= n or j - i < 2:
            i = j
            continue
        # i と j は動かさない。その間の (j-i-1) 個を寄せる
        a0, b0 = kugiri[i], kugiri[j]
        naka = [k for k in ma if a0 + 0.25 < k < b0 - 0.25]
        exp = kugiri[i + 1:j]
        if len(naka) >= len(exp):
            atta, _ = align_boundaries(exp, naka)
            if atta:
                for t, (mae, ato) in enumerate(zip(exp, atta)):
                    # 遠すぎる寄せは、かえって悪くなるのでしない
                    if abs(ato - mae) <= tol:
                        kugiri[i + 1 + t] = ato
                        if abs(ato - mae) > 0.05:
                            ugokashi += 1
                            ichiban = max(ichiban, abs(ato - mae))
        i = j
    # 順番が入れ替わらないようにだけ見る
    for t in range(1, n):
        if kugiri[t] <= kugiri[t - 1] + 0.12:
            kugiri[t] = kugiri[t - 1] + 0.12
    out = []
    for t, (_st, _du, tx) in enumerate(slots):
        out.append((kugiri[t], max(0.12, kugiri[t + 1] - kugiri[t]), tx))
    return out, ugokashi, ichiban


def place_in_chunk(sents_idx, sents, a0, b0, sils):
    """かたまりの中で、文の切れ目を実際の「間」に置く。"""
    k = len(sents_idx)
    if k == 1:
        return [(a0, b0)]
    ws = [max(1, len(sents[j])) for j in sents_idx]
    tw = float(sum(ws))
    cum, exp = 0.0, []
    for j in range(k - 1):
        cum += ws[j]
        exp.append(a0 + (b0 - a0) * (cum / tw))
    # かたまりの末尾にある無音(=次のかたまりとの境目)は候補に入れない
    inside = [(x, y) for (x, y) in sils
              if x > a0 + 0.05 and y < b0 - 0.05]
    got = None
    # このかたまりの中で「ちょうど k-1 個」になる無音の長さを探す。
    # 見つかれば、文の切れ目はそこで確定する(推測ゼロ)。
    best_exact = None
    for L in (0.60, 0.50, 0.45, 0.40, 0.36, 0.32, 0.28, 0.25, 0.22, 0.20, 0.18, 0.15, 0.12):
        cand = [c for c in inside if (c[1] - c[0]) >= L]
        if len(cand) == k - 1:
            best_exact = [max(c[0] + 0.02, c[1] - LEAD) for c in cand]
            break
    if best_exact:
        got = best_exact
    else:
        # 長い無音ほど文の切れ目らしいので、そちらを優先して割り当てる
        longs = sorted(inside, key=lambda c: -(c[1] - c[0]))[:max(k * 3, 8)]
        longs = sorted(longs, key=lambda c: c[0])
        cands = [max(c[0] + 0.02, c[1] - LEAD) for c in longs]
        if len(cands) >= k - 1:
            got, _ = align_boundaries(exp, cands)
    if not got:
        got = exp
    bounds = [a0] + list(got) + [b0]
    for t in range(1, len(bounds)):
        if bounds[t] <= bounds[t - 1]:
            bounds[t] = min(b0, bounds[t - 1] + 0.30)
    return [(bounds[t], bounds[t + 1]) for t in range(k)]


def check_script_vs_srt(script, srt_path, names):
    """台本・音声・subtitle.srt が同じものから作られているか確かめる。

    台本を直したあとに音声を録り直さないと、字幕の中身は新しいのに
    区切りの位置が古いまま、ということが起きる。見た目には
    「字幕が音声とずれている」としか分からないので、ここで名指しする。
    """
    if not os.path.exists(srt_path):
        return
    chunks = srt_texts(srt_path)
    paras = [x.strip() for x in script.replace(u"\r\n", u"\n").split(u"\n") if x.strip()]
    if names and len(chunks) != len(names):
        say(u"")
        say(u"⚠ subtitle.srt の区切り %d個 と、音声ファイル %d個 が合いません。"
            % (len(chunks), len(names)))
        say(u"   台本を直したあと、音声を作り直していない可能性があります。")
        say(u"")
        return
    # 本文がどれだけ違うか
    a = _norm(u"".join(paras))
    b = _norm(u"".join(chunks))
    if a == b:
        return
    # どこから違うか
    i = 0
    while i < min(len(a), len(b)) and a[i] == b[i]:
        i += 1
    say(u"")
    say(u"⚠ 台本と subtitle.srt の本文が違います。")
    say(u"   同じなのは先頭から %d文字まで。そこから先が食い違っています。" % i)
    say(u"     台本  … %s" % a[max(0, i - 12):i + 28])
    say(u"     音声側… %s" % b[max(0, i - 12):i + 28])
    say(u"   台本を直したなら、メニューの 1 で音声を作り直してください。")
    say(u"   そうしないと、字幕と絵の切り替わりが音声とずれます。")
    say(u"")


def kugiri_awase(durs, total, sils, mado=1.5):
    u"""1行ずつの音声の境目を、merged.wav の本物の無音に合わせ直す。

    ■ なぜ要るか（本人の画面で、冒頭だけ字幕と声がずれた）

    merged.wav は 1行ずつの音声をつなぐときに、行の前後の無音を削るので、
    合計が縮む（実測 540.81秒 → 534.44秒）。
    この縮みは**行の長さに比例しない。**
    後ろに長い間がある行はたくさん縮み、間の無い行はほとんど縮まない。

    前は一律 0.9882倍にしていたので、
      ・削られた量が平均より多い行のあとは、字幕が**遅れる**
      ・平均より少ない行のあとは、字幕が**早まる**
    しかも合計は必ず合うので、**最後だけは合い、途中でずれる。**
    本人の「冒頭からヒトガミの目的の章までずれる」はこれ。

    ■ どう直すか

    行の境目は、merged.wav の中では必ず無音の中にある（そこを削ったので）。
    一律倍率で出した目安の近くにある無音の**まん中**へ寄せる。
    寄せ先が無ければ目安のまま。順番が入れ替わらないようにだけ見る。

    戻り値: 境目の時刻の並び（0 と total を含む len(durs)+1 個）
    """
    n = len(durs)
    if n < 2:
        return [0.0, total]
    naka = sorted((a + b) / 2.0 for (a, b) in (sils or []) if b > a)

    # 合わせるたびに「残りの本物の時間 ÷ 残りの読み上げ時間」を計算し直す。
    #
    # 一度ずれたまま次を見積もると、ずれが積み上がって窓から外れ、
    # そこから先が全部合わなくなる（実際そうなった）。
    # 合わせ直した位置から測り直せば、ずれは次に持ち越さない。
    out, t = [0.0], 0.0
    for k in range(1, n):
        nokori_honto = total - t
        nokori_yomi = float(sum(durs[k - 1:])) or 1.0
        mezasu = t + durs[k - 1] * (nokori_honto / nokori_yomi)
        chikai = [(abs(c - mezasu), c) for c in naka
                  if abs(c - mezasu) <= mado and c > t + 0.05]
        saki = min(chikai)[1] if chikai else mezasu
        saki = min(max(saki, t + 0.05), total - 0.05)
        out.append(saki)
        t = saki
    out.append(total)
    return out


def timeline_from_parts_srt(script, folder, names, srt_path, total, sils, strict=False):
    """★ 1行ずつの音声の長さ + subtitle.srt の本文 から、正確な時刻表を作る。

    ・どこで区切れているか  → subtitle.srt の本文(これは正しい)
    ・各かたまりの長さ      → output フォルダの wav の実測(これも正しい)
    subtitle.srt の「時刻」だけが当てにならないので、そこだけ使わない。
    """
    if not os.path.exists(srt_path):
        return None, u"subtitle.srt がありません"
    chunks = srt_texts(srt_path)
    if len(chunks) != len(names):
        return None, u"音声 %d個 と subtitle.srt の %d個が合いません" % (len(names), len(chunks))
    paras = [p.strip() for p in script.replace(u"\r\n", u"\n").split(u"\n") if p.strip()]
    sents = []
    for p in paras:
        sents.extend(split_sentences(p))
    groups = group_sentences(sents, chunks)
    loose = u""
    if groups is None:
        if strict:
            # 推測で振り分ける前に、subtitle.srt を使わない正確な方法を試す。
            # 先に推測してしまうと、ズレたまま最後まで通ってしまう。
            return None, u"subtitle.srt の本文が台本と一致しません"
        # 本文が完全一致しなくても、区切りの数は正しいので使う。
        # 文を「文字数の比」でかたまりに割り振る。
        loose = u" (本文が完全一致しないため、文字数で振り分け)"
        clen = [max(1, len(_norm(c))) for c in chunks]
        tot = float(sum(clen))
        slen = [max(1, len(_norm(x))) for x in sents]
        stot = float(sum(slen))
        groups, i, acc = [], 0, 0.0
        for gi in range(len(chunks)):
            target = sum(clen[:gi + 1]) / tot
            took = []
            while i < len(sents) and (gi == len(chunks) - 1 or
                                      (acc + slen[i] / stot / 2.0) <= target):
                acc += slen[i] / stot
                took.append(i)
                i += 1
            if not took and i < len(sents):
                took = [i]
                acc += slen[i] / stot
                i += 1
            groups.append(took)
        while i < len(sents):
            groups[-1].append(i)
            i += 1
        if any(not g for g in groups):
            return None, u"台本の文と subtitle.srt の本文が対応づけられません"

    durs = [audio_duration(os.path.join(folder, n)) or 0.0 for n in names]
    ssum = sum(durs)
    if ssum <= 0:
        return None, u"音声の長さが読めません"
    scale = total / ssum
    head = (u"1行ずつの音声 %d個 (%s) の実測 %.2f秒 → merged.wav %.2f秒 (%.4f倍) / 文 %d"
            % (len(names), os.path.basename(folder) or u".", ssum, total, scale, len(sents)))

    # 行の境目は、一律倍率ではなく merged.wav の本物の無音に合わせる。
    # 一律だと、削られた無音の量が行ごとにちがうぶんだけ途中でずれる。
    kugiri = kugiri_awase(durs, total, sils)
    zure = max(abs(kugiri[k] - sum(durs[:k]) * scale) for k in range(len(kugiri))) \
        if len(kugiri) > 1 else 0.0
    if zure > 0.15:
        head += u" / 境目を無音に合わせ直しました(最大 %.2f秒ぶん)" % zure

    out = [None] * len(sents)
    for gi, took in enumerate(groups):
        a0, b0 = kugiri[gi], kugiri[gi + 1]
        for (idx, (s2, e2)) in zip(took, place_in_chunk(took, sents, a0, b0, sils)):
            out[idx] = (max(0.0, s2 - LEAD), e2, sents[idx])
    for j in range(len(out)):
        if out[j] is None:
            return None, u"割り当てに穴があります"
    return out, head + (u" → 推測なしで対応しました。" if not loose else loose)


def timeline_from_parts(script, folder, names, total, speech_script=None):
    """1行ずつの音声の長さを足して、そのまま時刻表にする(推測ゼロ)。"""
    paras = [p.strip() for p in script.replace(u"\r\n", u"\n").split(u"\n") if p.strip()]
    sents = []
    for p in paras:
        sents.extend(split_sentences(p))
    durs = []
    for n in names:
        d = audio_duration(os.path.join(folder, n))
        durs.append(d if d else 0.0)
    m, n_s, n_p = len(durs), len(sents), len(paras)
    head = u"1行ずつの音声 %d個 (%s) / 文 %d / 段落 %d" % (m, os.path.basename(folder) or u"同じフォルダ", n_s, n_p)

    if m == n_s:
        units, ws = sents, None
    elif m == n_p:
        units, ws = paras, None
    else:
        return None, head + u" → 数が合わないので使えません"

    bounds, t = [], 0.0
    for d in durs:
        bounds.append((t, t + d))
        t += d
    scale = (total / t) if (t > 0 and abs(t - total) > 0.05) else 1.0
    if scale != 1.0:
        bounds = [(a * scale, b * scale) for (a, b) in bounds]
        head += u" (合計 %.2f秒 を merged.wav の %.2f秒 に合わせて %.4f倍)" % (t, total, scale)

    out = []
    if m == n_s:
        for j, (a, b) in enumerate(bounds):
            out.append((max(0.0, a - LEAD), b, sents[j]))
        return out, head + u" → 文と1対1。推測ゼロで対応しました。"
    # 段落単位 → 中の文は文字数で割る(段落の頭と尻は正確)
    for j, (a, b) in enumerate(bounds):
        ss = split_sentences(paras[j])
        for (s2, e2, tx) in split_text_by_time(paras[j], a, b, ss):
            out.append((max(0.0, s2 - LEAD), e2, tx))
    return out, head + u" → 段落と1対1。段落の境目は正確、中の文は文字数で配分。"


def timeline_from_audio(script, sils, total, speech_script=None):
    """台本と音声だけから時刻表を組み立てる。"""
    paras = [p.strip() for p in script.replace(u"\r\n", u"\n").split(u"\n") if p.strip()]
    sents = []
    for p in paras:
        sents.extend(split_sentences(p))
    if not sents:
        return [], u"台本から文を取り出せませんでした。"

    spoken_sents = sents
    if speech_script:
        sp = []
        for p in [q.strip() for q in speech_script.replace(u"\r\n", u"\n").split(u"\n") if q.strip()]:
            sp.extend(split_sentences(p))
        if len(sp) == len(sents):
            spoken_sents = sp
        else:
            say(u"  (読み上げ用の文数 %d が字幕用 %d と違うため、字幕用で見積もります)"
                % (len(sp), len(sents)))
    weights = [max(1, len(x)) for x in spoken_sents]
    frags = [_frags(x) for x in spoken_sents]
    n_sent, n_frag = len(sents), sum(frags)

    L, runs, kind, score = choose_granularity(sils, total, n_sent, n_frag)
    if not runs:
        return [], u"音声に「間」が見つかりませんでした。"
    m = len(runs)
    head = u"文 %d / 読点区切り %d / 見つけた発話区間 %d (無音%.2f秒以上)" % (
        n_sent, n_frag, m, L)

    # --- ぴったり合った場合は、推測なしで対応づける ---
    if kind == "sent" and m == n_sent:
        span = [[runs[j][0], runs[j][1]] for j in range(n_sent)]
        note = head + u" → 文の数と一致。推測なしで対応しました。"
    elif kind == "frag" and m == n_frag:
        span, k = [], 0
        for j in range(n_sent):
            a0 = runs[k][0]
            k += frags[j]
            span.append([a0, runs[k - 1][1]])
        note = head + u" → 読点区切りの数と一致。推測なしで対応しました。"
    else:
        groups = align_runs_to_sentences(runs, weights, frags if kind == "frag" else None)
        if not groups:
            return [], head + u" ・割り当てに失敗しました"
        span = times_from_groups(runs, groups, weights, total)
        one = sum(1 for g in groups if g[1] - g[0] == 1 and g[3] - g[2] == 1)
        note = head + u" → 数が %d ずれているため、長さで照合しました (%d組 / うち1対1 %d組)" % (
            score, len(groups), one)
        return [(span[j][0], span[j][1], sents[j]) for j in range(n_sent)], note

    # 声の少し前から出す / 隙間は前の文に足す
    out = []
    for t in range(n_sent):
        s2 = max(0.0, span[t][0] - LEAD)
        if out and s2 < out[-1][0] + 0.30:
            s2 = out[-1][0] + 0.30
        out.append([s2, span[t][1]])
    for t in range(n_sent - 1):
        out[t][1] = max(out[t][0] + 0.30, out[t + 1][0])
    out[-1][1] = max(out[-1][0] + 0.30, total)
    return [(out[j][0], out[j][1], sents[j]) for j in range(n_sent)], note


def _speech_pos(spans, frac, totspeech):
    """発話時間の frac 地点が、実時間でどこかを返す。"""
    want = frac * totspeech
    acc = 0.0
    for (a, b, d) in spans:
        if acc + d >= want:
            return a + (want - acc)
        acc += d
    return spans[-1][1] if spans else 0.0


def snap_to_silence(cues, sils, tol, total=0.0):
    """文の切れ目を、実際の音声の「間」に合わせ直す。

    make_srt.py の時刻が見積もりでも、無音の位置は音声そのものなので、
    ここに合わせれば発話とズレない。2回繰り返して収束させる。
    """
    if not cues or len(cues) < 2 or not sils:
        return cues, 0, 0.0
    centers = [(x + y) / 2.0 for (x, y) in sils]
    bounds = [cues[i][1] for i in range(len(cues) - 1)]
    lengths = [max(1, len(cues[i][2])) for i in range(len(cues))]
    orig = list(bounds)
    hit = 0
    for _ in range(2):
        bounds, hit = _snap_pass(bounds, centers, tol, lengths, total)
    moved = sum(1 for i in range(len(bounds)) if abs(bounds[i] - orig[i]) > 0.02)
    worst = max([abs(bounds[i] - orig[i]) for i in range(len(bounds))] or [0.0])
    out = []
    for i, (st, en, tx) in enumerate(cues):
        s2 = bounds[i - 1] if i > 0 else 0.0
        e2 = bounds[i] if i < len(bounds) else en
        out.append((s2, max(e2, s2 + 0.30), tx))
    return out, moved, worst


def rescale_cues(cues, total):
    """SRTの終わりと音声の長さが違うとき、全体を伸縮してズレを消す。

    make_srt.py が文字数から時刻を見積もっている場合、後ろへ行くほど
    実際の発話とズレる。最後を音声の長さに合わせて線形に直す。
    """
    if not cues or total <= 0:
        return cues, 1.0
    last = cues[-1][1]
    if last <= 0:
        return cues, 1.0
    k = total / last
    if abs(last - total) < 0.25:
        return cues, 1.0
    return [(st * k, en * k, tx) for (st, en, tx) in cues], k


def refine_cues(cues, max_sec, max_chars):
    """段落まるごとのキューを、文 → 読点 の順にほぐす。

    VOICEPEAKは一定の速さで読むので、文字数の比で時間を割り振れば
    実際の発話とほぼ合う。"""
    out = []
    for (st, en, tx) in cues:
        tx = u" ".join(tx.split())
        if not tx:
            continue
        if (en - st) <= max_sec and len(tx) <= max_chars:
            out.append((st, en, tx))
            continue
        parts = [x for x in SENT_END.split(tx) if x.strip()]
        for (s2, e2, sent) in split_text_by_time(tx, st, en, parts):
            sent = sent.strip()
            if (e2 - s2) <= max_sec and len(sent) <= max_chars:
                out.append((s2, e2, sent))
                continue
            # まだ長い文は読点で分ける
            chunks, cur = [], u""
            for ch in sent:
                cur += ch
                if ch in u"、" and len(cur) >= max_chars * 0.45:
                    chunks.append(cur)
                    cur = u""
            if cur:
                chunks.append(cur)
            if len(chunks) < 2:
                k = max(2, int(len(sent) / float(max_chars)) + 1)
                chunks = (split_lines(sent, len(sent) / float(k) * 1.3, k)
                          or [sent[i:i + max_chars] for i in range(0, len(sent), max_chars)])
            out.extend(split_text_by_time(sent, s2, e2, chunks))
    return out


KUTEN = re.compile(u"(?<=[、。！？])")


def owari_bun(x):
    """「。」「！」「?」で終わっているか（＝文の終わり）。"""
    return x.rstrip().endswith((u"。", u"！", u"？"))


def kugiri(tx, moji=0):
    u"""文を区切る。「。」は必ず切り、「、」は moji 文字を超えないように切る。

    ・「。」「！」「？」は必ず切る（ここは絶対）
    ・「、」は、次を足すと moji 文字を超えるときに、その手前の「、」で切る
    ・「、」が1つも無くて moji 文字を超える文は、切らずにそのまま返す
      （切る場所が無い。途中で切ると字幕が読めなくなる）

        >>> kugiri(u"3期の第11話で、ほんの数分だけ映ったあの老人は、その人生の50年で、", 20)
        「3期の第11話で、」/「ほんの数分だけ映ったあの老人は、」/「その人生の50年で、」

    短すぎる切れ端をくっつけるのは split_by_kuten の仕事。
    そこでは尺(秒)も見るので、文字数だけのここでは切るだけにしておく。
    """
    out = []
    # ① まず「。！？」で文に割る（区切り文字は前に付ける）
    for bun in re.findall(u"[^。！？]*[。！？]+|[^。！？]+", tx):
        if not bun.strip():
            continue
        # ② その中を「、」で小片に割る（「、」は前に付ける）
        if not moji:
            # moji=0 は「「、」ごとに切る」＝前までの動き
            for ko in re.findall(u"[^、]*、|[^、]+", bun):
                if ko.strip():
                    out.append(ko)
            continue
        acc = u""
        for ko in re.findall(u"[^、]*、|[^、]+", bun):
            if acc and disp_len(acc) + disp_len(ko) > moji:
                out.append(acc)      # ここまでは「、」で終わっている
                acc = ko
            else:
                acc += ko
        if acc.strip():
            out.append(acc)
    return [x for x in out if x.strip()]


def split_by_kuten(slots, saitan=1.1, moji=0, mijika=0):
    """スロットを句読点で割る。

    1文に1枚だと、文の前半と後半で写っているべき人が違っても
    片方しか出せない。句読点で割ると、その両方に絵を当てられる。

    切ったあと、短すぎるものは「後ろ」にくっつける。
      ・mijika 文字以下のもの
      ・saitan 秒より短いもの
    どちらも、0.5秒で絵が変わると読めないため。
    ただし「。」で終わっているものは動かさない（「。」は必ず切る）。

    尺は文字数の比で分ける。丸めの誤差は最後で吸収する
    （合計がずれると音と絵がずれる）。
    """
    out = []
    for (s0, du, tx) in slots:
        piece = kugiri(tx, moji)
        if len(piece) < 2:
            out.append([s0, du, tx])
            continue
        # 文字数で尺を割る
        n = [max(1, disp_len(x)) for x in piece]
        tot = float(sum(n))
        hit = list(piece)
        hik = [du * (x / tot) for x in n]
        # 短いものを後ろにくっつける（mijika=0 なら何もしない＝前までの動き）
        i = 0
        while mijika and i < len(hit) - 1:
            mijikai = (disp_len(hit[i]) <= mijika) or (hik[i] < saitan)
            if mijikai and not owari_bun(hit[i]):
                hit[i + 1] = hit[i] + hit[i + 1]
                hik[i + 1] += hik[i]
                del hit[i]
                del hik[i]
                # i は進めない。くっついた先も短いかもしれないので、もう一度見る。
            else:
                i += 1
        # 丸めの誤差を最後で吸収する
        sa = du - sum(hik)
        hik[-1] += sa
        t = s0
        for x, d in zip(hit, hik):
            out.append([t, d, x])
            t += d
    return out

def build_slots(cues, total, target):
    """字幕の切れ目に合わせて、target秒前後のスロットに区切る。"""
    if cues:
        starts = [0.0]
        st, ce = cues[0][0], cues[0][1]
        texts, cur = [], []
        for i, (cs, cend, ct) in enumerate(cues):
            cur.append(ct)
            ce = cend
            nxt = cues[i + 1][1] if i + 1 < len(cues) else None
            close = (nxt is None) or (abs((nxt - st) - target) > abs((ce - st) - target))
            if close and i + 1 < len(cues):
                starts.append(cues[i + 1][0])
                texts.append(u" ".join(cur))
                cur = []
                st = cues[i + 1][0]
        texts.append(u" ".join(cur))
        slots = []
        for i, s0 in enumerate(starts):
            e0 = starts[i + 1] if i + 1 < len(starts) else max(total, s0 + 0.8)
            slots.append([s0, e0 - s0, texts[i] if i < len(texts) else u""])
    else:
        say(u"subtitle.srt が無いので、%.1f秒ごとの等間隔で割り当てます。" % target)
        slots, t = [], 0.0
        while t < total - 0.05:
            d = min(target, total - t)
            slots.append([t, d, u""])
            t += d

    # 長すぎるスロットは target ごとに分ける(本文も文字数の比で分ける)
    out = []
    for (s0, du, tx) in slots:
        n = int(du / (target * 1.8)) + 1
        if n == 1:
            out.append([s0, du, tx])
            continue
        pieces = None
        if tx:
            # 余裕の持たせ方をいくつか試し、いちばん読みやすい切り方を選ぶ
            budget = disp_len(tx) / float(n)
            best_cost = None
            for slack in (1.15, 1.35, 1.6, 1.9, 2.4):
                got = split_lines(tx, budget * slack, n, want_cost=True)
                if not got:
                    continue
                cand, cost = got
                if best_cost is None or cost < best_cost:
                    best_cost, pieces = cost, cand
        if not pieces:
            step = max(1, int(round(len(tx) / float(n)))) if tx else 1
            pieces = [tx[i:i + step] for i in range(0, len(tx), step)]
        pieces = [x for x in pieces if x.strip()]
        if not pieces:
            # セリフが無いスロットは、そのまま等分する
            for k in range(n):
                out.append([s0 + du * k / n, du / n, u""])
            continue
        # 尺はセリフの長さの比で割る(読む速さは一定なので、これがいちばん合う)
        for (a2, b2, piece) in split_text_by_time(tx, s0, s0 + du, pieces):
            out.append([a2, b2 - a2, piece])

    # 短すぎるスロットはくっつける(一瞬だけ映る絵を作らない)
    floor = max(1.3, target * 0.45)
    merged = []
    for idx, sl in enumerate(out):
        if merged and sl[1] < floor and (merged[-1][1] + sl[1]) <= target * 1.9:
            merged[-1][1] += sl[1]
            merged[-1][2] = (merged[-1][2] + sl[2]).strip()
            continue
        if sl[1] < floor and idx + 1 < len(out) and (out[idx + 1][1] + sl[1]) <= target * 2.1:
            out[idx + 1][1] += sl[1]
            out[idx + 1][2] = (sl[2] + out[idx + 1][2]).strip()
            continue
        merged.append(sl)
    t = 0.0
    for sl in merged:
        sl[0] = t
        t += sl[1]
    return merged


def load_imageplan(path):
    """キーワード→画像 の対応表を読む。戻り値 (rules, default, focus)。

    「対象話数」を書いておくと、#指定はまずその話数の中から探す。

        @@話数\t無職転生Ⅲ 第13話, 無職転生Ⅲ 第11話

    台本がどの話数の内容かを先に決めてから、その中で人物や情景を
    照合する、という順番にするための指定。左に書いたものほど優先。

    何度でも書ける。書いたところから下の行に効くので、
    段落ごとに「この段落はⅡ第20話の話」と切り替えられる。
    話の場面が段落ごとに動く台本では、これが肝心。
    """
    rules, default, focus = [], [], []
    cur_focus = []
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        line = line.rstrip()
        if not line.strip() or line.lstrip().startswith(u"#"):
            continue
        if u"\t" in line:
            key, imgs = line.split(u"\t", 1)
        else:
            parts = re.split(r"[ \u3000]{2,}", line.strip(), maxsplit=1)
            if len(parts) < 2:
                continue
            key, imgs = parts
        files = [x.strip() for x in imgs.replace(u"、", u",").split(u",") if x.strip()]
        if not files:
            continue
        k = key.strip()
        if k in (u"@@話数", u"@@対象話数"):
            # 何度でも書ける。書いたところから下の行に効く。
            cur_focus = files
            if not focus:
                focus = files          # 最初のものを全体の既定にする
        elif k == u"*":
            default = files
        else:
            rules.append([[x for x in k.split(u"|") if x], files, 0,
                          list(cur_focus)])
    return rules, default, focus


def load_enshutsu(path):
    u"""演出.txt を読む。区切りの種類ごとに、音とエフェクトを決める。

    書式:
        区切り <タブ> 種類 <タブ> 音のファイル <タブ> エフェクト <タブ> 秒数
    """
    out = {"kubun": {}, "sevol": 0.4, "aida": {}, "sezure": 0.0,
           "zentai": 0.0,
           "card": True, "card_byou": 1.5, "card_se": u"ドーン.mp3",
           "card_fx": u"暗転", "card_iro": u"000000", "card_hidari": 0.5,
           "card_nuki": True,
           "bgm": u"", "bgmvol": 0.10, "bgmfade": 3.0, "bgmduck": True}
    if not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read() \
            .replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t or t.startswith(u"#") or u"\t" not in t:
            continue
        c = [x.strip() for x in t.split(u"\t")]
        if c[0] == u"区切り" and len(c) >= 5:
            try:
                dur = max(0.0, min(1.0, float(c[4])))
            except ValueError:
                dur = 0.2
            out["kubun"][c[1]] = {"se": c[2], "fx": c[3], "dur": dur}
        elif c[0] == u"効果音の音量" and len(c) >= 2:
            try:
                out["sevol"] = max(0.0, min(2.0, float(c[1])))
            except ValueError:
                pass
        elif c[0] == u"間隔" and len(c) >= 3:
            try:
                out["aida"][c[1]] = max(0.0, float(c[2]))
            except ValueError:
                pass
        elif c[0] == u"章タイトル" and len(c) >= 2:
            out["card"] = c[1] not in (u"いいえ", u"なし", u"0", u"off", u"OFF")
        elif c[0] == u"章タイトルの秒数" and len(c) >= 2:
            try:
                out["card_byou"] = max(0.3, min(6.0, float(c[1])))
            except ValueError:
                pass
        elif c[0] == u"章タイトルの音" and len(c) >= 2:
            out["card_se"] = c[1]
        elif c[0] == u"章タイトルのエフェクト" and len(c) >= 2:
            out["card_fx"] = c[1]
        elif c[0] == u"章タイトルの色" and len(c) >= 2:
            out["card_iro"] = c[1]
        elif c[0] == u"章タイトルの絵の幅" and len(c) >= 2:
            try:
                out["card_hidari"] = max(0.2, min(0.8, float(c[1])))
            except ValueError:
                pass
        elif c[0] == u"章タイトルの背景抜き" and len(c) >= 2:
            out["card_nuki"] = c[1] not in (u"いいえ", u"なし", u"0", u"off", u"OFF")
        elif c[0] == u"演出の間隔" and len(c) >= 2:
            try:
                out["zentai"] = max(0.0, float(c[1]))
            except ValueError:
                pass
        elif c[0] == u"効果音のずれ" and len(c) >= 2:
            try:
                out["sezure"] = max(-1.0, min(1.0, float(c[1])))
            except ValueError:
                pass
        elif c[0] == u"BGM" and len(c) >= 2:
            out["bgm"] = c[1]
        elif c[0] == u"BGMの音量" and len(c) >= 2:
            try:
                out["bgmvol"] = max(0.0, min(2.0, float(c[1])))
            except ValueError:
                pass
        elif c[0] == u"BGMのフェード" and len(c) >= 2:
            try:
                out["bgmfade"] = max(0.0, min(30.0, float(c[1])))
            except ValueError:
                pass
        elif c[0] == u"BGM控えめ" and len(c) >= 2:
            out["bgmduck"] = c[1] not in (u"いいえ", u"なし", u"0", u"off", u"OFF")
    return out


def kimeru_basho(rows, starts, chaps, en):
    u"""どの切り替わりが、どの種類かを決める。

      章  … 画面表示.txt の章が切り替わるところ（いちばん強い）
      。  … 前のセリフが「。」「！」「？」で終わっているところ
      、  … それ以外の切り替わり

    同じ絵が続くところは、そもそも切り替わりではないので何もしない。
    """
    n = len(rows)
    kind = {}
    if chaps:
        for (key, _title, _eps) in chaps:
            for i in range(n):
                if key in rows[i][2]:
                    if i > 0:
                        kind[i] = u"章"
                    break
    for i in range(1, n):
        if i in kind:
            continue
        if rows[i][1] == rows[i - 1][1]:
            continue
        mae = rows[i - 1][2].rstrip()
        kind[i] = u"。" if mae.endswith((u"。", u"！", u"？")) else u"、"
    for k, aida in (en.get("aida") or {}).items():
        if aida <= 0:
            continue
        last = -1e9
        for i in sorted([x for x in kind if kind[x] == k]):
            if starts[i] - last < aida:
                del kind[i]
            else:
                last = starts[i]
    # 種類ごとの間引きだけだと、「。」と「、」がそれぞれ別に数えるので、
    # 合わせると倍の密度になる。最後に全体でもう一度間引く。
    # 章は話の変わり目なので必ず残し、時計もそこで進める。
    # 演出.txt に書かれていない種類（いまの「、」など）は、
    # そもそも何も出ないので、ここで落としておく。
    # 残したままだと、間引きの「前回の時刻」をそれが進めてしまい、
    # 本当に出したい「。」まで消えてしまう。
    aru = set(en.get("kubun") or {})
    for i in [x for x in kind if kind[x] not in aru]:
        del kind[i]
    zentai = en.get("zentai", 0.0)
    if zentai > 0:
        last = -1e9
        for i in sorted(list(kind)):
            if kind[i] == u"章":
                last = starts[i]
                continue
            if starts[i] - last < zentai:
                del kind[i]
            else:
                last = starts[i]
    return kind


def se_wav_ready(name, vol, work, cache):
    u"""効果音を 44100Hz・モノラルの wav にそろえ、立ち上がりも測る。

    立ち上がりを返すのは、ファイルの頭ではなく「音が鳴った瞬間」を
    絵の切り替わりに合わせるため。カメラもはさみも、ファイルの先頭から
    少し遅れて鳴るので、そのぶん前に置く。
    """
    if not name or name == u"なし":
        return None, 0.0
    if name in cache:
        return cache[name]
    src = None
    for d in (os.path.join(HERE, u"効果音"), HERE):
        cand = os.path.join(d, name)
        if os.path.exists(cand):
            src = cand
            break
    if src is None:
        say(u"効果音のファイルが見つかりません: %s" % name)
        cache[name] = (None, 0.0)
        return None, 0.0
    out = os.path.join(work, "se_%d.wav" % len(cache))
    run([need("ffmpeg"), "-y", "-loglevel", "error", "-i", src,
         "-af", "volume=%.3f" % vol, "-ar", "44100", "-ac", "1", out])
    atk = 0.0
    try:
        import wave, struct
        w = wave.open(out, "rb")
        sr = w.getframerate()
        d = w.readframes(w.getnframes())
        w.close()
        v = struct.unpack("<%dh" % (len(d) // 2), d)
        if v:
            th = max(abs(x) for x in v) * 0.2
            for idx, x in enumerate(v):
                if abs(x) >= th:
                    atk = idx / float(sr)
                    break
    except Exception:
        pass
    cache[name] = (out, atk)
    return out, atk


def insert_silence(src, out, basho):
    u"""声に無音をはさむ。basho は (元の時刻, 秒数) の並び。

    章タイトルのカードで映像が 1.5秒 伸びるので、声にも同じだけ
    無音を入れないと、そこから先がまるごとずれる。
    サンプル単位で入れるので、ずれは出ない。
    """
    import wave, array
    f = wave.open(src, "rb")
    sr, ch, sw = f.getframerate(), f.getnchannels(), f.getsampwidth()
    d = f.readframes(f.getnframes())
    f.close()
    if sw != 2:
        return None
    v = array.array("h")
    v.frombytes(d)
    if sys.byteorder == "big":
        v.byteswap()
    out_v = array.array("h")
    ima = 0
    for (t0, byou) in sorted(basho):
        i = min(len(v), int(round(t0 * sr)) * ch)
        i -= i % ch
        out_v.extend(v[ima:i])
        out_v.extend(array.array("h", [0]) * (int(round(byou * sr)) * ch))
        ima = i
    out_v.extend(v[ima:])
    if sys.byteorder == "big":
        out_v.byteswap()
    o = wave.open(out, "wb")
    o.setnchannels(ch)
    o.setsampwidth(2)
    o.setframerate(sr)
    o.writeframes(out_v.tobytes())
    o.close()
    return out


def build_se_track(uchikomi, total, out, zure=0.0):
    u"""効果音を、鳴らす時刻に貼りつけた1本のwavにする。

    adelay を何百個も並べるとフィルタグラフが大きくなりすぎるので、
    無音のバイト列に貼りつける形で作る。重なったところは足し合わせる。
    """
    import wave, struct
    sr = 44100
    buf = bytearray(int(total * sr) * 2)
    body = {}
    for (t, wav, atk) in uchikomi:
        if wav is None:
            continue
        if wav not in body:
            w = wave.open(wav, "rb")
            body[wav] = w.readframes(w.getnframes())
            w.close()
        se = body[wav]
        off = int(max(0.0, t + zure - atk) * sr) * 2
        if off >= len(buf):
            continue
        end = min(off + len(se), len(buf))
        a = bytearray(buf[off:end])
        b = se[:end - off]
        for k in range(0, len(a) - 1, 2):
            x = struct.unpack_from("<h", a, k)[0] + struct.unpack_from("<h", b, k)[0]
            struct.pack_into("<h", a, k, max(-32768, min(32767, x)))
        buf[off:end] = a
    o = wave.open(out, "wb")
    o.setnchannels(1)
    o.setsampwidth(2)
    o.setframerate(sr)
    o.writeframes(bytes(buf))
    o.close()
    return out


def bgm_sagasu(name):
    u"""BGM のファイルを探す。BGM フォルダ → 効果音フォルダ → 直下 の順。"""
    if not name or name in (u"なし", u"無し"):
        return None
    for d in (os.path.join(HERE, u"BGM"), os.path.join(HERE, u"効果音"), HERE):
        cand = os.path.join(d, name)
        if os.path.exists(cand):
            return cand
    # 拡張子を書き忘れていても拾う
    base = os.path.splitext(name)[0].lower()
    for d in (os.path.join(HERE, u"BGM"), HERE):
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            stem, ext = os.path.splitext(f)
            if ext.lower() in (".mp3", ".wav", ".m4a", ".ogg", ".flac") \
                    and stem.lower() == base:
                return os.path.join(d, f)
    return None


def bgm_mugon_kezuru(src, out):
    u"""曲の頭と終わりの無音を削って、くり返しのつなぎ目をなくす。

    曲は前後に無音が入っていることが多い。そのまま繰り返すと、
    1周ごとに音の切れた所ができて、いかにも「ループしている」音になる。
    つなぎ目のプツッという音を消すため、両端に 15ミリ秒だけフェードを入れる。
    削るところが見つからなければ、何もせず False を返す。
    """
    import wave, struct
    try:
        w = wave.open(src, "rb")
        sr, n = w.getframerate(), w.getnframes()
        d = w.readframes(n)
        w.close()
        v = struct.unpack("<%dh" % (len(d) // 2), d)
    except Exception:
        return False
    if not v:
        return False
    blk = max(1, int(sr * 0.02))          # 20ミリ秒ずつ見る
    lv = []
    for i in range(0, len(v) - blk, blk):
        s = v[i:i + blk]
        lv.append(max(abs(x) for x in s))
    if not lv:
        return False
    th = max(lv) * 0.02                   # いちばん大きい所の 2% 未満は無音とみなす
    atama = 0
    while atama < len(lv) and lv[atama] < th:
        atama += 1
    siri = len(lv) - 1
    while siri > atama and lv[siri] < th:
        siri -= 1
    if atama >= siri:
        return False
    a, b = atama * blk, min(len(v), (siri + 1) * blk)
    if a == 0 and b >= len(v) - blk:
        return False                      # 削るところがない
    cut = list(v[a:b])
    f = min(int(sr * 0.015), len(cut) // 4)   # つなぎ目のプツッ消し
    for i in range(f):
        g = i / float(f)
        cut[i] = int(cut[i] * g)
        cut[-1 - i] = int(cut[-1 - i] * g)
    o = wave.open(out, "wb")
    o.setnchannels(1)
    o.setsampwidth(2)
    o.setframerate(sr)
    o.writeframes(struct.pack("<%dh" % len(cut), *cut))
    o.close()
    say(u"  BGM: 前後の無音 %.2f秒を削りました (%.1f秒 → %.1f秒)"
        % ((len(v) - len(cut)) / float(sr), len(v) / float(sr),
           len(cut) / float(sr)))
    return True


def bgm_tsunagu(src, total, out, kasane=2.0):
    u"""曲を、動画の長さになるまで重ねながらつなぐ。

    ただ繰り返すと、1周ごとに曲の終わりの余韻と頭がぶつかって
    音が引っこむ所ができる。終わりの数秒と次の頭の数秒を
    重ねて入れかえる（クロスフェード）と、切れ目が分からなくなる。

    ４分の１円の形で重ねるので、重ねている間も音の大きさが変わらない。
    """
    import wave, array, math
    try:
        w = wave.open(src, "rb")
        sr = w.getframerate()
        d = w.readframes(w.getnframes())
        w.close()
        v = array.array("h")
        v.frombytes(d)
        if sys.byteorder == "big":
            v.byteswap()
    except Exception:
        return False
    hitsuyou = int(round(total * sr))
    if len(v) < sr or hitsuyou <= 0:
        return False
    if len(v) >= hitsuyou:
        buf = v[:hitsuyou]
    else:
        kas = max(1, min(int(kasane * sr), len(v) // 3))
        tbl = [(math.cos(i / float(kas) * math.pi / 2),
                math.sin(i / float(kas) * math.pi / 2)) for i in range(kas)]
        buf = array.array("h", v)
        mawari = 0
        while len(buf) < hitsuyou and mawari < 10000:
            moto = len(buf) - kas
            for i in range(kas):
                a, b = tbl[i]
                x = int(buf[moto + i] * a + v[i] * b)
                buf[moto + i] = -32768 if x < -32768 else (32767 if x > 32767 else x)
            buf.extend(v[kas:])
            mawari += 1
        buf = buf[:hitsuyou]
        say(u"  BGM: %.1f秒の曲を %.1f秒ずつ重ねて %d回つなぎました"
            % (len(v) / float(sr), kas / float(sr), mawari))
    if len(buf) < hitsuyou:
        buf.extend(array.array("h", [0]) * (hitsuyou - len(buf)))
    try:
        if sys.byteorder == "big":
            buf.byteswap()
        o = wave.open(out, "wb")
        o.setnchannels(1)
        o.setsampwidth(2)
        o.setframerate(sr)
        o.writeframes(buf.tobytes())
        o.close()
    except Exception:
        return False
    return True


def bgm_wav_ready(name, vol, total, owari, fade, work):
    u"""BGM を、動画の長さちょうどの 44100Hz・モノラルの wav にする。

    足りなければ繰り返し、長すぎれば切る。頭と終わりはフェードする。
    total … この長さの wav を作る（動画と声の長い方）
    owari … フェードアウトが終わる時刻（動画と声の短い方＝実際の終わり）
    """
    src = bgm_sagasu(name)
    if src is None:
        if name and name not in (u"なし", u"無し"):
            say(u"BGM のファイルが見つかりません: %s" % name)
            say(u"  BGM フォルダに入れて、演出.txt の BGM 行に名前を書いてください。")
        return None
    # いったん素の wav にしてから、前後の無音を削り、重ねてつなぐ
    moto = os.path.join(work, "bgm_moto.wav")
    run([need("ffmpeg"), "-y", "-loglevel", "error", "-i", src,
         "-ar", "44100", "-ac", "1", moto])
    tane = os.path.join(work, "bgm_tane.wav")
    tane = tane if bgm_mugon_kezuru(moto, tane) else moto
    tsugi = os.path.join(work, "bgm_tsugi.wav")
    tane = tsugi if bgm_tsunagu(tane, total, tsugi) else tane

    fade = max(0.0, min(fade, owari / 3.0))
    af = [u"volume=%.3f" % vol]
    if fade > 0.01:
        af.append(u"afade=t=in:st=0:d=%.3f" % fade)
        af.append(u"afade=t=out:st=%.3f:d=%.3f" % (max(0.0, owari - fade), fade))
    out = os.path.join(work, "bgm.wav")
    cmd = [need("ffmpeg"), "-y", "-loglevel", "error"]
    if tane != tsugi:
        cmd += ["-stream_loop", "-1"]      # つなぎに失敗したときの逃げ道
    cmd += ["-i", tane, "-af", u",".join(af), "-t", "%.3f" % total,
            "-ar", "44100", "-ac", "1", out]
    run(cmd)
    return out


def wav_frames(path):
    u"""wav のサンプル数を、ffprobe に頼らず正確に数える。"""
    import wave
    try:
        w = wave.open(path, "rb")
        n = w.getnframes()
        w.close()
        return n
    except Exception:
        return 0


def bgm_hikaeme(bgm, koe, total, work):
    u"""声が出ている間だけ BGM を自動で下げる（ダッキング）。

    声を鍵にして BGM を圧縮する。
    sidechaincompress は終わりを 0.5秒ほど削ってしまうので、
    apad と -t で元の長さぴったりに戻す。
    うまくいかない ffmpeg もあるので、失敗したら元の BGM をそのまま返す
    （音量が一定になるだけで、ずれなどの害はない）。
    """
    out = os.path.join(work, "bgm_duck.wav")
    ok = run_soft([
        need("ffmpeg"), "-y", "-loglevel", "error", "-i", bgm, "-i", koe,
        "-filter_complex",
        "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono[m];"
        "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,"
        "apad[k];"
        "[m][k]sidechaincompress="
        "threshold=0.02:ratio=6:attack=15:release=350:level_sc=1,"
        "apad[a]",
        "-map", "[a]", "-t", "%.3f" % total,
        "-ar", "44100", "-ac", "1", out])
    moto = wav_frames(bgm)
    if not ok or wav_frames(out) < moto - 2:
        say(u"  BGM控えめ は使えませんでした。音量そのままで入れます。")
        return bgm
    return out


_NUKI_SESSION = [None]      # rembg は読み込みが重いので1回だけ作る


def nuki_dekiru():
    u"""背景を消す道具(rembg)が使えるか。1回だけ調べる。"""
    if _NUKI_SESSION[0] is None:
        try:
            from rembg import new_session
            # isnet-anime は、アニメの絵のために作られたもの。
            # 既定の u2net は実写向けで、アニメだと髪や服がごっそり欠ける。
            _NUKI_SESSION[0] = new_session("isnet-anime")
        except Exception as e:
            _NUKI_SESSION[0] = False
            say(u"  背景を消す道具(rembg)が入っていません: %s" % e)
            say(u"  章カードは、絵をそのまま切り取って使います。")
            say(u"  キャラだけにしたいときは  pip install rembg onnxruntime  を"
                u"実行してください(初回だけ176MBの読み込みがあります)。")
    return _NUKI_SESSION[0] or None


def kyara_nuku(moto, out, yoyuu=0.04, shikii=48):
    u"""絵から背景を消して、キャラだけの PNG にする。

    消したあと、中身のある所だけに切りつめる(余白を落とす)。
    切りつめないと、元の絵のまん中に小さくキャラが乗っただけになり、
    半分に置いても小さくしか見えません。

    ■ 透明かどうかは、必ず「透明の層(アルファ)」だけで見ること

    最初 Image.getbbox() で囲みを取っていたら、1枚も抜けていないのに
    「画面いっぱい残っている」と出ました。getbbox() は色の層も見るので、
    透明でも色が入っていれば囲みに入ってしまいます。
    透明の層を取り出し、しきい値で白黒にしてから囲みを取ります。

    うまく抜けなかったとき(ほとんど透明・ほとんど不透明)は None を返し、
    呼んだ側が元の絵をそのまま使います。背景が複雑な絵や、
    キャラが写っていない風景の絵がこれに当たります。
    """
    sess = nuki_dekiru()
    if not sess:
        return None
    try:
        from rembg import remove
        from PIL import Image
        im = Image.open(moto).convert("RGBA")
        cut = remove(im, session=sess)
        alpha = cut.split()[3]
        mask = alpha.point(lambda v: 255 if v >= shikii else 0)
        bbox = mask.getbbox()
        if not bbox:
            return None                       # 何も残らなかった
        w0, h0 = cut.size
        nokori = sum(mask.histogram()[128:]) / float(w0 * h0)
        if nokori < 0.02:
            return None                       # 抜きすぎ(キャラが消えた)
        if nokori > 0.92:
            return None                       # 何も抜けていない
        yx = int((bbox[2] - bbox[0]) * yoyuu)
        yy = int((bbox[3] - bbox[1]) * yoyuu)
        cut = cut.crop((max(0, bbox[0] - yx), max(0, bbox[1] - yy),
                        min(w0, bbox[2] + yx), min(h0, bbox[3] + yy)))
        cut.save(out)
        return out
    except Exception as e:
        say(u"  背景を消せませんでした(%s): %s" % (os.path.basename(moto), e))
        return None


def setsumei(cat, k):
    u"""画像カタログの説明を、かならず1本の文字列で返す。

    ■ ここは一度まちがえた

    カタログの中身は「ルーデウス 茶髪 洞窟」という**文字列**なのに、
    配列のつもりで u" ".join() していた。文字列を join すると
    「ル ー デ ウ ス   茶 髪」と1文字ずつ離れてしまい、
    「ルーデウス」で探しても**一度も一致しなかった**。
    黙って当たらないだけなので、動いているように見えていた。
    """
    v = (cat or {}).get(k)
    if not v:
        return u""
    return v if isinstance(v, basestring if str is bytes else str) \
        else u" ".join(v)


def card_no_e(rows, hajime, owari, title, cat):
    u"""章カードに使う絵を、その章の中から選ぶ。

    本人の指定は「適したものをあなたが見つけ、背景を切り取ってキャラだけに」。
    章の先頭の絵をそのまま使うと、風景や文字だけの絵が来ることがあり、
    背景を消したら何も残りません。

    その章で使っている絵の中から、
      ・章の名前に出てくる人が写っている絵       …いちばん強い
      ・誰かが写っている絵                      …次
      ・「アップ」と書かれている絵               …さらに足す
      ・「使用不可」「クレジット」「実写」は外す
    で選びます。カタログに説明が無ければ、今までどおり先頭の絵。
    """
    namae = [c for c in uniq(CHARACTERS) if c in title]
    best, bscore = None, -1
    for i in range(hajime, owari):
        img = rows[i][1]
        if not img or img.startswith(u"@@"):
            continue
        w = setsumei(cat, img)
        if not w:
            if best is None:
                best = img
            continue
        if any(x in w for x in (u"使用不可", u"クレジット", u"実写", u"テロップ")):
            continue
        sc = 0
        if namae and any(c in w for c in namae):
            sc += 6
        elif any(c in w for c in uniq(CHARACTERS)):
            sc += 3
        if u"アップ" in w:
            sc += 2
        if u"二人" in w or u"三人" in w:
            sc -= 1                      # 1人のほうが切り抜きが映える
        if i == hajime:
            sc += 1                      # 迷ったら章の頭
        if sc > bscore:
            best, bscore = img, sc
    return best or rows[hajime][1]


def make_card(moto, out, w, h, iro, hidari, nuki=True):
    u"""章タイトルのカードを作る。

    本人の指定:
      「適した画像を見つけ、背景だけを切り取ってキャラだけの画像を作り、
        そのキャラだけの画像を半分に、背景は全て黒、
        もう半分には太字で章のタイトル」

    なので
      ・左半分 … キャラだけ(背景を消したもの)を、はみ出さない大きさで真ん中に
      ・全体   … 黒(章タイトルの色。既定 000000)
      ・右半分 … 文字。ここでは焼かず、字幕(libass)で太字で書く
                 （ffmpeg の drawtext だと Windows のフォントの場所を
                   決め打ちすることになり、見た目.txt の指定が効かない）

    背景が消せなかったときは、今までどおり絵をそのまま切り取って左に置く。
    キャラが写っていない風景の絵では、そのほうが見られるため。
    """
    lw = int(round(w * hidari))
    lw -= lw % 2
    rw = w - lw

    kyara = None
    if nuki:
        kyara = kyara_nuku(moto, os.path.splitext(out)[0] + u"_キャラ.png")

    if kyara:
        # 左半分の中に収める。縦も横もはみ出さない大きさで、真ん中に置く。
        yohaku = 0.90
        s = (u"color=c=0x%s:s=%dx%d[bg];"
             u"[0:v]scale=%d:%d:force_original_aspect_ratio=decrease[k];"
             u"[bg][k]overlay=x=(%d-overlay_w)/2:y=(%d-overlay_h)/2,"
             u"format=yuv420p[v]"
             % (iro, w, h, int(lw * yohaku), int(h * yohaku), lw, h))
        run([need("ffmpeg"), "-y", "-loglevel", "error",
             "-loop", "1", "-i", kyara,
             "-filter_complex", s, "-map", "[v]", "-frames:v", "1", out])
        try:
            os.remove(kyara)
        except OSError:
            pass
        return out, True

    s = (u"[0:v]scale=%d:%d:force_original_aspect_ratio=increase,"
         u"crop=%d:%d,setsar=1[L];"
         u"color=c=0x%s:s=%dx%d[R];"
         u"[L][R]hstack=inputs=2,format=yuv420p[v]"
         % (lw, h, lw, h, iro, rw, h))
    run([need("ffmpeg"), "-y", "-loglevel", "error", "-loop", "1", "-i", moto,
         "-filter_complex", s, "-map", "[v]", "-frames:v", "1", out])
    return out, False


def fx_filter(fx, dur):
    u"""エフェクトの種類から ffmpeg のフィルタを組む。

    どれも断片の長さを変えない作りにしてある。
    xfade のように重ねると全体が縮み、音とずれてしまうため。
    戻り値 (前の絵が要るか, filter_complex の文字列)
    """
    d = max(0.02, dur)
    if fx == u"暗転":
        return False, "[0:v]fade=t=in:st=0:d=%.3f,format=yuv420p[v]" % d
    if fx == u"はさみ":
        return True, ("[1:v]format=yuva420p[p];"
                      "[0:v][p]overlay=x='-(w*t/%.3f)':eof_action=pass,"
                      "format=yuv420p[v]" % d)
    if fx == u"ページめくり":
        return True, ("[0:v]format=yuva420p[n];"
                      "[1:v][n]overlay=x='if(lt(t,%.3f), W-(W*t/%.3f), 0)':"
                      "eof_action=pass,format=yuv420p[v]" % (d, d))
    if fx == u"溶ける":
        return True, ("[1:v]format=yuva420p,fade=t=out:st=0:d=%.3f:alpha=1[f];"
                      "[0:v][f]overlay,format=yuv420p[v]" % d)
    return False, None


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


def load_catalog(path, images):
    """画像カタログ(何が写っているかの一覧)を読む。

    書式:  目印 <タブ> 説明（キャラ名・表情・場所など、空白区切りで何個でも）

    「目印」は次のどれでもよい。
      1) フォルダ付きのファイル名   無職転生 第11話/0007.jpg
      2) ファイル名だけ             0007.jpg          （重複していないとき）
      3) 名前の一部                 第11話_0007       （一致した画像すべてに付く）

    3) があるので、一覧シートで名前が「…」で切れていても、
    見えている部分（話数と連番）だけ書けば効く。
    フォルダ名だけ書けば、その話数の画像すべてにまとめて説明を付けられる。

    同じ画像に複数の行が当たったときは、説明をつなげる（打ち消さない）。
    これで「第11話 → 迷宮」のような大まかな説明と、
    1枚ごとの細かい説明を両方書ける。
    """
    tags = {}
    if not os.path.exists(path):
        return tags
    exact = set(images)          # 1万枚あるので、まず総当たりを避ける
    base = {}
    for k in images:
        base.setdefault(k.split(u"/")[-1], []).append(k)
    lines, n, miss = 0, 0, []
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.lstrip().startswith(u"#"):
            continue
        if u"\t" not in line:
            continue
        name, desc = line.split(u"\t", 1)
        name, desc = name.strip(), desc.strip()
        if not name or not desc:
            continue
        lines += 1
        if name in exact:
            keys = [name]
        elif len(base.get(name, [])) == 1:
            keys = [base[name][0]]
        else:
            # ここだけは総当たり。ふつうは手書きの数行しか来ない。
            keys = [k for k in images if name in k]
        if not keys:
            miss.append(name)
            continue
        for k in keys:
            if k in tags:
                tags[k] = tags[k] + u" " + desc
            else:
                tags[k] = desc
        n += 1
    if lines:
        say(u"画像カタログを読みました: %d行 → %d枚に説明がつきました" % (lines, len(tags)))
    if miss:
        say(u"カタログのこの目印は、フォルダの中に見つかりませんでした(%d件):" % len(miss))
        for x in miss[:20]:
            say(u"    " + x)
        if len(miss) > 20:
            say(u"    ...ほか%d件" % (len(miss) - 20))
    return apply_person_rules(tags, load_person_rules(u"人物ルール.txt"))


def key_words(text):
    """日本語の文から、手がかりになる語だけ取り出す。

    カタカナの続き(キャラ名がほぼこれ)と、漢字の続き(出来事・場所)を拾う。
    形態素解析を入れずに済ませるための、割り切った作り。
    """
    out = []
    for w in re.findall(u"[\u30a1-\u30f6\u30fc]{3,}", text):
        out.append(w)
    for w in re.findall(u"[\u4e00-\u9fff]{2,}", text):
        out.append(w)
    return out


# 台本に出てくる登場人物。話数を当てるときの、いちばん強い手がかり。
# 時刻表をどの作り方で組んだか。最後にもう一度知らせるために覚えておく。
# ログは流れてしまうので、終わりにも出さないと気づけない。
JIKOKU = [u"(まだ決まっていません)"]

# 同じ絵を何か所ぶん空けたいか。句読点ごとに絵を変えるための目安。
AVOID_WINDOW = 12

# 同じ人とみなす呼び名。老デウスは年をとったルーデウス本人なので、
# どちらの絵が出ても間違いではない。
ONAJI_HITO = {
    u"老デウス": [u"老人", u"ルーデウス"],
    u"ルーデウス": [u"老デウス", u"老人"],
    u"シルフィ": [u"シルフィエット", u"フィッツ"],
    u"シルフィエット": [u"シルフィ", u"フィッツ"],
    u"フィッツ": [u"シルフィエット", u"シルフィ"],
}

# カタログに名前が無い人を、見た目の言葉で探すための逃げ道。
MITAME = {
    u"アリエル": [u"金髪 大人"],
    u"ギレーヌ": [u"緑髪 獣耳", u"獣耳"],
    u"ルーク": [u"金髪 大人"],
    u"ジュリ": [u"子供"],
    u"ギンガ": [u"鎧 大人"],
}


CHARACTERS = [
    u"ルーデウス", u"ロキシー", u"エリス", u"シルフィエット", u"シルフィ",
    u"フィッツ", u"パウロ", u"ゼニス", u"リーリャ", u"アイシャ", u"ノルン",
    u"ルイジェルド", u"ギレーヌ", u"ナナホシ", u"ザノバ", u"クリフ",
    u"エリナリーゼ", u"ヒトガミ", u"オルステッド", u"アリエル", u"ルーク",
    u"キシリカ", u"ゼニス", u"ドワーフ", u"老デウス", u"ジュリ",
]
# 「老デウス」は台本の中の呼び名であって、絵に写る人物ではない。
# 「デウス」を入れると全段落に当たってしまうので、入れない。


SEASON_WORDS = [
    ([u"3期", u"三期", u"\u2162", u"第3期", u"第三期"], u"\u2162"),
    ([u"2期", u"二期", u"\u2161", u"第2期", u"第二期"], u"\u2161"),
    ([u"1期", u"一期", u"\u2160", u"第1期", u"第一期"], u""),
]


def episode_folder(season, num, docs):
    """「\u2161」と 20 から、実際のフォルダ名を探す。無ければ None。"""
    want = u"無職転生%s 第%d話" % (season, num)
    if want in docs:
        return want
    for f in docs:
        if f.replace(u" ", u"") == want.replace(u" ", u""):
            return f
    return None


def explicit_episodes(paras, docs):
    """台本に「3期 第11話」と書いてあれば、それをそのまま使う。

    推測より、書いてあることの方が確かなので最優先する。
    期が書いていない段落は、直前に出てきた期を引き継ぐ。
    """
    out, cur = [], None
    for para in paras:
        for keys, mark in SEASON_WORDS:
            if any(k in para for k in keys):
                cur = mark
                break
        got = []
        for m in re.finditer(u"第\\s*([0-9０-９]{1,2})\\s*話", para):
            d = m.group(1)
            for a, b in zip(u"０１２３４５６７８９", u"0123456789"):
                d = d.replace(a, b)
            n = int(d)
            if cur is None:
                # 何期か書かれていない。決めつけずに候補を全部出す。
                # 台本に「3期の第11話」と書いておけば、ここで確定する。
                for mark in (u"\u2162", u"\u2161", u""):
                    f = episode_folder(mark, n, docs)
                    if f and f not in got:
                        got.append(f)
                continue
            f = episode_folder(cur, n, docs)
            if f and f not in got:
                got.append(f)
        out.append(got)
    return out


def uniq(xs):
    """順番を変えずに重複を取る。"""
    out, seen = [], set()
    for x in xs:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def scout_episodes(script, emap, top=3, counts=None, have=None):
    """台本の段落ごとに、どの話数の内容にあたるかを当てにいく。

    考え方は「その話数が、その人物でどれだけ占められているか」。
      ・ロキシーが半分の絵に写っている話数 → ロキシーの話
      ・1枚だけ写っている話数             → ほぼ手がかりにならない
    枚数がないと、どの話数も同点になって順番だけで決まってしまう。

    台本が原作オリジナルなら対応する話数は本当に無いので、
    そこで「分かりません」と出るのが正しい動き。
    """
    paras = [l.strip() for l in script.replace("\r\n", "\n").split("\n")
             if l.strip() and not l.strip().startswith(u"#")
             and not l.strip().startswith(u"\u3010") and not l.strip().startswith(u"\u25a0")]
    if not emap:
        say(u"話数マップ.txt がありません。これが無いと話数は調べられません。")
        return

    import math
    cnt = counts or {}
    N = float(len(emap))
    docs = {f: set(w for w in d.split() if not w.startswith(u"_"))
            for f, d in emap.items()}
    df = {}
    for ws in docs.values():
        for w in ws:
            df[w] = df.get(w, 0) + 1

    def rare(w):
        """その語が、何話に出てくるか。珍しいほど大きい。"""
        n = df.get(w, 0)
        if not n or n >= N * 0.6:
            return 0.0
        return math.log(N / n)

    # 話数ごとの総枚数（濃さを割合で見るため）
    # _枚数 があればそれが本当の総枚数。無い古い形式では、
    # 一番多い語の枚数で代用する（その語が必ず100%になってしまう）。
    tot = {}
    for f, d in cnt.items():
        tot[f] = max(1, d.get(u"_枚数") or (max(d.values()) if d else 1))

    def share(f, w):
        """その話数で、その語がどれくらい濃いか(0〜1)。"""
        d = cnt.get(f)
        if not d or w not in d:
            return 0.0
        return d[w] / float(tot.get(f, 1))

    # ここで止める判断をする。中身の薄いカタログで出した順位は、
    # それらしく見えるぶん、外れたときに気づけない。
    # 40枚も見ていれば、割合はじゅうぶん当てになる。全部見る必要はない。
    NEED = 40
    thin = []
    if have:
        for f, n in sorted(have.items(), key=lambda x: natkey(x[0])):
            seen = cnt.get(f, {}).get(u"_枚数", 0)
            if n and seen < min(NEED, n):
                thin.append((f, seen, n))
    if thin:
        say(u"")
        say(u"══════════════════════════════════════")
        say(u"⚠ まだ見ていない画像が多いので、下の順位はあてになりません。")
        say(u"══════════════════════════════════════")
        say(u"  %d話ぶんが、まだ %d枚に足りていません。" % (len(thin), NEED))
        for f, seen, n in thin[:6]:
            say(u"    %-20s %d枚中 %d枚しか見ていません" % (f, n, seen))
        if len(thin) > 6:
            say(u"    …ほか %d話" % (len(thin) - 6))
        say(u"")
        say(u"  先にメニューの 8 →「全部見る」を実行してください。")
        say(u"  話数をまたいで順ぐりに見ていくので、途中まででも")
        say(u"  どの話数も同じくらい埋まります。各話40枚を越えたところで")
        say(u"  この注意は出なくなり、順位が使えるようになります。")
        say(u"")

    say(u"")
    say(u"台本の段落ごとに、近い話数を出します。")
    say(u"「その人物がどれだけ多く写っている話数か」で選んでいます。")
    say(u"台本に話数そのものが書いてあれば、そちらを優先します。")
    say(u"")
    said = explicit_episodes(paras, docs)
    lines_out = []
    weak = 0
    for i, para in enumerate(paras):
        名 = [c for c in CHARACTERS if c in para]
        ws = set(key_words(para))
        sc = []
        for fol in docs:
            pt = 0.0
            for w in ws:
                if w in docs[fol]:
                    pt += rare(w) * (0.4 + share(fol, w))
            当 = []
            for c in 名:
                if c in docs[fol]:
                    sh = share(fol, c)
                    add = 6.0 * rare(c) * sh      # 濃さがすべて
                    pt += add
                    # 点にならなかった人（どの話数にも出る人）は出さない。
                    # 出すと、決め手になったように見えて紛らわしい。
                    if add >= 0.5:
                        当.append(u"%s%.0f%%(%d/%d)"
                                  % (c, sh * 100,
                                     cnt.get(fol, {}).get(c, 0), tot.get(fol, 0)))
            if pt > 0:
                sc.append((pt, fol, 当))
        sc.sort(key=lambda x: (-x[0], natkey(x[1])))
        head = para[:34] + (u"…" if len(para) > 34 else u"")
        say(u"  段落%-2d  %s" % (i + 1, head))
        if 名:
            say(u"          人物: " + u" ".join(名))
        if said[i]:
            if len(said[i]) > 2:
                say(u"          ※ 台本に話数はありますが、何期かが書かれていません。")
                say(u"            台本に「3期の第11話」のように書けば1つに決まります。")
            for f in said[i]:
                say(u"          → %-20s 台本に書いてあります" % f)
            rest = [f for _, f, _ in sc[:top] if f not in said[i]][:1]
            for f in rest:
                say(u"          → %-20s (念のため)" % f)
            lines_out.append(said[i] + rest)
            continue
        best = [x for x in sc[:top] if x[0] >= 1.0]
        if not best:
            weak += 1
            say(u"          → 分かりません")
            lines_out.append(None)
            continue
        for pt, f, 当 in best:
            say(u"          → %-20s %.1f%s"
                % (f, pt, (u"   " + u" ".join(当)) if 当 else u""))
        lines_out.append([f for _, f, _ in best])

    say(u"")
    say(u"─────────────────────────────────────")
    say(u"画像プラン.txt に、段落の頭ごとにこの行を入れてください。")
    say(u"書いたところから下の行に効きます。")
    say(u"─────────────────────────────────────")
    for i, fs in enumerate(lines_out):
        if fs:
            say(u"# 段落%d" % (i + 1))
            say(u"@@話数\t" + u", ".join(fs))
    say(u"")
    say(u"─────────────────────────────────────")
    say(u"話数マップの中身（枚数がおかしいときは、ここを見てください）")
    say(u"─────────────────────────────────────")
    for f in sorted(docs, key=natkey):
        d = cnt.get(f, {})
        ch = [u"%s:%d" % (c, d[c]) for c in uniq(CHARACTERS) if d.get(c)]
        n = (have or {}).get(f, 0)
        say(u"  %-20s 見た%d枚/全%d枚  %s"
            % (f, cnt.get(f, {}).get(u"_枚数", 0), n,
               u" ".join(ch[:8]) or u"(人物なし)"))
    say(u"")
    if weak:
        say(u"%d段落は判定できませんでした。" % weak)
        say(u"アニメに無い場面（原作だけの内容）なら、それが正しい答えです。")
        say(u"その段落は @@話数 を書かず、人物のタグ（#ロキシー など）で選んでください。")


def rebuild_epmap_from_catalog(cat_path, epmap_path):
    """画像カタログから、話数マップを「語:枚数」つきで作り直す。

    話数調べは「その話数がその人物でどれだけ占められているか」で決めるので、
    枚数が無いと全部100%になって、どの話数も同じに見えてしまう。
    古い形式のマップしか無いときは、ここで作り直す。
    """
    if not os.path.exists(cat_path):
        return False
    rules = load_person_rules(u"人物ルール.txt")
    per, tot = {}, {}
    hitori = {}
    for line in io.open(cat_path, encoding="utf-8-sig", errors="replace"):
        line = line.rstrip(u"\r\n")
        if not line.strip() or line.lstrip().startswith(u"#") or u"\t" not in line:
            continue
        k, d = line.split(u"\t", 1)
        if u"/" not in k:
            continue
        fol = k.split(u"/")[0]
        per.setdefault(fol, {})
        tot[fol] = tot.get(fol, 0) + 1
        if rules:
            # 人物ルールを通してから数える。そうしないと、話数調べだけが
            # 古い判定のままになって、絵えらびと食い違う。
            hitori[k] = d
        for w in d.split():
            if w in (u"使用不可", u"文字あり", u"きわどい", u"実写"):
                continue
            per[fol][w] = per[fol].get(w, 0) + 1
    if not per:
        return False
    if rules:
        # ルールを当てた結果で数え直す。そうしないと話数調べだけが
        # 古い判定のままになって、絵えらびと食い違う。
        hitori = apply_person_rules(hitori, rules)
        per, tot = {}, {}
        for k, d in hitori.items():
            fol = k.split(u"/")[0]
            per.setdefault(fol, {})
            tot[fol] = tot.get(fol, 0) + 1
            for w in d.split():
                if w in (u"使用不可", u"文字あり", u"きわどい", u"実写"):
                    continue
                per[fol][w] = per[fol].get(w, 0) + 1
    head = (u"# 話数マップ ─ どの話数に何があるか（自動で作られます）\r\n"
            u"#\r\n"
            u"# 「語:枚数」の形で、その話数の何枚に出たかを書いてあります。\r\n"
            u"# 枚数があると、話数調べ(メニュー7)が人物の濃さで判断できます。\r\n"
            u"#\r\n"
            u"# フォルダ名\t説明\r\n")
    with io.open(epmap_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(head)
        for fol in sorted(per, key=natkey):
            ws = sorted(per[fol].items(), key=lambda x: (-x[1], x[0]))
            # _枚数 はその話数の総枚数。濃さ(何%に写っているか)を出すのに要る
            cells = [u"_枚数:%d" % tot.get(fol, 0)]
            cells += [u"%s:%d" % (w, c) for w, c in ws[:40]]
            f.write(fol + u"\t" + u" ".join(cells) + u"\r\n")
    say(u"話数マップ.txt を、枚数つきで作り直しました (%d話)" % len(per))
    return True


def epmap_has_counts(path):
    """話数マップが、濃さを出せる形（_枚数つき）になっているか。

    語ごとの枚数だけでは足りない。その話数が何枚あるかを知らないと
    「何%の絵に写っているか」が出せず、一番多い語が必ず100%になる。
    """
    try:
        for line in io.open(path, encoding="utf-8-sig", errors="replace"):
            if line.strip() and not line.lstrip().startswith(u"#") and u"\t" in line:
                return u"_枚数:" in line.split(u"\t", 1)[1]
    except Exception:
        pass
    return False


def load_epmap_counts(path):
    """話数マップを「語 → 何枚に出たか」の形で読む。

    話数調べで使う。1枚だけ写っている人と、たくさん写っている人を
    同じに扱うと、どの話数の場面かが当てられない。
    """
    out = {}
    if not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.lstrip().startswith(u"#") or u"\t" not in line:
            continue
        name, desc = line.split(u"\t", 1)
        d = {}
        for w in desc.split():
            if u":" in w:
                a, b = w.rsplit(u":", 1)
                try:
                    d[a] = int(b)
                    continue
                except ValueError:
                    pass
            d[w] = 1
        if d:
            out[name.strip()] = d
    return out


def load_epmap(path, images):
    """話数マップ(どの話数に何があるか)を読む。

    書式:  フォルダ名 <タブ> 説明（空白区切りで何個でも）
      無職転生Ⅱ 第20話	2期 転移迷宮編 ロキシー 迷宮 ゼニス パウロ

    画像カタログ.txt が 1枚ごとの説明なのに対して、こちらは話数まるごと。
    #ロキシー 迷宮 のような指定でカタログに当たりが無かったとき、
    その言葉を含む話数フォルダの画像から選べるようにする。
    """
    out = {}
    if not os.path.exists(path):
        return out
    fols = set()
    for k in images:
        if u"/" in k:
            fols.add(k.split(u"/")[0])
    n, miss = 0, []
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.lstrip().startswith(u"#") or u"\t" not in line:
            continue
        name, desc = line.split(u"\t", 1)
        name, desc = name.strip(), desc.strip()
        if not name or not desc:
            continue
        hit = [f for f in fols if name == f] or [f for f in fols if name in f]
        if not hit:
            miss.append(name)
            continue
        # 「語:枚数」で書かれていたら、枚数は外して語だけにする
        plain = u" ".join(w.rsplit(u":", 1)[0] if u":" in w else w
                          for w in desc.split()
                          if not w.startswith(u"_"))
        for f in hit:
            out[f] = (out[f] + u" " + plain) if f in out else plain
        n += 1
    if n:
        say(u"話数マップを読みました: %d行 → %d話に説明がつきました" % (n, len(out)))
    if miss:
        say(u"話数マップのこのフォルダ名は見つかりませんでした(%d件): %s"
            % (len(miss), u" / ".join(miss[:8])))
    return out


def check_plan_words(rules, default, catalog):
    """画像プランで使っている言葉が、カタログに本当にあるか確かめる。

    無い言葉を書いても、黙って次の候補に流れるだけなので気づけない。
    ここで名指しすれば直せる。
    """
    if not catalog:
        return
    goi = set()
    for d in catalog.values():
        goi.update(d.split())
    nai = {}
    for r in list(rules) + [[u"*", default, 0, []]]:
        key, files = r[0], r[1]
        if isinstance(key, list):
            key = u"|".join(key)
        for f in files:
            if not f.startswith(u"#"):
                continue
            for w in f.lstrip(u"#").split():
                if w and w not in goi:
                    nai.setdefault(w, []).append(key)
    if nai:
        say(u"")
        say(u"⚠ 画像プランのこの言葉は、カタログに一度も出てきません:")
        for w in sorted(nai, key=lambda x: -len(nai[x])):
            say(u"    %-10s (%d か所)  例: %s" % (w, len(nai[w]), nai[w][0][:24]))
        say(u"  使える言葉は タグ一覧.txt にあります。")
        say(u"  そのままでも動きますが、その指定は必ず空振りします。")
        say(u"")


def plan_code_naosu(rules, default, images):
    u"""画像プランに書かれた絵の番号(3-14-095)を、絵の名前に読みかえる。

    本人の27件の直しから分かったこと：
    **「どうもこんにちは」「かさです」のような決まり文句は、
    中身で選ぶものではなく、毎回この絵と決まっている。**
    タグで近いものを探させるのではなく、絵そのものを指せるようにする。

    番号で書いた絵は「人が見て選んだ絵」として扱われるので、
    使用不可の判定も、使いすぎの上限も越えて、そのまま使われる。
    """
    naoshita, fumei = 0, []

    def hitotsu(f):
        if f.startswith(u"#") or f.startswith(u"@") or not code_norm(f):
            return f
        atta = code_to_img(f, images)
        if atta:
            return atta
        fumei.append(f)
        return f

    for r in rules:
        mae = list(r[1])
        r[1] = [hitotsu(f) for f in r[1]]
        naoshita += sum(1 for a, b in zip(mae, r[1]) if a != b)
    mae = list(default)
    default = [hitotsu(f) for f in default]
    naoshita += sum(1 for a, b in zip(mae, default) if a != b)
    if naoshita:
        say(u"画像プランの絵の番号 %d個を、絵の名前に読みかえました" % naoshita)
    for f in sorted(set(fumei)):
        say(u"  × 画像プランの %s に当たる絵が画像フォルダにありません" % f)
    return rules, default


def assign_images(slots, images, rules, default, catalog=None, epmap=None,
                  focus=None, mitame=None, chaps=None):
    """画像プランに従って、スロットごとに絵を決める。

    「@第11話」のように書くと、そのフォルダの画像を順に使う。
    同じ @ を何度書いても、使うたびに次の絵へ進むので、
    同じ話数を指定しても同じ絵が続かない。
    """
    check_plan_words(rules, default, catalog)
    # クレジット・実写・きわどい画面は、動画に出してはいけない。
    # カタログで「使用不可」と印のついた絵は、はじめから候補から外す。
    #
    # ただし、画像プランにファイル名を直接書いたものは外さない。
    # それは自動で選んだ絵ではなく、人が見て選んだ絵なので、
    # こちらの判定より本人の指定を優先する。
    tebiki = set()
    for items in [r[1] for r in rules] + [default]:
        for f in items:
            if not (f.startswith(u"#") or f.startswith(u"@")):
                tebiki.add(f)
    dame = set()
    if catalog:
        for k, d in catalog.items():
            if u"使用不可" in d.split() and k not in tebiki:
                dame.add(k)
    nokoshita = sorted(k for k in tebiki
                       if catalog and u"使用不可" in (catalog.get(k) or u"").split())
    if dame:
        mae = len(images)
        images = [k for k in images if k not in dame]
        say(u"使用不可の絵を %d枚 外しました (残り %d枚)" % (mae - len(images), len(images)))
    if nokoshita:
        say(u"次の絵は「使用不可」ですが、画像プランに直接書かれているので残します:")
        for k in nokoshita:
            say(u"    " + k)
    known = set(images)
    pools = {}

    cat = catalog or {}
    emap = epmap or {}
    via_ep, via_wide = set(), set()

    # 対象話数(@@話数)。左に書いたものほど先に探す。
    folders = []
    for k in images:
        f = k.split(u"/")[0] if u"/" in k else u""
        if f and f not in folders:
            folders.append(f)
    def resolve_focus(want):
        """書かれた話数名を、実際のフォルダ名の並びに直す。"""
        out2 = []
        for w in (want or []):
            for f in folders:
                if (w == f or w in f) and f not in out2:
                    out2.append(f)
        return out2

    missing_focus = set()
    for want in [focus] + [r[3] for r in rules if len(r) > 3]:
        if want and not resolve_focus(want):
            missing_focus.add(u", ".join(want))
    for w in sorted(missing_focus):
        say(u"対象話数に書かれた話数が見つかりません: " + w)

    base_fols = resolve_focus(focus)
    # base_fols は章ごとに差し替わるので、「もともとの既定」を別に取っておく。
    # 偏りの警告は、こちらと比べないと意味が変わってしまう。
    moto_base = list(base_fols)
    if base_fols:
        say(u"対象話数(既定): " + u" / ".join(base_fols))
    used_focus = set()

    # いま効いている話数。規則ごとに differ するので、その都度入れ替える。
    cur = {"fols": base_fols, "rank": dict((f, i) for i, f in enumerate(base_fols))}

    def _in_focus(k):
        return k.split(u"/")[0] in cur["rank"] if u"/" in k else False

    def _order(lst):
        """対象話数に書いた順に並べる(書いていない話数は後ろ)。"""
        r = cur["rank"]
        return sorted(lst, key=lambda k: (r.get(k.split(u"/")[0], 10 ** 6)
                                          if u"/" in k else 10 ** 6, natkey(k)))

    def _match(key, hiroi=False):
        """@ はファイル名/フォルダ名で、# は説明で探す。

        # は ① 画像カタログ(1枚ごと) → ② 話数マップ(話数まるごと) の順。
        ②で拾ったものは「話数から選んだ」印をつけて、あとでまとめて知らせる。

        hiroi=False のときは、対象話数の外まで探しにいかない。
        「#ルーデウス 戦闘」が対象話数に無いなら、勝手に他の期から
        拾ってくるのではなく、カンマの次の候補「#ルーデウス」に譲る。
        全部の候補が外れたときだけ hiroi=True でもう一度探す。
        @ 指定は「この話数から」と自分で書いたものなので、この制限はかけない。
        """
        if key.startswith(u"#"):
            words = [w for w in key[1:].replace(u"　", u" ").split() if w]

            def by_cat(pool):
                return [k for k in pool if cat.get(k) and all(w in cat[k] for w in words)]

            def by_epmap(pool):
                u"""話数マップ(話数まるごと)から探す。

                ■ 「話数まるごと」でも、別の人が写っている絵は外すこと

                前はその話数の絵をぜんぶ返していた。
                Ⅱ第14話の説明には「ロキシー」と書いてあるので、
                #ロキシー がその話数の絵ぜんぶに当たり、
                シルフィエットの絵が「ここにロキシーがいました」に出た（3か所）。
                1枚ごとの説明があるなら、そこに別の人の名前しか無い絵は外す。
                説明が無い絵は、そのまま候補に残す（それがこの仕組みの役目）。
                """
                fs = set(f for f, d in emap.items() if all(w in d for w in words))
                # 誰の絵が欲しいかは、#指定 だけでなく**セリフ**からも取る。
                #
                # 「ここにロキシーがいました。」で シルフィエット の絵が出ていた。
                # 当て方は #ロキシー が外れると #青髪 帽子 に落ちるが、
                # そこには人の名前が入っていないので、せっかくの
                # 「別の人の絵は外す」が効かなかった。
                # オルステッドの2か所も同じ理由。
                hoshii = [w for w in words if w in uniq(CHARACTERS)]
                for c in uniq(CHARACTERS):
                    if c in (cur.get("tx") or u"") and c not in hoshii:
                        hoshii.append(c)
                betsu = [c for c in uniq(CHARACTERS) if c not in hoshii] if hoshii else []
                out2 = []
                for k in pool:
                    if (k.split(u"/")[0] if u"/" in k else u"") not in fs:
                        continue
                    if betsu:
                        w2 = cat.get(k)
                        if w2 and not any(h in w2 for h in hoshii) \
                                and any(c in w2 for c in betsu):
                            continue        # 別の人だと分かっている絵は使わない
                    out2.append(k)
                return out2

            if cur["rank"]:
                inside = [k for k in images if _in_focus(k)]
                hit = by_cat(inside)
                if hit:
                    return _order(hit)
                hit = by_epmap(inside)
                if hit:
                    via_ep.add(key)
                    return _order(hit)

            if cur["rank"] and not hiroi:
                return []
            hit = by_cat(images)
            if hit:
                if cur["rank"]:
                    via_wide.add(key)
                return _order(hit)
            hit = by_epmap(images)
            if hit:
                via_ep.add(key)
                if cur["rank"]:
                    via_wide.add(key)
                return _order(hit)
            return []
        return _order([k for k in images if key in k])

    # 直前に使った絵をおぼえておき、同じ絵が近くで何度も出ないようにする。
    # 句読点ごとに絵を変えたい、という狙いのための仕組み。
    saikin = []
    mitame = mitame or MITAME_KITEI
    jougen = max(1, int(mitame.get(u"同じ絵の上限", 3)))
    afure = [0]

    # 動画ぜんぶで、同じ絵を何回まで使ってよいか。
    # 同じ風景ばかり流れると、どこの話か分からなくなるため。
    tsukai = {}

    def oboeru(k):
        saikin.append(k)
        if len(saikin) > AVOID_WINDOW:
            del saikin[0]
        tsukai[k] = tsukai.get(k, 0) + 1

    # 章の話数の中にある絵を、まるごと並べたもの（話数の組ごとに1回だけ作る）
    hoka_pool = {}
    DAME = (u"使用不可", u"クレジット", u"実写", u"テロップ", u"提供")

    def karu():
        u"""同じ話数の中から、まだ上限に達していない絵を借りる。

        ■ 借りるときも「誰が写っているか」を見ること

        はじめ、話数さえ合っていればどれでもよいことにしたら、
        「ヒトガミの目的は、」にルーデウスの絵が当たるようになった。
        同じ絵の使いすぎは直ったが、人ちがいが16件に増えた（うち10件がヒトガミ）。
        セリフに出てくる人が写っている絵を先に探し、
        いなければ、その人が写っていない絵を借りる。
        """
        fk = u"|".join(cur["fols"])
        if not fk:
            return None
        if fk not in hoka_pool:
            sou = []
            for k in images:
                if u"/" not in k or k.split(u"/")[0] not in cur["rank"]:
                    continue
                w = setsumei(catalog, k)
                if not w or any(x in w for x in DAME):
                    continue        # 説明の無い絵と、出してはいけない絵は借りない
                sou.append(k)
            hoka_pool[fk] = _order(sou)

        tx = cur.get("tx") or u""
        hoshii = [c for c in uniq(CHARACTERS) if c in tx]
        if hoshii:
            # セリフに人の名前が出ているときは、その人の絵しか借りない。
            #
            # 「ヒトガミの目的は、」にルーデウスの絵が当たるくらいなら、
            # ヒトガミの絵を4回目に使うほうがよい。
            # 本人がいちばん先に言ったのが「画像と字幕の内容がずれている」なので、
            # 絵の変化より、誰の話かが合っていることを上に置く。
            dewa = []
            for c in hoshii:
                dewa.extend([c] + ONAJI_HITO.get(c, []) + MITAME.get(c, []))
            for nokeru in (True, False):      # まず最近つかっていないものから
                for k in hoka_pool[fk]:
                    if tsukai.get(k, 0) >= jougen:
                        continue
                    if nokeru and k in saikin:
                        continue
                    w = setsumei(catalog, k)
                    if any(x in w for x in dewa):
                        return k
            return None        # その人の絵が無い → 繰り返してでもその人にする

        # 人の名前が出ていないセリフ（「ですが、」など）は、
        # 話数さえ合っていればよいので、変化をつけるために借りる。
        for k in hoka_pool[fk]:
            if tsukai.get(k, 0) < jougen and k not in saikin:
                return k
        for k in hoka_pool[fk]:
            if tsukai.get(k, 0) < jougen:
                return k
        return None

    def resolve(f, hiroi=False):
        if not (f.startswith(u"@") or f.startswith(u"#")):
            return f
        key = f[1:].strip() if f.startswith(u"@") else f
        # 候補の並びは覚えておいて使い回すが、**誰のセリフかも鍵に入れること。**
        #
        # 入れていなかったので、「話数まるごとから選ぶときに別の人の絵を外す」が
        # 一度も効かなかった。その章で最初に #青髪 帽子 を引いたのが
        # ロキシーの出てこない行だったため、シルフィエットの絵が入った並びが
        # そのまま残り、あとのロキシーの行も全部それを使っていた。
        # （点数も中身も前の回とまったく同じになり、気づけた）
        dare = u",".join(sorted(c for c in uniq(CHARACTERS)
                                if c in (cur.get("tx") or u"")))
        pk = (u"|".join(cur["fols"]), key, hiroi, dare)
        if pk not in pools:
            pools[pk] = [_match(key, hiroi), 0]
        lst, i = pools[pk]
        if not lst:
            if not hiroi:
                return resolve(f, True)   # 話数の中に無いときだけ広げる
            return f
        n = len(lst)
        # ① 最近つかっておらず、上限にも達していない絵
        for step in range(n):
            k = lst[(i + step) % n]
            if k not in saikin and tsukai.get(k, 0) < jougen:
                pools[pk][1] = i + step + 1
                return k
        # ② 上限に達していない絵（最近つかっていてもよい）
        for step in range(n):
            k = lst[(i + step) % n]
            if tsukai.get(k, 0) < jougen:
                pools[pk][1] = i + step + 1
                return k
        # ③ 候補がぜんぶ上限。章の話数の中から、まだ余裕のある絵を借りる。
        #
        #    ここが無いと、候補が1枚しかない章で同じ絵が何度も出ます。
        #    実際「助言② ウェンポートの路地裏」の章で、38行を18種でまかない、
        #    1枚が16回出ました（上限は3）。
        #    話数は合っているのだから、同じ話数の別の絵にするほうが良い。
        k = karu()
        if k:
            return k
        # ④ それでも無いときだけ、いちばん使っていないものを繰り返す。
        afure[0] += 1
        k = min(lst, key=lambda x: (tsukai.get(x, 0), lst.index(x)))
        pools[pk][1] = i + 1
        return k

    # 存在しない指定を知らせる
    missing, ambiguous = set(), set()
    base = {}
    for k in images:
        base.setdefault(k.split(u"/")[-1], []).append(k)
    # カンマ区切りは「見つからなければ次」なので、
    # 1つでも当たった行は問題なし。全部外れた行だけを知らせる。
    for items in [r[1] for r in rules] + [default]:
        hit_any, bad = False, []
        for f in items:
            if f.startswith(u"@") or f.startswith(u"#"):
                if _match(f[1:].strip() if f.startswith(u"@") else f):
                    hit_any = True
                else:
                    bad.append(f)
            elif f in known:
                hit_any = True
            elif len(base.get(f, [])) > 1:
                ambiguous.add(f)
            else:
                bad.append(f)
        if not hit_any:
            for f in bad:
                missing.add(f)
    if missing:
        say(u"この行はどの絵にも当たりませんでした(既定の絵になります):")
        for f in sorted(missing):
            say(u"    " + f)
    wide = []
    for items in [r[1] for r in rules] + [default]:
        for f in items:
            if f.startswith(u"@"):
                fols = set(k.split(u"/")[0] for k in _match(f[1:].strip()) if u"/" in k)
                if len(fols) > 1:
                    wide.append((f, sorted(fols)))
    if wide:
        seen = set()
        say(u"この @ 指定は複数の話数フォルダに当たります(狙いどおりか確認してください):")
        for f, fl in wide:
            if f in seen:
                continue
            seen.add(f)
            if len(fl) > 4:
                say(u"    %s  →  %d個の話数フォルダ (%s ほか)"
                    % (f, len(fl), u" / ".join(fl[:3])))
            else:
                say(u"    %s  →  %s" % (f, u" / ".join(fl)))
    if ambiguous:
        say(u"同じ名前が複数のフォルダにあるため、決められない指定があります:")
        for f in sorted(ambiguous):
            say(u"    %s  → 「無職転生 第11話/%s」のようにフォルダ名も書いてください" % (f, f))

    soto_tsukatta = set()

    def _usable1(items, hiroi):
        out = []
        for f in items:
            if f.startswith(u"@") or f.startswith(u"#"):
                if _match(f[1:].strip() if f.startswith(u"@") else f, hiroi):
                    out.append(f)
            elif f in known:
                out.append(f)
        return out

    def usable(items):
        """実際に絵が見つかる指定だけを残す。

        当たらない #/@ をそのまま返すと、その文字列が画像名として
        割り当て表に書かれてしまい、書き出しのときに止まる。
        ここで捨てて、既定の絵に回す。

        まずは対象話数の中だけで探す。1つも見つからなかったときに限り、
        話数の外まで広げる。広げたかどうかは2つめの戻り値で返す。
        """
        out = _usable1(items, False)
        if out:
            return out
        hirogeta = _usable1(items, True)
        for f in hirogeta:
            soto_tsukatta.add(f)
        return hirogeta

    def usable_hiroi(items):
        """usable が話数の外まで広げたかどうか。"""
        return not _usable1(items, False) and bool(_usable1(items, True))

    if usable(default):
        pool_default = usable(default)
    elif cur["rank"]:
        pool_default = _order([k for k in images if _in_focus(k)]) or images
        say(u"どれにも当たらなかった場面は、対象話数の絵を順に使います。")
    else:
        pool_default = images
    for f in usable(default):
        if f.startswith(u"@"):
            fols = set(k.split(u"/")[0] for k in _match(f[1:].strip()) if u"/" in k)
            if len(fols) > 3:
                say(u"注意: どれにも当たらなかった場面の指定 %s が %d個の話数フォルダに"
                    u"当たります。1つの話数に絞ることをおすすめします。" % (f, len(fols)))
    naoshita = [0]
    kaoganai = [0]

    def naoshi(pick, tx):
        """人ちがいの絵を選び直す。

        ただし画像プランにファイル名で直接書いた絵は、人が見て選んだもの。
        カタログの人物判定より本人の指定が上なので、触らない。
        """
        if pick in tebiki:
            return pick
        d0 = cat.get(pick)
        if not d0:
            return pick
        w = set(d0.split())
        names = [c for c in uniq(CHARACTERS) if c in tx]
        if not names:
            return pick
        for c in names:
            if any(x in w for x in [c] + ONAJI_HITO.get(c, [])):
                return pick                      # 合っている
        hoka = [c for c in uniq(CHARACTERS) if c in w]
        if not hoka:
            return pick                          # 誰も写っていないなら、そのまま
        # 選び直すときは、かならず対象話数の中から探す。
        # (ここを忘れると、他の期の絵を拾ってきてしまう)
        cur["fols"] = base_fols
        cur["rank"] = dict((f, i) for i, f in enumerate(base_fols))
        for c in names:
            keys = [u"#" + c] + [u"#" + x for x in ONAJI_HITO.get(c, [])] \
                   + [u"#" + x for x in MITAME.get(c, [])]
            for key in keys:
                if _match(key):
                    naoshita[0] += 1
                    return resolve(key)
        # その人の絵が、この章の話数に1枚も無いとき。
        #
        # ここで諦めると「ここにロキシーがいました。」に
        # シルフィエットの顔が出たままになる（実際に3か所残った）。
        # **別人の顔より、誰も写っていない絵のほうがましなので、**
        # 同じ話数の中から「ほかの人が写っていない絵」に替える。
        # それも無ければ、そのときは諦める。
        for k in images:
            if u"/" not in k or k.split(u"/")[0] not in cur["rank"]:
                continue
            w2 = setsumei(cat, k)
            if not w2 or any(x in w2 for x in DAME):
                continue
            if any(c in w2 for c in uniq(CHARACTERS)):
                continue              # 誰かが写っている絵は、ここでは使わない
            if tsukai.get(k, 0) >= jougen:
                continue
            naoshita[0] += 1
            kaoganai[0] += 1
            return k
        return pick

    out, d = [], 0
    hit, carried, namae = 0, 0, 0
    prev_rule = None
    new_sentence = True
    # 規則の選び方。
    #   ① 画像プランにファイル名で直接書いた規則（手で選んだ絵）を先に見る
    #   ② 次に、当たった規則のうち「いちばん長いキー」のものを使う
    # ②が要るのは、「、」をまたいで文をまとめるようになったため。
    # 1つのセリフに複数の規則が当たるので、「先に書いた行」ではなく
    # 「より細かく言い当てている行」を選ばないと、短いキーが後の文まで拾う。
    # (例: 「この時」が「この時点で、彼はもう老人に…」まで拾ってしまう)
    te_rules = [r for r in rules
                if any(not (f.startswith(u"#") or f.startswith(u"@")) for f in r[1])]
    auto_rules = [r for r in rules if r not in te_rules]

    def erabu(tx):
        for r in te_rules:
            if any(k in tx for k in r[0]):
                return r
        best, blen = None, -1
        for r in auto_rules:
            for k in r[0]:
                if k in tx and len(k) > blen:
                    best, blen = r, len(k)
        return best

    # 章ごとの「アニメ何話か」を、スロット番号に落とす。
    #
    # 画面表示_○○.txt の 章の行の4列目。ここが書いてあれば、その章の間は
    # 既定の話数をそれに差し替えます。画像プランに @@話数 が書いてある行は
    # そちらが勝つので、手で決めたものは今までどおり優先されます。
    shou_kiri = {}
    if chaps:
        tsukatta = set()
        for (key, title, eps) in chaps:
            if not eps:
                continue
            for i, (_s2, _d2, t2) in enumerate(slots):
                if i not in tsukatta and key in t2:
                    fs = resolve_focus(eps)
                    if fs:
                        shou_kiri[i] = (title, fs)
                    else:
                        say(u"  章「%s」の話数が見つかりません: %s"
                            % (title.replace(u"\\N", u" "), u", ".join(eps)))
                    tsukatta.add(i)
                    break
        if shou_kiri:
            say(u"章ごとの話数: %d章ぶんを使います（画面表示の4列目）"
                % len(shou_kiri))

    ima_base = list(base_fols)
    shou_tsukatta = []
    for idx, (_st, _du, tx) in enumerate(slots):
        if idx in shou_kiri:
            title, fs = shou_kiri[idx]
            ima_base = fs
            shou_tsukatta.append((title, fs))
        base_fols = ima_base
        cur["tx"] = tx          # 絵を借りるとき、誰のセリフかを見るため
        pick = None
        r = erabu(tx)
        if r is not None:
            want = r[3] if len(r) > 3 else []
            fols = resolve_focus(want) if want else base_fols
            cur["fols"] = fols
            cur["rank"] = dict((f, i) for i, f in enumerate(fols))
            if want:
                used_focus.add(u" / ".join(fols) if fols else u"(見つからず)")
            ok = usable(r[1])
            if ok:
                pick = resolve(ok[r[2] % len(ok)])
                r[2] += 1
                hit += 1
                prev_rule = r
        # 句読点で割った切れ端に人の名前が出てきたら、その人の絵にする。
        # 文の前半と後半で写っている人が違うとき、ここが効く。
        if pick is None:
            for c in uniq(CHARACTERS):
                if c in tx:
                    f = u"#" + c
                    cur["fols"] = base_fols
                    cur["rank"] = dict((f2, i2) for i2, f2 in enumerate(base_fols))
                    if _match(f):
                        pick = resolve(f)
                        namae += 1
                        break
        if pick is None and not new_sentence and prev_rule:
            want = prev_rule[3] if len(prev_rule) > 3 else []
            fols = resolve_focus(want) if want else base_fols
            cur["fols"] = fols
            cur["rank"] = dict((f, i) for i, f in enumerate(fols))
            ok = usable(prev_rule[1])
            if ok:
                # 同じ文の続きでも、絵は次のものに進める。
                # (前と同じ番号にすると、句読点で割った意味が無くなる)
                pick = resolve(ok[prev_rule[2] % len(ok)])
                prev_rule[2] += 1
                carried += 1
        if pick is None and not new_sentence and out:
            pick = out[-1]
            carried += 1
        if pick is None:
            cur["fols"] = base_fols
            cur["rank"] = dict((f, i) for i, f in enumerate(base_fols))
            pick = resolve(pool_default[d % len(pool_default)])
            d += 1
            prev_rule = None
        # セリフに人の名前が出ているのに、選ばれた絵に「別の人」が写っている
        # ときだけ、その人の絵に選び直す。誰も写っていない絵はそのまま。
        pick = naoshi(pick, tx)
        out.append(pick)
        oboeru(pick)
        t = tx.rstrip()
        new_sentence = (not t) or t[-1] in u"。！？"
    # --- 最後に、章の話数から外れた絵を引き戻す ---
    #
    # 章ごとに話数を決めても、まだ 14か所が別の話数の絵になっていた。
    # 「ですが、」のような文で、前の行の絵をそのまま引き継いだり、
    # 章の中に当たる絵が無くて外へ探しに行ったりしたもの。
    #
    # ここでもう一度、その章の話数の中から選び直す。
    # セリフに人の名前があれば、その人が写っている絵を先に探す。
    # 見つからなければ、そのままにする（無理に変えない）。
    hikimodoshi = 0
    if shou_kiri:
        ima2 = list(base_fols)
        for idx in range(len(out)):
            if idx in shou_kiri:
                ima2 = shou_kiri[idx][1]
            img = out[idx]
            if not ima2 or not img or u"/" not in img:
                continue
            if img in tebiki:
                continue      # 手で選んだ絵。話数の外でもそのまま使う
            if img.split(u"/")[0] in ima2:
                continue                      # もう合っている
            tx2 = slots[idx][2]
            hoshii2 = [c for c in uniq(CHARACTERS) if c in tx2]
            dewa2 = []
            for c in hoshii2:
                dewa2.extend([c] + ONAJI_HITO.get(c, []) + MITAME.get(c, []))
            erabi = None
            for k in images:
                if u"/" not in k or k.split(u"/")[0] not in ima2:
                    continue
                w3 = setsumei(catalog, k)
                if not w3 or any(x in w3 for x in DAME):
                    continue
                # ここは全部決まったあとなので「最近つかった」は見ない。
                # 見てしまうと、引き戻せるのに引き戻せないものが残る。
                if tsukai.get(k, 0) >= jougen:
                    continue
                if k == out[idx - 1] if idx else False:
                    continue              # 直前と同じ絵にはしない
                if dewa2:
                    if any(x in w3 for x in dewa2):
                        erabi = k
                        break
                elif erabi is None:
                    erabi = k
            if erabi:
                tsukai[out[idx]] = max(0, tsukai.get(out[idx], 1) - 1)
                out[idx] = erabi
                tsukai[erabi] = tsukai.get(erabi, 0) + 1
                hikimodoshi += 1

    say(u"画像プランを使いました: %d枚が直接一致 / %d枚がセリフの人名から / "
        u"%d枚が同じ文から引き継ぎ / 全%d枚"
        % (hit, namae, carried, len(slots)))
    if hikimodoshi:
        say(u"章の話数から外れていた絵を %d枚 その章の中に引き戻しました"
            % hikimodoshi)
    if naoshita[0]:
        say(u"人ちがいだった絵を %d枚 選び直しました" % naoshita[0])
    if kaoganai[0]:
        say(u"  うち %d枚は、その人の絵がこの話数に無いので"
            u"「誰も写っていない絵」にしました" % kaoganai[0])
    kasane = sorted(((v, k) for k, v in tsukai.items() if v > jougen), reverse=True)
    say(u"同じ絵は %d回まで。いちばん使った絵 %d回 / 使った絵の種類 %d"
        % (jougen, max(tsukai.values()) if tsukai else 0, len(tsukai)))
    if afure[0]:
        say(u"  候補が足りず %d枚は上限を超えました。絵を増やすか、"
            u"画像プランの候補(カンマ区切り)を増やすと直ります。" % afure[0])
        for (v, k) in kasane[:5]:
            say(u"    %d回  %s" % (v, k))
    # どの話数の絵をどれだけ使ったかを出す。
    # 1つの話数に偏っていたら、その場で気づけるようにするため。
    tally = {}
    for k in out:
        f = k.split(u"/")[0] if u"/" in k else u"(図表)"
        tally[f] = tally.get(f, 0) + 1
    order = sorted(tally.items(), key=lambda x: (-x[1], natkey(x[0])))
    say(u"使った話数: %d種類" % len(order))
    for f, n in order[:8]:
        say(u"    %-24s %3d枚  (%.0f%%)" % (f, n, 100.0 * n / max(1, len(out))))
    if len(order) > 8:
        say(u"    ほか %d種類" % (len(order) - 8))
    # 1つの話数の解説動画なら、その話数に偏っているのが正しい。
    # 偏りを責めるのは、対象話数の先頭に書いた話数ではないときだけ。
    if order and order[0][1] > len(out) * 0.5:
        atama = moto_base[0] if moto_base else None
        if order[0][0] != atama:
            say(u"⚠ %s に %.0f%% が偏っています。画像プランの指定を見直してください。"
                % (order[0][0], 100.0 * order[0][1] / len(out)))
    if used_focus:
        say(u"段落ごとの対象話数: %d通り" % len(used_focus))
    if via_wide:
        say(u"次の指定は対象話数の中に見つからず、他の話数から選びました:")
        for k in sorted(via_wide):
            say(u"    " + k)
    if via_ep:
        say(u"このうち次の指定は、1枚ごとの説明が無いので「話数まるごと」から選びました。")
        say(u"絵をぴったり合わせたいときは、その話数の一覧シートを出して送ってください:")
        for k in sorted(via_ep):
            say(u"    " + k)
    return out


def write_plan(path, slots, images, fingerprint=u""):
    with io.open(path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(u"# format: %d\r\n" % PLAN_FORMAT)
        if fingerprint:
            f.write(u"# inputs: %s\r\n" % fingerprint)
        f.write(u"# 画像の割り当て表です。5列目(画像)を書き換えると、その絵に差し替わります。\r\n")
        f.write(u"# 5列目には短い番号(例 3-11-056)を書いても通ります。期-話-通し番号です。\r\n")
        f.write(u"# 3列目(尺)を書き換えると長さが変わります。開始とmm:ssは表示用なので直さなくて大丈夫です。\r\n")
        f.write(u"# 行を消すとその分だけ前の絵が伸びます。保存したら「スライドショー動画にする.bat」をもう一度実行してください。\r\n")
        f.write(u"No\t開始\t尺\tmm:ss\t画像\tセリフ\t絵の番号\r\n")
        for i, (st, du, tx) in enumerate(slots):
            img = images[i] if len(images) == len(slots) else images[i % len(images)]
            f.write(u"%d\t%.2f\t%.2f\t%s\t%s\t%s\t%s\r\n"
                    % (i + 1, st, du, mmss(st), img,
                       tx.replace(u"\t", u" "), img_code(img)))


# 絵の決め方そのものの版。**決め方を変えたら必ず1つ上げること。**
#
# 指紋は設定ファイルの中身しか見ていなかったので、こちらが
# make_slideshow.py の決め方を直しても、設定が同じなら
# 前の割り当て表がそのまま使われ、直したことが効かなかった。
# （「同じ話数の中から別の絵を借りる」を入れた回が、まるまる空振りした）
WARIATE_BAN = 8


def kime_kata_shirushi():
    u"""絵の決め方・時刻の決め方のソースそのものの印。

    ■ なぜ要るか（v129 がまるごと空振りした）

    指紋は「設定ファイルの中身」＋「手で上げる WARIATE_BAN」だけを見ていた。
    字幕と音声のずれを直して v129 を出したのに、本人の画面では何も変わらず
    「画像の部分の間がすべてずれている」ままだった。
    採点の1行目がそれを言っていた。

        時刻表: ⑥ 前回の割り当て表をそのまま使用

    設定は何も変えていないので指紋が一致し、**前の（ずれたままの）割り当て表が
    そのまま使われ、直した時刻の計算が一度も走らなかった。**
    WARIATE_BAN を上げ忘れたせいだが、「忘れないようにする」では同じことが起きる。
    （同じ穴に2回落ちている。1回目は絵の借り方を直したとき）

    ■ 直し方：手で上げるのをやめて、中身そのものを見る

    決め方を書いてある関数のソースを、そのまま MD5 にする。
    こちらが1文字でも直せば印が変わり、割り当て表は必ず作り直される。
    上げ忘れようがない。
    """
    import inspect
    h = hashlib.md5()
    for f in (kugiri_awase, koma_awase, timeline_from_parts_srt,
              place_in_chunk, assign_images):
        try:
            h.update(inspect.getsource(f).encode("utf-8"))
        except Exception:
            return u"なし"
    return h.hexdigest()[:10]


def inputs_fingerprint(paths):
    u"""割り当ての元になったファイルの指紋を作る。

    前は「何行・何バイト」で見ていたが、それだと
    「同じ絵の上限 3 → 2」のように、字数の変わらない書きかえを
    見逃してしまい、設定を変えても割り当て表が作り直されなかった。
    いまは中身そのものを MD5 で見る。
    大きなファイル(音声など)は、頭と尻と大きさだけで足りる。
    """
    OOKII = 4 * 1024 * 1024
    parts = [u"ban%d" % WARIATE_BAN, u"kime:%s" % kime_kata_shirushi()]
    for p in paths:
        if not p:
            continue
        try:
            n = os.path.getsize(p)
            h = hashlib.md5()
            with io.open(p, "rb") as f:
                if n <= OOKII:
                    for blk in iter(lambda: f.read(1 << 20), b""):
                        h.update(blk)
                else:
                    h.update(f.read(1 << 20))
                    f.seek(max(0, n - (1 << 20)))
                    h.update(f.read(1 << 20))
            h.update(str(n).encode("ascii"))
            shirushi = h.hexdigest()[:10]
        except Exception:
            shirushi = u"なし"
        parts.append(u"%s:%s" % (os.path.basename(p), shirushi))
    return u" ".join(parts)

def plan_fingerprint_of(path):
    """割り当て表に書いてある指紋を読む(無ければ空)。"""
    try:
        for line in io.open(path, encoding="utf-8-sig", errors="replace"):
            m = re.match(u"^#\\s*inputs:\\s*(.+?)\\s*$", line.rstrip())
            if m:
                return m.group(1)
            if line.strip() and not line.lstrip().startswith(u"#"):
                break     # 中身の行に入ったら終わり。空行では止めない
    except Exception:
        pass
    return u""


def plan_format_of(path):
    """割り当て表の先頭にある書式番号を読む(分からなければ 0)。"""
    try:
        for line in io.open(path, encoding="utf-8-sig", errors="replace"):
            m = re.match(u"^#\\s*format:\\s*(\\d+)", line.strip())
            if m:
                return int(m.group(1))
            if line.strip() and not line.lstrip().startswith(u"#"):
                break
    except Exception:
        pass
    return 0


def plan_is_current(path):
    """割り当て表が、いまの書式で作られたものかどうか。"""
    return plan_format_of(path) == PLAN_FORMAT


def plan_is_outdated(path, sources):
    """画像プランなどを後から書き換えていたら、その名前を返す。

    割り当て表より新しいファイルがあれば、割り当てを作り直す合図にする。
    (画像割り当て.tsv を手で直した場合は、そちらのほうが新しくなるので
     作り直さない ＝ 手直しは消えない)
    """
    try:
        t = os.path.getmtime(path)
    except Exception:
        return None
    for src in sources:
        try:
            if src and os.path.exists(src) and os.path.getmtime(src) > t + 1:
                return src
        except Exception:
            pass
    return None


def read_plan(path):
    rows = []
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.startswith(u"#"):
            continue
        c = line.split(u"\t")
        if len(c) < 5 or c[0].strip() == u"No":
            continue
        try:
            du = float(c[2])
        except ValueError:
            continue
        img = c[4].strip()
        if du > 0.05 and img:
            rows.append((du, img, c[5].strip() if len(c) > 5 else u""))
    if not rows:
        die(u"割り当て表を読めませんでした: " + path)
    return rows


# ---------------------------------------------------------------- 描画
def unicode_bool(v):
    u"""「はい/いいえ」を真偽に直す。"""
    return unicode(v).strip() not in (u"いいえ", u"なし", u"0", u"off", u"OFF", u"False") \
        if str is bytes else \
        str(v).strip() not in (u"いいえ", u"なし", u"0", u"off", u"OFF", u"False")


PAN_MUKI = (u"左へ", u"右へ", u"上へ", u"下へ")


def pan_kesan(w, h, kakudai, nagai_byou, hayasa_bai=0.75):
    u"""横にも縦にも動かせる量と、その速さを決める。

    ■ 4方向を同じ速さ・同じ距離にする

    1.10倍にすると、余りは 横 192px・縦 108px と**ちがう**。
    方向ごとに距離を変えると、縦のときだけ速く見えてしまうので、
    **小さいほう（縦の 108px）を全部の方向の距離にそろえる。**
    こうすれば、どの方向でも同じ速さ・同じ距離になり、
    どの方向でも端が切れない。

      動く距離 = min(横の余り, 縦の余り)
      速さ     = 動く距離 ÷ いちばん長い尺 × 動きの速さ

    戻り値 (動く距離, 速さ, 横の余り, 縦の余り)
    """
    yoko = int(round(w * (kakudai - 1.0))); yoko -= yoko % 2
    tate = int(round(h * (kakudai - 1.0))); tate -= tate % 2
    kyori = min(yoko, tate)
    if kyori <= 0 or nagai_byou <= 0:
        return 0, 0.0, yoko, tate
    bai = max(0.05, min(1.0, hayasa_bai))
    return kyori, kyori / float(nagai_byou) * bai, yoko, tate


def pan_muki(i, mae_muki):
    u"""その絵をどの方向に動かすか。

    同じ方向が続くと「まだ動いている」ように見えてくどいので、
    直前とちがう方向から選ぶ。
    番号から決めるので、作り直しても同じ結果になる（毎回変わらない）。
    """
    import hashlib
    nokori = [m for m in PAN_MUKI if m != mae_muki] or list(PAN_MUKI)
    tane = hashlib.md5((u"pan%d" % i).encode("utf-8")).hexdigest()
    return nokori[int(tane[:8], 16) % len(nokori)]


SASHIKAE = os.path.join(SONOTA_DIR, u"差し替え.txt")

SASHIKAE_ATAMA = u"""\ufeff# ─────────────────────────────────────────────
# 差し替え ─ 番号で絵を入れ替える
#
#   書式:  字幕の番号 <タブ> 絵の番号
#
#   例:
#     042\t3-13-007        ← 無職転生Ⅲ 第13話 の 007 の絵にする
#     209\t2-22-031        ← 無職転生Ⅱ 第22話 の 031 の絵にする
#
#   絵の番号は 期-話-通し番号 です。
#     1-09-005  … 無職転生   第9話  の 005
#     2-14-013  … 無職転生Ⅱ 第14話 の 013
#     3-11-056  … 無職転生Ⅲ 第11話 の 056
#   「3-11-56」「Ⅲ11-056」のように書いても通ります。
#
# 字幕の番号は 確認用/コマ一覧_01.png と 確認用/一覧.txt のものです。
# 絵の番号は、画像フォルダに入っている 一覧_01.png と 一覧.txt で見られます。
#   （無ければ「はじめる.bat」→ C で作れます）
#
# 昔の書き方（042\t無職転生Ⅲ 第13話/007 のようなファイル名の一部）も通ります。
#
# **ここに書いた絵は、話数の外でも、使いすぎでも、そのまま使われます。**
# 機械の判定より、本人が選んだものが上です。
#
# 直したら「はじめる.bat」→ 2 → 1 を実行するだけ。
# 台本も音声も作り直しません。
# ─────────────────────────────────────────────

"""


def load_sashikae(path, images):
    u"""差し替え.txt を読む。{番号(1から): 画像のファイル名}"""
    if not os.path.exists(path):
        return {}
    out, machigai = {}, []
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read() \
            .replace("\r\n", "\n").split("\n"):
        t = line.strip()
        if not t or t.startswith(u"#"):
            continue
        # 表計算から貼ると、タブの列に「タブ」という字がそのまま入ることがある。
        # 実際に9番と18番がそれで当たらなかったので、落としてから読む。
        c = [x for x in re.split(r"[\t\uFF09\u3000 ]{1,}", t)
             if x and x.strip() not in (u"タブ", u"TAB", u"tab", u"\\t")]
        if len(c) < 2:
            if len(c) == 1 and c[0].strip().isdigit():
                continue          # 番号だけの行（本人が空けた所）は黙ってとばす
            continue
        try:
            no = int(c[0].strip())
        except ValueError:
            continue
        shirushi = u" ".join(c[1:]).strip()
        # 短い番号(3-11-056)を先に試し、だめならファイル名の一部として探す
        kimari = code_to_img(shirushi, images)
        if not kimari:
            atari = [k for k in images if shirushi in k]
            kimari = sorted(atari)[0] if atari else None
        if not kimari:
            tasuke = u""
            if code_norm(shirushi):
                tasuke = u"（その番号の絵が画像フォルダにありません）"
            machigai.append(u"%d番の「%s」に当たる絵がありません%s"
                            % (no, shirushi, tasuke))
            continue
        out[no] = kimari
    for m in machigai:
        say(u"  差し替え: " + m)
    return out


def normalize(src, dst, w, h, fit):
    if fit == "cover":
        vf = ("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d" % (w, h, w, h))
    elif fit == "contain":
        vf = ("scale=%d:%d:force_original_aspect_ratio=decrease,"
              "pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=black" % (w, h, w, h))
    else:  # blur
        vf = ("[0:v]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,"
              "boxblur=26:2,eq=brightness=-0.09[bg];"
              "[0:v]scale=%d:%d:force_original_aspect_ratio=decrease[fg];"
              "[bg][fg]overlay=(W-w)/2:(H-h)/2" % (w, h, w, h, w, h))
    cmd = [need("ffmpeg"), "-y", "-loglevel", "error", "-i", src]
    cmd += (["-filter_complex", vf] if fit == "blur" else ["-vf", vf])
    cmd += ["-frames:v", "1", dst]
    run(cmd)


def e_no(img):
    u"""絵のファイル名から「アニメ何話の絵か」を取り出す。

    絵は 話数フォルダ/ファイル名 で置かれているので、
    フォルダ名がそのまま話数です。別に書き足す必要はありません
    （二重に持つと必ず食いちがうので、持たせません）。
    """
    if not img or img.startswith(u"@@"):
        return u""
    return img.split(u"/")[0] if u"/" in img else u""


# ------------------------------------------------ 絵の短い番号（期-話-通し番号）
#
# 本人の指定（2026-10-04）:
#   「それぞれのフォルダ内に、画像とその番号がわかる一覧表を作成し、
#     それぞれどの画像を割り当てるのか正確にかつ簡単に指示できるようにしたい」
#
# 「無職転生Ⅲ 第11話/056_pTrupzRmdVSYPWm_x2.png」は打つのがつらい。
# フォルダ名と、ファイル名の頭についている番号だけで一意に決まるので、
#   期 - 話 - 通し番号      →  3-11-056
# と書けるようにする。どこでもこの書き方が通るようにそろえる。
KI_KIGOU = ((u"Ⅲ", 3), (u"Ⅱ", 2), (u"III", 3), (u"II", 2))


def fol_code(fol):
    u"""話数フォルダ名 → (期, 話)。分からなければ None。"""
    if not fol:
        return None
    ki = 1
    for kigou, n in KI_KIGOU:
        if kigou in fol:
            ki = n
            break
    m = re.search(r"第\s*(\d+)\s*話", fol)
    if not m:
        return None
    return (ki, int(m.group(1)))


def img_code(img):
    u"""絵の名前 → 短い番号。例 無職転生Ⅲ 第11話/056_xxx.png → 3-11-056"""
    if not img or img.startswith(u"@@") or u"/" not in img:
        return u""
    fol, name = img.split(u"/", 1)
    ke = fol_code(fol)
    m = re.match(r"(\d+)", os.path.basename(name))
    if not ke or not m:
        return u""
    return u"%d-%02d-%03d" % (ke[0], ke[1], int(m.group(1)))


def code_norm(t):
    u"""打ちまちがいを吸収して (期, 話, 通し番号) にする。

    通るもの:  3-11-56 / 3_11_056 / Ⅲ-11-056 / Ⅲ11-056 / 3 11 56
    """
    if not t:
        return None
    u = t.strip()
    for kigou, n in KI_KIGOU:
        if u.startswith(kigou):
            u = u"%d%s" % (n, u[len(kigou):])
            break
    kazu = re.findall(r"\d+", u)
    if len(kazu) == 3:
        ki, wa, no = (int(x) for x in kazu)
    elif len(kazu) == 2 and u[:1].isdigit() and len(kazu[0]) >= 3:
        # 「311-056」のように期と話がくっついている書き方
        ki, wa, no = int(kazu[0][0]), int(kazu[0][1:]), int(kazu[1])
    else:
        return None
    if ki not in (1, 2, 3) or wa > 99:
        return None
    return (ki, wa, no)


def code_to_img(t, images):
    u"""短い番号 → 実際の絵の名前。見つからなければ None。"""
    ke = code_norm(t)
    if not ke:
        return None
    hoshii = u"%d-%02d-%03d" % ke
    atari = [k for k in images if img_code(k) == hoshii]
    return sorted(atari)[0] if atari else None


def shou_no_wasuu(rows, chaps):
    u"""各行が「台本のうえで何話の内容か」を出す。

    画面表示_○○.txt の章の行の4列目。章が変わるまで、同じ話数が続きます。
    絵の話数とこれを並べると、食いちがいがその場で見えます。
    """
    out = [u""] * len(rows)
    if not chaps:
        return out
    kiri, tsukatta = {}, set()
    for (key, _title, eps) in chaps:
        if not eps:
            continue
        for i, (_du, _img, tx) in enumerate(rows):
            if i not in tsukatta and key in tx:
                kiri[i] = eps
                tsukatta.add(i)
                break
    ima = []
    for i in range(len(rows)):
        if i in kiri:
            ima = kiri[i]
        out[i] = u" / ".join(ima)
    return out


def hyou_gyou(i, start, du, img, tx, daihon):
    u"""一覧.txt の1行。絵の話数と、台本の話数を並べる。"""
    e = e_no(img)
    # 台本が「この話」と言っているのに、絵が別の話から来ているところに印。
    # ここが採点でいちばん効きます。
    shirushi = u""
    if e and daihon and e not in [x.strip() for x in daihon.split(u"/")]:
        shirushi = u"ちがう"
    # セリフは必ずいちばん右。印を右端に置くと、セリフの一部として
    # 読まれてしまい、採点がおかしくなります（一度そうなりかけました）。
    return u"%03d\t%s\t%.2f\t%s\t%s\t%s\t%s\t%s" % (
        i + 1, mmss(start), du, img, e, daihon, shirushi,
        tx.replace(u"\t", u" "))


ATAMA_GYOU = u"番号\t開始\t尺\t画像\t絵の話数\t台本の話数\tちがい\tセリフ"


def koma_ichiran(rows, starts, ends, cache, fol=u"確認用", retsu=4, gyou=5):
    u"""番号つきの「どの字幕にどの絵か」の表を、画像にして出す。

    本人の指定：
      「字幕の入った画像が表として見られ、それぞれの番号が振られており、
        番号を指定するだけで画像を入れ替える仕組みが望ましい」

    1マス = 絵 + 大きな番号 + その字幕。
    気に入らないマスの番号を 差し替え.txt に書けば、そこだけ入れ替わる。
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        say(u"コマ一覧は Pillow が要ります（pip install pillow）。とばしました。")
        return 0
    FONTS = [u"C:\\Windows\\Fonts\\meiryo.ttc", u"C:\\Windows\\Fonts\\YuGothM.ttc",
             u"C:\\Windows\\Fonts\\msgothic.ttc",
             u"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]

    def fnt(px):
        for f in FONTS:
            if os.path.exists(f):
                try:
                    return ImageFont.truetype(f, px)
                except Exception:
                    pass
        return ImageFont.load_default()

    tw, th = 420, 236
    pad, gap, shita, atama = 22, 14, 86, 64
    per = retsu * gyou
    mai = (len(rows) + per - 1) // per
    W = pad * 2 + retsu * tw + (retsu - 1) * gap
    H = atama + pad + gyou * (th + shita) + (gyou - 1) * gap + pad
    f_no, f_tx, f_hd = fnt(34), fnt(19), fnt(28)
    if not os.path.isdir(fol):
        os.makedirs(fol)
    dekita = 0
    for pg in range(mai):
        sheet = Image.new("RGB", (W, H), (14, 13, 22))
        d = ImageDraw.Draw(sheet)
        d.text((pad, 20), u"コマ一覧  %d / %d ページ   ［番号を 差し替え.txt に書くと"
               u"、その絵だけ入れ替わります］" % (pg + 1, mai), font=f_hd,
               fill=(238, 201, 115))
        for k in range(per):
            i = pg * per + k
            if i >= len(rows):
                break
            c, r = k % retsu, k // retsu
            x = pad + c * (tw + gap)
            y = atama + pad + r * (th + shita + gap)
            d.rectangle([x, y, x + tw, y + th], fill=(32, 30, 48))
            try:
                im = Image.open(cache[rows[i][1]]).convert("RGB")
                im.thumbnail((tw, th), Image.LANCZOS)
                sheet.paste(im, (x + (tw - im.width) // 2, y + (th - im.height) // 2))
            except Exception:
                d.text((x + 12, y + th // 2), u"(絵なし)", font=f_tx, fill=(150, 142, 180))
            no = u"%03d" % (i + 1)
            nw = int(d.textlength(no, font=f_no)) + 22
            d.rectangle([x, y, x + nw, y + 48], fill=(12, 10, 20))
            d.text((x + 11, y + 6), no, font=f_no, fill=(238, 201, 115))
            d.text((x + nw + 10, y + 6),
                   u"%s  %.1f秒" % (mmss(starts[i]), ends[i] - starts[i]),
                   font=f_tx, fill=(150, 142, 180))
            # いま当たっている絵の番号。入れ替えたいときは
            # 「この番号を、別の番号に」と書けばいいだけにする。
            ima = img_code(rows[i][1])
            if ima:
                d.text((x + nw + 10, y + 26), ima, font=f_tx, fill=(238, 201, 115))
            tx = rows[i][2].strip() or (u"（章タイトル）"
                                        if rows[i][1].startswith(u"@@") else u"")
            lines = wrap_ja(tx, 24, 3) if tx else []
            for n2, ln in enumerate(lines[:3]):
                d.text((x + 4, y + th + 8 + n2 * 24), ln, font=f_tx,
                       fill=(228, 222, 245))
        out = os.path.join(fol, u"コマ一覧_%02d.png" % (pg + 1))
        sheet.save(out)
        dekita += 1
    say(u"確認用/コマ一覧_01.png … %dページ を作りました（%dコマ）" % (dekita, len(rows)))
    say(u"  気に入らないコマの番号を その他/差し替え.txt に書けば、そこだけ入れ替わります。")
    return dekita


def write_ichiran(rows, starts, ends, fol=u"確認用", chaps=None):
    u"""一覧.txt だけ書く（動画は切らない）。

    採点(miru_kekka.py)が見るのはこの表だけで、短い動画は1本も見ていない。
    255本を切り出すと何分もかかるので、採点したいだけならこちらで足りる。
    """
    if not os.path.isdir(fol):
        os.makedirs(fol)
    daihon = shou_no_wasuu(rows, chaps)
    hyo = [ATAMA_GYOU]
    for i, (_du, img, tx) in enumerate(rows):
        hyo.append(hyou_gyou(i, starts[i], ends[i] - starts[i],
                             img, tx, daihon[i]))
    atama = [u"# 時刻表の作り方: " + JIKOKU[0]]
    for x in TARINAI:
        atama.append(u"# 足りない設定: " + x)
    io.open(os.path.join(fol, u"一覧.txt"), "w",
            encoding="utf-8-sig", newline="").write(
            u"\r\n".join(atama + hyo) + u"\r\n")
    say(u"確認用/一覧.txt を書きました (%d行)。採点はこれだけで足ります。" % len(rows))


def write_cuts(final, rows, starts, ends, fol=u"確認用", chaps=None):
    """完成した動画を、1枚ずつの短い動画に切り分ける。

    直したい場所を「7番」のように番号で指せるようにするためのもの。
    ファイル名に番号とセリフを入れてあるので、フォルダを見れば
    どれがどこか分かる。中身は完成品そのままなので、絵・字幕・音が
    本番と同じ状態で確かめられる。
    """
    ff = need("ffmpeg")
    if os.path.isdir(fol):
        shutil.rmtree(fol, ignore_errors=True)
    os.makedirs(fol)
    say(u"")
    say(u"1枚ずつの確認用動画を作っています (%d本)…" % len(rows))
    write_ichiran(rows, starts, ends, chaps=chaps)   # 表は 確認用、動画は 動画/分割版
    daihon = shou_no_wasuu(rows, chaps)
    hyo = [ATAMA_GYOU]
    for i, (_du, img, tx) in enumerate(rows):
        s0, du = starts[i], ends[i] - starts[i]
        na = re.sub(u"[\\/:*?\"<>|\r\n\t]+", u"", tx)[:24] or u"なし"
        out = os.path.join(fol, u"%03d_%s.mp4" % (i + 1, na))
        # -c copy だと近くのキーフレームまで戻ってしまい、
        # 「7番」の中身が6番から始まってしまう。番号で指せることが
        # この機能の目的なので、多少遅くても作り直して正確に切る。
        subprocess.run([ff, "-y", "-loglevel", "error",
                        "-ss", "%.3f" % s0, "-i", final,
                        "-t", "%.3f" % du,
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                        "-c:a", "aac", "-avoid_negative_ts", "make_zero", out],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        hyo.append(hyou_gyou(i, s0, du, img, tx, daihon[i]))
        if (i + 1) % 40 == 0:
            say(u"  %d / %d" % (i + 1, len(rows)))
    # 先頭に、時刻表をどう組んだかを書いておく。
    # これが③だと「絵と文が合っていない」ではなく「音とずれている」が本当の問題。
    atama = [u"# 時刻表の作り方: " + JIKOKU[0]]
    for x in TARINAI:
        atama.append(u"# 足りない設定: " + x)
    io.open(os.path.join(fol, u"一覧.txt"), "w",
            encoding="utf-8-sig", newline="").write(
            u"\r\n".join(atama + hyo) + u"\r\n")
    say(u"できました: %s" % os.path.join(HERE, fol))
    say(u"  ファイル名の頭の番号が、画像割り当て.tsv の No と同じです。")
    say(u"  直したいものがあれば「7番の絵を変えて」のように番号で言えます。")


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--images", default=IMGDIR_DEFAULT)
    ap.add_argument("--figs", default=FIGDIR, help=u"図表スライドの置き場")
    ap.add_argument("--audio", default="merged.wav")
    ap.add_argument("--srt", default="subtitle.srt")
    ap.add_argument("--sec", type=float, default=3.0)
    ap.add_argument("--kuten", action="store_true", default=True,
                    help=u"句読点ごとに絵を変える(既定)")
    ap.add_argument("--no-kuten", dest="kuten", action="store_false",
                    help=u"文ごとに絵を変える(前までの動き)")
    ap.add_argument("--kuten-min", type=float, default=1.1,
                    help=u"句読点で割ったとき、これより短い切れ端は後ろにくっつける")
    ap.add_argument("--kuten-moji", type=int, default=0,
                    help=u"「、」で切るとき、1つがこの文字数を超えないようにする。"
                         u"0(既定)なら「、」ごとに切る。「。」はどちらでも必ず切る")
    ap.add_argument("--kuten-tsunagi", type=int, default=0,
                    help=u"この文字数以下の切れ端は、問答無用で後ろにくっつける。0(既定)なら何もしない")
    ap.add_argument("--enshutsu", default=u"演出.txt",
                    help=u"絵の切り替わりと効果音の設定ファイル")
    ap.add_argument("--no-fx", action="store_true",
                    help=u"演出(エフェクトと効果音)を入れない")
    ap.add_argument("--no-bgm", action="store_true",
                    help=u"BGM を入れない")
    ap.add_argument("--cuts", action="store_true",
                    help=u"完成後、1枚ごとの短い動画を 確認用 に書き出す")
    ap.add_argument("--imageplan", default=IMGPLAN)
    ap.add_argument("--scout", action="store_true",
                    help=u"台本がどの話数にあたるかだけを調べる(動画は作らない)")
    ap.add_argument("--epmap", default=EPMAP,
                    help=u"話数マップ(どの話数に何があるか)")
    ap.add_argument("--catalog", default=CATALOG,
                    help=u"画像に何が写っているかの一覧")
    ap.add_argument("--no-rescale", action="store_true",
                    help=u"SRTを音声の長さに合わせる処理をしない")
    ap.add_argument("--no-snap", action="store_true",
                    help=u"音声の「間」に合わせる処理をしない")
    ap.add_argument("--script", default=u"台本_字幕用.txt", help=u"字幕に使う台本")
    ap.add_argument("--tts-script", default=u"台本_読み上げ用.txt",
                    help=u"実際に読み上げた台本(長さの見積もりに使う)")
    ap.add_argument("--no-parts", action="store_true",
                    help=u"1行ずつの音声を使わない")
    ap.add_argument("--no-audio-timeline", action="store_true",
                    help=u"音声から時刻表を作らず、subtitle.srt を使う")
    ap.add_argument("--lead", type=float, default=LEAD,
                    help=u"字幕を声の何秒前に出すか")
    ap.add_argument("--noise-db", type=int, default=-35, help=u"無音とみなす音量")
    ap.add_argument("--silence-len", type=float, default=0.22, help=u"無音とみなす長さ")
    ap.add_argument("--snap-tol", type=float, default=1.6, help=u"合わせにいく範囲(秒)")
    ap.add_argument("--fit", default="blur", choices=["blur", "contain", "cover"])
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--crf", type=int, default=20)
    ap.add_argument("--jobs", type=int, default=0,
                    help=u"断片をいくつ並べて作るか(0=CPUの数)")
    ap.add_argument("--seg-preset", default="ultrafast",
                    help=u"断片のx264プリセット。断片は途中の入れもの")
    ap.add_argument("--preset", default=None,
                    help=u"書き出しのx264プリセット(既定は 見た目.txt)")
    ap.add_argument("--out", default=u"完成.mp4")
    ap.add_argument("--no-folders", action="store_true",
                    help=u"フォルダ分けをせず、全部いちばん上に置く")
    ap.add_argument("--no-sub", action="store_true", help=u"字幕を焼き込まない")
    ap.add_argument("--font", default=None, help=u"既定は 見た目.txt のフォント")
    ap.add_argument("--sub-size", type=int, default=0, help=u"既定は 見た目.txt の大きさ")
    ap.add_argument("--mitame", default=MITAME_FILE, help=u"見た目の設定ファイル")
    ap.add_argument("--vertical", action="store_true",
                    help=u"縦動画(ショート/リール)にする。1080x1920 になります")
    ap.add_argument("--hook-sec", type=float, default=0.0,
                    help=u"冒頭の何秒かを、画面中央に大きく出す(ショート用)")
    ap.add_argument("--safe-bottom", type=float, default=0.0,
                    help=u"字幕を下から何割あけるか(縦は既定0.17)")
    ap.add_argument("--sub-chars", type=int, default=0, help=u"1行の文字数(既定は自動)")
    ap.add_argument("--overlay", default=OVERLAY)
    ap.add_argument("--credit", default=None, help=u"左上に出す引用元")
    ap.add_argument("--sub-lines", type=int, default=0, help=u"最大行数(既定は 見た目.txt)")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--preview", nargs="?", const=-1.0, type=float,
                    help=u"字幕の見え方を1枚のPNGで確認する(秒を指定可)")
    ap.add_argument("--render", action="store_true")
    a = ap.parse_args()

    os.chdir(HERE)
    # フォルダを用意して、入出力の場所をここで決めてしまう。
    # VOICEPEAK などは いちばん上 に書き出すので、どちらにあっても拾う。
    if not a.no_folders:
        shitaku()
        a.audio = sagasu(a.audio, OTO_DIR)
        a.srt = sagasu(a.srt, OTO_DIR)
        if not os.path.isabs(a.out) and os.sep not in a.out:
            a.out = os.path.join(DOUGA_DIR, a.out)
    # 見た目.txt は、字幕の割り方にも効くので、いちばん先に読む。
    # （--font などを付けたときだけ、コマンドのほうが勝つ）
    mi, mi_aru = load_mitame(a.mitame)
    tsunagi = a.kuten_tsunagi or int(mi[u"字幕の最短"])
    if a.vertical and a.size == "1920x1080":
        a.size = "1080x1920"
    w, h = [int(x) for x in a.size.lower().split("x")]
    tate = h > w
    if not a.safe_bottom:
        # 縦動画は下にアプリのボタンが重なるので、字幕を高めに置く
        a.safe_bottom = 0.17 if tate else 0.062

    if a.scout:
        # 話数調べは音声が無くてもできる
        log_start()
        imgs, _ = list_images(a.images, a.figs)
        # 人物ルール.txt を直したらすぐ効くように、毎回作り直す
        if not rebuild_epmap_from_catalog(a.catalog, a.epmap):
            say(u"画像カタログ.txt がありません。先にメニューの 8 を実行してください。")
        emap = load_epmap(a.epmap, imgs)
        if not os.path.exists(a.script):
            die(u"%s がありません。" % a.script)
        have = {}
        for k in imgs:
            if u"/" in k:
                f = k.split(u"/")[0]
                have[f] = have.get(f, 0) + 1
        scout_episodes(io.open(a.script, encoding="utf-8-sig", errors="replace").read(),
                       emap, counts=load_epmap_counts(a.epmap), have=have)
        log_save(u"話数しらべ.txt")
        return

    if not os.path.exists(a.audio):
        die(u"%s がありません。先に「音声を生成する.bat」を実行してください。" % a.audio)

    images, imgpath = list_images(a.images, a.figs)
    io.open(IMGLIST, "w", encoding="utf-8-sig", newline="").write(
        u"# %s の中にある画像 %d 枚\r\n" % (a.images, len(images)) + u"\r\n".join(images) + u"\r\n")

    # --- 割り当て表 ---
    have = os.path.exists(PLAN)
    stale = have and not plan_is_current(PLAN)
    # 指紋に入れ忘れると、そのファイルを直しても割り当て表が作り直されない。
    # merged.wav が抜けていたので、音声を録り直しても古い尺のまま使われ、
    # 字幕と音声がずれていた。見た目.txt も、同じ絵の上限や字幕の最短が
    # 割り当てに効くので入れる。
    # 画面表示_○○.txt も必ず入れること。
    # 章の行の4列目(その章がアニメの何話か)が、どの絵を選ぶかを決めるので、
    # ここを直したら割り当て表は作り直さないといけない。
    # 入れ忘れていたせいで、話数を書いても古い表が使われ、
    # 本人が その他/画像割り当て.tsv を手で消さないと効かなかった。
    srcs = [IMGPLAN, a.catalog, a.epmap, a.script, a.srt,
            a.audio, a.mitame, a.overlay, u"人物ルール.txt"]
    fp_now = inputs_fingerprint(srcs)
    newer = None
    if have and not stale:
        fp_old = plan_fingerprint_of(PLAN)
        if fp_old and fp_old != fp_now:
            newer = u"元のファイル"
            say(u"元になるファイルが変わったので、絵の割り当てを作り直します。")
            for a1, b1 in zip(fp_old.split(), fp_now.split()):
                if a1 != b1:
                    say(u"    %s  →  %s" % (a1, b1))
        elif not fp_old:
            # 古い割り当て表には指紋が無い。日付で判断する。
            newer = plan_is_outdated(PLAN, srcs)
            if newer:
                say(u"%s のほうが新しいので、絵の割り当てを作り直します。" % newer)
    if stale:
        bak = os.path.join(SONOTA_DIR, u"画像割り当て_旧.tsv")
        try:
            shutil.copy2(PLAN, os.path.join(HERE, bak))
            say(u"割り当て表が古い形式でした。%s に退避して作り直します。" % bak)
        except Exception:
            say(u"割り当て表が古い形式なので作り直します。")
        say(u"(絵の割り当ては 画像プラン.txt から復元されます)")
    if a.render and have and not stale and not newer:
        pass
    elif (not have) or a.plan or stale or newer:
        total = audio_duration(a.audio)
        cues = []

        # ★ まず音声そのものから時刻表を作る(subtitle.srt に頼らない)
        if not a.no_audio_timeline and os.path.exists(a.script):
            script = io.open(a.script, encoding="utf-8-sig", errors="replace").read()
            spoken = None
            if os.path.exists(a.tts_script):
                spoken = io.open(a.tts_script, encoding="utf-8-sig", errors="replace").read()
            globals()["LEAD"] = a.lead
            # 台本と subtitle.srt の中身がずれていないか、まず必ず見る。
            # (1行ずつの音声が無いときでも、ずれていれば言う)
            if not a.no_parts:
                _pd0, _pn0 = find_part_audio(HERE, a.audio)
            else:
                _pn0 = []
            check_script_vs_srt(script, a.srt, _pn0)
            # ① 1行ずつの音声が残っていれば、それを使う(推測ゼロ)
            if not a.no_parts:
                pdir, pnames = find_part_audio(HERE, a.audio)
                if pnames:
                    say(u"1行ずつの音声を見つけました: %s に %d個" % (pdir, len(pnames)))
                    sils0 = detect_silences(a.audio, a.noise_db, 0.05)
                    # ① subtitle.srt の本文が台本と完全に一致するときだけ使う
                    got, note = timeline_from_parts_srt(script, pdir, pnames, a.srt,
                                                        total, sils0, strict=True)
                    if got:
                        cues = got
                        JIKOKU[0] = u"① 音声＋subtitle.srt(本文一致) ＝ ずれません"
                        say(u"★ " + note)
                    else:
                        say(u"  (%s)" % note)
                        # ② subtitle.srt を使わず、音声の長さだけで組む(推測ゼロ)
                        got, note = timeline_from_parts(script, pdir, pnames, total, spoken)
                        if got:
                            cues = got
                            JIKOKU[0] = u"② 1行ずつの音声の実測 ＝ ずれません"
                            say(u"★ " + note)
                        else:
                            say(u"  (%s)" % note)
                            # ③ ここまで来たら、やむを得ず文字数で振り分ける
                            got, note = timeline_from_parts_srt(script, pdir, pnames,
                                                                a.srt, total, sils0)
                            if got:
                                cues = got
                                JIKOKU[0] = (u"③ 文字数で振り分け ＝ ずれます"
                                             u"（台本と音声が合っていません）")
                                say(u"")
                                say(u"⚠ 台本と subtitle.srt が食い違うので、文字数で振り分けました。")
                                say(u"   字幕・絵の切り替わりが、音声と少しずれます。")
                                say(u"   台本を直したあとは、1 で音声を作り直してください。")
                                say(u"   (subtitle.srt も一緒に作り直されます)")
                                say(u"")

            sils = [] if cues else detect_silences(a.audio, a.noise_db, 0.05)
            if sils:
                cues, note = timeline_from_audio(script, sils, total, spoken)
                JIKOKU[0] = u"④ 音声の無音から推測 ＝ 少しずれることがあります"
                say(u"音声から時刻表を作りました: " + note)
            elif not cues:
                say(u"音声に「間」が見つかりませんでした。--noise-db -40 などをお試しください。")

        if not cues:
            cues = parse_srt(a.srt) if os.path.exists(a.srt) else []
            if cues:
                JIKOKU[0] = u"⑤ subtitle.srt の時刻をそのまま ＝ ずれることがあります"
                say(u"subtitle.srt から時刻を読みました(音声からは作れませんでした)。")
        from_audio = bool(cues) and not a.no_audio_timeline and os.path.exists(a.script)
        if cues and not from_audio and not a.no_rescale:
            srt_end = cues[-1][1]
            cues, k = rescale_cues(cues, total)
            if k != 1.0:
                say(u"字幕の終わり %s と音声の長さ %s が違ったので、%.3f倍に直しました。"
                    % (mmss(srt_end), mmss(total), k))
                say(u"  (これをしないと、後半ほど発話と字幕がズレます)")
        # ここまでの切れ目は「実測から来たもの」。これを錨にして、
        # このあと文字数で割って増える切れ目だけを、あとで間に寄せ直す。
        ikari = []
        if cues:
            ikari = sorted(set([c[0] for c in cues] + [cues[-1][1]]))
        if cues:
            raw = len(cues)
            cues = refine_cues(cues, a.sec * 1.7, 30)
            if len(cues) > raw:
                say(u"字幕 %d本を、文の切れ目で %d本にほぐしました。" % (raw, len(cues)))
        if cues and not from_audio and not a.no_snap:
            sils = detect_silences(a.audio, a.noise_db, a.silence_len)
            if sils:
                cues, moved, worst = snap_to_silence(cues, sils, a.snap_tol, total)
                say(u"音声の「間」を %d箇所 見つけ、%d箇所の切れ目を実際の発話に合わせました。"
                    % (len(sils), moved))
                if worst > 0:
                    say(u"  いちばん大きかった補正: %.2f秒" % worst)
                # 合わせた結果、最後が音声より短い/長いときは末尾を伸ばす
                if cues and cues[-1][1] < total:
                    cues[-1] = (cues[-1][0], total, cues[-1][2])
                if cues:
                    ikari = sorted(set(ikari + [c[0] for c in cues]
                                       + [cues[-1][1]]))
            else:
                say(u"音声に「間」が見つかりませんでした(無音の判定を緩めるには --noise-db -40)。")
        slots = build_slots(cues, total, a.sec)
        if a.kuten:
            mae = len(slots)
            slots = split_by_kuten(slots, a.kuten_min, a.kuten_moji,
                                   tsunagi)
            if len(slots) != mae:
                say(u"句読点で割りました: %d枚 → %d枚 (1枚あたり %.1f秒)"
                    % (mae, len(slots), total / max(1, len(slots))))
                if a.kuten_moji:
                    say(u"   「。」は必ず切り、「、」は %d文字を超えないように切っています。"
                        % a.kuten_moji)
                else:
                    say(u"   「。」と「、」ごとに切っています(--kuten-moji で変えられます)。")
                if tsunagi:
                    say(u"   %d文字以下、または %.1f秒未満の切れ端は、後ろにくっつけています。"
                        % (tsunagi, a.kuten_min))
        # --- 文字数で割った切れ目を、本物の「間」に寄せ直す ---
        # ここをやらないと、段落の頭だけ合っていて途中がずれる。
        # 実測の切れ目(錨)は動かさないので、合っていた所が崩れることはない。
        if slots and not a.no_snap:
            sils_k = detect_silences(a.audio, a.noise_db, 0.08)
            if sils_k:
                slots, ugoita, ichiban = koma_awase(slots, ikari, sils_k,
                                                    tol=min(a.snap_tol, 0.9))
                if ugoita:
                    say(u"文字数で割った切れ目 %d か所を、本物の「間」に合わせ直しました"
                        u"（いちばん大きいもの %.2f秒）" % (ugoita, ichiban))
                else:
                    say(u"文字数で割った切れ目は、すでに「間」と合っていました。")
            else:
                say(u"音声に「間」が見つからず、切れ目は文字数のままです"
                    u"（--noise-db -40 で緩められます）。")

        picked = images
        if os.path.exists(a.imageplan):
            rules, default, focus = load_imageplan(a.imageplan)
            rules, default = plan_code_naosu(rules, default, images)
            if rules or default:
                cat = load_catalog(a.catalog, images)
                emap = load_epmap(a.epmap, images)
                _c0, chaps_for_assign = load_overlay(a.overlay) \
                    if os.path.exists(a.overlay) else (u"", [])
                picked = assign_images(slots, images, rules, default, cat,
                                       emap, focus, mitame=mi,
                                       chaps=chaps_for_assign)
        write_plan(PLAN, slots, picked, fp_now)
        say(u"音声 %s / 画像 %d枚 / 区切り %d枚ぶん" % (mmss(total), len(images), len(slots)))
        say(u"割り当て表を書き出しました: " + os.path.join(HERE, PLAN))
        if a.plan:
            say(u"中身を確認し、必要なら画像の列を直してから「動画を作る.bat」を実行してください。")
            return
    else:
        say(u"既存の割り当て表を使います: " + PLAN + u"(作り直すときは --plan)")
        JIKOKU[0] = (u"⑥ 前回の割り当て表をそのまま使用"
                     u" ＝ 音声を録り直していれば、ずれます")

    rows = read_plan(PLAN)

    # --- 画像の列に短い番号(3-11-056)が書かれていたら、絵の名前に直す ---
    # 本人が表を直すときは、長いファイル名を打つより番号のほうが速い。
    naoshita, fumei = 0, []
    for i, (du, img, tx) in enumerate(rows):
        if img.startswith(u"@@") or img in imgpath or os.path.isabs(img):
            continue
        if u"/" in img and not code_norm(img):
            continue
        atta = code_to_img(img, images)
        if atta:
            rows[i] = (du, atta, tx)
            naoshita += 1
        elif code_norm(img):
            fumei.append(u"%d番の %s" % (i + 1, img))
    if naoshita:
        say(u"割り当て表の短い番号 %d個を、絵に読みかえました" % naoshita)
    for t in fumei:
        say(u"  × " + t + u" に当たる絵が画像フォルダにありません")

    # --- 番号で指定された差し替えを当てる（本人の指定がいちばん上） ---
    # 本人が読む番号は 確認用/一覧.txt と コマ一覧（章カードも1コマ）なので、
    # ここで同じ番号にそろえてから当てる。
    en = load_enshutsu(a.enshutsu)
    _credit0, chaps0 = load_overlay(a.overlay) if os.path.exists(a.overlay) \
        else (u"", [])
    kaado = card_basho(rows, chaps0) \
        if (en.get("card") and chaps0 and not a.no_fx) else []
    ban, card_ban = toshi_bangou(rows, kaado)
    kae = load_sashikae(os.path.join(HERE, SASHIKAE), images)
    if kae:
        kaeta = 0
        for no, img2 in sorted(kae.items()):
            if no in card_ban:
                say(u"  差し替え: %d番は章タイトルのカード「%s」です。"
                    u"ここは入れ替えられません" % (no, card_ban[no]))
                continue
            if no not in ban:
                say(u"  差し替え: %d番はありません（いちばん大きい番号は %d）"
                    % (no, max(ban) if ban else 0))
                continue
            i = ban[no]
            du, _mae2, tx2 = rows[i]
            rows[i] = (du, img2, tx2)
            say(u"  差し替え: %3d番「%s」→ %s"
                % (no, (tx2.strip() or u"（セリフなし）")[:22], img_code(img2) or img2))
            kaeta += 1
        say(u"差し替え.txt のとおり %d枚を入れ替えました（番号で指定されたもの）" % kaeta)
    elif not os.path.exists(os.path.join(HERE, SASHIKAE)):
        io.open(os.path.join(HERE, SASHIKAE), "w", encoding="utf-8",
                newline="\r\n").write(SASHIKAE_ATAMA)

    # --- 画像を出力サイズにそろえる(同じ絵は1回だけ) ---
    work = os.path.join(HERE, SONOTA_DIR, "_work")
    norm = os.path.join(work, "norm")
    if not os.path.isdir(norm):
        os.makedirs(norm)
    uniq = []
    for (_, img, _t) in rows:
        if img not in uniq:
            uniq.append(img)
    say(u"画像を %dx%d にそろえています (%d枚)…" % (w, h, len(uniq)))
    cache = {}
    # 絵を横に動かすときは、あらかじめ大きめにそろえておく。
    # 断片を作るときに、その大きいほうから画面ぶんを切り出して動かす。
    ugokasu = unicode_bool(mi.get(u"画像を動かす", u"はい"))
    kakudai = max(1.0, min(1.5, float(mi.get(u"画像の拡大", 1.10))))
    nw, nh = w, h
    if ugokasu:
        nw = int(round(w * kakudai)); nw -= nw % 2
        nh = int(round(h * kakudai)); nh -= nh % 2
    for img in uniq:
        src = img if os.path.isabs(img) else imgpath.get(img, os.path.join(a.images, img))
        if not os.path.exists(src):
            die(u"画像が見つかりません: " + src + u"  (割り当て表の名前を確認してください)")
        key = u"%s|%d|%d|%dx%d|%s" % (os.path.abspath(src), os.path.getsize(src),
                                      int(os.path.getmtime(src)), nw, nh, a.fit)
        dst = os.path.join(norm, hashlib.md5(key.encode("utf-8")).hexdigest()[:16] + ".png")
        if not os.path.exists(dst):
            normalize(src, dst, nw, nh, a.fit)
        cache[img] = dst

    # --- 章タイトルのカードを、章の頭にはさむ ---
    # 1.5秒ぶん尺が増えるので、あとで音声にも同じだけ無音を入れる。
    # 入れないと、ここから先がまるごとずれる。
    cards = {}          # 新しい並びでの位置 -> 章の名前
    # 場所は差し替えの前に求めてある（番号を合わせるため）。同じものを使う。
    card_moto = list(kaado)
    if card_moto:
        # 章ごとに、カードに向いた絵をその章の中から選び直す
        cat_for_card = load_catalog(a.catalog, images) \
            if os.path.exists(a.catalog) else {}
        kugiri = [x[0] for x in card_moto] + [len(rows)]
        card_moto = [(ii, card_no_e(rows, ii, kugiri[n + 1], ti, cat_for_card), ti)
                     for n, (ii, ti) in enumerate(card_moto)]
        cdir = os.path.join(HERE, SONOTA_DIR, "card")
        if not os.path.isdir(cdir):
            os.makedirs(cdir)
        byou = en["card_byou"]
        atarashii, zure = [], 0
        ci, nuketa = 0, 0
        for i, row in enumerate(rows):
            while ci < len(card_moto) and card_moto[ci][0] == i:
                _, moto, title = card_moto[ci]
                key = u"@@card%02d" % ci
                png = os.path.join(cdir, "card%02d.png" % ci)
                _, ok = make_card(cache[moto], png, w, h,
                                  en["card_iro"], en["card_hidari"],
                                  nuki=en.get("card_nuki", True))
                if ok:
                    nuketa += 1
                cache[key] = png
                cards[len(atarashii)] = title
                atarashii.append((byou, key, u""))
                ci += 1
            atarashii.append(row)
        rows = atarashii
        say(u"章タイトルのカードを %d枚 はさみました (1枚 %.1f秒)"
            % (len(cards), byou))
        say(u"  うち %d枚は背景を消してキャラだけにしました（残り %d枚は"
            u"抜けなかったので絵のまま）" % (nuketa, len(cards) - nuketa))

    # --- 切り替わりをフレームにそろえる(絵と字幕を1フレームも狂わせない) ---
    fps = a.fps
    ends, cum = [], 0.0
    for (du, _img, _t) in rows:
        cum += du
        ends.append(int(round(cum * fps)) / float(fps))
    for i in range(1, len(ends)):                 # 最低1フレームは確保する
        if ends[i] <= ends[i - 1]:
            ends[i] = ends[i - 1] + 1.0 / fps
    starts = [0.0] + ends[:-1]

    # --- 字幕(ASS) ---
    total = ends[-1]
    font = a.font or mi[u"フォント"]
    size = a.sub_size or max(24, int(round(min(w, h)
                                          / max(6.0, mi[u"字幕の大きさ"]))))
    sub_chars = a.sub_chars or int(mi[u"字幕の1行"])
    sub_lines = a.sub_lines or max(1, int(mi[u"字幕の行数"]))
    credit, chaps = u"", []
    ov_aru = os.path.exists(a.overlay)
    if ov_aru:
        credit, chaps = load_overlay(a.overlay)
    if a.credit is not None:
        credit = a.credit

    # 字幕は割り当て表からそのまま作るので、絵の切り替わりと必ず一致する
    cues = []
    for i, (_du, _img, tx) in enumerate(rows):
        if tx.strip():
            cues.append((starts[i], ends[i], tx.strip()))

    ass = None
    if not a.no_sub:
        if not cues:
            say(u"割り当て表にセリフが入っていないので、字幕は焼き込みません。")
        else:
            spans = chapter_spans(cues, chaps, total) if chaps else []
            ass = os.path.join(work, "burn.ass")
            card_ev = [(starts[i], ends[i], cards[i]) for i in sorted(cards)]
            n = write_ass(cues, ass, w, h, font, size, sub_chars, sub_lines,
                          credit=credit, chapters=spans, total=total,
                          safe_bottom=a.safe_bottom, hook_until=a.hook_sec,
                          mi=mi, cards=card_ev, hidari=en["card_hidari"])
            dup = sum(1 for i in range(1, len(cues))
                      if cues[i][2] == cues[i - 1][2])
            say(u"字幕を焼き込みます (%d枚 / %s %dpx / 画像1枚につき字幕1つ)"
                % (n, font, size))
            longest = max(len(c[2]) for c in cues)
            say(u"  いちばん長いセリフ %d文字 / 同じ字幕の連続 %d箇所" % (longest, dup))
            if credit:
                say(u"  左上の引用: " + credit)
            if spans:
                say(u"  右上のチャプター: %d本" % len(spans))
                for (st, _en, t) in spans:
                    say(u"    %s  %s" % (mmss(st), t.replace(u"\\N", u" / ")))
            hookae = len(chaps) - len(spans)
            if chaps and hookae:
                say(u"  台本に見つからなかったチャプターのキーワード %d本:" % hookae)
                atta = set(t for (_s, _e, t) in spans)
                for (key, title, _eps) in chaps:
                    if title not in atta:
                        say(u"    × %-16s → %s" % (key, title.replace(u"\\N", u" / ")))
            TARINAI.extend(kakete_iru(a, mi_aru, ov_aru, credit, chaps, spans))
            TARINAI.extend(font_shirabe(font))

    # --- プレビュー(1枚だけ) ---
    if a.preview is not None:
        if not ass:
            die(u"字幕が無いのでプレビューできません。")
        if a.preview < 0:
            cue = max(cues, key=lambda c: len(c[2]))
            say(u"いちばん長いセリフでプレビューします。")
        else:
            cue = min(cues, key=lambda c: abs(c[0] - a.preview))
        img = rows[0][1]
        for i, (_du, im, _t) in enumerate(rows):
            if ends[i] > cue[0]:
                img = im
                break
        one = os.path.join(work, "preview.ass")
        sp = chapter_spans(cues, chaps, total) if chaps else []
        here_title = [t for (st, en, t) in sp if st <= cue[0] < en]
        write_ass([(0.0, 5.0, cue[2])], one, w, h, font, size,
                  sub_chars, sub_lines, credit=credit,
                  chapters=[(0.0, 5.0, here_title[0])] if here_title else [],
                  total=5.0, mi=mi)
        out = os.path.join(SONOTA_DIR, u"プレビュー.png")
        run([need("ffmpeg"), "-y", "-loglevel", "error", "-i", cache[img],
             "-vf", "subtitles=" + ass_path(one), "-frames:v", "1", out])
        say(u"")
        say(u"プレビューを作りました: " + os.path.join(HERE, out))
        say(u"  セリフ: " + cue[2][:40])
        say(u"  文字を大きくするなら  --sub-size 58 、1行を短くするなら  --sub-chars 22")
        return

    # --- 書き出し ---
    # fps=... を先に通すこと。concatの出力は1枚につき1フレームしかないので、
    # 先に subtitles を置くと「絵1枚につき字幕1枚」が固定されてズレる。
    # silent.mp4 は 1枚=Nフレームで作った固定フレームレートの動画なので、
    # subtitles は毎フレーム正しく評価される。
    vf = ("subtitles=" + ass_path(ass) + ",format=yuv420p") if ass \
         else "format=yuv420p"
    # --- 1枚ずつ「ちょうどNフレーム」の断片にして、それを連結する ---
    # concatデマルチプレクサに秒で尺を渡すと、入力の時間単位に丸められて
    # 後半ほどズレる。フレーム数で作れば1フレームも狂わない。
    segdir = os.path.join(work, "seg")
    if not os.path.isdir(segdir):
        os.makedirs(segdir)
    frames = [int(round((ends[i] - starts[i]) * fps)) for i in range(len(rows))]
    frames = [max(1, n) for n in frames]

    # 演出(区切りの種類ごとのエフェクトと効果音)
    kinds = kimeru_basho(rows, starts, chaps, en) if en["kubun"] else {}
    # カードそのものが章の切れ目なので、カードに演出を付け、
    # カードの直後の絵には付けない（2回続けて鳴るのを防ぐ）
    for ci in sorted(cards):
        kinds[ci] = u"章カード"
        kinds.pop(ci + 1, None)
    if cards:
        en["kubun"][u"章カード"] = {"se": en["card_se"], "fx": en["card_fx"],
                                    "dur": min(0.6, en["card_byou"] * 0.4)}
    if a.no_fx:
        kinds = {}

    segcache, seglist = {}, []
    say(u"断片を作っています (%d本)…" % len(rows))
    if kinds:
        tally = {}
        for k in kinds.values():
            tally[k] = tally.get(k, 0) + 1
        say(u"  演出: " + u" / ".join(
            u"%s %d か所(%s)" % (k, tally[k], en["kubun"].get(k, {}).get("fx", u"-"))
            for k in sorted(tally, key=lambda x: -tally[x])))

    # --- 絵を横に動かす速さを決める ---
    #
    # いちばん長く映る絵でも右端を越えない速さにし、それを全部の絵で使う。
    # 章カードは動かさない（左右で絵と文字を分けているので、動くと崩れる）。
    kyori, hayasa, yoko, tate = 0, 0.0, 0, 0
    muki = {}
    if ugokasu:
        nagai = max((frames[i] / float(fps))
                    for i in range(len(rows))
                    if not rows[i][1].startswith(u"@@")) if rows else 0.0
        bai = max(0.05, min(1.0, float(mi.get(u"動きの速さ", 0.75))))
        kyori, hayasa, yoko, tate = pan_kesan(w, h, kakudai, nagai, bai)
        if kyori:
            mae = None
            for i in range(len(rows)):
                if rows[i][1].startswith(u"@@"):
                    continue          # 章カードは動かさない
                mae = pan_muki(i, mae)
                muki[i] = mae
            kazu = {}
            for m in muki.values():
                kazu[m] = kazu.get(m, 0) + 1
            say(u"絵を動かします: %.2f倍に広げ、余り 横%dpx 縦%dpx。"
                u"小さいほうの %dpx を全方向の距離にそろえます" % (kakudai, yoko, tate, kyori))
            say(u"  いちばん長い %.2f秒 で使い切る速さの %.2f倍（毎秒 %.1fpx）/ "
                u"2秒の絵なら %.0fpx（画面の %.1f%%）"
                % (nagai, bai, hayasa, min(kyori, hayasa * 2),
                   100.0 * min(kyori, hayasa * 2) / w))
            say(u"  方向はバラバラ（直前とはちがう向き）: "
                + u" / ".join(u"%s %d枚" % (m, kazu.get(m, 0)) for m in PAN_MUKI))
        else:
            ugokasu = False

    def pan_chain(label_in, label_out, m):
        u"""大きい絵から画面ぶんを切り出す。m が向き（None なら動かさない）。

        crop の x / y に t を入れると1コマずつ計算し直してくれる。
        min / max で止めてあるので、どの向きでも端を越えない。
        動く帯は余りの**まん中**に置くので、絵の中心から大きく外れない。
        """
        x0 = (yoko - kyori) / 2.0          # 横に動く帯の左端
        y0 = (tate - kyori) / 2.0          # 縦に動く帯の上端
        susumu = u"min(%d,%.4f*t)" % (kyori, hayasa)
        if m == u"左へ":        # 絵が左へ流れる＝切り出しが右へ進む
            x, y = u"'%.1f+%s'" % (x0, susumu), u"%.1f" % (tate / 2.0)
        elif m == u"右へ":
            x, y = u"'%.1f-%s'" % (x0 + kyori, susumu), u"%.1f" % (tate / 2.0)
        elif m == u"上へ":
            x, y = u"%.1f" % (yoko / 2.0), u"'%.1f+%s'" % (y0, susumu)
        elif m == u"下へ":
            x, y = u"%.1f" % (yoko / 2.0), u"'%.1f-%s'" % (y0 + kyori, susumu)
        else:
            x, y = u"(iw-%d)/2" % w, u"(ih-%d)/2" % h
        return u"[%s]crop=%d:%d:x=%s:y=%s[%s];" % (label_in, w, h, x, y, label_out)

    shigoto = []          # あとでまとめて作る断片
    for i, (_du, img, _t) in enumerate(rows):
        spec = en["kubun"].get(kinds.get(i)) if i in kinds else None
        need_mae, fil = (False, None)
        if spec:
            # 尺より長いエフェクトはかけられない
            d = min(spec["dur"], (frames[i] / float(fps)) * 0.6)
            need_mae, fil = fx_filter(spec["fx"], d)
        mae = cache[rows[i - 1][1]] if (need_mae and i > 0) else None
        if need_mae and mae is None:
            fil = None
        # 章カードは元から画面ぴったりの大きさなので、切り出しも動きもしない
        kore = muki.get(i) if ugokasu else None
        if ugokasu:
            pan = pan_chain(u"0:v", u"c0", kore)
            if mae is not None:
                pan += pan_chain(u"1:v", u"c1", None)
            if fil:
                fil = pan + fil.replace(u"[0:v]", u"[c0]").replace(u"[1:v]", u"[c1]")
        key = (cache[img], frames[i], mae, fil, kore)
        seg = segcache.get(key)
        if seg is None:
            seg = os.path.join(segdir, "s%05d.mp4" % len(segcache))
            cmd = [need("ffmpeg"), "-y", "-loglevel", "error",
                   "-loop", "1", "-framerate", str(fps), "-i", cache[img]]
            if fil:
                if mae:
                    cmd += ["-loop", "1", "-framerate", str(fps), "-i", mae]
                cmd += ["-filter_complex", fil, "-map", "[v]"]
            elif ugokasu:
                cmd += ["-vf", pan_chain(u"0:v", u"v", kore)
                        .replace(u"[0:v]", u"").rstrip(u";").replace(u"[v]", u"")]
            cmd += ["-frames:v", str(frames[i]),
                    "-c:v", "libx264", "-preset", a.seg_preset,
                    "-crf", str(max(12, a.crf - 6)),
                    "-pix_fmt", "yuv420p", "-g", str(fps * 2), "-an", seg]
            shigoto.append(cmd)
            segcache[key] = seg
        seglist.append(seg)

    # 断片づくりは1本ずつが短いので、並べて走らせるとそのぶん速くなる。
    # 絵も長さも違う独立した仕事なので、順番は結果に関係しない。
    if shigoto:
        # 実測：4コアで 4本同時=1.57倍 / 6本同時=1.96倍。
        # ffmpeg 自体がスレッドを使うので、コア数ちょうどより
        # 少し多めに走らせたほうが速かった。
        nin = a.jobs if a.jobs > 0 else \
            max(2, min(8, int((os.cpu_count() or 2) * 1.5)))
        say(u"  %d本を %d個ずつ並べて作ります" % (len(shigoto), nin))
        t_seg = time.time()
        if nin <= 1:
            for c in shigoto:
                run(c)
        else:
            from concurrent.futures import ThreadPoolExecutor
            shippai = []
            with ThreadPoolExecutor(max_workers=nin) as ex:
                for cmd, r in zip(shigoto, ex.map(_run_quiet, shigoto)):
                    if r is not None:
                        shippai.append((cmd, r))
            if shippai:
                say(shippai[0][1][-2000:])
                die(u"断片を作れませんでした（%d本）。" % len(shippai))
        say(u"  断片 %.1f秒" % (time.time() - t_seg))

    lst = os.path.join(work, "list.txt")
    with io.open(lst, "w", encoding="utf-8", newline="\n") as f:
        for seg in seglist:
            f.write(u"file '%s'\n" % seg.replace("\\", "/").replace("'", "'\\''"))

    silent = os.path.join(work, "silent.mp4")
    run([need("ffmpeg"), "-y", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
    say(u"  合計 %d フレーム = %.3f秒" % (sum(frames), sum(frames) / float(fps)))


    # 効果音と BGM を、それぞれ1本のwavにして声に重ねる。
    # amix は normalize=0 にしないと声の音量が下がってしまう。
    # duration=first なので、声の長さは1サンプルも変わらない。
    oto = a.audio
    # カードぶんの無音を、声にも入れる。
    # 入れる位置は「そのカードより前の、カード以外の尺の合計」。
    if cards:
        basho, moto_t = [], 0.0
        for i in range(len(rows)):
            if i in cards:
                basho.append((moto_t, (ends[i] - starts[i])))
            else:
                moto_t += ends[i] - starts[i]
        shizuka = insert_silence(a.audio, os.path.join(work, "koe_card.wav"), basho)
        if shizuka:
            oto = shizuka
            say(u"  章タイトルのぶん、声に無音を %.1f秒 入れました (%d か所)"
                % (sum(b for _a, b in basho), len(basho)))
        else:
            say(u"  ⚠ 声に無音を入れられませんでした。カードのぶんだけずれます。")
    kasaneru = []          # 声に重ねるもの
    uchikomi, secache, sekazu = [], {}, {}
    for i, k in kinds.items():
        spec = en["kubun"].get(k)
        if not spec:
            continue
        wav, atk = se_wav_ready(spec["se"], en["sevol"], work, secache)
        if wav:
            uchikomi.append((starts[i], wav, atk))
            sekazu[spec["se"]] = sekazu.get(spec["se"], 0) + 1
    if uchikomi:
        trk = build_se_track(uchikomi, sum(frames) / float(fps),
                             os.path.join(work, "se_track.wav"),
                             zure=en.get("sezure", 0.0))
        if trk:
            kasaneru.append(trk)
            say(u"  効果音: " + u" / ".join(u"%s %d回" % (n, c)
                                        for n, c in sorted(sekazu.items())))

    if en.get("bgm") and not a.no_bgm:
        eizou = sum(frames) / float(fps)
        koe = audio_duration(oto)
        bgm = bgm_wav_ready(en["bgm"], en["bgmvol"],
                            max(eizou, koe), min(eizou, koe),
                            en["bgmfade"], work)
        if bgm:
            if en.get("bgmduck"):
                bgm = bgm_hikaeme(bgm, oto, max(eizou, koe), work)
            kasaneru.append(bgm)
            say(u"  BGM: %s (音量 %.2f / フェード %.1f秒%s)"
                % (en["bgm"], en["bgmvol"], en["bgmfade"],
                   u" / 声の間は控えめ" if en.get("bgmduck") else u""))

    if kasaneru:
        mixed = os.path.join(work, "mixed.wav")
        cmd = [need("ffmpeg"), "-y", "-loglevel", "error", "-i", oto]
        for w in kasaneru:
            cmd += ["-i", w]
        n = len(kasaneru) + 1
        cmd += ["-filter_complex",
                "%samix=inputs=%d:duration=first:normalize=0[a]"
                % ("".join("[%d:a]" % i for i in range(n)), n),
                "-map", "[a]", mixed]
        run(cmd)
        oto = mixed

    say(u"動画を書き出しています (%s / crf %d)。長さ次第で数分かかります…"
        % ((a.preset or mi[u"書き出しの速さ"]), a.crf))
    tmp_out = os.path.join(work, "out.mp4")
    run_live([need("ffmpeg"), "-y", "-loglevel", "error", "-stats",
         "-i", silent,
         "-i", oto,
         "-map", "0:v:0", "-map", "1:a:0",
         "-vf", vf,
         "-c:v", "libx264", "-preset", (a.preset or mi[u"書き出しの速さ"]),
         "-crf", str(a.crf),
         "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart", tmp_out])

    # 完成.mp4 がプレイヤーで開かれていても、書き出しを捨てずに済ませる
    final = a.out
    try:
        os.replace(tmp_out, final)
    except OSError:
        base, ext = os.path.splitext(a.out)
        final = None
        for k in range(2, 30):
            cand = u"%s_%d%s" % (base, k, ext)
            try:
                os.replace(tmp_out, cand)
                final = cand
                break
            except OSError:
                continue
        say(u"")
        if final:
            say(u"%s が他のソフトで開かれているようです。" % a.out)
            say(u"代わりに %s として保存しました。" % final)
            say(u"プレイヤーを閉じてから実行すると、%s に上書きされます。" % a.out)
        else:
            die(u"%s を保存できませんでした。プレイヤーなどを閉じてもう一度お試しください。"
                % a.out)

    say(u"")
    say(u"完成しました: " + os.path.join(HERE, final))
    say(u"字幕と音声のタイミング: " + JIKOKU[0])
    if TARINAI:
        say(u"")
        say(u"  ⚠ 指定した見た目が入っていません。足りないもの %d件:" % len(TARINAI))
        for x in TARINAI:
            say(u"     ・" + x)
        say(u"     掲示板から制作パックを落としなおすと、そろいます。")
    if JIKOKU[0].startswith(u"⑥"):
        say(u"")
        say(u"  ⚠ 絵の割り当ては前回のものをそのまま使いました。")
        say(u"     音声や設定を変えたのに絵や尺が古いときは、")
        say(u"     画像割り当て.tsv を消すか --plan を付けて作り直してください。")
        say(u"")
    if JIKOKU[0].startswith(u"③"):
        say(u"")
        say(u"  ⚠ 字幕と音声がずれています。台本を直したのに音声が古いままです。")
        say(u"     メニューの 1 で音声を作り直すと直ります。")
        say(u"     (絵の割り当てや句読点の設定を変えても、このずれは直りません)")
        say(u"")
    # 一覧.txt は必ず書く（採点に要る・ほぼ一瞬）。
    # 1枚ずつの動画は --cuts のときだけ（255本で何分もかかる）。
    try:
        if a.cuts:
            write_cuts(final, rows, starts, ends, chaps=chaps)
        else:
            write_ichiran(rows, starts, ends, chaps=chaps)
        koma_ichiran(rows, starts, ends, cache)
    except Exception as e:
        say(u"確認用の書き出しはできませんでした: %s" % e)
    say(u"絵を差し替えたいときは 画像割り当て.tsv を直して、もう一度 batを実行してください。")


if __name__ == "__main__":
    main()
