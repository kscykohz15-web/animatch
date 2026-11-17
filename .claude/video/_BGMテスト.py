# -*- coding: utf-8 -*-
u"""おすすめ紹介の回は、作品ごとに別の曲が流れるか（仕上げ.py ㉛）

■ 本人の指定（2026-11-17）

  > C:\\Youtube動画\\おすすめアニメ\\BGM　あと、使用するBGMはこちらから使用し、
  > 作品ごとに音楽は別のものを使うようにしてください。

■ 見ること（ためしの曲は周波数の違う音。出来た bgm.wav を区切りごとに聞き分ける）

  ① 区切り（はじめに・作品ひとつずつ・おわりに）ごとに、当てたとおりの曲が鳴っている
  ② となり合う区切りは別の曲
  ③ 元の大きさが2倍ちがう曲でも、流れる大きさはそろっている
  ④ 切り替わりに音の穴が無い（前を下げながら次を上げて重ねる）
  ⑤ 長さが動画ちょうど
  ⑥ 曲の並びは動画の名前で決まる（作り直しても同じ）
  ⑦ 曲が1つも無ければ、今までどおり 演出.txt の1曲を流す
"""
from __future__ import print_function
import array, io, math, os, re, shutil, subprocess, sys, wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAGYOU = os.path.join(HERE, u"_BGMテスト作業")
FF = shutil.which("ffmpeg")
warui = []
HZ = {u"曲A.mp3": 330, u"曲B.mp3": 550, u"曲C.mp3": 770, u"曲D.mp3": 990}


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
本作は漫画が原作となっており、原作は完結済みとなります。物語は、赤い所から始まります。
続いての作品は、あお組、制作はおつしゃ。
本作はゲームが原作となっており、アニメは第二期まで放送済みとなります。物語は、青い所から始まります。
最後にご紹介する作品は、きいろ組、制作はへいしゃ。
本作はオリジナルアニメで、全12話で物語が完結しています。物語は、黄色い所から始まります。
今回の動画は以上となります。ご視聴ありがとうございました。
"""

GAMEN = u"""引用\t各作品の著作権は、それぞれの権利者に帰属します
章\t今回の動画の内容は\t－\t＊全作品\t
章\tあか組\tあか組！\\N2014年冬\tあか組！\t
章\tあお組\tあお組\\N2010年夏\tあお組\t
章\tきいろ組\tきいろ組\\N2025年夏\tきいろ組\t
章\t今回の動画は以上となります\tおわりに\t＊全作品\t
"""


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    from PIL import Image
    oo = os.path.join(SAGYOU, u"おすすめ")
    e, b = os.path.join(oo, u"画像"), os.path.join(oo, u"BGM")
    for n, fol in enumerate((u"あか組！", u"あお組", u"きいろ組")):
        os.makedirs(os.path.join(e, fol))
        for j in range(6):
            Image.new("RGB", (320, 180), (40 + n * 60, 60 + j * 20, 120)).save(
                os.path.join(e, fol, u"%03d_x2.png" % (100 + j)))
        Image.new("RGB", (300, 400), (250, 250, 250)).save(os.path.join(e, fol, u"1.jpg"))
    os.makedirs(b)
    for nm, hz in HZ.items():
        # 曲B だけ元の大きさを半分にする（③ そろえているかを見る）
        ff(["-f", "lavfi", "-i", "sine=frequency=%d:duration=7" % hz,
            "-af", "volume=%s" % ("0.3" if hz == 550 else "0.6"),
            "-ar", "44100", "-ac", "1", os.path.join(b, nm)])
    for nm, body in ((u"台本_字幕用.txt", DAIHON), (u"画面表示.txt", GAMEN),
                     (u"画像プラン.txt", u"*\t#穏やか\n")):
        io.open(os.path.join(SAGYOU, nm), "w", encoding="utf-8", newline="\n").write(body)
    for f in (u"見た目.txt", u"演出.txt", u"置き場所.py", u"make_slideshow.py"):
        shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    # パックの BGM（演出.txt の1曲）。作品ごとの曲が無いときはこれが流れる
    os.makedirs(os.path.join(SAGYOU, u"BGM"))
    os.makedirs(os.path.join(SAGYOU, u"効果音"))
    m = re.search(u"^BGM\t(.+)$", io.open(os.path.join(HERE, u"演出.txt"), encoding="utf-8-sig").read(),
                  re.M)
    ff(["-f", "lavfi", "-i", "sine=frequency=200:duration=5", "-ar", "44100", "-ac", "1",
        os.path.join(SAGYOU, u"BGM", (m.group(1).strip() if m else u"ふおんなきり.mp3"))])
    ff(["-f", "lavfi", "-i",
        "sine=frequency=280:duration=50,volume='if(lt(mod(t,2),1.5),0.5,0)':eval=frame",
        "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, "merged.wav")])
    return e, b


def hashiru(e):
    r = subprocess.run([sys.executable, "make_slideshow.py", "--images", e, "--sec", "2"],
                       cwd=SAGYOU, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    return r.returncode, r.stdout.decode("utf-8", "replace")


def yomu_wav(p):
    w = wave.open(p, "rb")
    n, sr = w.getnframes(), w.getframerate()
    a = array.array("h", w.readframes(n))
    w.close()
    return a, sr


def kiku(a, sr, t0, t1):
    u"""t0〜t1 でいちばん強い、ためしの曲の名前（Goertzel）。"""
    seg = a[int(t0 * sr):int(t1 * sr)]
    best, bv = None, -1.0
    for nm, hz in HZ.items():
        k = 2 * math.cos(2 * math.pi * hz / sr)
        q1 = q2 = 0.0
        for x in seg:
            q0 = k * q1 - q2 + x
            q2, q1 = q1, q0
        v = q1 * q1 + q2 * q2 - k * q1 * q2
        if v > bv:
            best, bv = nm, v
    return best


def ookisa(a, sr, t0, t1):
    seg = a[int(t0 * sr):int(t1 * sr)]
    return math.sqrt(sum(x * x for x in seg) / max(1, len(seg)))


def main():
    if not FF:
        print(u"ffmpeg が無いので、とばします。")
        return 0
    try:
        import PIL  # noqa: F401
    except ImportError:
        print(u"Pillow が無いので、とばします。")
        return 0
    e, b = junbi()
    rc, log = hashiru(e)
    io.open(os.path.join(SAGYOU, u"_log1.txt"), "w", encoding="utf-8").write(log)
    iu(rc == 0, u"動画が最後までできる")
    hyou = os.path.join(SAGYOU, u"確認用", u"BGMの割り当て.txt")
    iu(os.path.exists(hyou), u"確認用/BGMの割り当て.txt を書く")
    wari = []
    if os.path.exists(hyou):
        for l in io.open(hyou, encoding="utf-8-sig"):
            c = l.rstrip(u"\r\n").split(u"\t")
            if len(c) == 3 and not l.startswith(u"#"):
                mm, ss = c[0].split(u":")
                wari.append((int(mm) * 60 + int(ss), c[1], c[2]))
    iu(len(wari) == 5, u"区切りは5つ（はじめに・作品3つ・おわりに）: %d" % len(wari))
    iu(all(wari[i][2] != wari[i + 1][2] for i in range(len(wari) - 1)), u"② となり合う区切りは別の曲")
    iu(len(set(w[2] for w in wari[1:4])) == 3, u"② 3作品は3つとも別の曲")

    bgm = os.path.join(SAGYOU, u"その他", u"_work", u"bgm.wav")
    if not os.path.exists(bgm) or len(wari) != 5:
        iu(False, u"bgm.wav ができていないので、音を聞けません")
    else:
        a, sr = yomu_wav(bgm)
        nagasa = len(a) / float(sr)
        m = re.search(u"音声 (\\d+):(\\d+)", log)
        iu(abs(nagasa - 50.0) < 3.0, u"⑤ 長さが動画とほぼ同じ（%.1f秒）" % nagasa)
        kiita, ook = [], []
        for n, (st, na, k) in enumerate(wari):
            en = wari[n + 1][0] if n + 1 < len(wari) else nagasa
            t0, t1 = st + 1.6, min(en - 0.4, st + 1.6 + 3.0)
            if t1 - t0 < 0.5:
                continue
            kiita.append((na, k, kiku(a, sr, t0, t1)))
            if 0 < n < len(wari) - 1:
                ook.append(ookisa(a, sr, t0, t1))
        zure = [x for x in kiita if x[1] != x[2]]
        iu(not zure, u"① 区切りごとに、当てたとおりの曲が鳴っている%s"
           % (u"（ちがう: %s）" % u" / ".join(u"%s は %s のはずが %s" % z for z in zure) if zure else u""))
        if ook:
            iu(max(ook) / max(1.0, min(ook)) < 1.35,
               u"③ 曲Bは元の大きさが半分でも、作品の区切りの大きさがそろっている（%s）"
               % u" / ".join(u"%.0f" % x for x in ook))
        ana = []
        for (st, na, k) in wari[1:]:
            mae, ato = ookisa(a, sr, st - 2.5, st - 1.5), ookisa(a, sr, st + 1.5, st + 2.5)
            soko = min(ookisa(a, sr, st + d / 10.0, st + d / 10.0 + 0.1) for d in range(-8, 9))
            if soko < 0.35 * min(mae, ato):
                ana.append(u"%s %.0f/%.0f" % (na, soko, min(mae, ato)))
        iu(not ana, u"④ 切り替わりに音の穴が無い%s" % (u"（%s）" % u"・".join(ana) if ana else u""))

    # ⑥ 並びは動画の名前で決まる
    import importlib.util
    spec = importlib.util.spec_from_file_location(u"ms_bgm", os.path.join(SAGYOU, u"make_slideshow.py"))
    M = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(M)
    sp = [(i * 10.0, i * 10.0 + 10.0, u"章%d" % i) for i in range(8)]
    kyoku = sorted(HZ)
    x1 = M.bgm_wariate(sp, kyoku, u"ニヤニヤが止まらない_最高のラブコメアニメ20選")
    x2 = M.bgm_wariate(sp, kyoku, u"ニヤニヤが止まらない_最高のラブコメアニメ20選")
    iu(x1 == x2, u"⑥ 同じ動画なら、作り直しても同じ曲")
    iu(all(x1[i][3] != x1[i + 1][3] for i in range(len(x1) - 1)),
       u"⑥ 区切りが曲より多くても、となり合う区切りは別の曲")

    # ⑦ 曲が1つも無ければ、演出.txt の1曲
    for f in os.listdir(b):
        os.remove(os.path.join(b, f))
    rc2, log2 = hashiru(e)
    io.open(os.path.join(SAGYOU, u"_log2.txt"), "w", encoding="utf-8").write(log2)
    iu(rc2 == 0 and u"作品ごとの曲が見つかりません" in log2 and re.search(u"BGM: .+\\(音量", log2),
       u"⑦ 曲が無ければ、知らせてから 演出.txt の1曲を流す")

    print(u"")
    if warui:
        print(u"× %d件 落ちました" % len(warui))
        return 1
    print(u"○ おすすめ紹介の回は、作品ごとに別の曲が流れます")
    return 0


if __name__ == "__main__":
    sys.exit(main())
