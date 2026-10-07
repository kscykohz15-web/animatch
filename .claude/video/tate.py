# -*- coding: utf-8 -*-
u"""iPhone(a-Shell)で、横動画から縦のショートを切り出す。

    python tate.py --list
    python tate.py --from 1:05 --to 1:28
    python tate.py --no 40 --to-no 52
    python tate.py --from 1:05 --to 1:28 --hook hook.png

必要なもの
  ・a-Shell（無料・App Store）だけ。ffmpeg が入っています
  ・完成.mp4（PCで作ったもの）を iPhone の「ファイル」に置く
  ・一覧.txt があれば、番号で切り出せます

しないこと
  ・字幕を新しく焼きません。完成.mp4 に焼かれた字幕がそのまま入ります。
    iPhone側で日本語フォントが使える保証がないので、そこに頼らない作りです。
  ・冒頭の文字（フック）は画像で足します。作り方は下の --hook を見てください。
"""

import argparse
import io
import os
import re
import subprocess
import sys

W, H = 1080, 1920


def say(t):
    try:
        print(t)
    except UnicodeEncodeError:
        print(t.encode("utf-8", "replace").decode("ascii", "replace"))
    sys.stdout.flush()


def die(t):
    say(u"")
    say(u"!! " + t)
    sys.exit(1)


def ff():
    from shutil import which
    p = which("ffmpeg")
    if not p:
        die(u"ffmpeg が見つかりません。a-Shell で実行してください。")
    return p


def run(cmd, why=u""):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        die((why or u"うまくいきませんでした") + u":\n"
            + r.stdout.decode("utf-8", "replace")[-1200:])
    return r.stdout.decode("utf-8", "replace")


def dur_of(path):
    out = subprocess.run([ff(), "-hide_banner", "-i", path],
                         stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT).stdout.decode("utf-8", "replace")
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.?\d*)", out)
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def to_sec(s):
    u"""「1:05」「65」「1:05.5」を秒にする。"""
    s = (u"%s" % s).strip()
    if not s:
        return 0.0
    p = s.split(u":")
    try:
        if len(p) == 1:
            return float(p[0])
        if len(p) == 2:
            return int(p[0]) * 60 + float(p[1])
        return int(p[0]) * 3600 + int(p[1]) * 60 + float(p[2])
    except ValueError:
        die(u"時刻の書き方が分かりません: %s  (例 1:05)" % s)


def mmss(t):
    return u"%d:%05.2f" % (int(t) // 60, t - 60 * (int(t) // 60))


def read_list(path):
    u"""一覧.txt（確認用フォルダの中）を読む。番号→(開始, 尺, セリフ)"""
    out = []
    if not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8-sig", errors="replace"):
        c = line.rstrip(u"\r\n").split(u"\t")
        if len(c) >= 5 and c[0].strip().isdigit():
            out.append((int(c[0]), to_sec(c[1]), float(c[2]), c[4]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=u"完成.mp4")
    ap.add_argument("--list", action="store_true", help=u"切れる場所を見る")
    ap.add_argument("--from", dest="a", default=u"", help=u"開始（例 1:05）")
    ap.add_argument("--to", dest="b", default=u"", help=u"終わり（例 1:28）")
    ap.add_argument("--no", type=int, default=0, help=u"一覧.txt の番号から")
    ap.add_argument("--to-no", type=int, default=0, help=u"その番号まで")
    ap.add_argument("--hook", default=u"", help=u"冒頭に出す画像(png/jpg)")
    ap.add_argument("--hook-sec", type=float, default=1.5)
    ap.add_argument("--blur", type=float, default=28.0, help=u"背景のぼかし具合")
    ap.add_argument("--out", default=u"")
    ap.add_argument("--index", default=u"一覧.txt")
    a = ap.parse_args()

    if not os.path.exists(a.video):
        die(u"%s がありません。PCで作った完成.mp4 を、このフォルダに置いてください。"
            % a.video)
    total = dur_of(a.video)
    rows = read_list(a.index)

    if a.list or (not a.a and not a.no):
        say(u"%s  全体 %s" % (a.video, mmss(total)))
        if rows:
            say(u"")
            say(u"── 一覧.txt の番号 ──────────────")
            for (n, st, du, tx) in rows:
                say(u"  %3d  %-8s %4.1f秒  %s" % (n, mmss(st), du, tx[:30]))
            say(u"")
            say(u"例)  python tate.py --no 40 --to-no 52")
        else:
            say(u"")
            say(u"一覧.txt がないので、時刻で指定してください。")
            say(u"例)  python tate.py --from 1:05 --to 1:28")
        say(u"")
        say(u"ショートは15〜30秒が伸びやすいです。")
        return

    if a.no:
        d = dict((n, (st, du)) for (n, st, du, _t) in rows)
        if a.no not in d:
            die(u"一覧.txt に %d番がありません。--list で確認してください。" % a.no)
        s0 = d[a.no][0]
        last = a.to_no if a.to_no else a.no
        if last not in d:
            die(u"一覧.txt に %d番がありません。" % last)
        e0 = d[last][0] + d[last][1]
        namae = u"%03d-%03d" % (a.no, last)
    else:
        s0 = to_sec(a.a)
        e0 = to_sec(a.b) if a.b else min(total, s0 + 25.0)
        namae = u"%s-%s" % (a.a.replace(u":", u""), (a.b or u"").replace(u":", u""))

    if e0 <= s0:
        die(u"終わりが開始より前になっています。")
    e0 = min(e0, total)
    sec = e0 - s0
    out = a.out or (u"ショート_%s.mp4" % namae)

    say(u"切り出します: %s 〜 %s (%.1f秒)" % (mmss(s0), mmss(e0), sec))
    if sec > 60:
        say(u"  ※ %.0f秒あります。15〜30秒に縮めることを考えてください。" % sec)

    # 横のまま縦の枠に収め、背景は同じ絵をぼかして敷く。
    # 字幕は完成.mp4 に焼かれているので、ここでは何も描かない。
    vf = (u"[0:v]scale=%d:-2,setsar=1[fg];"
          u"[0:v]scale=%d:%d:force_original_aspect_ratio=increase,"
          u"crop=%d:%d,gblur=sigma=%.0f[bg];"
          u"[bg][fg]overlay=(W-w)/2:(H-h)/2[v]"
          % (W, W, H, W, H, a.blur))
    honpen = u"_honpen.mp4" if a.hook else out
    run([ff(), "-y", "-loglevel", "error",
         "-ss", "%.3f" % s0, "-i", a.video, "-t", "%.3f" % sec,
         "-filter_complex", vf, "-map", "[v]", "-map", "0:a",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
         "-c:a", "aac", "-b:a", "128k", "-r", "30", "-pix_fmt", "yuv420p",
         honpen], u"縦にできませんでした")

    if a.hook:
        if not os.path.exists(a.hook):
            die(u"%s がありません。" % a.hook)
        # フックは「絵＋無音」を作って、本編の前につなぐ。
        # 文字は画像に入っているので、フォントは要りません。
        hk = u"_hook.mp4"
        run([ff(), "-y", "-loglevel", "error",
             "-loop", "1", "-framerate", "30", "-i", a.hook,
             "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
             "-t", "%.3f" % a.hook_sec,
             "-vf", u"scale=%d:%d:force_original_aspect_ratio=decrease,"
                    u"pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1" % (W, H, W, H),
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
             "-c:a", "aac", "-b:a", "128k", "-r", "30", "-pix_fmt", "yuv420p",
             hk], u"フックを作れませんでした")
        lst = u"_c.txt"
        io.open(lst, "w", encoding="utf-8").write(
            u"file '%s'\nfile '%s'\n" % (hk, honpen))
        run([ff(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", lst, "-c", "copy", out], u"つなげませんでした")
        for f in (hk, honpen, lst):
            try:
                os.remove(f)
            except OSError:
                pass

    say(u"")
    say(u"できました: %s  (%s / %d×%d)"
        % (out, mmss(dur_of(out)), W, H))
    say(u"")
    say(u"「ファイル」アプリから写真に保存すれば、そのまま投稿できます。")


if __name__ == "__main__":
    main()
