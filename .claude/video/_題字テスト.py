# -*- coding: utf-8 -*-
u"""おすすめ紹介の回を、小さな材料で**本当に最後まで作って**確かめる

■ 本人の指定（2026-11-15・ラブコメ20選を見て）

  ① はじめにの章の絵は、紹介する作品群の中から。右上の「はじめに」は出さない
  ② 左上は、いま出ている絵の作品の ©表記
  ③ 作品が切り替わるシーンは、エフェクトで切り替える
  ④ タイトルと制作会社を言うところは、公式画像（1）をそのまま全面に＋下の帯に
     「制作：○○」「作品名」。右半分に題名は出さない（本人の直し）

■ なぜ本当に作るのか

4つとも「作品フォルダの回」だけの枝で、無職転生の材料では一度も通らない。
煙テスト（無職転生の形）が通っても、こちらが動く保証は何も無い。
作品フォルダ・公式画像・著作権.txt をその場で作り、完成.mp4 まで走らせる。
"""
from __future__ import print_function
import io, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAGYOU = os.path.join(HERE, u"_題字テスト作業")
FF = shutil.which("ffmpeg")
warui = []


def iu(ok, msg):
    print(u"%s %s" % (u"○" if ok else u"×", msg))
    if not ok:
        warui.append(msg)


def ff(args):
    r = subprocess.run([FF, "-y", "-loglevel", "error"] + args,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-1500:])
        raise SystemExit(u"材料が作れませんでした")


DAIHON = u"""どうもこんにちわ、かさです。
今回の動画の内容は、ためしの作品を三つご紹介します。それでは早速紹介にうつります。
最初にご紹介する作品は、あか組！、制作はこうしゃ。
本作は漫画が原作です。物語は、赤い所から始まります。
こんどは青い話です。続いての作品は、あお組、制作はおつしゃ。
本作はゲームが原作です。物語は、青い所から始まります。
最後は絵の無い作品です。最後にご紹介する作品は、みどり組、制作はへいしゃ。
本作はオリジナル作品です。
今回の動画は以上となります。ご視聴ありがとうございました。
"""

GAMEN = u"""引用\t各作品の著作権は、それぞれの権利者に帰属します
章\t今回の動画の内容は\t－\t＊全作品\t
章\tあか組\tあか組！\\N2014年冬\tあか組！\t
章\tあお組\tあお組\\N2010年夏\tあお組\t
章\tみどり組\tみどり組\\N2025年夏\tみどり組\t
章\t今回の動画は以上となります\tおわりに\t＊全作品\t
"""

CHOSAKU = u"""あか組！\t©あか/あか製作委員会
あお組\t©あお/あお製作委員会
"""

ENSHUTSU = u"""区切り\t。\tカメラ.mp3\t暗転\t0.17
区切り\t章\tカードをめくる.mp3\tページめくり\t0.40
効果音の音量\t0.4
章タイトル\tはい
章タイトルの秒数\t1.5
章タイトルの音\tドーン.mp3
章タイトルのエフェクト\t暗転
章タイトルの色\t141024
章タイトルの絵の幅\t0.5
章タイトルの背景抜き\tいいえ
"""


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    e = os.path.join(SAGYOU, u"絵")
    for fol, cols in ((u"あか組！", ("red", "darkred", "salmon", "crimson")),
                      (u"あお組", ("blue", "navy", "skyblue", "royalblue")),
                      (u"べつの作品", ("green", "lime", "olive", "teal"))):
        os.makedirs(os.path.join(e, fol))
        for n, col in enumerate(cols):
            ff(["-f", "lavfi", "-i", "color=c=%s:s=1280x720" % col, "-frames:v", "1",
                os.path.join(e, fol, "%04d.jpg" % (n + 2))])
    # 公式画像は あか組！ にだけ置く（あお組は公式画像なし・みどり組はフォルダなし）
    ff(["-f", "lavfi", "-i", "testsrc2=s=1200x1600", "-frames:v", "1",
        os.path.join(e, u"あか組！", "1.jpg")])
    os.makedirs(os.path.join(SAGYOU, u"効果音"))
    for nm, body in ((u"台本_字幕用.txt", DAIHON), (u"画面表示.txt", GAMEN),
                     (u"著作権.txt", CHOSAKU), (u"演出.txt", ENSHUTSU),
                     (u"話数マップ.txt",
                      u"べつの作品\t穏やか 室内 立ち姿 空 街 歩く 本 文字あり\n")):
        io.open(os.path.join(SAGYOU, nm), "w", encoding="utf-8",
                newline="\n").write(body)
    shutil.copy(os.path.join(HERE, u"見た目.txt"), os.path.join(SAGYOU, u"見た目.txt"))
    for nm, hz, byou in ((u"カメラ.mp3", 1200, 0.10), (u"カードをめくる.mp3", 600, 0.20),
                         (u"ドーン.mp3", 180, 0.60)):
        ff(["-f", "lavfi", "-i", "sine=frequency=%d:duration=%s" % (hz, byou),
            "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, u"効果音", nm)])
    ff(["-f", "lavfi", "-i",
        "sine=frequency=280:duration=40,volume='if(lt(mod(t,2),1.5),0.5,0)':eval=frame",
        "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, "merged.wav")])
    for f in ("make_slideshow.py", u"置き場所.py", u"プラン下書き.py", u"当て方.txt"):
        shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    # 画像プランは本番と同じ道具で作る（#公式 がここで入る）
    sys.path.insert(0, SAGYOU)
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        u"shitagaki_d", os.path.join(SAGYOU, u"プラン下書き.py"))
    P = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(P)
    P.tsukuru(os.path.join(SAGYOU, u"台本_字幕用.txt"), os.path.join(SAGYOU, u"画面表示.txt"),
              os.path.join(SAGYOU, u"画像プラン.txt"), u"ためし", koushiki=True)
    return e


def koma(mp4, t, out):
    ff(["-ss", "%.2f" % t, "-i", mp4, "-frames:v", "1", out])


def main():
    if not FF:
        print(u"ffmpeg が無いので、とばします。")
        return 0
    e = junbi()
    r = subprocess.run([sys.executable, "make_slideshow.py", "--images", e, "--sec", "2"],
                       cwd=SAGYOU, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    out = r.stdout.decode("utf-8", "replace")
    io.open(os.path.join(SAGYOU, u"_log.txt"), "w", encoding="utf-8").write(out)
    if r.returncode != 0:
        print(out[-3500:])
        print(u"\n× make_slideshow.py が最後まで走りませんでした。")
        return 1
    mp4 = os.path.join(SAGYOU, u"動画", u"完成.mp4")
    iu(os.path.exists(mp4), u"完成.mp4 ができた")

    # ── ① はじめに
    ichi = io.open(os.path.join(SAGYOU, u"確認用", u"一覧.txt"), encoding="utf-8-sig").read()
    iu(u"べつの作品" not in ichi, u"① 紹介していない作品（べつの作品）の絵が1枚も出ない")
    ass = io.open(os.path.join(SAGYOU, u"その他", u"_work", u"burn.ass"),
                  encoding="utf-8").read()
    chap = [l for l in ass.split(u"\n") if u",Chap," in l]
    iu(not any(l.rstrip().endswith(u"－") or u",,－" in l for l in chap),
       u"① 右上に「－」（はじめに）を出していない")
    iu(any(u"あか組" in l for l in chap), u"① 作品の章の右上は出ている")
    iu(u"章タイトルのカードを 1枚" in out,
       u"① 声の無い章カードは おわりに の1枚だけ（はじめに・作品の章には入れない）")

    # ── ② 左上
    cre = [l for l in ass.split(u"\n") if u",Credit," in l]
    iu(any(u"©あか/あか製作委員会" in l for l in cre)
       and any(u"©あお/あお製作委員会" in l for l in cre),
       u"② 左上に作品ごとの ©表記が出る（%d 回切り替わる）" % len(cre))
    iu(any(u"それぞれの権利者に帰属" in l for l in cre),
       u"② 表に無い所（無地の章）は共通の表記に戻る")

    # ── ③④ 題字の画面
    iu(u"作品の頭の1文 3 か所を「題字の画面」にしました" in out, u"④ 3作品とも題字の画面になった")
    dj = [l for l in ass.split(u"\n") if u",Daiji," in l]
    iu(any(u"制作：こうしゃ" in l for l in dj) and any(l.endswith(u"あか組！") for l in dj),
       u"④ 帯に「制作：こうしゃ」と「あか組！」が出る")
    iu(any(u"制作：おつしゃ" in l for l in dj) and any(l.endswith(u"あお組") for l in dj),
       u"④ 2つめの作品も同じ")
    # 本人の直し：「右半分の文字は必要なく、1の画像をそのまま貼るだけ。字幕は中央下側のもの」
    card = [l for l in ass.split(u"\n") if u",Card," in l]
    iu(not any(u"あか組" in l or u"あお組" in l for l in card),
       u"④ 右半分に題名を出していない（出るのは公式画像と下の帯だけ）")
    iu(u"あか組！/1.jpg" in ichi and u"@@daiji" not in ichi,
       u"④ 題字の画面の絵は、公式画像（1）そのもの（組んだカードではない）")
    def_ = [l for l in ass.split(u"\n") if u",Def," in l]
    iu(not any(u"制作は" in l for l in def_),
       u"④ 題字の画面のあいだ、ふつうの字幕（制作は…）は出さない")
    iu(any(u"本作は漫画が原作です" in l for l in def_), u"④ そのあとは、ふつうの字幕に戻る")
    iu(u"公式画像（1.jpg など）が無いので" in out and u"あお組" in out,
       u"④ 公式画像の無い作品は名前で言う（その作品のほかの絵を使う）")
    iu(u"章 " in out and u"ページめくり" in out,
       u"③ 作品の切り替わりに「章」のエフェクト（ページめくり）が入る")
    m = re.search(u"演出: (.+)", out)
    print(u"   " + (m.group(0) if m else u"（演出の行なし）"))

    # 目で見るためのコマ（検査はしない。本人に見せる・こちらが見る用）
    m2 = re.search(u"Dialogue: 1,(\\d+):(\\d+):([\\d.]+),[^,]+,Daiji", ass)
    if m2:
        t0 = int(m2.group(1)) * 3600 + int(m2.group(2)) * 60 + float(m2.group(3))
        koma(mp4, t0 + 1.0, os.path.join(SAGYOU, u"題字.png"))
        koma(mp4, max(0.0, t0 - 1.5), os.path.join(SAGYOU, u"はじめに.png"))
    return 0


if __name__ == "__main__":
    rc = main()
    print(u"")
    if rc or warui:
        print(u"落ちました。%d件:" % len(warui))
        for w in warui:
            print(u"  ・" + w)
        sys.exit(1)
    print(u"全部通りました。")
    if u"--nokosu" not in sys.argv:
        shutil.rmtree(SAGYOU, ignore_errors=True)
