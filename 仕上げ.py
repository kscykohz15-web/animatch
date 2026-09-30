# -*- coding: utf-8 -*-
u"""掲示板を出す前に、決めごとを全部きかいで確かめる。

    python 仕上げ.py            … 確かめて、通ったら board.html まで作る
    python 仕上げ.py --shirabe  … 確かめるだけ（board.html は作らない）

見るもの（どれか1つでも落ちたら board.html は作らない）

  ① 台本の組     字幕用と読み上げ用で、段落の数と文の数が同じか
  ② 尺           8分以上あるか（ミッドロール広告の条件・6.46字/秒）
  ③ 章           画面表示.txt の章キーワードが、本当に字幕に当たるか
  ④ 画像プラン   タグの綴り・話数フォルダ・死んだキーワード・当たる割合
  ⑤ 配り忘れ     共通の設定が、どの動画のパックにも入るか

これを通さずに掲示板を出さないこと。
「老デウス以外のパックに設定が1つも入っていなかった」のは、
ここを機械で見ていなかったからです。
"""
import io, os, re, subprocess, sys

def sagasu():
    u"""作業場所（scratchpad）を探す。

    このファイルは2か所に置いてある。
      ・scratchpad の直下  … ふだん動かすのはこっち
      ・リポジトリ直下      … scratchpad が消えても残るように
    どちらから呼ばれても動くように、scratchpad を探しに行く。
    """
    import glob
    koko = os.path.dirname(os.path.abspath(__file__))
    for c in (os.path.join(koko, "scratchpad"),
              os.environ.get("CLAUDE_SCRATCHPAD", "")):
        if c and os.path.isdir(os.path.join(c, "video")):
            return os.path.dirname(c.rstrip(os.sep)), c
    for c in sorted(glob.glob("/tmp/claude-*/*animatch*/*/scratchpad")):
        if os.path.isdir(os.path.join(c, "video")):
            return os.path.dirname(c.rstrip(os.sep)), c
    print(u"[中断] 作業場所(scratchpad)が見つかりません。")
    print(u"       CLAUDE_SCRATCHPAD にその場所を入れて、もう一度実行してください。")
    sys.exit(1)


HERE, B = sagasu()          # HERE=scratchpad の親（build.py がある所） B=scratchpad
V = os.path.join(B, "video")
sys.path.insert(0, V)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

YOMI_SOKUDO = 6.46          # 実測の読み上げ速度（字/秒）
SAITAN_BYO = 8 * 60         # ミッドロール広告に必要な尺

# (名前, 字幕用, 読み上げ用)
DAIHON = [
    (u"老デウス", u"final/老デウス_壮絶な人生年表_字幕用_最終版.txt",
                  u"final/老デウス_壮絶な人生年表_読み上げ用_最終版.txt"),
    (u"第0弾", u"第0弾_ターニングポイント全解説_字幕用_v4段落整理版.txt",
               u"第0弾_ターニングポイント全解説_読み上げ用_v4段落整理版.txt"),
    (u"第1回", u"final/第1回_人生年表_字幕用_最終版.txt",
               u"final/第1回_人生年表_読み上げ用_最終版.txt"),
    (u"第3回", u"final/第3回_伏線7選_字幕用_最終版.txt",
               u"final/第3回_伏線7選_読み上げ用_最終版.txt"),
    (u"第4回", u"final/第4回_謎7選_字幕用_最終版.txt",
               u"final/第4回_謎7選_読み上げ用_最終版.txt"),
    (u"第5回", u"final/第5回_3人が一度いなくなる理由_字幕用_最終版.txt",
               u"final/第5回_3人が一度いなくなる理由_読み上げ用_最終版.txt"),
    (u"第6回", u"final/第6回_ヒトガミの正体_字幕用_最終版.txt",
               u"final/第6回_ヒトガミの正体_読み上げ用_最終版.txt"),
    (u"第7回", u"final/第7回_オルステッドの正体_字幕用_最終版.txt",
               u"final/第7回_オルステッドの正体_読み上げ用_最終版.txt"),
]

# パックに必ず入っていないといけないもの
KYOTSU = [u"画像カタログ.txt", u"話数マップ.txt", u"タグ一覧.txt", u"企画と台本の型.txt",
          u"台本の知恵.txt", u"読み辞書.txt", u"人物ルール.txt", u"演出.txt", u"見た目.txt"]
DOUGA = [u"rou", u"tp", u"s1", u"s3", u"s4", u"s5", u"s6", u"s7"]

warui = []


def midashi(n, t):
    print(u"\n── %s %s " % (n, t) + u"─" * max(0, 46 - len(t)))


def dan_of(p):
    return [x.strip() for x in io.open(p, encoding="utf-8-sig").read()
            .replace("\r\n", "\n").split("\n") if x.strip()]


def mmss(t):
    return u"%d:%02d" % (int(t) // 60, int(t) % 60)


# ── ① 台本の組 ───────────────────────────────────────
midashi(u"①", u"台本の組（字幕用 と 読み上げ用）")
for (nm, sub, tts) in DAIHON:
    ps, pt = os.path.join(B, sub), os.path.join(B, tts)
    if not os.path.exists(ps):
        warui.append(u"%s の字幕用がありません" % nm)
        print(u"× %-6s 字幕用がありません" % nm)
        continue
    if not os.path.exists(pt):
        warui.append(u"%s の読み上げ用がありません" % nm)
        print(u"× %-6s 読み上げ用がありません" % nm)
        continue
    ds, dt = dan_of(ps), dan_of(pt)
    ks = sum(u"".join(ds).count(c) for c in u"。！？")
    kt = sum(u"".join(dt).count(c) for c in u"。！？")
    komatta = []
    if len(ds) != len(dt):
        komatta.append(u"段落 %d↔%d" % (len(ds), len(dt)))
    if ks != kt:
        komatta.append(u"文 %d↔%d" % (ks, kt))
    if komatta:
        warui.append(u"%s の台本の組が合っていません（%s）" % (nm, u" / ".join(komatta)))
    print(u"%s %-6s 段落%3d 文%3d  %s"
          % (u"×" if komatta else u"○", nm, len(ds), ks,
             u" / ".join(komatta) if komatta else u""))

# ── ② 尺 ────────────────────────────────────────────
midashi(u"②", u"尺（8分以上・6.46字/秒）")
for (nm, sub, _t) in DAIHON:
    p = os.path.join(B, sub)
    if not os.path.exists(p):
        continue
    n = len(u"".join(dan_of(p)))
    byo = n / YOMI_SOKUDO
    ok = byo >= SAITAN_BYO
    if not ok:
        warui.append(u"%s が8分に足りません（%s）" % (nm, mmss(byo)))
    print(u"%s %-6s %5d字 → %s" % (u"○" if ok else u"×", nm, n, mmss(byo)))

# ── ③ 章 ────────────────────────────────────────────
midashi(u"③", u"章のキーワードが字幕に当たるか")
r = subprocess.run([sys.executable, os.path.join(V, u"全部しらべる.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"章のキーワードに当たらないものがあります")

# ── ④ 画像プラン ────────────────────────────────────
midashi(u"④", u"画像プラン（作り直して確かめる）")
r = subprocess.run([sys.executable, os.path.join(V, u"プラン全部作る.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"画像プランに問題があります")

# ── ⑤ 配り忘れ ──────────────────────────────────────
midashi(u"⑤", u"共通の設定が、どの動画のパックにも入るか")
src = io.open(os.path.join(HERE, "board.src.html"), encoding="utf-8").read()
# ZIPを作るところは2か所ある（制作パック と 台本保存/音声生成/動画化）。
# 「1か所でも呼んでいればよい」にすると、片方だけ直したのを見逃す。
# 効果音フォルダも miru_kekka.py も、それで消えた。
yobi = len(re.findall(r"^\s*pushKyotsu\(entries\);", src, re.M))
if yobi < 2:
    warui.append(u"pushKyotsu を呼んでいるのが %d か所しかありません（2か所必要）" % yobi)
    print(u"× ZIPを作る2か所のうち %d か所しか共通を入れていません" % yobi)
else:
    print(u"○ ZIPを作る %d か所とも共通を入れています" % yobi)
    nai = [k for k in KYOTSU if u'"%s"' % k not in src]
    if nai:
        warui.append(u"共通に入っていない: " + u" ".join(nai))
        print(u"× 共通の一覧に無い: " + u" ".join(nai))
    else:
        print(u"○ 共通 %d件が pushKyotsu で全パックに入ります" % len(KYOTSU))
for d in DOUGA:
    for tag, nm in ((u"over", u"画面表示"), (u"plan", u"画像プラン")):
        f = os.path.join(V, u"%s_%s.txt" % (nm, {
            u"rou": u"老デウス", u"tp": u"第0弾", u"s1": u"第1回", u"s3": u"第3回",
            u"s4": u"第4回", u"s5": u"第5回", u"s6": u"第6回", u"s7": u"第7回"}[d]))
        if not os.path.exists(f):
            warui.append(u"%s がありません" % os.path.basename(f))
            print(u"× %s がありません" % os.path.basename(f))

# ── まとめ ──────────────────────────────────────────
print(u"\n" + u"=" * 58)
if warui:
    print(u"落ちました。%d件:" % len(warui))
    for x in warui:
        print(u"  ・" + x)
    print(u"\nboard.html は作っていません。直してからもう一度。")
    sys.exit(1)

print(u"全部通りました。")
if "--shirabe" in sys.argv:
    print(u"（--shirabe なので board.html は作っていません）")
    sys.exit(0)

for step in ("sync_py.py", "build.py"):
    print(u"\n── %s ─────────────────────────" % step)
    r = subprocess.run([sys.executable, os.path.join(HERE, step)], cwd=HERE,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    out = r.stdout.decode("utf-8", "replace").rstrip()
    print(u"\n".join(out.split(u"\n")[-6:]))
    if r.returncode != 0:
        print(out)
        sys.exit(1)
print(u"\nboard.html ができました。掲示板に出してください。")
