# -*- coding: utf-8 -*-
u"""できあがっている動画から、編集のクセを測る道具。

    python mane.py                     … このフォルダの動画を全部まとめて測る
    python mane.py 動画.mp4             … 1本だけ測る
    python mane.py --folder "C:\\動画"  … そのフォルダの動画を全部測る

私は動画を見ることができません。YouTubeにも接続できません。
ですが動画ファイルさえあれば、「どこで絵が切り替わったか」
「切り替わりに何秒かけているか」「どこで音が鳴ったか」を
数字で測ることはできます。

この道具はその数字だけを 編集のクセ.txt に書き出します。
それを貼ってもらえれば、同じリズムになるよう 演出.txt を合わせます。
動画そのものを送ってもらう必要はありません。

■ 何を測るか
    ① 絵が切り替わった時刻       (何秒に1回切り替えているか)
    ② 切り替わりにかけている時間  (パッと切るのか、溶かすのか)
    ③ 一瞬暗くなる切り替わり
    ④ 効果音が鳴った時刻         (切り替わりの何割で鳴らしているか)

■ 全部の動画を測るとき
    1本あたり1〜2分かかります。本数が多いときは、
    1本につき真ん中の3分だけを測ると速く終わります。
        python mane.py --max 180
"""
from __future__ import print_function
import argparse
import io
import os
import re
import subprocess
import sys

if sys.version_info[0] >= 3:
    unicode = str

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

W, H = 32, 18                 # 測るときの大きさ。小さくして速くする
FPS = 30                      # コマ単位で測るので、元と同じくらいにする


def say(s):
    try:
        print(s)
    except UnicodeEncodeError:
        enc = getattr(sys.stdout, "encoding", None) or "ascii"
        print(s.encode(enc, "replace").decode(enc, "replace"))


LOG = []


def note(s):
    LOG.append(s)


def need_ffmpeg():
    for n in ("ffmpeg", "ffmpeg.exe"):
        try:
            subprocess.check_output([n, "-version"], stderr=subprocess.STDOUT)
            return n
        except Exception:
            pass
    say(u"× ffmpeg が見つかりません。")
    say(u"  PowerShellで  winget install --id Gyan.FFmpeg -e  を実行してください。")
    raise SystemExit(1)


def hhmmss(t):
    return u"%d:%05.2f" % (int(t // 60), t % 60)


def parse_time(s):
    if s is None:
        return None
    if u":" in s:
        m, sec = s.split(u":", 1)
        return int(m) * 60 + float(sec)
    return float(s)


def yomikomu(ff, path, ss, to):
    u"""動画を小さな白黒のコマにして、まとめて読み込む。

    ffmpeg の scene 検出はスライドショーだと拾い漏らすので、
    自分でコマの差を見る。1コマずつ見るので、溶かしている時間まで測れる。
    """
    cmd = [ff, "-hide_banner", "-loglevel", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    if to is not None:
        cmd += ["-to", str(to)]
    cmd += ["-i", path, "-vf", "fps=%d,scale=%d:%d" % (FPS, W, H),
            "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = p.communicate()
    n = W * H
    return [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)]


def shirabe(fr):
    u"""止まっている区間を探して、その切れ目を切り替わりとする。

    コマどうしの差だけを見ると、横にすべる演出のように
    1コマあたりの変化が小さいものを取りこぼす。
    そこで「直前の止まっていた絵」と比べて、離れたら変化の始まり、
    また止まったら変化の終わり、とみなす。
    """
    n = W * H

    def sa(a, b):
        return sum(abs(a[k] - b[k]) for k in range(n)) / float(n)

    if len(fr) < 8:
        return [], [], []

    lv = [sum(f) / float(n) for f in fr]
    futsu = sorted(lv)[len(lv) // 2]

    # ふだんの揺れ(ノイズ)の大きさを見てから、しきい値を決める
    tonari = [sa(fr[i], fr[i + 1]) for i in range(len(fr) - 1)]
    srt = sorted(tonari)
    noise = srt[len(srt) // 2]
    ugoki_thr = max(noise * 4 + 0.8, 1.5)     # 動いているとみなす差
    chigau_thr = max(noise * 8 + 3.0, 6.0)    # 別の絵とみなす差

    cuts, nagasa, kurasa = [], [], []
    ref = fr[0]
    i = 1
    while i < len(fr):
        if sa(fr[i], ref) < chigau_thr:
            i += 1
            continue
        # ここから変化が始まっている。さかのぼって始まりを探す
        st = i
        while st > 1 and tonari[st - 2] >= ugoki_thr:
            st -= 1
        # 止まるまで進む
        j = i
        while j < len(fr) - 1 and tonari[j - 1] >= ugoki_thr:
            j += 1
        cuts.append(st)
        nagasa.append(max(1, j - st + 1))
        mn = min(lv[max(0, st - 1):min(len(lv), j + 2)] or [futsu])
        kurasa.append(mn < futsu * 0.35)
        ref = fr[j]
        i = j + 1

    # 横にすべる演出は、途中で一瞬止まって見えることがあり、
    # 1回の切り替わりが2つに割れる。近すぎるものはまとめる。
    ma = int(FPS * 0.5)
    c2, n2, k2 = [], [], []
    for idx in range(len(cuts)):
        if c2 and cuts[idx] - c2[-1] <= ma:
            n2[-1] = cuts[idx] + nagasa[idx] - c2[-1]
            k2[-1] = k2[-1] or kurasa[idx]
        else:
            c2.append(cuts[idx])
            n2.append(nagasa[idx])
            k2.append(kurasa[idx])
    return c2, n2, k2


def find_se(ff, path, ss, to):
    u"""効果音が鳴った時刻を拾う。

    声は低い音が中心なので、高いほうだけ残してから、
    急に大きくなったところを探す。
    """
    import wave, struct
    tmp = "_mane_hi.wav"
    cmd = [ff, "-y", "-loglevel", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    if to is not None:
        cmd += ["-to", str(to)]
    cmd += ["-i", path, "-vn", "-af", "highpass=f=3500", "-ar", "16000",
            "-ac", "1", tmp]
    subprocess.call(cmd)
    if not os.path.exists(tmp):
        return []
    w = wave.open(tmp, "rb")
    sr = w.getframerate()
    d = w.readframes(w.getnframes())
    w.close()
    try:
        os.remove(tmp)
    except Exception:
        pass
    v = struct.unpack("<%dh" % (len(d) // 2), d)
    win = int(sr * 0.02)
    lv = []
    for i in range(0, len(v) - win, win):
        lv.append(max(abs(x) for x in v[i:i + win]))
    if not lv:
        return []
    srt = sorted(lv)
    naka = srt[len(srt) // 2]
    thr = max(naka * 5, srt[int(len(srt) * 0.98)] * 0.55, 200)
    out, mae = [], -99
    for i, x in enumerate(lv):
        if x >= thr and (i - mae) > 8:
            out.append(i * win / float(sr))
            mae = i
    return out


def hakaru(ff, path, ss, to, mx):
    u"""1本ぶんを測る。戻り値は数字の入れ物。"""
    if mx and ss is None and to is None:
        # 長いときは真ん中だけ測る
        try:
            o = subprocess.check_output(
                [ff, "-hide_banner", "-i", path], stderr=subprocess.STDOUT)
        except subprocess.CalledProcessError as e:
            o = e.output
        m = re.search(rb"Duration: (\d+):(\d+):([\d.]+)", o)
        if m:
            dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
            if dur > mx:
                ss = (dur - mx) / 2.0
                to = ss + mx
    fr = yomikomu(ff, path, ss, to)
    if len(fr) < 30:
        return None
    cuts, nagasa, kurasa = shirabe(fr)
    se = find_se(ff, path, ss, to)
    tcut = [c / float(FPS) for c in cuts]
    byou = len(fr) / float(FPS)
    r = {"name": os.path.basename(path), "byou": byou, "cuts": tcut,
         "nagasa": nagasa, "kurasa": kurasa, "se": se}
    if len(tcut) >= 3:
        r["haba"] = sorted(tcut[i + 1] - tcut[i] for i in range(len(tcut) - 1))
    else:
        r["haba"] = []
    atta, zure = 0, []
    for t in se:
        if tcut:
            c = min(tcut, key=lambda x: abs(x - t))
            if abs(c - t) <= 0.25:
                atta += 1
                zure.append(t - c)
    r["atta"] = atta
    r["zure"] = sorted(zure)
    return r


def naka(xs):
    return sorted(xs)[len(xs) // 2] if xs else 0.0


def kaku_1(r):
    u"""1本ぶんの数字を書く。"""
    note(u"")
    note(u"■ %s  (%.0f秒 を測定)" % (r["name"], r["byou"]))
    note(u"  切り替わり %d か所 / 平均 %.2f秒に1回"
         % (len(r["cuts"]), r["byou"] / max(1, len(r["cuts"]))))
    if r["haba"]:
        h = r["haba"]
        note(u"    まんなか %.2f秒 / 短いほう1/4 %.2f秒 / 長いほう1/4 %.2f秒"
             % (naka(h), h[len(h) // 4], h[len(h) * 3 // 4]))
    if r["nagasa"]:
        n = r["nagasa"]
        note(u"  かけている時間 まんなか %d コマ (%.2f秒)"
             % (naka(n), naka(n) / float(FPS)))
        note(u"    パッと切る(2コマ以内) %d%% / はっきり溶かす(5コマ以上) %d%%"
             % (int(100.0 * len([x for x in n if x <= 2]) / len(n)),
                int(100.0 * len([x for x in n if x >= 5]) / len(n))))
    if r["kurasa"]:
        k = len([x for x in r["kurasa"] if x])
        note(u"  一瞬暗くなる %d か所 (%d%%)"
             % (k, int(100.0 * k / len(r["kurasa"]))))
    note(u"  効果音 %d か所 / 切り替わりと重なる %d か所 / 切り替わりの %d%% で鳴る"
         % (len(r["se"]), r["atta"],
            min(100, int(100.0 * r["atta"] / max(1, len(r["cuts"]))))))
    if r["zure"]:
        note(u"    切り替わりからのずれ まんなか %+.3f秒" % naka(r["zure"]))


def youi(path):
    u"""書き出し先のフォルダが無ければ作る。"""
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        try:
            os.makedirs(d)
        except OSError:
            pass
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", nargs="?", default=None, help=u"動画(省略すると全部)")
    ap.add_argument("--folder", default=None, help=u"このフォルダの動画を全部")
    ap.add_argument("--from", dest="ss", default=None, help=u"ここから (1:00 のように)")
    ap.add_argument("--to", dest="to", default=None, help=u"ここまで")
    ap.add_argument("--max", type=float, default=None,
                    help=u"1本につきこの秒数だけ測る(真ん中から)。本数が多いとき用")
    ap.add_argument("--out", default=os.path.join(u"確認用", u"編集のクセ.txt"))
    a = ap.parse_args()

    ff = need_ffmpeg()
    EXT = (".mp4", ".mov", ".mkv", ".m4v", ".webm", ".avi")

    if a.video:
        mono = [a.video]
    else:
        fol = a.folder or u"."
        if not os.path.isdir(fol):
            say(u"× フォルダが見つかりません: %s" % fol)
            return 1
        mono = sorted(os.path.join(fol, f) for f in os.listdir(fol)
                      if f.lower().endswith(EXT))
        # 途中の作業ファイルは外す
        mono = [f for f in mono if "_work" not in f and u"確認用" not in f]
    if not mono:
        say(u"× 動画が見つかりません。")
        say(u"  python mane.py 動画.mp4   のようにファイル名を指定するか、")
        say(u"  --folder \"C:\\動画のあるフォルダ\"  を付けてください。")
        return 1

    say(u"%d 本を測ります。1本あたり1〜2分かかります…" % len(mono))
    if a.max:
        say(u"  (1本につき真ん中の %.0f秒 だけ測ります)" % a.max)

    ss = parse_time(a.ss)
    to = parse_time(a.to)
    res = []
    for i, v in enumerate(mono, 1):
        say(u"  [%d/%d] %s" % (i, len(mono), os.path.basename(v)))
        try:
            r = hakaru(ff, v, ss, to, a.max)
        except Exception as e:
            say(u"     測れませんでした: %s" % e)
            continue
        if r:
            res.append(r)
        else:
            say(u"     読み込めませんでした")

    if not res:
        say(u"× どの動画も測れませんでした。")
        return 1

    note(u"=== 編集のクセ ===")
    note(u"測った動画: %d 本" % len(res))

    # ── 全部まとめた数字（これがいちばん見たいところ）
    allh, alln, allk, allz = [], [], [], []
    cuts_n = se_n = atta_n = 0
    byou = 0.0
    for r in res:
        allh += r["haba"]
        alln += r["nagasa"]
        allk += r["kurasa"]
        allz += r["zure"]
        cuts_n += len(r["cuts"])
        se_n += len(r["se"])
        atta_n += r["atta"]
        byou += r["byou"]

    note(u"")
    note(u"── 全部まとめて ──")
    note(u"  測った長さの合計 : %.0f秒 (%.1f分)" % (byou, byou / 60.0))
    note(u"  切り替わり       : %d か所 / 平均 %.2f秒に1回"
         % (cuts_n, byou / max(1, cuts_n)))
    if allh:
        allh.sort()
        note(u"    まんなか %.2f秒 / 短いほう1/4 %.2f秒 / 長いほう1/4 %.2f秒"
             % (naka(allh), allh[len(allh) // 4], allh[len(allh) * 3 // 4]))
    if alln:
        note(u"  かけている時間   : まんなか %d コマ (%.2f秒)"
             % (naka(alln), naka(alln) / float(FPS)))
        note(u"    パッと切る(2コマ以内) %d%% / はっきり溶かす(5コマ以上) %d%%"
             % (int(100.0 * len([x for x in alln if x <= 2]) / len(alln)),
                int(100.0 * len([x for x in alln if x >= 5]) / len(alln))))
    if allk:
        k = len([x for x in allk if x])
        note(u"  一瞬暗くなる     : %d か所 (%d%%)"
             % (k, int(100.0 * k / len(allk))))
    note(u"  効果音           : %d か所 / 切り替わりの %d%% で鳴る"
         % (se_n, min(100, int(100.0 * atta_n / max(1, cuts_n)))))
    if allz:
        note(u"    切り替わりからのずれ まんなか %+.3f秒" % naka(allz))
        note(u"    (マイナスなら、音のほうが先に鳴っています)")

    note(u"")
    note(u"── 1本ずつ ──")
    for r in res:
        kaku_1(r)

    note(u"")
    note(u"=== ここまで ===")

    with io.open(youi(a.out), "w", encoding="utf-8") as f:
        f.write(u"\n".join(LOG))
        f.write(u"\n")
    for line in LOG:
        say(line)
    say(u"")
    say(u"-> %s に書き出しました。このファイルを貼ってください。" % a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
