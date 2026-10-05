# -*- coding: utf-8 -*-
u"""ずれ実測 ─ 出来た動画そのもので、字幕と声がずれていないかを測る

**作った材料ではなく、本物の動画で測ります。** これが本当の数字です。

  ① 完成した mp4 から音を取り出す
  ② 声が始まる瞬間（無音の終わり）を全部拾う
  ③ 焼き込んだ字幕が出る時刻と突き合わせる

動画を作ると自動で走ります。結果は 確認用/ずれ.txt に残ります。

  いちばん大きいずれ   0.45秒を超えたら、その時刻を見てください
  平均のずれ           0.12秒は「字幕を声の少し前に出す」設計ぶんです

ずれている所があれば、**その時刻と字幕の文**をチャットに貼ってください。
こちらで同じ形を作って確かめられます。
"""
import io, os, re, subprocess, sys, glob

def ff(args):
    r = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return r.stdout.decode("utf-8", "replace")

mp4 = (glob.glob(u"動画/*.mp4") + glob.glob(u"*.mp4"))
if not mp4:
    print(u"× 動画が見つかりません"); sys.exit(1)
mp4 = mp4[0]
ass = u"その他/_work/burn.ass"
if not os.path.exists(ass):
    print(u"× burn.ass が見つかりません"); sys.exit(1)

wav = u"その他/_hakaru.wav"
ff(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-ac", "1", "-ar", "44100", wav])

log = ff(["ffmpeg", "-hide_banner", "-nostats", "-i", wav,
          "-af", "silencedetect=noise=-35dB:d=0.04", "-f", "null", "-"])
koe = []            # 声が始まる瞬間
for m in re.finditer(r"silence_end:\s*([0-9.]+)", log):
    koe.append(float(m.group(1)))
koe.append(0.0)
koe.sort()

jimaku = []
for line in io.open(ass, encoding="utf-8", errors="replace").read().split("\n"):
    if not line.startswith(u"Dialogue:"):
        continue
    c = line.split(u",", 9)
    if len(c) < 10:
        continue
    def hm(t):
        h, m2, s = t.strip().split(u":")
        return int(h) * 3600 + int(m2) * 60 + float(s)
    tx = re.sub(r"\{[^}]*\}", u"", c[9]).replace(u"\\N", u"").strip()
    if not tx or u"第" in c[3] or u"©" in tx:
        continue
    jimaku.append((hm(c[1]), tx))
# 章の名前・引用など、本文でないものは落とす
# 章タイトルのカードは、わざと 1.5秒 無音にしてある所なので外す
jimaku = [(t, x) for (t, x) in jimaku
          if len(x) >= 4 and not re.match(r"^第\d+章$", x)]
jimaku.sort()

zure = []
for (t, tx) in jimaku:
    chikai = min(koe, key=lambda c: abs(c - t))
    zure.append((abs(chikai - t), t, chikai, tx))
zure.sort(reverse=True)
n = len(zure)
if not n:
    print(u"× 字幕が読めませんでした"); sys.exit(1)
print(u"動画           : %s" % mp4)
print(u"声の始まり     : %d か所" % len(koe))
print(u"焼いた字幕     : %d枚" % n)
print(u"いちばん大きいずれ : %.2f秒" % zure[0][0])
print(u"平均のずれ         : %.2f秒" % (sum(z[0] for z in zure) / n))
print(u"0.30秒を超えたもの : %d枚 (%.0f%%)" % (sum(1 for z in zure if z[0] > 0.30),
                                              100.0 * sum(1 for z in zure if z[0] > 0.30) / n))
print(u"")
def mmss(t):
    return u"%d:%02d" % (int(t // 60), int(t % 60))


waru = [z for z in zure if z[0] > 0.45]
gyou = [u"# 字幕と声のずれ（出来た動画そのもので測ったもの）",
        u"# 平均 %.2f秒 のうち 0.12秒は、字幕を声の少し前に出す設計ぶんです。" % (
            sum(z[0] for z in zure) / n),
        u"",
        u"いちばん大きいずれ\t%.2f秒" % zure[0][0],
        u"平均のずれ\t%.2f秒" % (sum(z[0] for z in zure) / n),
        u"0.45秒を超えたもの\t%d枚 / %d枚" % (len(waru), n),
        u"", u"時刻\tずれ\t字幕"]
for (d, t, c, tx) in zure[:40]:
    gyou.append(u"%s\t%.2f秒\t%s" % (mmss(t), d, tx))
try:
    if not os.path.isdir(u"確認用"):
        os.makedirs(u"確認用")
    io.open(os.path.join(u"確認用", u"ずれ.txt"), "w",
            encoding="utf-8", newline="\r\n").write(u"\r\n".join(gyou) + u"\r\n")
except Exception:
    pass

if waru:
    print(u"⚠ 0.45秒を超えてずれている所が %d枚 あります。" % len(waru))
    for (d, t, c, tx) in waru[:8]:
        print(u"  %s  %.2f秒ずれ   %s" % (mmss(t), d, tx[:24]))
    print(u"  この時刻と文をチャットに貼ってください。")
else:
    print(u"○ 0.45秒を超えてずれている所はありません。")
print(u"  くわしくは 確認用/ずれ.txt")
