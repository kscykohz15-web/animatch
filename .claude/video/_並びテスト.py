# -*- coding: utf-8 -*-
u"""作業フォルダの新しい並び（仕上げ.py ㉞）

■ 本人の指定（2026-11-20）

  > zipファイル解凍後、はじめるbatの完了後、自動で生成されるファイルやフォルダがぐちゃぐちゃで
  > 見にくいです。…01_画像、02_動画のように、分けてください。ここで、動画、音声、はそれぞれ分け、
  > あとの勝手に生成されるフォルダたち（基本的に私の方で確認不要）なものは、99_確認不要 フォルダを
  > 生成し保存してください。

  本人の選択:「台本・確認用も分ける」

    <作業フォルダ>\\  はじめる.bat / 01_台本 / 02_音声 / 03_動画 / 04_確認用 / 99_確認不要

  メニュー（PowerShell）はこちらで動かせない。だから
    ・引っ越し（並び替え.py）と道具（make_slideshow・ずれ実測・説明文）は**本当に動かす**
    ・メニューとパックは、ボードの本物の文字から取り出して**名前と道がそろっているか**を見る

■ 見ること
  ① 前の並びの作業フォルダを 並び替え.py が引っ越す
     （台本→01・音声→02・動画→03・分割版と確認用→04・道具と設定とその他→99・声の控え→99\\その他）
  ② 何も消さない（引っ越す前のファイルの中身が、ぜんぶどこかに残っている）
     ぶつかったら古いほうは 99_確認不要\\_前の並び。育てるカタログは中身の多いほう、
     学んだ話数の入った 画面表示.txt を残す
  ③ 知らないファイル・フォルダには触らない／はじめる.bat はいちばん上に残す
  ④ 2回目は何もしない
  ⑤ 新しい並びで、99_確認不要 から make_slideshow を動かすと
     02_音声 の声を読み、03_動画 に動画・04_確認用 に一覧と入れ替え表とスマホ用・99 にその他、
     **いちばん上に前の名前（音声・動画・確認用・その他）を作らない**
  ⑥ ずれ実測.py・説明文.py も 04_確認用 に書く
  ⑦ メニュー: 並びの名前が道具と同じ／Prepare が先に 並び替え.py を呼ぶ／
     道具を動かす所は 99_確認不要／前の道（$root の下の 音声・動画・確認用）が残っていない
  ⑧ パック: いちばん上は はじめる.bat だけ（本人の指定 2026-11-20「はじめるbatだけは、直下、
     それ以外は99_確認不要フォルダへ」）。台本は 99_確認不要/パックの台本。はじめる.bat は日本語なしで
     99_ の menu.ps1 を探し、無ければ隣の menu.ps1
  ⑨ パックの台本を 01_台本 へ入れる（並び替え.py --daihon。Prepare が呼ぶ）
     はじめて → 入る／同じパックをもう一度 → 01_台本 で直した台本を上書きしない／
     新しい台本のパック → 入り、前の台本は 99_確認不要\\_前の台本 へ／01_台本 から消えていたら入れ直す／
     パックを作業フォルダに解いたとき（99_確認不要\\パックの台本）も同じ
"""
from __future__ import print_function
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

FF = shutil.which("ffmpeg")
NODE = shutil.which("node")
warui = []
ENV = dict(os.environ, PYTHONIOENCODING="utf-8")

DAI, OTO, DOU, KAK, FUY = u"01_台本", u"02_音声", u"03_動画", u"04_確認用", u"99_確認不要"


def iu(ok, msg):
    print(u"%s %s" % (u"○" if ok else u"×", msg))
    if not ok:
        warui.append(msg)


def kaku(p, body=u"", b=None):
    d = os.path.dirname(p)
    if not os.path.isdir(d):
        os.makedirs(d)
    if b is not None:
        io.open(p, "wb").write(b)
    else:
        io.open(p, "w", encoding="utf-8", newline="\n").write(body)


def nakami(root):
    u"""root の下のファイルの中身（md5）→ 相対の道 の一覧。"""
    d = {}
    for a, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(a, f)
            h = hashlib.md5(io.open(p, "rb").read()).hexdigest()
            d.setdefault(h, []).append(os.path.relpath(p, root))
    return d


def ichiran(root):
    out = []
    for a, ds, fs in os.walk(root):
        for f in fs:
            out.append(os.path.relpath(os.path.join(a, f), root).replace(os.sep, u"/"))
    return sorted(out)


def aru(root, rel):
    return os.path.exists(os.path.join(root, *rel.split(u"/")))


# ── ①〜④ 引っ越し ─────────────────────────────
def hikkoshi(tmp):
    r = os.path.join(tmp, u"05_動画", u"01_前の並び")
    kaku(os.path.join(r, u"はじめる.bat"), u"@echo off\r\n")
    kaku(os.path.join(r, u"menu.ps1"), u"# 前のメニュー\n")
    kaku(os.path.join(r, u"make_slideshow.py"), u"# 前の道具\n")
    kaku(os.path.join(r, u"台本_字幕用.txt"), u"前の台本です。\n")
    kaku(os.path.join(r, u"台本_読み上げ用.txt"), u"マエノダイホンデス。\n")
    kaku(os.path.join(r, u"画像カタログ.txt"), u"a\t1\nb\t2\nc\t3\nd\t4\ne\t5\n")
    kaku(os.path.join(r, u"画面表示.txt"), u"# 学んだ話数が入っています\n章\tあ\n")
    kaku(os.path.join(r, u"演出.txt"), u"前の演出\n")
    kaku(os.path.join(r, u"音声", u"merged.wav"), b=b"RIFF-mae")
    kaku(os.path.join(r, u"音声", u"subtitle.srt"), u"1\n00:00:00,000 --> 00:00:01,000\nあ\n")
    kaku(os.path.join(r, u"音声", u"音声のもと.txt"), u"前の台本です。\n")
    kaku(os.path.join(r, u"音声", u"声のもと.txt"), u"マエノダイホンデス。\n")
    kaku(os.path.join(r, u"動画", u"01_前の並び.mp4"), b=b"mp4-hon")
    kaku(os.path.join(r, u"動画", u"分割版", u"001.mp4"), b=b"mp4-001")
    kaku(os.path.join(r, u"確認用", u"一覧.txt"), u"1\t0:00\t1.0\n")
    kaku(os.path.join(r, u"確認用", u"入れ替え表.html"), u"<html></html>")
    kaku(os.path.join(r, u"確認用", u"スマホ用", u"jimaku.json"), u"{}")
    kaku(os.path.join(r, u"その他", u"差し替え.txt"), u"12\t3\n")
    kaku(os.path.join(r, u"その他", u"_work", u"a.png"), b=b"png-a")
    kaku(os.path.join(r, u"_work", u"b.png"), b=b"png-b")
    kaku(os.path.join(r, u"output", u"001.wav"), b=b"RIFF-001")
    kaku(os.path.join(r, u"図表", u"年表.png"), b=b"png-nenpyou")
    kaku(os.path.join(r, u"効果音", u"ぽん.wav"), b=b"RIFF-pon")
    kaku(os.path.join(r, u"BGM", u"曲.mp3"), b=b"mp3")
    kaku(os.path.join(r, u"_前の設定", u"20261101_演出.txt"), u"もっと前の演出\n")
    kaku(os.path.join(r, u"ショート_01", u"s.mp4"), b=b"mp4-short")
    # 本人が自分で置いたかもしれない物（触らない）
    kaku(os.path.join(r, u"メモ.docx"), b=b"docx")
    kaku(os.path.join(r, u"自分のフォルダ", u"x.txt"), u"自分の\n")
    # 先に 01・99 がある（新しいパックを作業フォルダに解いた・前のメニューと行き来した）。ぶつかる所
    kaku(os.path.join(r, DAI, u"台本_字幕用.txt"), u"01_台本 の台本です。\n")
    kaku(os.path.join(r, FUY, u"画像カタログ.txt"), u"a\t1\nb\t2\n")          # 少ない → 前のほうを残す
    kaku(os.path.join(r, FUY, u"画面表示.txt"), u"章\tい\n")                   # 学んでいない → 前のほうを残す
    kaku(os.path.join(r, FUY, u"演出.txt"), u"新しい演出\n")                    # 新しいほうを残す
    kaku(os.path.join(r, FUY, u"make_slideshow.py"), u"# 新しい道具\n")

    mae = nakami(r)
    p = subprocess.run([sys.executable, os.path.join(HERE, u"並び替え.py"), r],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=ENV)
    log = p.stdout.decode("utf-8", "replace")
    print(u"\n".join(u"    " + l for l in log.strip().split(u"\n")))
    iu(p.returncode == 0, u"① 並び替え.py が最後まで走る")
    hairu = {
        DAI + u"/台本_読み上げ用.txt": u"マエノダイホンデス。\n",
        OTO + u"/merged.wav": None, OTO + u"/subtitle.srt": None,
        FUY + u"/その他/音声のもと.txt": u"前の台本です。\n",
        FUY + u"/その他/声のもと.txt": u"マエノダイホンデス。\n",
        DOU + u"/01_前の並び.mp4": None,
        KAK + u"/分割版/001.mp4": None, KAK + u"/一覧.txt": None,
        KAK + u"/入れ替え表.html": None, KAK + u"/スマホ用/jimaku.json": None,
        FUY + u"/その他/差し替え.txt": None, FUY + u"/その他/_work/a.png": None,
        FUY + u"/その他/_work/b.png": None, FUY + u"/output/001.wav": None,
        FUY + u"/図表/年表.png": None, FUY + u"/効果音/ぽん.wav": None, FUY + u"/BGM/曲.mp3": None,
        FUY + u"/_前の設定/20261101_演出.txt": None, FUY + u"/ショート_01/s.mp4": None,
        FUY + u"/menu.ps1": None,
    }
    nai = [k for k in hairu if not aru(r, k)]
    iu(not nai, u"① 決めた場所へ引っ越す（%d か所）%s" % (len(hairu), (u" ── 無い: " + u"、".join(nai)) if nai else u""))
    chigau = [k for k, v in hairu.items() if v is not None and aru(r, k)
              and io.open(os.path.join(r, *k.split(u"/")), encoding="utf-8").read() != v]
    iu(not chigau, u"① 中身も合っている%s" % ((u" ── 違う: " + u"、".join(chigau)) if chigau else u""))
    ue = sorted(os.listdir(r))
    iu(ue == sorted([u"はじめる.bat", DAI, OTO, DOU, KAK, FUY, u"メモ.docx", u"自分のフォルダ"]),
       u"③ いちばん上は はじめる.bat・番号のフォルダ・本人の物だけ（%s）" % u" ".join(ue))
    iu(aru(r, u"自分のフォルダ/x.txt") and aru(r, u"メモ.docx"), u"③ 知らない物には触らない")
    # ② 何も消さない
    ato = nakami(r)
    kieta = [v[0] for h, v in mae.items() if h not in ato]
    iu(not kieta, u"② 何も消さない（中身 %d 種類がぜんぶ残る）%s"
       % (len(mae), (u" ── 消えた: " + u"、".join(kieta)) if kieta else u""))
    yomu = lambda k: io.open(os.path.join(r, *k.split(u"/")), encoding="utf-8").read()
    iu(yomu(DAI + u"/台本_字幕用.txt") == u"01_台本 の台本です。\n",
       u"② 台本がぶつかったら 01_台本 のほうを残し、いちばん上にあった前のほうは _前の並び へ")
    iu(yomu(FUY + u"/画像カタログ.txt").count(u"\t") == 5, u"② 画像カタログ.txt は中身の多いほうを残す")
    iu(u"学んだ話数が入っています" in yomu(FUY + u"/画面表示.txt"), u"② 学んだ話数の入った 画面表示.txt を残す")
    iu(yomu(FUY + u"/演出.txt") == u"新しい演出\n" and yomu(FUY + u"/make_slideshow.py") == u"# 新しい道具\n",
       u"② 設定と道具は新しいほうを残す")
    bk = [x for x in ichiran(r) if x.startswith(FUY + u"/_前の並び/")]
    iu(len(bk) >= 4, u"② ぶつかった古いほう %d 個を 99_確認不要\\_前の並び に残す" % len(bk))
    # ④ 2回目
    sanshou = ichiran(r)
    p2 = subprocess.run([sys.executable, os.path.join(HERE, u"並び替え.py"), r],
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=ENV)
    log2 = p2.stdout.decode("utf-8", "replace")
    iu(p2.returncode == 0 and ichiran(r) == sanshou and u"引っ越し" not in log2,
       u"④ 2回目は何もしない")


# ── ⑤⑥ 新しい並びで道具を動かす ───────────────────
def dougu(tmp):
    if not FF:
        print(u"… ffmpeg が無いので ⑤⑥ はとばします")
        return
    try:
        import PIL  # noqa: F401
    except ImportError:
        print(u"… Pillow が無いので ⑤⑥ はとばします")
        return
    import _オープニングテスト as OT
    OT.FF = FF
    root = os.path.join(tmp, u"03_おすすめアニメ動画")
    e = os.path.join(root, u"01_画像")
    from PIL import Image
    for n, fol in enumerate((u"あか組！", u"あお組")):
        os.makedirs(os.path.join(e, fol))
        for j in range(4):
            OT.kizami_e(os.path.join(e, fol, u"%04d.png" % (j + 1)), (60 + n * 80, 90, 30 * j), n * 10 + j)
        Image.new("RGB", (300, 400), (250, 250, 250)).save(os.path.join(e, fol, u"1.jpg"))
    w = os.path.join(root, u"05_動画", u"01_ためし")
    work = os.path.join(w, FUY)
    os.makedirs(os.path.join(work, u"効果音"))
    for d in (DAI, OTO, DOU, KAK):
        os.makedirs(os.path.join(w, d))
    kaku(os.path.join(w, DAI, u"台本_字幕用.txt"), OT.DAIHON)
    # メニューの SyncDaihon と同じ：01_台本 の写しを 99 に置いてから道具を動かす
    shutil.copy(os.path.join(w, DAI, u"台本_字幕用.txt"), os.path.join(work, u"台本_字幕用.txt"))
    for nm, body in ((u"画面表示.txt", OT.GAMEN), (u"画像プラン.txt", OT.PLAN)):
        kaku(os.path.join(work, nm), body)
    for f in (u"見た目.txt", u"演出.txt", u"make_slideshow.py", u"置き場所.py", u"ずれ実測.py", u"説明文.py"):
        shutil.copy(os.path.join(HERE, f), os.path.join(work, f))
    OT.ff(["-f", "lavfi", "-i",
           "sine=frequency=280:duration=40,volume='if(lt(mod(t,2),1.5),0.5,0)':eval=frame",
           "-ar", "44100", "-ac", "1", os.path.join(w, OTO, u"merged.wav")])
    rc, log = OT.hashiru(work, e)
    if rc != 0:
        print(log[-2500:])
    iu(rc == 0, u"⑤ 99_確認不要 から make_slideshow が最後まで走る（02_音声 の声を読む）")
    dou = [f for f in os.listdir(os.path.join(w, DOU)) if f.endswith(u".mp4")]
    iu(bool(dou), u"⑤ 03_動画 に動画ができる（%s）" % (u"・".join(dou) or u"無し"))
    for rel in (u"一覧.txt", u"入れ替え表.html"):
        iu(aru(w, KAK + u"/" + rel), u"⑤ 04_確認用\\%s ができる" % rel)
    iu(os.path.isdir(os.path.join(w, KAK, u"スマホ用")), u"⑤ 04_確認用\\スマホ用 ができる")
    iu(os.path.isdir(os.path.join(work, u"その他")), u"⑤ その他（作業ファイル）は 99_確認不要 の中")
    # 動画の名前（入れ替え表・スマホ用の #@title・BGM の種）は作業フォルダの名前。
    # 道具のいるフォルダの名前を使うと、どの動画も「99_確認不要」になる（v201 を出す前に見つけた）
    ij = os.path.join(w, KAK, u"スマホ用", u"ichiran.json")
    try:
        t = json.load(io.open(ij, encoding="utf-8")).get(u"title")
    except Exception:
        t = None
    iu(t == u"01_ためし", u"⑤ スマホ用の動画の名前は作業フォルダの名前（%s）── 99_確認不要 にしない" % t)
    ih = io.open(os.path.join(w, KAK, u"入れ替え表.html"), encoding="utf-8").read() \
        if aru(w, KAK + u"/入れ替え表.html") else u""
    iu(bool(re.search(u'"title":\\s*"01_ためし"', ih)) and not re.search(u'"title":\\s*"99_', ih),
       u"⑤ 入れ替え表の動画の名前も作業フォルダの名前")
    mae_na = [d for d in (u"音声", u"動画", u"確認用", u"その他") if os.path.isdir(os.path.join(w, d))]
    mae_na += [FUY + u"\\" + d for d in (u"音声", u"動画", u"確認用") if os.path.isdir(os.path.join(work, d))]
    iu(not mae_na, u"⑤ 前の名前のフォルダ（音声・動画・確認用）をどこにも作らない%s"
       % ((u" ── できた: " + u"、".join(mae_na)) if mae_na else u""))
    iu(sorted(os.listdir(w)) == sorted([DAI, OTO, DOU, KAK, FUY]),
       u"⑤ いちばん上は番号のフォルダだけ（%s）" % u" ".join(sorted(os.listdir(w))))
    # ⑥ ずれ実測・説明文
    p = subprocess.run([sys.executable, u"ずれ実測.py"], cwd=work, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=ENV)
    iu(aru(w, KAK + u"/ずれ.txt"),
       u"⑥ ずれ実測.py が 04_確認用\\ずれ.txt に書く" + (u"" if aru(w, KAK + u"/ずれ.txt")
                                                   else u" ── " + p.stdout.decode("utf-8", "replace")[-400:]))
    p = subprocess.run([sys.executable, u"説明文.py"], cwd=work, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=ENV)
    iu(aru(w, KAK + u"/説明文.txt"),
       u"⑥ 説明文.py が 04_確認用\\説明文.txt に書く" + (u"" if aru(w, KAK + u"/説明文.txt")
                                                   else u" ── " + p.stdout.decode("utf-8", "replace")[-400:]))
    iu(sorted(os.listdir(w)) == sorted([DAI, OTO, DOU, KAK, FUY]), u"⑥ そのあとも、いちばん上は番号のフォルダだけ")


# ── ⑦⑧ メニューとパック ─────────────────────────
def menu_to_pack(tmp):
    if not NODE:
        print(u"… node が無いので ⑦⑧ はとばします")
        return
    src = os.path.join(HERE, u"board.src.html")
    ps1 = os.path.join(tmp, u"menu.ps1")
    p = subprocess.run([NODE, os.path.join(HERE, u"menu_dump.js"), src, ps1],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if p.returncode != 0 or not os.path.exists(ps1):
        iu(False, u"⑦ menu.ps1 を取り出せませんでした")
        return
    m = io.open(ps1, encoding="utf-8").read()
    ms = io.open(os.path.join(HERE, u"make_slideshow.py"), encoding="utf-8").read()
    nb = io.open(os.path.join(HERE, u"並び替え.py"), encoding="utf-8").read()
    for nm in (DAI, OTO, DOU, KAK, FUY):
        iu((u"'%s'" % nm) in m and (u'u"%s"' % nm) in nb
           and (nm in (DAI, FUY) or (u'u"%s"' % nm) in ms),
           u"⑦ 「%s」の名前が メニュー・並び替え.py・make_slideshow.py で同じ" % nm)
    iu(u'startswith(u"99_")' in ms, u"⑦ make_slideshow.py は 99_ にいれば新しい並び（メニューの 99_確認不要 と合う）")
    pre = m[m.index(u"function Prepare {"):m.index(u"function Pause2")]
    i_nb = pre.find(u"並び替え.py")
    i_cp = pre.find(u"Copy-Item")
    iu(0 <= i_nb < i_cp, u"⑦ Prepare は道具を写す前に 並び替え.py を呼ぶ")
    iu(u"SyncDaihon" in pre, u"⑦ Prepare の終わりに 01_台本 の写しを 99 に置く（SyncDaihon）")
    for fn in (u"MakeVoice", u"MakeVideo", u"KoeZure"):
        a = m.index(u"function %s" % fn)
        body = m[a:m.index(u"\n}\n", a)]
        iu(u"Set-Location $work" in body and u"Set-Location $root" not in body,
           u"⑦ %s は 99_確認不要 で道具を動かす" % fn)
    mv = m[m.index(u"function MakeVoice"):m.index(u"function CheckVideoTools")]
    iu(u"Move-Item $s3 (Join-Path $otoDir $k)" in mv, u"⑦ 声を作ったら merged.wav・subtitle.srt を 02_音声 へ移す")
    iu(u"(Join-Path $so '声のもと.txt')" in mv and u"$so = Join-Path $work 'その他'" in mv,
       u"⑦ 声の控え（声のもと・音声のもと）は 99_確認不要\\その他")
    iu(u"Join-Path $work 'その他\\声のもと.txt'" in m, u"⑦ KoeZure は 99_確認不要\\その他\\声のもと.txt と比べる")
    nokori = re.findall(u"Join-Path \\$root '(?:音声|動画|確認用|その他|台本_|merged|画像割り当て|使うモデル|パック版|編集のクセ)[^']*'", m)
    nokori += re.findall(u"Set-Location \\$root|Push-Location \\$root", m)
    iu(not nokori, u"⑦ 前の道（作業フォルダのいちばん上の 音声・動画・確認用・その他…）が残っていない%s"
       % ((u" ── " + u"、".join(nokori[:5])) if nokori else u""))
    # ⑧ パック: board.src.html の本物の JS（HAJIMERU_BAT・narabiPack）を node で動かす
    s = io.open(src, encoding="utf-8").read()
    a = s.index(u"  var HAJIMERU_BAT = [")
    b = s.index(u"  function exportAllPack(id, title, btn){")
    js = s[a:b] + u"""
var names = ["はじめる.bat","menu.ps1","パック版.txt","台本_字幕用.txt","台本_読み上げ用.txt","README.txt",
             "make_slideshow.py","並び替え.py","画像プラン.txt","図表/年表.png","効果音/ぽん.wav","BGM/ここに曲を入れてください.txt"];
var es = names.map(function(n){ return {name:n}; });
// スマホで決めた絵（掲示板の「修正を決定」）。動画の名前が合うものだけ入る
var kf = sumahoKetteiFile({title: "01_ためし", n: 2, text: "#@title\\t01_ためし\\r\\n5\\tあか組！/0005.png\\t本作は\\r\\n"}, "01_ためし");
if (kf) es.push(kf);
var betsu = sumahoKetteiFile({title: "02_ほか", n: 1, text: "#@title\\t02_ほか\\r\\n"}, "01_ためし");
narabiPack(es);
process.stdout.write(JSON.stringify({bat: HAJIMERU_BAT, names: es.map(function(e){ return e.name; }),
  kettei: kf ? kf.text : null, betsu: betsu}));
"""
    jf = os.path.join(tmp, u"pack.js")
    io.open(jf, "w", encoding="utf-8").write(js)
    p = subprocess.run([NODE, jf], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        o = json.loads(p.stdout.decode("utf-8"))
    except ValueError:
        iu(False, u"⑧ パックの並びの JS が動きません: " + p.stdout.decode("utf-8", "replace")[-400:])
        return
    top = sorted(set(n.split(u"/")[0] for n in o["names"]))
    iu(top == sorted([u"はじめる.bat", FUY]),
       u"⑧ パックのいちばん上は はじめる.bat と 99_確認不要 だけ（%s）" % u" ".join(top))
    iu(u"99_確認不要/パックの台本/台本_字幕用.txt" in o["names"]
       and u"99_確認不要/パックの台本/台本_読み上げ用.txt" in o["names"],
       u"⑧ 台本は 99_確認不要\\パックの台本 に入る（作業フォルダの 99 にある台本の写しと別の名前）")
    iu(u"99_確認不要/menu.ps1" in o["names"] and u"99_確認不要/並び替え.py" in o["names"]
       and u"99_確認不要/図表/年表.png" in o["names"],
       u"⑧ menu.ps1・道具・図表は 99_確認不要 に入る（menu.ps1 の Prepare が $here を 99 と見るのと合う）")
    bat = o["bat"]
    iu(all(ord(c) < 128 for c in bat), u"⑧ はじめる.bat に日本語が入っていない（cmd が読む前に化けるため）")
    iu(u'"%~dp099_*"' in bat and u"\\menu.ps1" in bat and u"goto :eof" in bat,
       u"⑧ はじめる.bat は 99_ で始まるフォルダの menu.ps1 を探す")
    last = [l for l in bat.split(u"\r\n") if l.strip()][-1]
    iu(u'"%~dp0menu.ps1"' in last, u"⑧ 見つからなければ前の形（隣の menu.ps1）で動く")
    iu(u"\r\n" in bat and u"\n" not in bat.replace(u"\r\n", u""), u"⑧ はじめる.bat の改行は CRLF")
    iu(u"$packTop = Split-Path -Parent $here" in m and u"Join-Path $packTop 'はじめる.bat'" in m
       and u"Join-Path $packTop '01_台本'" not in m,
       u"⑧ menu.ps1 は はじめる.bat を 99 の1つ上に探す（台本は探さない）")
    iu(u"python $nb $root --daihon (Join-Path $here 'パックの台本')" in pre,
       u"⑧ Prepare は パックの台本 を 並び替え.py --daihon に渡す")
    # 保存名は、どの動画でも 00_制作パック.zip（本人の指定 2026-11-21「どの動画でも00_制作パックという名前に」）。
    # 作業フォルダは menu.ps1 が 05_動画\<番号つきの題名> に決めるので、zip の名前は動画の名前に関わらない。
    # 片づけ（9）は「*_制作パック.zip」「*_制作パック」で古いパックを拾うので、00_ もそのまま拾える
    ex = s[s.index(u"  function exportAllPack(id, title, btn){"):]
    ex = ex[:ex.index(u"\n  }\n") + 4]
    iu(u'filename: "00_制作パック.zip"' in ex and u'"_制作パック.zip"' not in ex,
       u"⑧ 制作パックの保存名は、どの動画でも 00_制作パック.zip")
    iu(u"'*_制作パック.zip'" in s and u"-like '*_制作パック'" in s,
       u"⑧ 片づけ（9）は 00_制作パック.zip とそれを解いたフォルダも拾える（*_制作パック）")
    # スマホで決めた絵（2026-11-20 本人の指定: 決定ボタンを押せば制作パックにその内容が更新される）
    iu(u"99_確認不要/その他/irekae_sumaho.txt" in o["names"] and (o.get("kettei") or u"").startswith(u"\ufeff#@title\t01_ためし")
       and o.get("betsu") is None,
       u"⑧ スマホで決めた絵はパックの 99_確認不要\\その他\\irekae_sumaho.txt に入る（別の動画の決定は入れない）")
    iu(u"Join-Path $here 'その他\\irekae_sumaho.txt'" in pre and u"Copy-Item $ks $kd -Force" in pre
       and pre.index(u"irekae_sumaho") < pre.index(u"SyncDaihon\n}") if u"SyncDaihon\n}" in pre else False,
       u"⑧ Prepare は パックの その他\\irekae_sumaho.txt を作業フォルダの 99_確認不要\\その他 へ写す")


# ── ⑨ パックの台本を 01_台本 へ ──────────────────
def daihon(tmp):
    w = os.path.join(tmp, u"05_動画", u"02_台本を入れる")
    pk = os.path.join(tmp, u"Downloads", u"02_台本を入れる_制作パック", FUY, u"パックの台本")
    S, Y = u"台本_字幕用.txt", u"台本_読み上げ用.txt"

    def pack(sub, yomi):
        kaku(os.path.join(pk, S), sub)
        kaku(os.path.join(pk, Y), yomi)

    def hashiru(src):
        p = subprocess.run([sys.executable, os.path.join(HERE, u"並び替え.py"), w, u"--daihon", src],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=ENV)
        return p.returncode, p.stdout.decode("utf-8", "replace")

    def dai(n=S):
        q = os.path.join(w, DAI, n)
        return io.open(q, encoding="utf-8").read() if os.path.exists(q) else None

    def mae():
        q = os.path.join(w, FUY, u"_前の台本")
        return sorted(os.listdir(q)) if os.path.isdir(q) else []

    pack(u"一つ目のパックの台本です。\n", u"ヒトツメ。\n")
    rc, log = hashiru(pk)
    iu(rc == 0 and dai() == u"一つ目のパックの台本です。\n" and dai(Y) == u"ヒトツメ。\n"
       and u"01_台本 に入れました" in log,
       u"⑨ はじめて → パックの台本が 01_台本 に入る")
    kaku(os.path.join(w, DAI, S), u"本人が直した台本です。\n")
    rc, log = hashiru(pk)
    iu(rc == 0 and dai() == u"本人が直した台本です。\n" and not mae(),
       u"⑨ 同じパックをもう一度 → 01_台本 で直した台本を上書きしない")
    pack(u"二つ目のパックの台本です。\n", u"ヒトツメ。\n")
    rc, log = hashiru(pk)
    bk = mae()
    iu(rc == 0 and dai() == u"二つ目のパックの台本です。\n" and len(bk) == 1
       and io.open(os.path.join(w, FUY, u"_前の台本", bk[0]), encoding="utf-8").read() == u"本人が直した台本です。\n",
       u"⑨ 新しい台本のパック → 入り、直していた前の台本は 99_確認不要\\_前の台本 に残る（%s）" % u"・".join(bk))
    iu(dai(Y) == u"ヒトツメ。\n" and len(bk) == 1, u"⑨ 変わっていない読み上げ用は触らない")
    os.remove(os.path.join(w, DAI, S))
    rc, log = hashiru(pk)
    iu(rc == 0 and dai() == u"二つ目のパックの台本です。\n", u"⑨ 01_台本 から消えていたら、同じパックでも入れ直す")
    # パックを作業フォルダに解いた（パックの台本が 作業フォルダ\99_確認不要\パックの台本）
    nk = os.path.join(w, FUY, u"パックの台本")
    kaku(os.path.join(nk, S), u"三つ目のパックの台本です。\n")
    kaku(os.path.join(nk, Y), u"ミッツメ。\n")
    rc, log = hashiru(nk)
    iu(rc == 0 and dai() == u"三つ目のパックの台本です。\n" and dai(Y) == u"ミッツメ。\n",
       u"⑨ パックを作業フォルダに解いたときも入る")
    kaku(os.path.join(w, DAI, S), u"また直した台本です。\n")
    rc, log = hashiru(nk)
    iu(rc == 0 and dai() == u"また直した台本です。\n", u"⑨ そのあと作業フォルダの はじめる.bat を動かしても、直した台本を残す")
    iu(sorted(os.listdir(w)) == sorted([DAI, OTO, DOU, KAK, FUY]), u"⑨ 作業フォルダのいちばん上は番号のフォルダだけ")


def main():
    tmp = tempfile.mkdtemp(prefix=u"narabi_")
    try:
        hikkoshi(tmp)
        daihon(tmp)
        dougu(tmp)
        menu_to_pack(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print()
    if warui:
        print(u"× 新しい並びで %d か所が合っていません" % len(warui))
        return 1
    print(u"○ 作業フォルダの新しい並び（01_台本・02_音声・03_動画・04_確認用・99_確認不要）が通ります")
    return 0


if __name__ == "__main__":
    sys.exit(main())
