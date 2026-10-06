# -*- coding: utf-8 -*-
u"""画像をぜんぶ見て、1枚ずつ説明をつける。

    python miru.py --images "C:\\Youtube動画\\無職転生\\画像\\高画質"

できあがるのは 画像カタログ.txt（どの絵に誰が・何が写っているか）です。
画像プラン.txt の #ロキシー 迷宮 のような指定は、ここから絵を探します。

■ 見る方法は2つ
  local (既定) … あなたのPCの中で Ollama を動かす。お金はかからない。
                  そのかわり時間がかかり、キャラ名は「見た目→名前」の
                  対応表で決める（下の RULES）。
  api          … Claude API に送る。精度は高いがお金がかかる。
                  使うときだけ --engine api を付ける。

■ 何度でも実行してよい
  一度説明をつけた画像は飛ばすので、2回目からは増えたぶんだけ見ます。
  途中で止めても、そこまでの結果はファイルに残ります。

■ local を使う準備（1回だけ）
  1. https://ollama.com/download から Ollama を入れる
  2. このメニューの「8」を選ぶ。モデルが無ければ選んで入れられます
     （手で入れるなら  ollama pull qwen2.5vl:3b  など）
"""

import argparse
import base64
import io
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")

IMGDIR_DEFAULT = u"C:\\Youtube動画\\無職転生\\画像\\高画質"
CATALOG = u"画像カタログ.txt"
EPMAP = u"話数マップ.txt"
KEYFILE = u"APIキー.txt"

OLLAMA = "http://127.0.0.1:11434"
SIDE = 448                 # 送る前に長辺をこの大きさにする
API_MODEL = "claude-opus-5"
API_PER_REQUEST = 10


LOG = []
LOGGING = [False]


def say(t):
    if LOGGING[0]:
        LOG.append(t)
    try:
        print(t)
    except UnicodeEncodeError:
        print(t.encode("utf-8", "replace").decode("utf-8", "replace"))
    sys.stdout.flush()


def log_start():
    del LOG[:]
    LOGGING[0] = True


def log_save(path):
    """控えを Python が自分で書く。

    PowerShell に渡して保存させると、文字コードの違いで日本語が
    まるごとこわれることがある。
    """
    LOGGING[0] = False
    try:
        io.open(path, "w", encoding="utf-8-sig", newline="").write(
            u"\r\n".join(LOG) + u"\r\n")
        say(u"")
        say(u"%s に保存しました。これをチャットに貼ってください。" % path)
    except Exception as e:
        say(u"控えを保存できませんでした: %s" % e)


def die(t):
    say(u"")
    say(u"!! " + t)
    sys.exit(1)


def natkey(name):
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r"(\d+)", name)]


# ══════════════════════════════ 画像を集める / まとめる

def walk_images(root):
    out = []
    for cur, dirs, files in os.walk(root):
        dirs.sort(key=natkey)
        rel = os.path.relpath(cur, root)
        rel = u"" if rel == "." else rel.replace(os.sep, u"/")
        for n in sorted([x for x in files if x.lower().endswith(EXTS)], key=natkey):
            if n.startswith(u"_"):
                continue
            out.append((rel + u"/" + n) if rel else n)
    return out


def dhash(Image, path, size=8):
    im = Image.open(path).convert("L").resize((size + 1, size), Image.LANCZOS)
    px = im.tobytes()
    bits = 0
    for r in range(size):
        row = px[r * (size + 1):(r + 1) * (size + 1)]
        for c in range(size):
            bits = (bits << 1) | (1 if row[c] < row[c + 1] else 0)
    return bits


def load_hash_cache(root):
    p = os.path.join(root, u"_hash.tsv")
    out = {}
    if os.path.exists(p):
        for ln in io.open(p, encoding="utf-8-sig", errors="replace"):
            ln = ln.rstrip(u"\r\n")
            if u"\t" in ln:
                k, v = ln.split(u"\t", 1)
                try:
                    out[k] = int(v)
                except ValueError:
                    pass
    return out


def save_hash_cache(root, table):
    try:
        with io.open(os.path.join(root, u"_hash.tsv"), "w",
                     encoding="utf-8-sig", newline="\r\n") as f:
            for k in sorted(table, key=natkey):
                f.write(u"%s\t%d\r\n" % (k, table[k]))
    except Exception:
        pass


def group_similar(root, names, dist):
    """同じフォルダで続いている、よく似た絵をひとまとめにする。"""
    try:
        from PIL import Image
    except ImportError:
        die(u"Pillow が要ります:  pip install pillow")
    cache = load_hash_cache(root)
    todo = [n for n in names if n not in cache]
    if todo:
        say(u"絵の形を調べています (%d枚)…" % len(todo))
        for i, n in enumerate(todo):
            try:
                cache[n] = dhash(Image, os.path.join(root, n.replace(u"/", os.sep)))
            except Exception:
                cache[n] = -1
            if (i + 1) % 1000 == 0:
                say(u"    %d / %d" % (i + 1, len(todo)))
        save_hash_cache(root, cache)
    groups, rep, members, prev = [], None, [], None
    for n in names:
        h = cache.get(n, -1)
        same = prev is not None and prev[0].rsplit(u"/", 1)[0] == n.rsplit(u"/", 1)[0]
        near = same and h >= 0 and prev[1] >= 0 and bin(h ^ prev[1]).count("1") <= dist
        if near:
            members.append(n)
        else:
            if rep:
                groups.append((rep, members))
            rep, members = n, [n]
        prev = (n, h)
    if rep:
        groups.append((rep, members))
    return groups


def nokori(sec):
    """残り時間を、時間と分で言う。何百分と言われても見当がつかない。"""
    m = int(sec / 60) + 1
    if m < 90:
        return u"%d分" % m
    return u"%d時間%d分" % (m // 60, m % 60)


def spread_groups(groups):
    """見る順番を、話数をまたいで順ぐりにする。

    頭から順に見ていくと、途中で止まったとき後ろの話数が丸ごと空になる。
    順ぐりなら、どこで止まってもどの話数も同じくらい埋まっているので、
    そこまでの結果だけでも話数の割り出しに使える。
    """
    by = {}
    for g in groups:
        by.setdefault(g[0].split(u"/")[0] if u"/" in g[0] else u"", []).append(g)
    fols = sorted(by, key=natkey)
    out, i = [], 0
    while len(out) < len(groups):
        for f in fols:
            if i < len(by[f]):
                out.append(by[f][i])
        i += 1
    return out


# ══════════════════════════════ カタログ

SKIP = u"見られなかった画像.txt"

# 説明の形の版。欄を足したらここを上げる。
#
# 上げたあと `python miru.py --入れ直す` を走らせると、
# **全部の絵をもう一度見て、新しい形の説明を付け直す。**
# 途中で止めても、済みの控えがあるので続きから進む
# （6000枚を何時間もかけて見るので、やり直しになると困る）。
SETSUMEI_BAN = u"3"
SUMI = u"画像カタログ_済み_v%s.txt" % SETSUMEI_BAN


def tsuika_sumi(path, keys, lock):
    u"""新しい形で説明を付け終えた絵を、控えに書き足す。"""
    if not keys:
        return
    with lock:
        with io.open(path, "a", encoding="utf-8", newline="") as f:
            for k in keys:
                f.write(k + u"\r\n")


def read_skip(path):
    """何度やっても見られなかった画像の一覧を読む。"""
    out = set()
    if not os.path.exists(path):
        return out
    for ln in io.open(path, encoding="utf-8-sig", errors="replace"):
        ln = ln.strip()
        if ln and not ln.startswith(u"#"):
            out.add(ln)
    return out


def read_done(path):
    done = set()
    if not os.path.exists(path):
        return done
    for ln in io.open(path, encoding="utf-8-sig", errors="replace"):
        ln = ln.rstrip(u"\r\n")
        if not ln.strip() or ln.lstrip().startswith(u"#") or u"\t" not in ln:
            continue
        done.add(ln.split(u"\t", 1)[0].strip())
    return done


CATALOG_HEAD = u"""# 画像カタログ（この画像に何が写っているか の一覧）
#
# 書式:  目印 <タブ> 説明（空白区切りでいくつでも）
#
# 画像プラン.txt で #ロキシー 迷宮 のように書くと、ここから絵を探します。
# 「使用不可」と付いた画像は、クレジット・実写など動画に出せないものです。
#
# この下は miru.py が書き足します。手で直しても構いません
# （同じ目印の行があると、その画像はもう見に行きません）。
#
# 目印\t説明
"""


def append_catalog(path, rows, lock):
    with lock:
        new = not os.path.exists(path)
        with io.open(path, "a", encoding="utf-8-sig" if new else "utf-8",
                     newline="") as f:
            if new:
                f.write(CATALOG_HEAD.replace(u"\n", u"\r\n"))
            for k, d in rows:
                f.write(k + u"\t" + d + u"\r\n")


def rebuild_epmap(catalog_path, epmap_path):
    if not os.path.exists(catalog_path):
        return
    per, tot = {}, {}
    for ln in io.open(catalog_path, encoding="utf-8-sig", errors="replace"):
        ln = ln.rstrip(u"\r\n")
        if not ln.strip() or ln.lstrip().startswith(u"#") or u"\t" not in ln:
            continue
        k, d = ln.split(u"\t", 1)
        if u"/" not in k:
            continue
        fol = k.split(u"/")[0]
        per.setdefault(fol, {})
        tot[fol] = tot.get(fol, 0) + 1
        for w in d.split():
            if w in (u"使用不可", u"文字あり", u"きわどい", u"実写"):
                continue
            per[fol][w] = per[fol].get(w, 0) + 1
    if not per:
        return
    head = u"""# 話数マップ ─ どの話数に何があるか（miru.py が自動で作ります）
#
# 書式:  フォルダ名 <タブ> 説明（空白区切り）
#
# 画像カタログ.txt を話数ごとに数えて、その話数によく出る言葉を多い順に
# 並べたものです。「語:枚数」の形で、何枚に出たかも書いてあります。
# #指定でカタログに当たりが無かったときと、話数調べ(メニュー7)で使われます。
#
# フォルダ名\t説明
"""
    with io.open(epmap_path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(head.replace(u"\n", u"\r\n"))
        for fol in sorted(per, key=natkey):
            ws = sorted(per[fol].items(), key=lambda x: (-x[1], x[0]))
            # 語のうしろに「何枚に出たか」を付ける。
            # 1枚だけ写っている人と、半分の絵に写っている人を
            # 同じ重みで扱うと、話数が当てられない。
            # _枚数 はその話数の総枚数。「何%の絵に写っているか」を出すのに要る
            cells = [u"_枚数:%d" % tot.get(fol, 0)]
            cells += [u"%s:%d" % (w, c) for w, c in ws[:40]]
            f.write(fol + u"\t" + u" ".join(cells) + u"\r\n")
    say(u"話数マップ.txt を作り直しました (%d話)" % len(per))


# ══════════════════════════════ 画像を送れる形にする

def encode(path, side):
    from PIL import Image
    im = Image.open(path)
    if im.mode != "RGB":
        im = im.convert("RGB")
    im.thumbnail((side, side), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=78)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


# ══════════════════════════════ local: Ollama に聞く
#
# 小さいモデルにアニメのキャラ名を当てさせるのは無理があるので、
# 「見た目」だけを決まった選択肢から選ばせて、名前はこちらの対応表で決める。

SCHEMA = {
    "type": "object",
    "properties": {
        "people":     {"type": "integer"},
        "hair_color": {"type": "string",
                       "enum": ["blue", "red", "green", "blonde", "brown",
                                "white", "black", "purple", "pink", "orange", "none"]},
        "hair_length": {"type": "string", "enum": ["short", "long", "none"]},
        "age":        {"type": "string", "enum": ["child", "teen", "adult", "elderly", "none"]},
        "gender":     {"type": "string", "enum": ["male", "female", "unknown", "none"]},
        "pointed_ears": {"type": "boolean"},
        "animal_ears":  {"type": "boolean"},
        # ここを配列にすると、小さいモデルが同じ要素を延々と書き続けて
        # 「token repeat limit reached」で落ちる。1つずつの欄に分ける。
        "wearing":    {"type": "string",
                       "enum": ["hat", "sunglasses", "glasses", "armor",
                                "robe", "school uniform", "cloak",
                                "maid outfit", "dress", "bare skin", "none"]},
        "wearing2":   {"type": "string",
                       "enum": ["hat", "sunglasses", "glasses", "armor",
                                "robe", "school uniform", "cloak",
                                "maid outfit", "dress", "bare skin", "none"]},
        "holding":    {"type": "string",
                       "enum": ["staff", "sword", "spear", "axe", "book", "none"]},
        "place":      {"type": "string",
                       "enum": ["indoor", "forest", "cave", "street", "castle",
                                "field", "snow", "sky", "water", "desert", "unknown"]},
        "time_of_day": {"type": "string", "enum": ["day", "night", "unknown"]},
        "mood":       {"type": "string",
                       "enum": ["happy", "sad", "angry", "scared", "calm",
                                "tense", "romantic", "pained", "surprised",
                                "unknown"]},
        "action":     {"type": "string",
                       "enum": ["talking", "fighting", "walking", "crying", "eating",
                                "sleeping", "magic", "hugging", "standing",
                                "falling", "kneeling", "running", "pointing",
                                "unknown"]},
        # ── 2人目（本人の指定・2026-10-06）────────────────────────
        # 「ルーデウスとロキシーの二人が写った画像」を選べるようにするため。
        # いままでは「いちばん目立つ人」しか聞いていなかったので、
        # 二人写っていても名前が片方しか付かなかった。
        "hair_color2": {"type": "string",
                        "enum": ["blue", "red", "green", "blonde", "brown",
                                 "white", "black", "purple", "pink", "orange",
                                 "none"]},
        "hair_length2": {"type": "string", "enum": ["short", "long", "none"]},
        "age2":       {"type": "string",
                       "enum": ["child", "teen", "adult", "elderly", "none"]},
        "gender2":    {"type": "string", "enum": ["male", "female", "unknown", "none"]},
        # ── 場面の効果（37番「未来を創造させる描写」のような指定のため）──
        "effect":     {"type": "string",
                       "enum": ["magic circle", "explosion", "light", "blood",
                                "tears", "none"]},
        "closeup":    {"type": "boolean"},
        "text_on_screen": {"type": "boolean"},
        "live_action": {"type": "boolean"},
        "glowing_eyes": {"type": "boolean"},
        "dark_skin":    {"type": "boolean"},
        "beard":        {"type": "boolean"},
    },
    # 必須を絞ると、モデルが楽をして半分くらい書かずに返してくる。
    # 人物の判定は gender / age / wearing などを使うので、全部を必須にする。
    "required": ["people", "hair_color", "hair_length", "age", "gender",
                 "hair_color2", "hair_length2", "age2", "gender2", "effect",
                 "pointed_ears", "animal_ears", "wearing", "wearing2", "holding",
                 "place", "time_of_day", "mood", "action", "closeup",
                 "text_on_screen", "live_action", "glowing_eyes",
                 "dark_skin", "beard"],
}

LOCAL_PROMPT = (
    "This is a frame from a Japanese anime. Look carefully and fill in the JSON.\n"
    "- hair_color: the hair colour of the most prominent character. "
    "Use 'none' if no person is visible.\n"
    "- pointed_ears / animal_ears: almost always false. Set true ONLY if the ear "
    "shape is unmistakable. They are mutually exclusive - never both true.\n"
    "- wearing / wearing2 / holding: ONE value each, and only what you can "
    "actually see. Use 'none' when nothing stands out. wearing2 is a second "
    "garment, or 'none'. Never repeat the same value twice.\n"
    "- text_on_screen: true if large captions, credits, a title card or a menu "
    "fill much of the frame.\n"
    "- live_action: true if this is a photograph of real people, not drawn animation.\n"
    "- glowing_eyes: true only if the eyes glow or shine unnaturally (red/white) "
    "in a dark frame.\n"
    "- dark_skin: true if the character has clearly dark/tanned skin.\n"
    "- age: use 'elderly' for an old person with wrinkles or white/grey hair "
    "and an aged face.\n"
    "- gender: always answer male or female when a person is visible; "
    "use 'unknown' only when you truly cannot tell.\n"
    "- hair_color2 / hair_length2 / age2 / gender2: the SECOND most prominent "
    "character, if two or more people are visible. Use 'none' for every one of "
    "these when only one person is visible. Never copy the first character's "
    "answers into them.\n"
    "- mood: use 'pained' when the character is hurt, grimacing, losing a fight "
    "or crying out in pain. Use 'surprised' for shock.\n"
    "- effect: a striking visual effect filling part of the frame. Use 'none' "
    "unless it is obvious.\n"
    "\n"
    "Fill in EVERY key. Never leave a key out. If you are unsure about a key, "
    "use 'unknown' (or 'none' / false / an empty list), but still include it.\n"
    "Answer with JSON only."
)

# 見た目 → 日本語タグ
JP_HAIR = {"blue": u"青髪", "red": u"赤髪", "green": u"緑髪", "blonde": u"金髪",
           "brown": u"茶髪", "white": u"白髪", "black": u"黒髪", "purple": u"紫髪",
           "pink": u"桃色の髪", "orange": u"橙の髪"}
JP_PLACE = {"indoor": u"室内", "forest": u"森", "cave": u"洞窟", "street": u"街",
            "castle": u"城", "field": u"草原", "snow": u"雪", "sky": u"空",
            "water": u"水辺", "desert": u"荒野"}
JP_MOOD = {"happy": u"笑顔", "sad": u"悲しい", "angry": u"怒り", "scared": u"恐怖",
           "calm": u"穏やか", "tense": u"緊迫", "romantic": u"甘い",
           # 本人の 33番「ヒトガミの画像(やられる顔)」のための言葉
           "pained": u"やられ顔", "surprised": u"驚き"}
JP_ACTION = {"talking": u"会話", "fighting": u"戦闘", "walking": u"歩く",
             "crying": u"泣く", "eating": u"食事", "sleeping": u"眠る",
             "magic": u"魔法", "hugging": u"抱きしめる", "standing": u"立ち姿",
             "falling": u"倒れる", "kneeling": u"ひざまずく",
             "running": u"走る", "pointing": u"指さす"}
JP_EFFECT = {"magic circle": u"魔法陣", "explosion": u"爆発", "light": u"光",
             "blood": u"血", "tears": u"涙"}
JP_WEAR = {"hat": u"帽子", "sunglasses": u"サングラス", "glasses": u"眼鏡",
           "armor": u"鎧", "robe": u"ローブ", "school uniform": u"制服",
           "cloak": u"マント", "maid outfit": u"メイド服", "dress": u"ドレス",
           "bare skin": u"露出"}
JP_HOLD = {"staff": u"杖", "sword": u"剣", "spear": u"槍", "axe": u"斧", "book": u"本"}
JP_AGE = {"child": u"子供", "teen": u"少年少女", "adult": u"大人", "elderly": u"老人"}

# 見た目 → 人物名。上から順に見て、最初に当てはまったものを使う。
#
# ここは「手がかりが2つ以上そろったときだけ名前を付ける」方針にしている。
# 小さいモデルは髪の色すら安定しない（同じ絵で青と白に割れる）ので、
# 「茶髪の男＝ルーデウス」のような1つの手がかりだけの規則を置くと、
# ほとんどの絵に誤った名前が付いて、かえって絵えらびを悪くする。
# 名前が付かない絵は、髪の色・場所・人数などのタグで拾えばよい。
RULES = [
    (u"ヒトガミ",      lambda v: v["glow"]),
    (u"フィッツ",      lambda v: v["hair"] in ("white",) and "sunglasses" in v["wear"]),
    (u"シルフィエット", lambda v: v["hair"] == "white" and v["ears"] and v["sex"] == "female"),
    (u"ロキシー",      lambda v: v["hair"] in ("blue", "purple")
                                 and ("hat" in v["wear"] or "staff" in v["hold"])),
    (u"ロキシー",      lambda v: v["hair"] in ("blue", "purple") and v["sex"] == "female"),
    (u"エリス",        lambda v: v["hair"] == "red" and v["sex"] == "female"
                                 and (v["long"] or "sword" in v["hold"])),
    (u"ルイジェルド",  lambda v: v["hair"] == "green" and "spear" in v["hold"]),
    (u"ギレーヌ",      lambda v: v["hair"] == "green" and (v["beast"] or v["dark"])),
    (u"シルフィエット", lambda v: v["hair"] == "green" and v["age"] == "child"),
    (u"ナナホシ",      lambda v: v["hair"] == "black" and "school uniform" in v["wear"]
                                 and v["sex"] == "female"),
    (u"ザノバ",        lambda v: v["hair"] == "purple" and v["sex"] == "male"),
    (u"パウロ",        lambda v: v["hair"] == "brown" and v["sex"] == "male"
                                 and v["beard"] and v["age"] == "adult"),
    # ルーデウスとゼニスは、髪の色だけでは他の登場人物と見分けがつかない。
    # 「茶髪の男＝ルーデウス」にすると半分の絵に付いてしまうので置かない。
]


def to_tags(d):
    """Ollama が返した JSON を、日本語のタグ文字列に直す。"""
    g = lambda k, dv=None: d.get(k, dv)
    def hiraku(*keys):
        """1つの文字列でも、昔の配列でも受け取れるようにする。"""
        out = []
        for k in keys:
            v = g(k)
            if isinstance(v, str):
                out.append(v)
            elif isinstance(v, list):
                out += [x for x in v if isinstance(x, str)]
        return out
    wear = hiraku("wearing", "wearing2")
    hold = hiraku("holding")
    wear = [x for i, x in enumerate(wear) if x not in wear[:i]]   # 同じものは1つに
    # ── 明らかにおかしい答えを捨てる ──
    # 小さいモデルは、迷うと「全部はい」と答える癖がある。そのまま通すと
    # 嘘のタグが混ざって、絵えらびがかえって悪くなる。
    if bool(g("pointed_ears")) and bool(g("animal_ears")):
        d = dict(d)
        d["pointed_ears"] = d["animal_ears"] = False   # 両立しない
        g = lambda k, dv=None: d.get(k, dv)
    if len(wear) >= 4:
        wear = []      # 選択肢を書き写している
    if len(hold) >= 3:
        hold = []
    wear = [x for x in wear if x != "none"][:2]
    hold = [x for x in hold if x != "none"][:2]

    v = {"hair": g("hair_color", "none"), "wear": wear, "hold": hold,
         "ears": bool(g("pointed_ears")), "beast": bool(g("animal_ears")),
         "sex": g("gender", "unknown"), "age": g("age", "none"),
         "glow": bool(g("glowing_eyes")), "dark": bool(g("dark_skin")),
         "beard": bool(g("beard")), "long": g("hair_length") == "long"}

    tags = []
    if g("live_action"):
        return u"実写 使用不可"
    if g("text_on_screen"):
        tags.append(u"文字あり")
        tags.append(u"使用不可")
    if "bare skin" in wear:
        tags.append(u"きわどい")
        tags.append(u"使用不可")

    try:
        n = int(g("people", 0) or 0)
    except (TypeError, ValueError):
        n = 0
    if n <= 0:
        tags.append(u"人物なし")
    elif n == 1:
        tags.append(u"一人")
    elif n == 2:
        tags.append(u"二人")
    else:
        tags.append(u"大勢")

    if n > 0:
        for name, ok in RULES:
            try:
                if ok(v):
                    tags.append(name)
                    break
            except Exception:
                pass
        # ── 2人目の名前（本人の指定・2026-10-06）──────────────────
        #
        # 「ルーデウスとロキシーの二人が写った画像が望ましい」。
        # いままでは「いちばん目立つ人」しか聞いていなかったので、
        # 二人写っていても名前が片方しか付かず、**二人の絵を探せなかった**。
        # 2人目の見た目を別に聞いて、同じ人物ルールにかける。
        if n >= 2 and g("hair_color2", "none") not in (None, "none"):
            v2 = {"hair": g("hair_color2", "none"), "wear": [], "hold": [],
                  "ears": False, "beast": False,
                  "sex": g("gender2", "unknown"), "age": g("age2", "none"),
                  "glow": False, "dark": False, "beard": False,
                  "long": g("hair_length2") == "long"}
            # 1人目と同じ見た目なら、同じ人を2回数えているだけ。足さない。
            onaji = (v2["hair"] == v["hair"] and v2["sex"] == v["sex"]
                     and v2["age"] == v["age"])
            if not onaji:
                for name, ok in RULES:
                    try:
                        if ok(v2) and name not in tags:
                            tags.append(name)
                            break
                    except Exception:
                        pass
                if v2["hair"] in JP_HAIR and JP_HAIR[v2["hair"]] not in tags:
                    tags.append(JP_HAIR[v2["hair"]])
        if v["hair"] in JP_HAIR:
            tags.append(JP_HAIR[v["hair"]])
        if g("hair_length") == "long":
            tags.append(u"長い髪")
        if v["age"] in JP_AGE:
            tags.append(JP_AGE[v["age"]])
        if v["ears"]:
            tags.append(u"エルフ耳")
        if v["beast"]:
            tags.append(u"獣耳")
        if v["dark"]:
            tags.append(u"褐色肌")
        if v["beard"]:
            tags.append(u"ひげ")
        if v["glow"]:
            tags.append(u"光る目")
        for w in wear:
            if w in JP_WEAR:
                tags.append(JP_WEAR[w])
        for w in hold:
            if w in JP_HOLD:
                tags.append(JP_HOLD[w])

    if g("place") in JP_PLACE:
        tags.append(JP_PLACE[g("place")])
    if g("time_of_day") == "night":
        tags.append(u"夜")
    elif g("time_of_day") == "day":
        tags.append(u"昼")
    if g("mood") in JP_MOOD:
        tags.append(JP_MOOD[g("mood")])
    if g("action") in JP_ACTION:
        tags.append(JP_ACTION[g("action")])
    if g("effect") in JP_EFFECT:
        tags.append(JP_EFFECT[g("effect")])
    if g("closeup"):
        tags.append(u"アップ")

    out = []
    for t in tags:
        if t not in out:
            out.append(t)
    return u" ".join(out) if out else u""


def write_vocab(path):
    """このやり方で出しうるタグを、全部書き出しておく。

    画像プラン.txt に書く #タグ は、ここに載っている言葉から選ぶ。
    載っていない言葉を書くと、どの絵にも当たらない。
    """
    groups = [
        (u"人物（見た目から決めています。確実ではありません）",
         [n for n, _ in RULES]),
        (u"人数", [u"人物なし", u"一人", u"二人", u"大勢"]),
        (u"髪", sorted(set(JP_HAIR.values())) + [u"長い髪"]),
        (u"年齢", list(JP_AGE.values())),
        (u"体の特徴", [u"エルフ耳", u"獣耳", u"褐色肌", u"ひげ", u"光る目"]),
        (u"身に着けているもの", list(JP_WEAR.values())),
        (u"持ち物", list(JP_HOLD.values())),
        (u"場所", list(JP_PLACE.values())),
        (u"時間", [u"昼", u"夜"]),
        (u"気持ち", list(JP_MOOD.values())),
        (u"動作", list(JP_ACTION.values())),
        (u"場面の効果", list(JP_EFFECT.values())),
        (u"画面", [u"アップ", u"文字あり", u"実写", u"きわどい", u"使用不可"]),
    ]
    with io.open(path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(u"# 画像カタログに出てくるタグの一覧\r\n")
        f.write(u"# 画像プラン.txt の #指定は、ここにある言葉から選んでください。\r\n")
        f.write(u"# 空白で2語以上つなぐと、その全部を含む絵だけに絞られます。\r\n")
        f.write(u"#   例)  #ロキシー 洞窟      #老人 室内      #戦闘 夜\r\n")
        f.write(u"\r\n")
        seen = []
        for title, ws in groups:
            f.write(u"■ " + title + u"\r\n")
            uniq = []
            for w in ws:
                if w not in uniq:
                    uniq.append(w)
            f.write(u"   " + u" ".join(uniq) + u"\r\n\r\n")
            seen += uniq
    say(u"タグ一覧.txt を書きました (使える言葉 %d個)" % len(set(seen)))


class OllamaError(Exception):
    pass


def http_json(url, payload=None, timeout=300):
    if payload is None:
        req = urllib.request.Request(url)
    else:
        req = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        # Ollama は失敗の理由を本文に入れてくる。捨てずに見せる。
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = u""
        try:
            body = json.loads(body).get("error", body)
        except Exception:
            pass
        raise OllamaError(u"HTTP %d  %s" % (e.code, (body or u"")[:400]))
    except urllib.error.URLError as e:
        raise OllamaError(u"つながりません: %s" % e.reason)


def ollama_models(host):
    try:
        d = http_json(host + "/api/tags", timeout=10)
    except Exception:
        return None
    return [m.get("name", "") for m in d.get("models", [])]


VISION_HINTS = ("vl", "llava", "vision", "moondream", "minicpm-v", "gemma3",
                "gemma4", "bakllava", "qwen2.5vl", "qwen3-vl")
SUGGEST = ["qwen2.5vl:3b", "moondream", "llava:7b", "minicpm-v", "gemma3:4b"]


def pick_local_model(host, want):
    got = ollama_models(host)
    if got is None:
        die(u"Ollama が動いていません。\n"
            u"   https://ollama.com/download から入れて、もう一度試してください。\n"
            u"   入れてあるのにこの表示が出る場合は、コマンドプロンプトで\n"
            u"       ollama serve\n"
            u"   と打ってから、もう一度実行してください。")
    if want:
        if want in got or any(m.split(":")[0] == want for m in got):
            return want
        die(u"そのモデルは入っていません: %s\n   入れるには:  ollama pull %s" % (want, want))
    vis = [m for m in got if any(h in m.lower() for h in VISION_HINTS)]
    if vis:
        return vis[0]
    die(u"絵を見られるモデルが入っていません。\n"
        u"   コマンドプロンプトでどれか1つ入れてください（小さいものほど速い）:\n"
        + u"\n".join(u"       ollama pull " + s for s in SUGGEST))


FIELD_HELP = (
    "Return one JSON object with exactly these keys:\n"
    '{"people": <int>, "hair_color": "blue|red|green|blonde|brown|white|black|'
    'purple|pink|orange|none", "hair_length": "short|long|none", '
    '"age": "child|teen|adult|elderly|none", "gender": "male|female|unknown|none", '
    '"pointed_ears": <bool>, "animal_ears": <bool>, "wearing": "<one>", '
    '"wearing2": "<one or none>", '
    '"holding": "<one>", "place": "indoor|forest|cave|street|castle|field|'
    'snow|sky|water|desert|unknown", "time_of_day": "day|night|unknown", '
    '"mood": "happy|sad|angry|scared|calm|tense|romantic|unknown", '
    '"action": "talking|fighting|walking|crying|eating|sleeping|magic|hugging|'
    'standing|unknown", "closeup": <bool>, "text_on_screen": <bool>, '
    '"live_action": <bool>, "glowing_eyes": <bool>, "dark_skin": <bool>, '
    '"beard": <bool>}\n'
    "wearing may contain: hat, sunglasses, glasses, armor, robe, school uniform, "
    "cloak, maid outfit, dress, bare skin.\n"
    "holding may contain: staff, sword, spear, axe, book.\n"
)

# format の書き方。左から試して、通ったものを以後ずっと使う。
# (Ollama の版やモデルによって、細かいスキーマを受け付けないことがある)
FORMS = [u"スキーマ", u"json", u"なし"]


def _payload(model, img, form):
    # num_ctx を決めておかないと、絵のぶんで埋まって答えが途中で切れる
    # (done_reason: length)。num_predict は答えに要る長さの目安。
    p = {"model": model, "stream": False,
         "options": {"temperature": 0, "num_ctx": 4096, "num_predict": 600},
         "images": [img]}
    if form == u"スキーマ":
        p["prompt"] = LOCAL_PROMPT + u"\nwearing may contain: hat, sunglasses, " \
            u"glasses, armor, robe, school uniform, cloak, maid outfit, dress, " \
            u"bare skin.\nholding may contain: staff, sword, spear, axe, book."
        p["format"] = SCHEMA
    elif form == u"json":
        p["prompt"] = LOCAL_PROMPT + u"\n" + FIELD_HELP
        p["format"] = "json"
    else:
        p["prompt"] = LOCAL_PROMPT + u"\n" + FIELD_HELP + \
            u"\nOutput the JSON object only. No explanation, no markdown fences."
    return p


def kirikomi(host, model, root, name, side, timeout):
    """空しか返らなくなったとき、原因を確定させるための実験。

    同じ画像を3通りで送り直す:
      ① 形を決めずに「一言で説明して」だけ  → これも空なら、絵を読む所が壊れている
      ② 画像を付けずに文字だけ              → これも空なら、モデル全体が壊れている
      ③ 画像を小さくして送る                 → これで通るなら、大きさの問題
    どこまで通るかで、直す場所が決まる。
    """
    out = []
    img = encode(os.path.join(root, name.replace(u"/", os.sep)), side)
    kogata = encode(os.path.join(root, name.replace(u"/", os.sep)), 224)

    shiken = [
        (u"① 絵あり・形の指定なし",
         {"model": model, "stream": False, "images": [img],
          "prompt": "Describe this image in one short sentence.",
          "options": {"temperature": 0}}),
        (u"② 絵なし・文字だけ",
         {"model": model, "stream": False,
          "prompt": "Say the single word: hello", "options": {"temperature": 0}}),
        (u"③ 絵を小さく(224px)",
         {"model": model, "stream": False, "images": [kogata],
          "prompt": "Describe this image in one short sentence.",
          "options": {"temperature": 0}}),
    ]
    say(u"")
    say(u"── 原因をしぼります（同じ画像で3通り試します）──")
    say(u"   画像: %s" % name)
    say(u"   送る大きさ: %d KB (長辺%dpx) / %d KB (224px)"
        % (len(img) * 3 // 4096, side, len(kogata) * 3 // 4096))
    for namae, pay in shiken:
        try:
            d = http_json(host + "/api/generate", pay, timeout=timeout)
            t = (d.get("response") or u"").strip()
            say(u"   %s → %s" % (namae, (t[:70] if t else u"空っぽ")))
            say(u"       prompt_eval=%s eval=%s %.1f秒"
                % (d.get("prompt_eval_count"), d.get("eval_count"),
                   (d.get("total_duration") or 0) / 1e9))
            out.append(bool(t))
        except OllamaError as e:
            say(u"   %s → エラー: %s" % (namae, e))
            out.append(False)
        except Exception as e:
            say(u"   %s → エラー: %s" % (namae, e))
            out.append(False)
    say(u"")
    say(u"── 読み方 ──")
    if out and out[0]:
        say(u"   絵は読めています。JSONの形を指定したときだけ空になる、")
        say(u"   という症状です。format の指定をやめれば進みます。")
        say(u"   → 8 → 6 で qwen2.5vl:7b に変えると直ることが多いです。")
    elif len(out) > 2 and out[2] and not out[0]:
        say(u"   小さい画像なら通ります。絵が大きすぎます。")
        say(u"   → 長辺を 224px にして走らせてください（下に出す指示）。")
    elif len(out) > 1 and out[1] and not out[0]:
        say(u"   文字だけなら答えます。絵を読む部分だけが壊れています。")
        say(u"   → Ollama を一度終了して、起動し直してください。")
        say(u"     直らなければ ollama rm qwen2.5vl:3b のあと入れ直しです。")
    else:
        say(u"   文字だけでも答えません。モデル全体が応答していません。")
        say(u"   → Ollama を終了 → 起動。それでも駄目なら")
        say(u"     8 → 3 で CPU に切り替えてください（遅いですが確実です）。")
    say(u"")
    return out


def ask_local(host, model, root, name, side, timeout, state=None):
    state = state if state is not None else {"i": 0}
    img = encode(os.path.join(root, name.replace(u"/", os.sep)), side)
    yarinaoshi = [False]
    while True:
        form = FORMS[state["i"]]
        try:
            pay = _payload(model, img, form)
            if yarinaoshi[0]:
                # 同じ絵で同じ答えを繰り返して落ちたので、少しだけ揺らす。
                # temperature 0 のままだと、何度やっても同じ所で詰まる。
                pay["options"]["temperature"] = 0.35
            d = http_json(host + "/api/generate", pay, timeout=timeout)
            break
        except OllamaError as e:
            t = u"%s" % e
            if (u"repeat" in t or u"aborted" in t) and not yarinaoshi[0]:
                yarinaoshi[0] = True
                continue
            if state["i"] + 1 < len(FORMS):
                state["i"] += 1
                say(u"  「%s」の書き方が通りませんでした → 「%s」で試します"
                    % (form, FORMS[state["i"]]))
                say(u"    Ollama の言い分: %s" % e)
                continue
            raise
    txt = d.get("response", "")
    # 何が返ってきたかを残す。空が続いたとき、原因を目で見るため
    state["raw"] = txt
    state["done"] = d.get("done_reason", "")
    # 数字を見れば、絵を読んだのか・何も書かなかったのかが分かる
    state["nums"] = u"prompt_eval=%s eval=%s total=%.1f秒" % (
        d.get("prompt_eval_count"), d.get("eval_count"),
        (d.get("total_duration") or 0) / 1e9)
    try:
        obj = json.loads(txt)
    except ValueError:
        m = re.search(r"\{.*\}", txt, re.S)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
        except ValueError:
            return None
    if not isinstance(obj, dict):
        return None
    return to_tags(obj)


# ══════════════════════════════ api: Claude に聞く（お金がかかる）

API_SYSTEM = u"""あなたはアニメ「無職転生」の画面写真に検索用のタグを付ける担当です。

主な登場人物: ルーデウス(茶〜金髪・緑の目) / ロキシー(水色の長い髪・白い帽子・杖) /
エリス(赤い髪) / シルフィエット(緑髪の幼少期と白髪・エルフ耳) /
フィッツ(白髪＋サングラス＋エルフ耳) / パウロ(茶髪ポニーテール) / ゼニス(金髪) /
リーリャ(黒髪のメイド) / ルイジェルド(緑髪・額に赤い宝石・槍) /
ギレーヌ(褐色肌・緑髪・獣耳・大剣) / ナナホシ(黒髪ロング・制服) /
ザノバ(紫髪の大男) / クリフ(金髪の小柄な少年) / エリナリーゼ(金髪か白髪のエルフ・赤い目) /
ヒトガミ(白い靄か赤く光る目) / オルステッド(銀髪・顔に傷) / アリエル(金の縦ロール)

各画像1行、次の形だけを出力する（説明文は書かない）:
  番号<タブ>タグを空白区切り<タブ>ok
タグは10〜16個。人物名 → 見た目 → 場所 → 動作 → 気持ち の順。
自信の無い人物名は書かない。クレジット等の文字画面・実写・きわどい画面は
3列目を ng にして、タグに 文字あり / 実写 / きわどい を入れる。日本語で書く。"""


def ask_api(client, root, chunk, side, model, effort):
    content = []
    for i, name in enumerate(chunk):
        content.append({"type": "text", "text": u"画像 %d:" % (i + 1)})
        content.append({"type": "image", "source": {
            "type": "base64", "media_type": "image/jpeg",
            "data": encode(os.path.join(root, name.replace(u"/", os.sep)), side)}})
    content.append({"type": "text",
                    "text": u"上の%d枚に、決められた形で%d行だけ出力してください。"
                            % (len(chunk), len(chunk))})
    msg = client.messages.create(
        model=model, max_tokens=2000,
        system=[{"type": "text", "text": API_SYSTEM,
                 "cache_control": {"type": "ephemeral"}}],
        output_config={"effort": effort},
        messages=[{"role": "user", "content": content}])
    if getattr(msg, "stop_reason", None) == "refusal":
        return {}, msg.usage
    text = u"".join(b.text for b in msg.content if b.type == "text")
    out = {}
    for ln in text.replace(u"\r\n", u"\n").split(u"\n"):
        ln = ln.strip()
        if not ln:
            continue
        parts = ln.split(u"\t")
        if len(parts) < 2:
            parts = re.split(r"[ \u3000]{2,}", ln)
        if len(parts) < 2:
            continue
        m = re.match(r"^\s*(\d+)", parts[0])
        if not m:
            continue
        idx = int(m.group(1))
        if not (1 <= idx <= len(chunk)) or not parts[1].strip():
            continue
        tags = parts[1].strip()
        if len(parts) > 2 and parts[2].strip().lower().startswith(u"ng"):
            tags += u" 使用不可"
        out[idx] = tags
    return out, msg.usage


PRICE = {"claude-opus-5": (5.0, 25.0), "claude-sonnet-5": (2.0, 10.0),
         "claude-haiku-4-5": (1.0, 5.0)}


def find_key(here):
    k = os.environ.get("ANTHROPIC_API_KEY")
    if k:
        return k.strip(), u"環境変数"
    p = os.path.join(here, KEYFILE)
    if os.path.exists(p):
        t = u"".join(io.open(p, encoding="utf-8-sig", errors="replace").read().split())
        if t:
            return t, KEYFILE
    return None, None


# ══════════════════════════════ 本体

def show_recent(path, n):
    """さっき付けたタグを並べて出す。合っているか人が見て確かめるため。"""
    if not os.path.exists(path):
        return
    rows = []
    for ln in io.open(path, encoding="utf-8-sig", errors="replace"):
        ln = ln.rstrip(u"\r\n")
        if not ln.strip() or ln.lstrip().startswith(u"#") or u"\t" not in ln:
            continue
        rows.append(ln.split(u"\t", 1))
    if not rows:
        return
    say(u"")
    say(u"── 付いたタグ（新しいものから %d件）───────────────" % min(n, len(rows)))
    for k, d in rows[-n:]:
        say(u"  %-34s %s" % (k.split(u"/")[-1][:34], d))
    say(u"──────────────────────────────────────────")
    say(u"合っていないものがあれば、この一覧をチャットに貼ってください。")
    say(u"見た目から名前を決める対応表を直します。")


def diagnose(errs):
    """よくある失敗の、意味と直し方を日本語で出す。"""
    all_text = u" ".join(errs).lower()
    if u"cuda" in all_text or u"device kernel" in all_text or u"0xc0000409" in all_text:
        say(u"")
        say(u"── 何が起きているか ────────────────────────")
        say(u"  絵を見るモデルを、グラフィックボード(GPU)に載せた瞬間に落ちています。")
        say(u"  Ollama が持っている GPU 用の部品と、いまのドライバが噛み合っていません。")
        say(u"  画像の送り方は関係ありません（3通り全部で同じところで落ちています）。")
        say(u"")
        say(u"── 直し方 ──────────────────────────────")
        say(u"  A. GPU を使わずに動かす（すぐできる／遅い）")
        say(u"     メニューの 8 で「GPUを使わずに動かし直す」を選んでください。")
        say(u"     自分でやるなら、タスクトレイの Ollama を終了してから:")
        say(u"         setx CUDA_VISIBLE_DEVICES -1")
        say(u"     そのあと Ollama を起動し直してください。")
        say(u"     (それでも落ちるなら  setx OLLAMA_LLM_LIBRARY cpu  も足す)")
        say(u"")
        say(u"  B. NVIDIA のドライバを新しくする（速さはそのまま／おすすめ）")
        say(u"     Ollama が必要とする版:")
        say(u"       ・ドライバ 550 以上")
        say(u"       ・GeForce 900/1000番台のような古いカードは 570 以上")
        say(u"       ・GTX 700番台より前のカードは、そもそも動きません")
        say(u"     いまの版は  nvidia-smi  で確かめられます。")
        say(u"     https://www.nvidia.co.jp/Download/index.aspx")
        say(u"     入れ直したあと、Ollama も最新版にしてください。")
        say(u"")
        return
    if u"memory" in all_text or u"out of memory" in all_text:
        say(u"")
        say(u"  メモリが足りていません。もっと小さいモデルを試してください:")
        say(u"      ollama pull moondream")
        say(u"      python miru.py --model moondream")
        return
    if u"not found" in all_text or u"no such model" in all_text:
        say(u"")
        say(u"  モデルが見つかりません。入れ直してください:  ollama pull qwen2.5vl:3b")
        return


def probe(a, names):
    """1枚だけ送って、どこで何が起きているかを洗いざらい出す。

    うまくいかないときは、この出力をそのまま貼ってもらえば原因が分かる。
    """
    say(u"")
    say(u"── 1枚だけ試します（原因さがし用）──")
    say(u"つなぎ先: " + a.host)
    got = ollama_models(a.host)
    if got is None:
        die(u"Ollama につながりません。コマンドプロンプトで  ollama serve  を試してください。")
    say(u"入っているモデル: " + (u", ".join(got) if got else u"(なし)"))
    model = a.model or pick_local_model(a.host, u"")
    say(u"使うモデル: " + model)

    if a.folder:
        names = [n for n in names if a.folder in n] or names
    target = names[len(names) // 2]
    say(u"送る画像: " + target)
    img = encode(os.path.join(a.images, target.replace(u"/", os.sep)), a.side)
    say(u"送る大きさ: 約 %d KB (長辺 %d px)" % (len(img) * 3 // 4096, a.side))

    errs = []
    for form in FORMS:
        say(u"")
        say(u"■ 「%s」の書き方で送ってみます" % form)
        pay = _payload(model, img, form)
        shown = dict((k, v) for k, v in pay.items() if k != "images")
        say(u"  送る中身(画像以外): " + json.dumps(shown, ensure_ascii=False)[:300])
        t = time.time()
        try:
            d = http_json(a.host + "/api/generate", pay, timeout=a.timeout)
        except OllamaError as e:
            say(u"  → だめでした: %s" % e)
            errs.append(u"%s" % e)
            continue
        el = time.time() - t
        txt = (d.get("response") or u"")
        say(u"  → うまくいきました (%.1f秒)" % el)
        say(u"  返ってきたもの: " + txt.replace(u"\n", u" ")[:400])
        try:
            obj = json.loads(txt)
        except ValueError:
            m = re.search(r"\{.*\}", txt, re.S)
            obj = json.loads(m.group(0)) if m else None
        if isinstance(obj, dict):
            say(u"  タグにすると: " + (to_tags(obj) or u"(空)"))
            say(u"")
            say(u"この書き方で動きます。1枚 %.1f秒 なので、1万枚だと およそ %.1f時間です。"
                % (el, el * 10000 / 3600.0))
        else:
            say(u"  JSON として読めませんでした。")
        return
    say(u"")
    say(u"どの書き方も通りませんでした。")
    diagnose(errs)
    say(u"上の内容をそのままチャットに貼ってください。")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=IMGDIR_DEFAULT)
    ap.add_argument("--catalog", default=CATALOG)
    ap.add_argument("--epmap", default=EPMAP)
    ap.add_argument("--folder", default=u"")
    ap.add_argument("--engine", default="local", choices=["local", "api"])
    ap.add_argument("--host", default=OLLAMA)
    ap.add_argument("--model", default=u"")
    ap.add_argument("--side", type=int, default=SIDE)
    ap.add_argument("--timeout", type=int, default=300)
    ap.add_argument("--dist", type=int, default=10)
    ap.add_argument("--all", action="store_true", help=u"似た絵もまとめず全部見る")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--redo", action="store_true",
                    help=u"すでに説明がついている画像も、もう一度見る")
    # PowerShell から渡すのは --renew のほう。
    # 日本語の名前は、文字コードの行きちがいで化けることがある。
    ap.add_argument("--renew", "--入れ直す", dest="irenaoshi", action="store_true",
                    help=u"説明の形が新しくなったので、全部の絵を見直す"
                         u"（途中で止めても続きから）")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--fake", action="store_true", help=u"自己テスト")
    ap.add_argument("--probe", action="store_true",
                    help=u"1枚だけ送って、何が起きているかを全部出す")
    ap.add_argument("--per-folder", type=int, default=0,
                    help=u"1話あたり何枚までにするか(話数の見分けをつけるだけなら40枚で足ります)")
    # api のときだけ使うもの
    ap.add_argument("--effort", default="low", choices=["low", "medium", "high"])
    ap.add_argument("--per", type=int, default=API_PER_REQUEST)
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    os.chdir(HERE)
    if not os.path.isdir(a.images):
        die(u"画像フォルダがありません: " + a.images)

    names = walk_images(a.images)
    if not names:
        die(u"画像が1枚もありません: " + a.images)
    say(u"画像 %d枚" % len(names))

    if a.probe:
        log_start()
        probe(a, names)
        log_save(u"画像しらべ.txt")
        return

    if a.folder:
        names = [n for n in names if a.folder in n]
        say(u"「%s」で絞って %d枚" % (a.folder, len(names)))
        if not names:
            die(u"その話数の画像がありません。")

    log_start()
    if a.irenaoshi:
        # 新しい形で付け終えた絵だけを「済み」とする。
        # 古い形の説明は残したまま、新しい説明を後ろに足す
        # （読むほうは後ろの行が勝つので、新しいほうが使われる）。
        done = read_skip(SUMI)
        say(u"説明の形 v%s で付け直します。" % SETSUMEI_BAN)
        if done:
            say(u"  すでに新しい形で済んでいる: %d枚（続きから進みます）" % len(done))
        say(u"  途中で止めても大丈夫です。もう一度同じ命令で続きから進みます。")
    else:
        done = set() if a.redo else read_done(a.catalog)
    if not a.redo and not a.irenaoshi:
        tobasu = read_skip(SKIP)
        if tobasu:
            say(u"前に見られなかった %d枚は飛ばします (%s を消すとまた見ます)"
                % (len(tobasu), SKIP))
            done = done | tobasu
    if a.redo:
        say(u"やり直しなので、すでに説明がついている画像も見ます。")
        say(u"  (古い説明は消さずに、新しい説明を足します)")
    elif a.irenaoshi:
        pass
    elif done:
        say(u"すでに説明がついている: %d枚" % len(done))
    todo = [n for n in names if n not in done]
    if not todo:
        say(u"")
        say(u"新しく見る画像はありません。全部ぶん説明がついています。")
        rebuild_epmap(a.catalog, a.epmap)
        log_save(u"画像しらべ.txt")
        return
    if a.per_folder:
        # 話数の濃さを測るだけなら、全部見なくても足ります。
        # 話数をまたいで順ぐりに取るので、途中で止めてもどの話も同じくらい進みます。
        have = {}
        for n in done:
            f = n.split(u"/")[0] if u"/" in n else u""
            have[f] = have.get(f, 0) + 1
        by = {}
        for n in todo:
            by.setdefault(n.split(u"/")[0] if u"/" in n else u"", []).append(n)
        fols = sorted(by, key=natkey)
        need = dict((f, max(0, a.per_folder - have.get(f, 0))) for f in fols)
        picked = []
        for i in range(a.per_folder):
            for f in fols:
                if i < min(need[f], len(by[f])):
                    picked.append(by[f][i])
        say(u"1話あたり %d枚までにしぼりました: %d枚 → %d枚"
            % (a.per_folder, len(todo), len(picked)))
        todo = picked
        if not todo:
            say(u"")
            say(u"どの話数も %d枚ぶん説明がついています。" % a.per_folder)
            rebuild_epmap(a.catalog, a.epmap)
            log_save(u"画像しらべ.txt")
            return
    say(u"これから見る: %d枚" % len(todo))

    if a.all:
        groups = [(n, [n]) for n in todo]
    else:
        groups = group_similar(a.images, todo, a.dist)
        say(u"よく似た絵をまとめて %d枚ぶんに (1枚あたり平均 %.1f フレーム)"
            % (len(groups), len(todo) / float(max(1, len(groups)))))
    groups = spread_groups(groups)
    if a.limit:
        groups = groups[:a.limit]
        say(u"お試しなので %d枚ぶんだけ見ます" % len(groups))

    lock = threading.Lock()
    stat = {"img": 0, "ng": 0, "in": 0, "out": 0, "kara": 0}
    kara = [0]          # 続けて何も取れなかった回数
    warui = [0]         # 続けてつまずいた回数
    tomatta = [False]   # 途中で見切りをつけたか
    akirame = []        # 何度やっても見られなかった画像
    form_state = {"i": 0}
    fails = []
    t0 = time.time()

    # ───────── local
    if a.engine == "local":
        model = u"(テスト)" if a.fake else pick_local_model(a.host, a.model)
        say(u"")
        say(u"あなたのPCの中で見ます（お金はかかりません）")
        say(u"  モデル: %s" % model)
        say(u"  見る枚数: %d" % len(groups))
        if a.dry_run:
            say(u"")
            say(u"--dry-run なので、ここまでで止めます。")
            say(u"速さは実際に動かしてみないと分かりません。はじめは --limit 20 をおすすめします。")
            return

        say(u"")
        say(u"見てもらっています。止めても、そこまでの結果は残ります。")
        for gi, (rep, members) in enumerate(groups):
            try:
                if a.fake:
                    tags = to_tags({"people": 1, "hair_color": "blue", "wearing": ["hat"],
                                    "holding": ["staff"], "gender": "female",
                                    "place": "cave", "time_of_day": "night",
                                    "mood": "tense", "action": "walking",
                                    "closeup": False, "text_on_screen": False})
                else:
                    tags = ask_local(a.host, model, a.images, rep, a.side, a.timeout, form_state)
            except OllamaError as e:
                stat["ng"] += 1
                warui[0] += 1
                say(u"  %s でつまずきました: %s" % (rep, e))
                tags = None
                fails.append(u"%s" % e)
                akirame += list(members)
                if stat["ng"] >= 5 and stat["img"] == 0:
                    say(u"")
                    say(u"5回続けて失敗したので止めます。")
                    diagnose(fails)
                    break
            except Exception as e:
                stat["ng"] += 1
                say(u"  %s でつまずきました: %s" % (rep, e))
                tags = None
            if tags:
                append_catalog(a.catalog, [(m, tags) for m in members], lock)
                if a.irenaoshi:
                    tsuika_sumi(SUMI, members, lock)
                stat["img"] += len(members)
                kara[0] = 0
                warui[0] = 0
                if form_state["i"] != 0:
                    # 一度うまくいったなら、いちばん良い書き方に戻す。
                    # 戻さないと、数枚の失敗のせいで残り全部が
                    # 形の指定なしになり、答えが途中で切れ続ける。
                    say(u"  「%s」に戻します" % FORMS[0])
                    form_state["i"] = 0
            elif not a.fake:
                # 「答えは返ってきたが、中身が空」。ここを数えないと、
                # 何時間も回した末に1枚も残っていない、ということが起きる。
                kara[0] += 1
                stat["kara"] += 1
                akirame += list(members)
                if kara[0] <= 3 or kara[0] % 50 == 0:
                    say(u"  %s から何も取れませんでした (%d回続けて)"
                        % (rep, kara[0]))
                    r = (form_state.get("raw") or u"")[:160].replace(u"\n", u" ")
                    say(u"    返ってきたもの: %s" % (r if r.strip() else u"(からっぽ)"))
                    if form_state.get("done"):
                        say(u"    終わった理由: %s" % form_state["done"])
                if kara[0] in (5, 11, 17) and form_state["i"] + 1 < len(FORMS):
                    form_state["i"] += 1
                    say(u"  「%s」の書き方に変えて、やり直してみます"
                        % FORMS[form_state["i"]])
                if kara[0] == 8:
                    # 一度メモリを空けてもらって、間を置いてから続ける
                    say(u"  モデルをいったん降ろして、20秒待ってから続けます…")
                    try:
                        http_json(a.host + "/api/generate",
                                  {"model": model, "keep_alive": 0, "prompt": ""},
                                  timeout=30)
                    except Exception:
                        pass
                    time.sleep(20)
                if kara[0] >= 25:
                    say(u"")
                    say(u"══════════════════════════════════════")
                    say(u"25回続けて何も取れませんでした。原因を調べます。")
                    say(u"══════════════════════════════════════")
                    say(u"Ollama は「できました」と返しますが、中身が空です。")
                    if form_state.get("nums"):
                        say(u"直前の数字: %s" % form_state["nums"])
                    try:
                        kirikomi(a.host, model, a.images, rep, a.side, a.timeout)
                    except Exception as e:
                        say(u"  調べられませんでした: %s" % e)
                    say(u"ここまでの分は残っています。やり直せば続きから見ます。")
                    say(u"この画面を 画像しらべ.txt ごとチャットに貼ってください。")
                    tomatta[0] = True
                    break
            n = gi + 1
            if n <= 3 or n % 20 == 0 or n == len(groups):
                el = time.time() - t0
                rest = (el / n) * (len(groups) - n)
                say(u"  %d / %d  (画像 %d枚ぶん / 1枚 %.1f秒 / 残り およそ %s)"
                    % (n, len(groups), stat["img"], el / n, nokori(rest)))
            if n == 3 and not a.fake:
                say(u"  ── 最初の3枚の見立て ──")
                say(u"     " + (tags or u"(取れませんでした)"))
                say(u"  この調子でよければ、そのままお待ちください。")

    # ───────── api
    else:
        reps = [g[0] for g in groups]
        chunks = [reps[i:i + a.per] for i in range(0, len(reps), a.per)]
        px = a.side * (a.side * 9 // 16)
        inp = len(chunks) * (a.per * px / 750.0 + 700)
        out = len(chunks) * (a.per * 45 + 40)
        pi, po = PRICE.get(a.model or API_MODEL, PRICE[API_MODEL])
        say(u"")
        say(u"Claude API に送ります（お金がかかります）")
        say(u"  お願いする回数: %d回 / だいたいの料金: $%.2f"
            % (len(chunks), inp / 1e6 * pi + out / 1e6 * po))
        if a.dry_run:
            say(u"")
            say(u"--dry-run なので、ここまでで止めます。")
            return
        try:
            import anthropic
        except ImportError:
            die(u"anthropic が要ります:  pip install anthropic")
        key, src = find_key(HERE)
        if not key:
            die(u"APIキーがありません。%s に貼り付けてください。" % KEYFILE)
        say(u"APIキー: %s から読みました" % src)
        client = anthropic.Anthropic(api_key=key, max_retries=5, timeout=180.0)
        model = a.model or API_MODEL

        def work(ci):
            chunk = chunks[ci]
            try:
                got, usage = ask_api(client, a.images, chunk, a.side, model, a.effort)
            except Exception as e:
                with lock:
                    stat["ng"] += 1
                say(u"  %d回目でつまずきました: %s" % (ci + 1, e))
                return
            rows = []
            for i, rep in enumerate(chunk):
                d = got.get(i + 1)
                if d:
                    for mm in groups[ci * a.per + i][1]:
                        rows.append((mm, d))
            if rows:
                append_catalog(a.catalog, rows, lock)
                if a.irenaoshi:
                    tsuika_sumi(SUMI, [k for (k, _d) in rows], lock)
            with lock:
                stat["img"] += len(rows)
                stat["in"] += getattr(usage, "input_tokens", 0) or 0
                stat["out"] += getattr(usage, "output_tokens", 0) or 0

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=a.workers) as ex:
            list(ex.map(work, range(len(chunks))))
        if stat["in"]:
            say(u"実際に使った量: 入力 %d / 出力 %d  (およそ $%.2f)"
                % (stat["in"], stat["out"],
                   stat["in"] / 1e6 * pi + stat["out"] / 1e6 * po))

    if stat["img"] and not a.fake:
        show_recent(a.catalog, 25)
    write_vocab(u"タグ一覧.txt")
    say(u"")
    say(u"できました。説明をつけた画像: %d枚 / つまずいた回数: %d" % (stat["img"], stat["ng"]))
    if stat["kara"]:
        say(u"何も取れなかった回数: %d" % stat["kara"])
    say(u"カタログ: " + os.path.join(HERE, a.catalog))
    rebuild_epmap(a.catalog, a.epmap)
    if stat["ng"]:
        say(u"つまずいたぶんは、もう一度実行すれば続きから見ます。")
    if akirame:
        # 次に実行したとき、同じ絵で何度もつまずかないように覚えておく。
        # 消せばまた見に行きます。
        mae = read_skip(SKIP)
        io.open(SKIP, "w", encoding="utf-8-sig", newline="").write(
            u"# 何度やっても見られなかった画像です。\r\n"
            u"# 次からは飛ばします。もう一度見てほしいときは、この行を消してください。\r\n"
            + u"\r\n".join(sorted(mae | set(akirame))) + u"\r\n")
        say(u"")
        say(u"見られなかった %d枚を %s に控えました。次からは飛ばします。"
            % (len(set(akirame)), SKIP))
    nokori_n = len([n for n in names if n not in read_done(a.catalog)
                    and n not in read_skip(SKIP)])
    if nokori_n:
        say(u"")
        say(u"まだ %d枚 残っています。" % nokori_n)
    log_save(u"画像しらべ.txt")
    if tomatta[0]:
        # 走り直しても同じなので、メニュー側は繰り返さない
        sys.exit(4)
    if nokori_n and not a.limit and not a.per_folder and not a.folder:
        # メニュー側がこれを見て、続きから走り直す
        sys.exit(3)


if __name__ == "__main__":
    main()
