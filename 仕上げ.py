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
  ⑥ 空まわり     本体を小さな材料で本当に走らせる
  ⑦ 二重定義     同じ名前を2回定義していないか
  ⑧ パック版     パック版が掲示板の版と合っているか
  ⑨ 演出         本人の編集のクセに合っているか
  ⑩ 折り返し     字幕が言葉の途中で折り返していないか
  ⑪ menu.ps1     PowerShell で本当に読めるか
  ⑫ BOM          台本の先頭に見えない文字が付いていないか
  ⑬ 章カード     タイトルが右半分に収まるか
  ⑭ 作り直し     決め方を直したら、割り当て表が作り直されるか
  ⑮ 人物ルール   条件が、本当に出てくるタグかどうか
  ⑯ 音ズレ       字幕と声がずれていないか（材料を作って実測）
  ⑰ 絵の直し     数字ひとつで絵を入れ替える仕組みが働くか
  ⑱ パック       道具が4か所ぜんぶに入っているか
  ⑲ 絵と字幕     同じコマで切り替わるか（コマを数えて実証）
  ⑳ 文脈         本人の直し(29〜37番)を、機械だけで再現できるか

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

# ■ どの動画があるかは、ここには書きません（2026-10-07）
#
# 前はこのファイルに2つ（DAIHON と DOUGA）、全部しらべる.py に1つ、
# プラン全部作る.py に1つ、同じ一覧が4か所ありました。
# 1本足すとどこかを必ず忘れるので、video/動画一覧.txt に1か所だけ置いています。
import 動画一覧 as _D
_DOUGA = _D.yomu()
DAIHON = [(v.namae, v.sub_rel, v.tts_rel) for v in _DOUGA]
DOUGA = [v.shirushi for v in _DOUGA]
NAMAE = dict((v.shirushi, v.namae) for v in _DOUGA)

# パックに必ず入っていないといけないもの
KYOTSU = [u"画像カタログ.txt", u"話数マップ.txt", u"タグ一覧.txt", u"企画と台本の型.txt",
          u"台本の知恵.txt", u"読み辞書.txt", u"人物ルール.txt", u"演出.txt", u"見た目.txt"]

warui = []
# 止めないが、必ず知らせる宿題（作りかけの機能など）
SHUKUDAI = []


def midashi(n, t):
    print(u"\n── %s %s " % (n, t) + u"─" * max(0, 46 - len(t)))


def dan_of(p):
    return [x.strip() for x in io.open(p, encoding="utf-8-sig").read()
            .replace("\r\n", "\n").split("\n") if x.strip()]


def mmss(t):
    return u"%d:%02d" % (int(t) // 60, int(t) % 60)


# ■ まだ台本が無い動画は、できてから見る（2026-10-08）
#
# 動画一覧.txt に先に行を足して、台本はこれから書く ── という途中の状態がある。
# それを「字幕用がありません」で落とすと、
# **すでに出来ている8本ぶんの掲示板まで出せなくなる。**
# 実際にそれで止まり、本人にパックを届けられなかった。
#
# 線をゆるめたのではない。**無いものは検査しようがない**というだけ。
# 黙って飛ばすと事故になるので、必ず名前を並べて知らせる。
# 片方だけある（字幕用はあるのに読み上げ用が無い）のは作りかけの事故なので落とす。
MIKANSEI = []
_DAIHON2 = []
for (nm, sub, tts) in DAIHON:
    a1 = os.path.exists(os.path.join(B, sub))
    b1 = os.path.exists(os.path.join(B, tts))
    if not a1 and not b1:
        MIKANSEI.append(nm)
    else:
        _DAIHON2.append((nm, sub, tts))
if MIKANSEI:
    print(u"… まだ台本が無いので、この %d本は検査しません: %s"
          % (len(MIKANSEI), u" / ".join(MIKANSEI)))
    print(u"   （動画一覧.txt には登録済み。台本ができたら自動で検査に入ります）")
DAIHON = _DAIHON2
DOUGA = [d for d in DOUGA if NAMAE.get(d) not in MIKANSEI]

# ── ① 台本の組 ───────────────────────────────────────
midashi(u"①", u"台本の組（動画一覧.txt の %d本）" % len(DAIHON))
for (nm, sub, tts) in DAIHON:
    ps, pt = os.path.join(B, sub), os.path.join(B, tts)
    if not os.path.exists(ps):
        warui.append(u"%s の字幕用がありません（読み上げ用はあります）" % nm)
        print(u"× %-6s 字幕用がありません（読み上げ用はあります）" % nm)
        continue
    if not os.path.exists(pt):
        warui.append(u"%s の読み上げ用がありません（字幕用はあります）" % nm)
        print(u"× %-6s 読み上げ用がありません（字幕用はあります）" % nm)
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
    # 置き場所.txt は掲示板ごとに中身が違うので共通(pushKyotsu)に入れられない。
    # 入れ忘れると、絵のフォルダを見にいく先が無いまま動画を作ることになる。
    # ■ ここが落ちたら、**この board.src.html が古い**（2026-10-08・誤診の記録）
    #
    # 一度これを「作りかけの機能だから止めない」に変えたが、**誤りだった。**
    # 公開中の掲示板を読んだら v144 で、置き場所.txt はZIPの2か所に
    # ちゃんと入っていた。＝ 機能は完成していて、
    # **こちらの scratchpad の board.src.html が遅れているだけ**だった。
    #
    # board.src.html は git に入れていないので、別のセッションが直しても
    # こちらには来ない。**この検査が落ちたら、こちらの掲示板を出してはいけない。**
    # 出すと相手の作業（掲示板2枚・置き場所）を丸ごと消す。
    #
    # そのときの渡し方は「公開中の掲示板を読んで、中の py-slideshow だけ
    # 差し替えて出す」。board_v145.html を作ったのがその手順。
    nb = len(re.findall(r'name:"置き場所\.txt"', src))
    if nb < 2:
        warui.append(u"置き場所.txt がZIPに %d か所しかありません"
                     u"（この board.src.html が古い可能性。公開中のものを確かめること）" % nb)
        print(u"× 置き場所.txt がZIPの %d か所にしか入っていません" % nb)
        print(u"   この board.src.html が古いかもしれません。")
        print(u"   公開中の掲示板を読んでから、まるごと出さずに中身だけ差し替えてください。")
    else:
        print(u"○ 置き場所.txt も ZIPの %d か所とも入ります" % nb)
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

# 動画一覧.txt の1本ごとに、掲示板の SCRIPTS に件があるか。
# build.py も最後に見るが、そこまで20項目ぜんぶ走ってからになるので、ここでも見る。
# まだ台本が無い動画は、掲示板にも載せようがない。できてから見る。
nai_sc = [v.shirushi for v in _DOUGA
          if v.namae not in MIKANSEI
          and not re.search(r"^    %s:\{name:" % re.escape(v.shirushi), src, re.M)]
if nai_sc:
    warui.append(u"board.src.html の SCRIPTS に無い動画: " + u" ".join(nai_sc))
    print(u"× SCRIPTS に無い動画: " + u" ".join(nai_sc))
else:
    print(u"○ 動画 %d本とも SCRIPTS に件があります" % (len(_DOUGA) - len(MIKANSEI)))

# 節の data-board が、build.py の知っている掲示板だけを指しているか
ban_src = set(re.findall(r'<section data-board="([^"]+)"', src))
ban_ichiran = set(v.ban for v in _DOUGA)
shiranai = ban_src - ban_ichiran
if shiranai:
    warui.append(u"data-board に動画が1本も無い掲示板: " + u" ".join(sorted(shiranai)))
    print(u"× data-board に動画が1本も無い掲示板: " + u" ".join(sorted(shiranai)))
else:
    print(u"○ 掲示板 %s … 節の印と動画一覧.txt が合っています"
          % u" / ".join(sorted(ban_ichiran)))

for d in DOUGA:
    for tag, nm in ((u"over", u"画面表示"), (u"plan", u"画像プラン")):
        f = os.path.join(V, u"%s_%s.txt" % (nm, NAMAE[d]))
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
    # ついでに、本物の PowerShell があれば構文そのものを見る。
    # 構造の検査だけでは「書き方が壊れている」を見つけられない。
    pwsh = shutil.which("pwsh") or u"/tmp/claude-0/pwsh/pwsh"
    if os.path.exists(pwsh) and os.path.exists(out_ps1):
        cmd = ('$t=$null;$e=$null;'
               '[void][System.Management.Automation.Language.Parser]::ParseFile('
               '"%s",[ref]$t,[ref]$e);'
               'if($e.Count){foreach($x in $e){Write-Output('
               '"  "+$x.Extent.StartLineNumber+"行目: "+$x.Message)};exit 1}'
               'Write-Output ("○ PowerShell の構文エラーなし（トークン "+$t.Count+"個）")'
               ) % out_ps1.replace("\\", "/")
        r2 = subprocess.run([pwsh, "-NoProfile", "-Command", cmd],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        print(r2.stdout.decode("utf-8", "replace").rstrip())
        if r2.returncode != 0:
            warui.append(u"menu.ps1 に PowerShell の構文エラーがあります")
    else:
        print(u"… pwsh が無いので、構文そのものの検査はとばします")
    if os.path.exists(out_ps1):
        os.remove(out_ps1)

# ── ⑱ 道具が4か所ぜんぶに入っているか ────────────
midashi(u"⑱", u"道具が4か所ぜんぶに入っているか")
# 置き場所・同期・ZIP・Prepare の4つ。片方だけだと黙って消える（3回やった）。
r = subprocess.run([sys.executable, os.path.join(V, u"パック検査.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"道具がパックの4か所ぜんぶに入っていません")

# ── ⑫ 台本に BOM が付いていないか ───────────────────
midashi(u"⑫", u"台本の先頭に見えない文字(BOM)が付いていないか")
# 付いていると、VOICEPEAK に渡す本人のスクリプトが
# cp932 で書けずに落ちる（実際に落ちた）。
# ■ 見る所が足りていなかった（2026-10-07）
#
# ここは「JSの式に \ufeff と書いていないか」だけを見ていた。
# **台本そのものの先頭に BOM が付いていること**は見ていないので、
# 掲示板に残っていた v141 では doc-*-tts 8本ぜんぶに付いていた。
# 本物の台本ファイルを直に見る。build.py も流し込むときに落とす。
warui_bom = []
for m in re.finditer(r'\{name:"(台本_[^"]+\.txt)",\s*text:\s*([^,}]+)\}', src):
    if u"ufeff" in m.group(2):
        warui_bom.append(m.group(1))
for (nm, sub, tts) in DAIHON:
    for michi in (sub, tts):
        f = os.path.join(B, michi)
        if os.path.exists(f) and io.open(f, "rb").read(3) == b"\xef\xbb\xbf":
            warui_bom.append(os.path.basename(f))
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
         u"place_in_chunk", u"assign_images",
         u"refine_cues", u"split_by_kuten", u"split_text_by_time",
         u"koe_to_awaseru", u"jissoku_wariai"]
m_k = re.search(r"def kime_kata_shirushi\(\):(.*?)\ndef ", ms, re.S)
tsukatte = u"kime_kata_shirushi()" in ms.split(u"def inputs_fingerprint")[-1][:1500]
if not m_k:
    warui.append(u"kime_kata_shirushi が make_slideshow.py にありません")
    print(u"× kime_kata_shirushi がありません（決め方を直しても空振りします）")
elif not tsukatte:
    warui.append(u"inputs_fingerprint が kime_kata_shirushi を使っていません")
    print(u"× 指紋に決め方の印が入っていません（直しても空振りします）")
else:
    # ■ ファイル全体を見ているか（2026-10-08・3回目の空振りのあと）
    #
    # 手で並べた関数だけを見ていたせいで、字幕を割る所が抜けていた。
    # 本人の v144 が「⑥ 前回の割り当て表をそのまま使用」になり、
    # 直した処理が1行も動かなかった。並べ忘れは3回起きている。
    zentai = u"getsource(sys.modules[__name__])" in m_k.group(1)
    nai = [k for k in HISSU if k not in m_k.group(1)]
    if not zentai:
        warui.append(u"決め方の印が make_slideshow.py 全体を見ていません")
        print(u"× 印が関数の選び方に頼っています。並べ忘れると空振りします。")
    elif nai:
        warui.append(u"決め方の印に入っていない関数: " + u" ".join(nai))
        print(u"× 次の関数が印に入っていません。直しても空振りします:")
        for k in nai:
            print(u"   " + k)
    else:
        print(u"○ make_slideshow.py を1文字でも直せば、割り当て表は必ず作り直されます"
              u"（関数を並べ忘れようがありません）")

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

# ── ⑰ 絵を数字ひとつで直す仕組みが働くか ────────────
midashi(u"⑰", u"絵を数字ひとつで直す仕組みが働くか")
# 本人の工数をいちばん食うのが絵の直し。
# 候補の出し方・紙の数字・本人の指定の優先、どれが欠けても手間が戻る。
r = subprocess.run([sys.executable, os.path.join(V, u"直す検査.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"絵を直す仕組みが働いていません（直す検査.py）")

# ── ⑲ 絵と字幕が同じコマで切り替わるか ────────────
midashi(u"⑲", u"絵と字幕が同じコマで切り替わるか")
# 本人の指摘「字幕と音声はあっているが、字幕と画像の切り替わりがずれている」。
# 推測で直さず、**出来た動画のコマを数えて**確かめる。章カードの有無の両方。
r = subprocess.run([sys.executable, os.path.join(V, u"絵と字幕の検査.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"絵と字幕が同じコマで切り替わっていません")

# ── ⑳ 本人の直しを、機械だけで再現できるか ────────────
midashi(u"⑳", u"本人の直しを、機械だけで再現できるか")
# 本人が 29〜37番の絵を直し、**理由を全部書いてくれた**（2026-10-06）。
# 理由はぜんぶ「その1行だけでは分からないこと」だった。
#   「この子供」→ 前の文の「ルーデウスとロキシーのその子供が、」
#   「それが、」 → 前の文の「オルステッドと手を組み…」
# 台本の前後から読む仕組みを入れたので、**本人の答えと同じになるか**を毎回見る。
# ここが落ちたら、本人の工数がまた増えるということ。
r = subprocess.run([sys.executable, os.path.join(V, u"文脈検査.py")],
                   cwd=V, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                   env=dict(os.environ, PYTHONIOENCODING="utf-8"))
print(r.stdout.decode("utf-8", "replace").rstrip())
if r.returncode != 0:
    warui.append(u"本人の直し(29〜37番)を機械だけで再現できていません（文脈検査.py）")

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
if SHUKUDAI:
    print(u"")
    print(u"⚠ 作りかけのまま残っていること（出すのは止めません）:")
    for x in SHUKUDAI:
        print(u"   ・" + x)
print(u"\nboard.html ができました。掲示板に出してください。")
