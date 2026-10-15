# -*- coding: utf-8 -*-
u"""make_slideshow.py を、小さな材料で本当に最後まで走らせてみる。

いくら設定を確かめても、本体が動かなければ動画はできません。
実際「見た目.txt を読む所で落ちる」バグを、設定の検査だけでは
見つけられませんでした（本人の画面で初めて出た）。

ここでは 4枚の絵と 12秒の音で、字幕・引用・章・エフェクト・効果音・BGM まで
入れた 完成.mp4 を本当に作り、長さまで確かめます。

  python 煙テスト.py
"""
import io, os, shutil, subprocess, sys, wave, struct, math

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAGYOU = os.path.join(HERE, "_煙テスト")
FF = shutil.which("ffmpeg")


def ff(args):
    r = subprocess.run([FF, "-y", "-loglevel", "error"] + args,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-1500:])
        raise SystemExit(u"材料が作れませんでした")


DAIHON = u"""むかし、ある所に絵がありました。
その絵は四枚しかありませんでした。
それでも動画にはなりました。
ここで話が変わります。
最後に、ちゃんと終わりました。
"""

GAMEN = u"""引用\t©てすと
章\tむかし\tはじめ\tてすと甲
章\tここで話が変わります\tおわり\tてすと乙
"""

PLAN = u"""むかし\t#あか, #あお, #もも
その絵は四枚\t#あお, #もも, #あか
それでも動画\t#もも, #あか, #あお
ここで話が変わります\t#きいろ, #みどり, #みず
最後に\t#みどり, #みず, #きいろ
*\t#あお, #みどり
"""

CATALOG = u"""てすと甲/あか\tあか
てすと甲/あお\tあお
てすと甲/もも\tもも
てすと乙/みどり\tみどり
てすと乙/きいろ\tきいろ
てすと乙/みず\tみず
"""

EPMAP = u"""てすと甲\tはじめ あか あお もも
てすと乙\tおわり みどり きいろ みず
"""

ENSHUTSU = u"""区切り\t。\tカメラ.mp3\t暗転\t0.12
区切り\t、\tはさみ.mp3\tはさみ\t0.16
区切り\t章\tカードをめくる.mp3\tページめくり\t0.40
効果音の音量\t0.4
BGM\tてすと曲.wav
BGMの音量\t0.25
BGMのフェード\t2
BGM控えめ\tいいえ
章タイトル\tはい
章タイトルの秒数\t1.5
章タイトルの音\tドーン.mp3
章タイトルのエフェクト\t暗転
章タイトルの色\t141024
章タイトルの絵の幅\t0.5
"""


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    e = os.path.join(SAGYOU, u"絵")
    os.makedirs(os.path.join(e, u"てすと甲"))
    os.makedirs(os.path.join(e, u"てすと乙"))
    os.makedirs(os.path.join(SAGYOU, u"効果音"))
    os.makedirs(os.path.join(SAGYOU, u"BGM"))
    for nm, col, fol in ((u"あか", "red", u"てすと甲"), (u"あお", "blue", u"てすと甲"),
                         (u"もも", "pink", u"てすと甲"),
                         (u"みどり", "green", u"てすと乙"), (u"きいろ", "yellow", u"てすと乙"),
                         (u"みず", "cyan", u"てすと乙")):
        ff(["-f", "lavfi", "-i", "color=c=%s:s=1280x720" % col,
            "-frames:v", "1", os.path.join(e, fol, nm + ".jpg")])

    w = io.open  # 短く
    for nm, body in ((u"台本_字幕用.txt", DAIHON), (u"画面表示.txt", GAMEN),
                     (u"画像プラン.txt", PLAN), (u"画像カタログ.txt", CATALOG),
                     (u"話数マップ.txt", EPMAP), (u"演出.txt", ENSHUTSU)):
        w(os.path.join(SAGYOU, nm), "w", encoding="utf-8",
          newline="\n").write(body)
    shutil.copy(os.path.join(HERE, u"見た目.txt"),
                os.path.join(SAGYOU, u"見た目.txt"))
    for nm in (u"カメラ.mp3", u"はさみ.mp3", u"カードをめくる.mp3", u"ドーン.mp3"):
        src = os.path.join(HERE, u"効果音", nm)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(SAGYOU, u"効果音", nm))
    ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=5",
        "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, u"BGM", u"てすと曲.wav")])
    # 声のかわり。台本の長さに合わせて 12秒
    ff(["-f", "lavfi", "-i",
        "sine=frequency=280:duration=12,volume='if(lt(mod(t,2),1.4),0.5,0)':eval=frame",
        "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, "merged.wav")])
    for f in ("make_slideshow.py", u"置き場所.py"):
        shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    return e


def main():
    if not FF:
        print(u"ffmpeg が無いので煙テストはとばします。")
        return 0
    e = junbi()
    r = subprocess.run(
        [sys.executable, "make_slideshow.py", "--images", e,
         "--sec", "2"],
        cwd=SAGYOU, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    out = r.stdout.decode("utf-8", "replace")
    if r.returncode != 0:
        print(out[-3000:])
        print(u"\n× make_slideshow.py が最後まで走りませんでした。")
        return 1

    # 採点に要る 一覧.txt が、--cuts なしでも出ていること
    ichi = os.path.join(SAGYOU, u"確認用", u"一覧.txt")
    if not os.path.exists(ichi):
        print(out[-2000:])
        print(u"\n× 確認用/一覧.txt ができていません（採点ができません）。")
        return 1
    gyou = len([x for x in io.open(ichi, encoding="utf-8-sig").read()
                .replace("\r\n", "\n").split("\n") if x.strip()])
    bun = os.path.join(SAGYOU, u"動画", u"分割版")
    mp4 = len([x for x in os.listdir(bun) if x.endswith(".mp4")]) \
        if os.path.isdir(bun) else 0
    print(u"   確認用/一覧.txt %d行 / 短い動画 %d本 (--cuts なしなので0が正しい)"
          % (gyou, mp4))
    if mp4:
        print(u"× --cuts を付けていないのに短い動画ができています。")
        return 1

    # フォルダ分けができているか
    machigai = []
    for d in (u"音声", u"動画", u"確認用", u"その他"):
        if not os.path.isdir(os.path.join(SAGYOU, d)):
            machigai.append(u"%s フォルダがありません" % d)
    for nm, d in ((u"一覧.txt", u"確認用"),):
        if not os.path.exists(os.path.join(SAGYOU, d, nm)):
            machigai.append(u"%s が %s にありません" % (nm, d))
    nokori = [x for x in os.listdir(SAGYOU)
              if x.endswith((".mp4", ".tsv")) or x == "_work"]
    if nokori:
        machigai.append(u"いちばん上に残っています: " + u" ".join(nokori))
    if machigai:
        print(out[-1500:])
        for x in machigai:
            print(u"× " + x)
        return 1
    print(u"   フォルダ分け: 音声 / 動画 / 確認用 / その他 … できています")

    kansei = os.path.join(SAGYOU, u"動画", u"完成.mp4")
    if not os.path.exists(kansei):
        print(out[-2000:])
        print(u"\n× 完成.mp4 ができていません。")
        return 1

    # 中身を確かめる
    info = subprocess.run([FF, "-i", kansei], stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT).stdout.decode("utf-8", "replace")
    komatta = []
    if "Video:" not in info:
        komatta.append(u"映像が入っていません")
    if "Audio:" not in info:
        komatta.append(u"音が入っていません")
    for shirushi, nani in ((u"左上の引用", u"引用が出ていません"),
                           (u"右上のチャプター", u"章が出ていません"),
                           (u"字幕を焼き込みます", u"字幕が焼かれていません"),
                           (u"効果音:", u"効果音が入っていません"),
                           (u"BGM:", u"BGMが入っていません"),
                           (u"同じ絵は", u"同じ絵の上限が効いていません"),
                           (u"章タイトルのカードを", u"章タイトルのカードが入っていません"),
                           (u"声に無音を", u"カードぶんの無音が入っていません"),
                           (u"章ごとの話数", u"章ごとの話数(画面表示の4列目)が効いていません"),
                           (u"絵を動かします", u"絵を動かす設定が効いていません")):
        if shirushi not in out:
            komatta.append(nani)
    ookisa = os.path.getsize(kansei)
    if ookisa < 10000:
        komatta.append(u"完成.mp4 が小さすぎます(%dバイト)" % ookisa)

    for line in out.split(u"\n"):
        if any(k in line for k in (u"字幕を焼き込みます", u"左上の引用",
                                   u"右上のチャプター", u"効果音:", u"BGM:",
                                   u"同じ絵は", u"章タイトル", u"無音を", u"章ごとの話数", u"絵を動かし", u"方向はバラバラ", u"いちばん長い",
                                   u"合計", u"タイミング")):
            print(u"   " + line.strip())
    print(u"   完成.mp4 %.0fKB" % (ookisa / 1024.0))

    if komatta:
        print(u"\n× " + u" / ".join(komatta))
        return 1
    shutil.rmtree(SAGYOU, ignore_errors=True)
    print(u"○ 本体は最後まで走り、完成.mp4 ができました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
