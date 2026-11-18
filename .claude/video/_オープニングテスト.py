# -*- coding: utf-8 -*-
u"""オープニングと、長く映る絵の動き（仕上げ.py ㉜）

■ 本人の指定（2026-11-18）

  > C:\\Youtube動画\\03_おすすめアニメ動画\\04_オープニング　このオープニングは動画生成の際に、
  > すべての動画において最初にこちらのフォルダに入った、「1」という動画を使用してください。

  > 画像の動かし方ですが、しっかり最初から最後まで動かすようにしてください。動かす速さは
  > 今ぐらいがちょうどいいので、動きが途中で終わってしまうものに関しては、もう少し画像の
  > 拡大具合を調整するなどを行って調整してください。

  オープニングは本人のパソコンにしか無く、こちらで一度も通らない枝。長く映る絵の動きも、
  動画を作って絵を比べないと分からない。小さな材料で**完成.mp4 まで本当に作って**見る。

■ 見ること
  ① 本人の並び（03_…／01_画像・02_BGM・04_オープニング）で、置き場所.txt が無くても
     となりのフォルダから オープニングの「1」と 曲 を見つける
  ② 完成した動画の頭がオープニング（赤い画面）で、そのあとが本編
  ③ 動画の長さ ＝ オープニング ＋ 本編（--no-opening で作ったもの）
  ④ その他/_オープニング秒.txt にオープニングの秒数を残す（説明文.py の目次が足す）
     一覧.txt の時刻は本編のまま
  ⑤ 長く映る絵（約14秒）が、映っている間ずっと動いている
     （終わり 1.2秒前 と 0.3秒前 のコマが違う。同じ材料で v196 は差 0.01＝止まっている・
      直したあとは 44.5＝頭と同じ速さ。v196 は約5秒で端に着いて止まっていた）
  ⑥ 動きの速さは今のまま（短い絵は前と同じ毎秒の距離）
"""
from __future__ import print_function
import io, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAGYOU = os.path.join(HERE, u"_オープニングテスト作業")
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


# 「、」の無い長い1文（約9秒の字幕）を あか組 の章に置く
NAGAI = (u"本作の魅力はとても長い一文で区切りの点がまったく無いまま最後まで続いていくので"
         u"この字幕は長く映ることになりますがそれでも絵は止まらずに動きつづけます。")

DAIHON = u"""どうもこんにちわ、かさです。
今回の動画の内容は、ためしの作品を二つご紹介します。
最初にご紹介する作品は、あか組！、制作はこうしゃ。
本作は漫画が原作となっています。
%s
続いての作品は、あお組、制作はおつしゃ。
本作はゲームが原作となっています。
今回の動画は以上となります。ご視聴ありがとうございました。
""" % NAGAI

GAMEN = u"""引用\t各作品の著作権は、それぞれの権利者に帰属します
章\t今回の動画の内容は\t－\t＊全作品\t
章\tあか組\tあか組！\\N2014年冬\tあか組！\t
章\tあお組\tあお組\\N2010年夏\tあお組\t
章\t今回の動画は以上となります\tおわりに\t＊全作品\t
"""

PLAN = u"""@@話数\tあか組！
あか組！\t#公式, #穏やか
制作はこうしゃ\t#公式, #穏やか
@@話数\tあお組
あお組\t#公式, #穏やか
*\t#穏やか, #室内
"""


def kizami_e(path, iro, tane):
    u"""動くと画素がはっきり変わる絵（細かい縞と点）。"""
    from PIL import Image, ImageDraw
    import random
    rnd = random.Random(tane)
    im = Image.new("RGB", (640, 360), iro)
    d = ImageDraw.Draw(im)
    for x in range(0, 640, 6):
        d.line([(x, 0), (x, 360)], fill=(255, 255, 255) if (x // 6) % 2 else (0, 0, 0))
    for y in range(0, 360, 7):
        d.line([(0, y), (640, y)], fill=(rnd.randint(0, 255), 40, 200))
    for _ in range(1500):
        x, y = rnd.randint(0, 639), rnd.randint(0, 359)
        d.rectangle([x, y, x + 2, y + 2], fill=(rnd.randint(0, 255), rnd.randint(0, 255), 0))
    im.save(path)


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    root = os.path.join(SAGYOU, u"03_おすすめアニメ動画")
    e = os.path.join(root, u"01_画像")
    from PIL import Image
    for n, fol in enumerate((u"あか組！", u"あお組")):
        os.makedirs(os.path.join(e, fol))
        for j in range(6):
            kizami_e(os.path.join(e, fol, u"%04d.png" % (j + 1)), (60 + n * 80, 90, 30 * j), n * 10 + j)
        Image.new("RGB", (300, 400), (250, 250, 250)).save(os.path.join(e, fol, u"1.jpg"))
    bgm = os.path.join(root, u"02_BGM")
    os.makedirs(bgm)
    for i, hz in enumerate((330, 440, 550)):
        ff(["-f", "lavfi", "-i", "sine=frequency=%d:duration=30" % hz, "-ar", "44100", "-ac", "2",
            os.path.join(bgm, u"曲%d.wav" % (i + 1))])
    op = os.path.join(root, u"04_オープニング")
    os.makedirs(op)
    # 本編と違う大きさ・違う音の形式（48kHz ステレオ）の、真っ赤な2秒
    ff(["-f", "lavfi", "-i", "color=c=red:s=640x360:d=2:r=24",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=2:sample_rate=48000",
        "-ac", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
        os.path.join(op, u"1.mp4")])
    w = os.path.join(root, u"05_動画", u"01_ためし")
    os.makedirs(os.path.join(w, u"効果音"))
    for nm, body in ((u"台本_字幕用.txt", DAIHON), (u"画面表示.txt", GAMEN),
                     (u"画像プラン.txt", PLAN)):
        io.open(os.path.join(w, nm), "w", encoding="utf-8", newline="\n").write(body)
    for f in (u"見た目.txt", u"演出.txt", u"make_slideshow.py", u"置き場所.py"):
        shutil.copy(os.path.join(HERE, f), os.path.join(w, f))
    ff(["-f", "lavfi", "-i",
        "sine=frequency=280:duration=40,volume='if(lt(mod(t,2),1.5),0.5,0)':eval=frame",
        "-ar", "44100", "-ac", "1", os.path.join(w, "merged.wav")])
    return e, w


def hashiru(w, e, *args):
    r = subprocess.run([sys.executable, "make_slideshow.py", "--images", e, "--sec", "2",
                        "--plan"], cwd=w, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    if r.returncode != 0:
        return r.returncode, r.stdout.decode("utf-8", "replace")
    r = subprocess.run([sys.executable, "make_slideshow.py", "--images", e, "--sec", "2"]
                       + list(args), cwd=w, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    return r.returncode, r.stdout.decode("utf-8", "replace")


def nagasa(p):
    r = subprocess.run([FF, "-hide_banner", "-i", p], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", r.stdout.decode("utf-8", "replace"))
    return (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))) if m else 0.0


def koma(p, t, out):
    ff(["-ss", "%.3f" % t, "-i", p, "-frames:v", "1", out])
    from PIL import Image
    return Image.open(out).convert("RGB")


def sa(a, b):
    u"""2枚のコマの違い（画素の差の平均）。字幕の帯（下 1/4）は見ない。"""
    from PIL import ImageChops, ImageStat
    w, h = a.size
    box = (0, int(h * 0.12), w, int(h * 0.72))
    d = ImageChops.difference(a.crop(box), b.crop(box))
    return sum(ImageStat.Stat(d).mean) / 3.0


def kansei(w, log=u""):
    u"""出来た動画の道。ログの「完成しました: …」を先に信じる（置き場所は 動画/完成.mp4 など）。"""
    m = re.findall(u"完成しました: (.+)", log or u"")
    if m and os.path.exists(m[-1].strip()):
        return m[-1].strip()
    c = []
    for d in (w, os.path.join(w, u"動画")):
        if os.path.isdir(d):
            c += [os.path.join(d, f) for f in os.listdir(d) if f.endswith(u".mp4")]
    return sorted(c, key=os.path.getmtime)[-1] if c else None


def nagai_basho(w):
    u"""確認用/一覧.txt から、長い字幕の（本編での）始まりと終わり。

    2列目の開始は「0:16」の形に丸めた表示なので使わず、3列目の尺（秒）を前から足す。
    """
    t = 0.0
    for line in io.open(os.path.join(w, u"確認用", u"一覧.txt"), encoding="utf-8-sig") \
            .read().replace(u"\r\n", u"\n").split(u"\n"):
        c = line.split(u"\t")
        if len(c) >= 8 and c[0].isdigit():
            try:
                du = float(c[2])
            except ValueError:
                continue
            if c[7].startswith(u"本作の魅力はとても長い"):
                return t, t + du
            t += du
    return None


def main():
    if not FF:
        print(u"ffmpeg が無いので、とばします。")
        return 0
    try:
        import PIL  # noqa: F401
    except ImportError:
        print(u"Pillow が無いので、とばします。")
        return 0
    e, w = junbi()

    # 本編だけ（比べるため）
    rc, log0 = hashiru(w, e, "--no-opening")
    io.open(os.path.join(SAGYOU, u"_log0.txt"), "w", encoding="utf-8").write(log0)
    if rc != 0:
        print(log0[-2500:])
        iu(False, u"本編だけの動画が最後まで作れる")
        return 1
    p0 = kansei(w, log0)
    if not p0:
        iu(False, u"本編だけの動画が見つかりません")
        return 1
    hon = nagasa(p0)
    nb = nagai_basho(w)
    iu(nb is not None and nb[1] - nb[0] > 6.0,
       u"⑤ 材料: 長い字幕が 6秒より長く映る（%s）" % (u"%.1f秒" % (nb[1] - nb[0]) if nb else u"-"))
    iu(not os.path.exists(os.path.join(w, u"その他", u"_オープニング秒.txt")),
       u"④ オープニングを付けないときは、秒数の控えを置かない")
    shutil.copy(p0, os.path.join(SAGYOU, u"_本編だけ.mp4"))

    # オープニング付き
    rc, log = hashiru(w, e)
    io.open(os.path.join(SAGYOU, u"_log1.txt"), "w", encoding="utf-8").write(log)
    if rc != 0:
        print(log[-2500:])
        iu(False, u"オープニング付きの動画が最後まで作れる")
        return 1
    iu(u"オープニングを頭に付けています" in log and u"04_オープニング" in log,
       u"① 置き場所.txt が無くても、となりの 04_オープニング から「1」を見つける")
    iu(u"02_BGM" in io.open(os.path.join(w, u"確認用", u"BGMの割り当て.txt"),
                            encoding="utf-8-sig").read()
       if os.path.exists(os.path.join(w, u"確認用", u"BGMの割り当て.txt")) else False,
       u"① となりの 02_BGM の曲を当てる")
    p1 = kansei(w, log)
    if not p1 or os.path.abspath(p1) == os.path.abspath(p0):
        # 同じ名前で上書きされるので、本編だけのほうは先に写しておいたものを使う
        p0 = os.path.join(SAGYOU, u"_本編だけ.mp4")
    if not p1:
        iu(False, u"オープニング付きの動画が見つかりません")
        return 1
    zen = nagasa(p1)
    hik = os.path.join(w, u"その他", u"_オープニング秒.txt")
    op_byou = float(io.open(hik, encoding="utf-8").read().strip()) if os.path.exists(hik) else 0.0
    iu(abs(op_byou - 2.0) < 0.15, u"④ その他/_オープニング秒.txt に秒数（%.2f）" % op_byou)
    iu(abs(zen - (hon + op_byou)) < 0.5,
       u"③ 長さ ＝ オープニング＋本編（%.2f ＝ %.2f＋%.2f）" % (zen, op_byou, hon))
    k0 = koma(p1, 0.6, os.path.join(SAGYOU, u"_k_op.png"))
    r, g, b = [sum(x) / float(len(x)) for x in zip(*list(k0.getdata())[::97])]
    iu(r > 150 and g < 80 and b < 80, u"② 頭はオープニング（赤 %.0f/%.0f/%.0f）" % (r, g, b))
    k1 = koma(p1, op_byou + 1.0, os.path.join(SAGYOU, u"_k_hon.png"))
    r, g, b = [sum(x) / float(len(x)) for x in zip(*list(k1.getdata())[::97])]
    iu(not (r > 150 and g < 80 and b < 80), u"② そのあとは本編（赤くない）")
    nb1 = nagai_basho(w)
    iu(nb1 is not None and nb is not None and abs(nb1[0] - nb[0]) < 0.05,
       u"④ 一覧.txt の時刻は本編のまま（%s）" % (u"%.2f" % nb1[0] if nb1 else u"-"))

    # ⑤ 長く映る絵が、最後まで動いている（本編だけの動画で見る）
    if nb:
        a1 = koma(p0, nb[1] - 1.2, os.path.join(SAGYOU, u"_k_a.png"))
        a2 = koma(p0, nb[1] - 0.3, os.path.join(SAGYOU, u"_k_b.png"))
        s_owari = sa(a1, a2)
        b1 = koma(p0, nb[0] + 0.5, os.path.join(SAGYOU, u"_k_c.png"))
        b2 = koma(p0, nb[0] + 1.4, os.path.join(SAGYOU, u"_k_d.png"))
        s_atama = sa(b1, b2)
        iu(s_owari > 3.0,
           u"⑤ 長く映る絵は、終わり近くでもまだ動いている（終わり1.2秒前→0.3秒前の差 %.1f・"
           u"頭の差 %.1f）" % (s_owari, s_atama))
        iu(u"長く映る絵" in log0 and u"拡大を上げました" in log0,
           u"⑤ 「長く映る絵 … 拡大を上げました」と知らせる")
    m = re.search(u"毎秒 ([0-9.]+)px", log0)
    iu(m and 15.0 <= float(m.group(1)) <= 30.0,
       u"⑥ 動きの速さは今のまま（毎秒 %spx）" % (m.group(1) if m else u"-"))
    return 0


if __name__ == "__main__":
    rc = main()
    print(u"")
    if rc or warui:
        print(u"落ちました。%d件:" % len(warui))
        for x in warui:
            print(u"  ・" + x)
        sys.exit(1)
    print(u"全部通りました。")
    if u"--nokosu" not in sys.argv:
        shutil.rmtree(SAGYOU, ignore_errors=True)
