# -*- coding: utf-8 -*-
"""
録画した動画から、場面が変わるたびに静止画を切り出します。

    python extract_frames.py                     … 録画フォルダの動画を全部処理
    python extract_frames.py --threshold 0.25    … もっと細かく拾う(枚数が増える)
    python extract_frames.py --mode interval --every 4

出力は  C:\\Youtube動画\\無職転生\\画像\\素材\\<動画名>\\ に
  <動画名>_0523.jpg   (5分23秒の場面)  という名前で入ります。
使えそうなものだけ 高画質 フォルダへ移してお使いください。
"""
import argparse
import io
import os
import re
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import 置き場所                                   # 道は置き場所.txt にだけ書く
SRC_DEFAULT = 置き場所.rokuga()
OUT_DEFAULT = os.path.join(置き場所.oomoto(), u"画像", u"素材")
VIDEO_EXTS = (".ts", ".m2ts", ".mp4", ".mkv", ".avi", ".wmv", ".mov", ".mpg")


def say(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("utf-8", "replace").decode("ascii", "replace"))
    sys.stdout.flush()


def die(msg):
    say(u"")
    say(u"[中断] " + msg)
    sys.exit(1)


def need(tool):
    p = shutil.which(tool)
    if not p:
        die(u"%s が見つかりません。PowerShellで  winget install --id Gyan.FFmpeg -e  "
            u"を実行し、ウィンドウを開き直してください。" % tool)
    return p


def duration(path):
    out = subprocess.run(
        [need("ffprobe"), "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout
    try:
        return float(out.decode("utf-8", "replace").strip().split()[0])
    except Exception:
        return 0.0


def safe_name(name):
    name = os.path.splitext(os.path.basename(name))[0]
    name = re.sub(r"[\\/:*?\"<>|\s]+", "_", name).strip("_")
    return name[:40] or u"video"


def mmss(t):
    t = int(t)
    return u"%02d%02d" % (t // 60, t % 60)


def extract(src, outdir, a):
    tag = safe_name(src)
    total = duration(src)
    start = max(0.0, a.skip_head)
    end = max(start + 1.0, total - a.skip_tail) if total else 0.0
    if total and end <= start:
        say(u"  飛ばす秒数が長すぎます: " + tag)
        return 0

    if os.path.isdir(outdir):
        shutil.rmtree(outdir, ignore_errors=True)
    os.makedirs(outdir)

    if a.mode == "scene":
        vf = "select='gt(scene\\,%s)'" % a.threshold
    else:
        vf = "select='not(mod(n\\,1))',fps=1/%s" % a.every
    vf += ",scale=%d:-2,showinfo" % a.width

    cmd = [need("ffmpeg"), "-hide_banner", "-loglevel", "info", "-y"]
    if start > 0:
        cmd += ["-ss", "%.3f" % start]
    if total:
        cmd += ["-to", "%.3f" % end]
    cmd += ["-i", src, "-vf", vf, "-vsync", "vfr", "-q:v", str(a.quality)]
    if a.limit:
        cmd += ["-frames:v", str(a.limit)]
    cmd += [os.path.join(outdir, "tmp_%05d.jpg")]

    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    log = r.stdout.decode("utf-8", "replace")
    if r.returncode != 0:
        say(log[-1500:])
        say(u"  切り出しに失敗しました: " + tag)
        return 0

    times = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", log)]
    made = sorted(f for f in os.listdir(outdir) if f.startswith("tmp_"))
    kept = 0
    for i, fn in enumerate(made):
        full = os.path.join(outdir, fn)
        if os.path.getsize(full) < a.min_kb * 1024:   # 暗転・単色は捨てる
            os.remove(full)
            continue
        t = (times[i] if i < len(times) else 0.0) + start
        dst = os.path.join(outdir, u"%s_%s.jpg" % (tag, mmss(t)))
        k = 2
        while os.path.exists(dst):
            dst = os.path.join(outdir, u"%s_%s_%d.jpg" % (tag, mmss(t), k))
            k += 1
        os.rename(full, dst)
        kept += 1
    say(u"  %-34s %4d枚  (%s)" % (tag, kept, mmss(total) if total else u"?"))
    return kept


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=SRC_DEFAULT)
    ap.add_argument("--out", default=OUT_DEFAULT)
    ap.add_argument("--mode", default="scene", choices=["scene", "interval"])
    ap.add_argument("--threshold", default="0.35", help=u"小さいほど細かく拾う")
    ap.add_argument("--every", default="5", help=u"interval のとき何秒ごとか")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--quality", type=int, default=3, help=u"2が高画質、6が軽い")
    ap.add_argument("--limit", type=int, default=500, help=u"1本あたりの上限(0で無制限)")
    ap.add_argument("--min-kb", type=int, default=18, help=u"これより小さい画像は捨てる")
    ap.add_argument("--skip-head", type=float, default=0.0, help=u"頭を飛ばす秒数(OP対策)")
    ap.add_argument("--skip-tail", type=float, default=0.0, help=u"尻を飛ばす秒数(ED対策)")
    a = ap.parse_args()

    if not os.path.isdir(a.src):
        die(u"録画フォルダがありません: " + a.src + u"\n"
            u"ここに録画した動画を置くか、--src で場所を指定してください。")
    vids = sorted(f for f in os.listdir(a.src) if f.lower().endswith(VIDEO_EXTS))
    if not vids:
        die(u"動画ファイルがありません: " + a.src)

    say(u"%d本の動画から切り出します(%s)" %
        (len(vids), u"場面が変わるたび" if a.mode == "scene" else u"%s秒ごと" % a.every))
    say(u"")
    total = 0
    for v in vids:
        total += extract(os.path.join(a.src, v),
                         os.path.join(a.out, safe_name(v)), a)
    say(u"")
    say(u"合計 %d枚を %s に切り出しました。" % (total, a.out))
    say(u"使えそうなものを 高画質 フォルダへ移してください。")
    say(u"「画像一覧シートを作る」で、この素材フォルダの一覧も作れます:")
    say(u'  python make_contact.py --images "<素材の中のフォルダ>" --out "<出力先>"')


if __name__ == "__main__":
    main()
