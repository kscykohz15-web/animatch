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
import hashlib
import io, os, re, shutil, subprocess, sys

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
else:
    # もう一度まわして、同じものができること。
    # 「手で選んだ絵」の枠が、作り直すたびに 4行→8行→12行 と
    # 太っていったことがある。1回だけでは気づけない。
    import hashlib as _h
    def _yubi():
        d = {}
        for f in sorted(os.listdir(V)):
            if f.startswith(u"画像プラン_") and f.endswith(u".txt"):
                d[f] = _h.md5(io.open(os.path.join(V, f), "rb").read()).hexdigest()
        return d
    mae = _yubi()
    subprocess.run([sys.executable, os.path.join(V, u"プラン全部作る.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    chigau = [f for f, v in _yubi().items() if mae.get(f) != v]
    if chigau:
        warui.append(u"作り直すたびに画像プランが変わります: " + u" ".join(chigau))
        print(u"× 2回作ると中身が変わります: " + u" ".join(chigau))
    else:
        print(u"○ もう一度作っても同じものができます（枠が太りません）")

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

# 演出.txt が名前を出している音は、全部パックに入っていること。
# ドーン.mp3 を足したとき、掲示板に入れ忘れて「音が鳴らない」になりかけた。
# ZIP も Prepare も script[data-se] をまとめて配るので、ここが1か所で足りる。
oto = set()
for line in io.open(os.path.join(V, u"演出.txt"), encoding="utf-8-sig") \
        .read().replace("\r\n", "\n").split("\n"):
    if line.lstrip().startswith(u"#") or not line.strip():
        continue
    c = [x.strip() for x in line.split(u"\t") if x.strip()]
    if len(c) >= 3 and c[0] == u"区切り":
        oto.add(c[2])
    elif len(c) >= 2 and c[0] == u"章タイトルの音":
        oto.add(c[1])
nuke = sorted(x for x in oto
              if u'data-se="%s"' % x not in src
              or not os.path.exists(os.path.join(V, u"効果音", x)))
if nuke:
    warui.append(u"効果音が配られていません: " + u" ".join(nuke))
    print(u"× 演出.txt が使う音が掲示板に入っていません: " + u" ".join(nuke))
else:
    print(u"○ 演出.txt が使う音 %d件とも、掲示板から全パックに入ります（%s）"
          % (len(oto), u" ".join(sorted(oto))))

for d in DOUGA:
    for tag, nm in ((u"over", u"画面表示"), (u"plan", u"画像プラン")):
        f = os.path.join(V, u"%s_%s.txt" % (nm, {
            u"rou": u"老デウス", u"tp": u"第0弾", u"s1": u"第1回", u"s3": u"第3回",
            u"s4": u"第4回", u"s5": u"第5回", u"s6": u"第6回", u"s7": u"第7回"}[d]))
        if not os.path.exists(f):
            warui.append(u"%s がありません" % os.path.basename(f))
            print(u"× %s がありません" % os.path.basename(f))

# ── ⑥ 本体が最後まで走るか ──────────────────────────
midashi(u"⑥", u"本体を小さな材料で本当に走らせる")
r = subprocess.run([sys.executable, os.path.join(V, u"煙テスト.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"make_slideshow.py が最後まで走りません")

# ── ⑦ 名前のぶつかり ────────────────────────────────
midashi(u"⑦", u"同じ名前を2回定義していないか")
ms = io.open(os.path.join(V, "make_slideshow.py"), encoding="utf-8").read()
mita = {}
for m in re.finditer(r"^([A-Z][A-Z0-9_]*)\s*=", ms, re.M):
    mita.setdefault(m.group(1), []).append(ms[:m.start()].count("\n") + 1)
butsu = {k: v for k, v in mita.items() if len(v) > 1}
if butsu:
    for k, v in sorted(butsu.items()):
        warui.append(u"%s が %s 行目で2回定義されています" % (k, u"と".join(map(str, v))))
        print(u"× %-14s %s 行目" % (k, u" / ".join(map(str, v))))
    print(u"  （あとの定義が前を上書きします。--mitame が dict になった原因がこれ）")
else:
    print(u"○ 大文字の定数に、同じ名前の2回定義はありません")

# ── ⑧ パック版 ──────────────────────────────────────
midashi(u"⑧", u"パック版が掲示板の版と合っているか")
src2 = io.open(os.path.join(HERE, "board.src.html"), encoding="utf-8").read()
m = re.search(r'PACK_VERSION\s*=\s*"v(\d+)"', src2)
oboe = os.path.join(HERE, u".出した版.txt")
dashita = 0
if os.path.exists(oboe):
    try:
        dashita = int(io.open(oboe, encoding="utf-8").read().strip() or 0)
    except ValueError:
        dashita = 0
if not m:
    warui.append(u"PACK_VERSION が見つかりません")
    print(u"× PACK_VERSION が見つかりません")
elif int(m.group(1)) <= dashita:
    warui.append(u"パック版 v%s が前回出した v%d 以下です（上げ忘れ）"
                 % (m.group(1), dashita))
    print(u"× パック版 v%s は前回 v%d 以下。上げてください" % (m.group(1), dashita))
else:
    print(u"○ パック版 v%s（前回出したのは v%d）" % (m.group(1), dashita))
    print(u"   出したら .出した版.txt に %s を書くこと" % m.group(1))

# ── ⑩ 字幕が言葉の途中で折り返していないか ──────────
midashi(u"⑩", u"字幕が言葉の途中で折り返していないか")
r = subprocess.run([sys.executable, os.path.join(V, u"折り返し検査.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"字幕が言葉の途中で折り返しています")

# ── ⑨ 演出が本人のクセに合っているか ────────────────
midashi(u"⑨", u"演出が本人の編集のクセに合っているか")
r = subprocess.run([sys.executable, os.path.join(V, u"演出あわせ.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"演出が本人の編集のクセから離れています")

# ── ⑪ menu.ps1 の構造 ───────────────────────────────
midashi(u"⑪", u"menu.ps1 が壊れていないか")
node = shutil.which("node")
if not node:
    print(u"… node が無いので、この検査はとばします")
else:
    out_ps1 = os.path.join(HERE, "_menu.ps1")
    r = subprocess.run([node, os.path.join(V, "menu_dump.js"),
                        os.path.join(HERE, "board.src.html"), out_ps1],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-800:])
        warui.append(u"menu.ps1 を取り出せませんでした")
    else:
        r = subprocess.run([sys.executable, os.path.join(V, u"ps1検査.py"), out_ps1],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        print(r.stdout.decode("utf-8", "replace").rstrip())
        if r.returncode != 0:
            warui.append(u"menu.ps1 の構造に問題があります")
    if os.path.exists(out_ps1):
        os.remove(out_ps1)

# ── ⑫ 台本に BOM が付いていないか ───────────────────
midashi(u"⑫", u"台本の先頭に見えない文字(BOM)が付いていないか")
# 付いていると、VOICEPEAK に渡す本人のスクリプトが
# cp932 で書けずに落ちる（実際に落ちた）。
warui_bom = []
for m in re.finditer(r'\{name:"(台本_[^"]+\.txt)",\s*text:\s*([^,}]+)\}', src):
    if u"ufeff" in m.group(2):
        warui_bom.append(m.group(1))
if warui_bom:
    for f in sorted(set(warui_bom)):
        warui.append(u"%s に BOM が付いています" % f)
        print(u"× %s に BOM が付いています" % f)
else:
    print(u"○ 台本に BOM は付いていません")
if u"$env:PYTHONIOENCODING = 'utf-8'" not in src:
    warui.append(u"menu.ps1 が PYTHONIOENCODING を立てていません")
    print(u"× menu.ps1 が PYTHONIOENCODING を立てていません")
else:
    print(u"○ 画面の文字コードを UTF-8 にそろえています")

# ── ⑬ 章タイトルのカード ────────────────────────────
midashi(u"⑬", u"章タイトルのカードが右半分に収まるか")
r = subprocess.run([sys.executable, os.path.join(V, u"カード検査.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"章タイトルのカードが右半分からはみ出します")

# ── ⑭ 決め方を直したら、割り当て表が作り直されるか ────────────
midashi(u"⑭", u"決め方を直したら、割り当て表が作り直されるか")
# 指紋が設定ファイルしか見ていなかったせいで、こちらが決め方を直しても
# 前の割り当て表がそのまま使われ、直したことが空振りした。2回やっている。
#   1回目 絵の借り方を直した回   2回目 字幕と音声のずれを直した v129
# 手で上げる版は忘れるので、いまは決め方の関数のソースそのものを
# 指紋に混ぜている。ここが外れていないかを見る。
ms = io.open(os.path.join(V, "make_slideshow.py"), encoding="utf-8").read()
HISSU = [u"kugiri_awase", u"koma_awase", u"timeline_from_parts_srt",
         u"place_in_chunk", u"assign_images"]
m_k = re.search(r"def kime_kata_shirushi\(\):(.*?)\ndef ", ms, re.S)
tsukatte = u"kime_kata_shirushi()" in ms.split(u"def inputs_fingerprint")[-1][:1500]
if not m_k:
    warui.append(u"kime_kata_shirushi が make_slideshow.py にありません")
    print(u"× kime_kata_shirushi がありません（決め方を直しても空振りします）")
elif not tsukatte:
    warui.append(u"inputs_fingerprint が kime_kata_shirushi を使っていません")
    print(u"× 指紋に決め方の印が入っていません（直しても空振りします）")
else:
    nai = [k for k in HISSU if k not in m_k.group(1)]
    if nai:
        warui.append(u"決め方の印に入っていない関数: " + u" ".join(nai))
        print(u"× 次の関数が印に入っていません。直しても空振りします:")
        for k in nai:
            print(u"   " + k)
    else:
        print(u"○ 決め方(%s)を直せば、割り当て表は必ず作り直されます"
              % u"・".join(HISSU))

# ── ⑮ 人物ルールの条件が、本当にあるタグか ──────────
midashi(u"⑮", u"人物ルールの条件が、出てくるタグかどうか")
r = subprocess.run([sys.executable, os.path.join(V, u"人物ルール検査.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"人物ルールに、絶対に当たらない条件があります")

# ── ⑯ 字幕と声がずれていないか（作った材料で実測）────────────
midashi(u"⑯", u"字幕と声がずれていないか（実測）")
# 「まだずれています」を何度も往復した。こちらで測れないものは、こちらで直せない。
# 本物と同じ形の材料を作って、出来た割り当てと正解を突き合わせて測る。
# 1〜2分かかるが、ここを省くと同じ往復が必ずまた起きる。
r = subprocess.run([sys.executable, os.path.join(V, u"ずれ検査.py"), u"--回", u"2"],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"字幕と声がずれています（ずれ検査.py）")

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
