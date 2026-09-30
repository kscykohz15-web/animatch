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
章\tむかし\tはじめ
章\tここで話が変わります\tおわり
"""

PLAN = u"""@@話数\tてすと
むかし\t#あか, #あお
その絵は四枚\t#あお, #みどり
それでも動画\t#みどり, #きいろ
ここで話が変わります\t#きいろ, #あか
最後に\t#あか, #あお
*\t#あお
"""

CATALOG = u"""あか.jpg\tあか
あお.jpg\tあお
みどり.jpg\tみどり
きいろ.jpg\tきいろ
"""

ENSHUTSU = u"""区切り\t。\tカメラ.mp3\t暗転\t0.12
区切り\t、\tはさみ.mp3\tはさみ\t0.16
区切り\t章\tカードをめくる.mp3\tページめくり\t0.40
効果音の音量\t0.4
BGM\tてすと曲.wav
BGMの音量\t0.25
BGMのフェード\t2
BGM控えめ\tはい
"""


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    e = os.path.join(SAGYOU, u"絵", u"てすと")
    os.makedirs(e)
    os.makedirs(os.path.join(SAGYOU, u"効果音"))
    os.makedirs(os.path.join(SAGYOU, u"BGM"))
    for nm, col in ((u"あか", "red"), (u"あお", "blue"),
                    (u"みどり", "green"), (u"きいろ", "yellow")):
        ff(["-f", "lavfi", "-i", "color=c=%s:s=1280x720" % col,
            "-frames:v", "1", os.path.join(e, nm + ".jpg")])

    w = io.open  # 短く
    for nm, body in ((u"台本_字幕用.txt", DAIHON), (u"画面表示.txt", GAMEN),
                     (u"画像プラン.txt", PLAN), (u"画像カタログ.txt", CATALOG),
                     (u"演出.txt", ENSHUTSU)):
        w(os.path.join(SAGYOU, nm), "w", encoding="utf-8",
          newline="\n").write(body)
    shutil.copy(os.path.join(HERE, u"見た目.txt"),
                os.path.join(SAGYOU, u"見た目.txt"))
    for nm in (u"カメラ.mp3", u"はさみ.mp3", u"カードをめくる.mp3"):
        src = os.path.join(HERE, u"効果音", nm)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(SAGYOU, u"効果音", nm))
    ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=5",
        "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, u"BGM", u"てすと曲.wav")])
    # 声のかわり。台本の長さに合わせて 12秒
    ff(["-f", "lavfi", "-i",
        "sine=frequency=280:duration=12,volume='if(lt(mod(t,2),1.4),0.5,0)':eval=frame",
        "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, "merged.wav")])
    shutil.copy(os.path.join(HERE, "make_slideshow.py"),
                os.path.join(SAGYOU, "make_slideshow.py"))
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

    kansei = os.path.join(SAGYOU, u"完成.mp4")
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
                           (u"BGM:", u"BGMが入っていません")):
        if shirushi not in out:
            komatta.append(nani)
    ookisa = os.path.getsize(kansei)
    if ookisa < 10000:
        komatta.append(u"完成.mp4 が小さすぎます(%dバイト)" % ookisa)

    for line in out.split(u"\n"):
        if any(k in line for k in (u"字幕を焼き込みます", u"左上の引用",
                                   u"右上のチャプター", u"効果音:", u"BGM:",
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
