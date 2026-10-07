# -*- coding: utf-8 -*-
u"""本編から、ショート(縦動画)を切り出す。

    python short.py --list                  どこで切れるかを見る
    python short.py --chapter 4             4番目の章をショートにする
    python short.py --chapter 4 --hook "第11話の老人は、ルーデウス本人です。"

本編の 画像割り当て.tsv・merged.wav・図表 をそのまま使うので、
音声を録り直さずにショートが作れます。区切りは必ず絵の切り替わり目に
合わせるので、音と絵と字幕のずれは本編と同じ（ゼロ）です。

--hook を付けると、冒頭に「文字だけの1.5秒」を足します。
ショートは最初の1〜2秒で決まるので、ここに結論を置きます。
読み上げは入りません（録り直しが要らないようにするため）。
"""

import argparse
import io
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = u"画像割り当て.tsv"
OVERLAY = u"画面表示.txt"
AUDIO = u"merged.wav"
SCRIPT = u"台本_字幕用.txt"
FIGDIR = u"図表"


def say(t):
    try:
        print(t)
    except UnicodeEncodeError:
        print(t.encode("utf-8", "replace").decode("utf-8", "replace"))
    sys.stdout.flush()


def die(t):
    say(u"")
    say(u"!! " + t)
    sys.exit(1)


def need(name):
    from shutil import which
    p = which(name)
    if not p:
        die(u"%s が見つかりません。" % name)
    return p


def run(cmd):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        die(u"うまくいきませんでした:\n" + r.stdout.decode("utf-8", "replace")[-1500:])


def mmss(t):
    return u"%d:%02d" % (int(t) // 60, int(t) % 60)


def read_plan(path):
    """割り当て表を (尺, 画像, セリフ) の並びで読む。"""
    rows = []
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.lstrip().startswith(u"#"):
            continue
        c = line.split(u"\t")
        if len(c) < 5 or c[0].strip() == u"No":
            continue
        try:
            du = float(c[2])
        except ValueError:
            continue
        if du > 0.05 and c[4].strip():
            rows.append((du, c[4].strip(), c[5].strip() if len(c) > 5 else u""))
    if not rows:
        die(u"割り当て表を読めませんでした: " + path)
    return rows


def load_chapters(path):
    credit, chaps = u"", []
    if not os.path.exists(path):
        return credit, chaps
    for line in io.open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.lstrip().startswith(u"#"):
            continue
        c = [x.strip() for x in line.split(u"\t") if x.strip()]
        if len(c) >= 2 and c[0] in (u"引用", u"credit"):
            credit = c[1]
        elif len(c) >= 3 and c[0] in (u"章", u"chapter"):
            chaps.append((c[1], c[2]))
    return credit, chaps


def chapter_ranges(rows, chaps):
    """章ごとに「何番目のスロットから何番目まで」を出す。

    区切りは必ずスロットの境目にする。ここを守らないと音がずれる。
    """
    marks = []
    for key, title in chaps:
        for i, (_du, _img, tx) in enumerate(rows):
            if key and key in tx:
                marks.append((i, title))
                break
    marks.sort()
    out = []
    for n, (i, title) in enumerate(marks):
        j = marks[n + 1][0] if n + 1 < len(marks) else len(rows)
        if j > i:
            out.append((i, j, title))
    return out


def safe_name(t):
    t = t.replace(u"\\N", u" ")          # 章タイトルの改行しるし
    t = re.sub(r"[\\/:*?\"<>|]+", "", t).strip()
    return (t[:40] or u"ショート")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help=u"切れる場所の一覧を出す")
    ap.add_argument("--chapter", type=int, default=0, help=u"何番目の章か(1から)")
    ap.add_argument("--from-slot", type=int, default=0, help=u"何番目の絵から(1から)")
    ap.add_argument("--to-slot", type=int, default=0, help=u"何番目の絵まで")
    ap.add_argument("--hook", default=u"", help=u"冒頭に出す文字(読み上げなし)")
    ap.add_argument("--hook-sec", type=float, default=1.5)
    ap.add_argument("--max-sec", type=float, default=60.0,
                    help=u"これを超えたら知らせる(既定60秒)")
    ap.add_argument("--name", default=u"", help=u"作るフォルダの名前")
    ap.add_argument("--images", default=u"C:\\Youtube動画\\無職転生\\画像\\高画質")
    ap.add_argument("--render", action="store_true", default=True)
    ap.add_argument("--no-render", dest="render", action="store_false")
    a = ap.parse_args()

    os.chdir(HERE)
    for f in (PLAN, AUDIO):
        if not os.path.exists(f):
            die(u"%s がありません。先に本編を作ってください。" % f)

    rows = read_plan(PLAN)
    credit, chaps = load_chapters(OVERLAY)
    spans = chapter_ranges(rows, chaps)

    # 各スロットの開始時刻
    starts, t = [], 0.0
    for du, _i, _t in rows:
        starts.append(t)
        t += du
    total = t

    if a.list or (not a.chapter and not a.from_slot):
        say(u"本編: %s / 絵 %d枚" % (mmss(total), len(rows)))
        say(u"")
        say(u"── 章の一覧（--chapter の番号）──────────────")
        for n, (i, j, title) in enumerate(spans):
            sec = sum(r[0] for r in rows[i:j])
            mark = u"" if sec <= a.max_sec else u"  ← 長い"
            say(u"  %2d  %5s〜%-5s  %4.1f秒  %s%s"
                % (n + 1, mmss(starts[i]),
                   mmss(starts[j - 1] + rows[j - 1][0]), sec, title, mark))
        say(u"")
        say(u"ショートに向くのは 15〜30秒です。長い章は --from-slot / --to-slot で")
        say(u"絵の番号を指定して切ってください（--list に絵の番号も出ます）。")
        say(u"")
        say(u"── 絵とセリフ ──────────────────────────")
        for i, (du, img, tx) in enumerate(rows):
            say(u"  %3d  %5s  %4.1f秒  %s" % (i + 1, mmss(starts[i]), du, tx[:38]))
        return

    if a.chapter:
        if not (1 <= a.chapter <= len(spans)):
            die(u"章は 1〜%d の間で指定してください。" % len(spans))
        i, j, title = spans[a.chapter - 1]
    else:
        i = max(0, a.from_slot - 1)
        j = a.to_slot if a.to_slot else len(rows)
        j = min(len(rows), max(i + 1, j))
        title = rows[i][2][:20]

    part = rows[i:j]
    sec = sum(r[0] for r in part)
    name = safe_name(a.name or title)
    out = os.path.join(HERE, u"ショート_" + name)
    say(u"切り出します: %s" % title)
    say(u"  絵 %d〜%d / %.1f秒" % (i + 1, j, sec))
    if sec > a.max_sec:
        say(u"  ※ %.0f秒あります。ショートは15〜30秒が伸びやすいので、"
            u"--from-slot / --to-slot で短くすることを考えてください。" % sec)

    if os.path.isdir(out):
        shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)

    # 音声を、絵の境目ちょうどで切る
    ff = need("ffmpeg")
    cut = os.path.join(out, "_cut.wav")
    run([ff, "-y", "-loglevel", "error", "-i", AUDIO,
         "-ss", "%.4f" % starts[i], "-t", "%.4f" % sec, cut])

    if a.hook:
        sil = os.path.join(out, "_sil.wav")
        run([ff, "-y", "-loglevel", "error", "-f", "lavfi",
             "-i", "anullsrc=r=48000:cl=mono", "-t", "%.3f" % a.hook_sec, sil])
        lst = os.path.join(out, "_c.txt")
        io.open(lst, "w", encoding="utf-8").write(
            u"file '_sil.wav'\nfile '_cut.wav'\n")
        run([ff, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", lst, "-c", "copy", os.path.join(out, AUDIO)])
        for f in (sil, cut, lst):
            try:
                os.remove(f)
            except OSError:
                pass
    else:
        os.replace(cut, os.path.join(out, AUDIO))

    # 割り当て表（本編の決定をそのまま持ってくる）
    slots = ([(a.hook_sec, part[0][1], a.hook)] if a.hook else []) + list(part)
    with io.open(os.path.join(out, PLAN), "w", encoding="utf-8-sig", newline="") as f:
        f.write(u"# format: 3\r\n")
        f.write(u"# 本編から切り出したショートです。5列目を書き換えると絵が変わります。\r\n")
        f.write(u"No\t開始\t尺\tmm:ss\t画像\tセリフ\r\n")
        t2 = 0.0
        for n, (du, img, tx) in enumerate(slots):
            f.write(u"%d\t%.2f\t%.2f\t%s\t%s\t%s\r\n"
                    % (n + 1, t2, du, mmss(t2), img, tx.replace(u"\t", u" ")))
            t2 += du

    # 台本と、引用の表示（章タイトルは出さない。縦は画面が狭いので）
    io.open(os.path.join(out, SCRIPT), "w", encoding="utf-8-sig", newline="").write(
        u"\r\n".join([s[2] for s in slots if s[2]]))
    if credit:
        io.open(os.path.join(out, OVERLAY), "w", encoding="utf-8-sig", newline="").write(
            u"引用\t%s\r\n" % credit)

    # 図表と道具をそろえる
    if os.path.isdir(FIGDIR):
        shutil.copytree(FIGDIR, os.path.join(out, FIGDIR))
    for f in ("make_slideshow.py",):
        if os.path.exists(f):
            shutil.copy2(f, out)

    say(u"  できました: " + out)

    if a.render:
        say(u"")
        say(u"縦動画にしています…")
        r = subprocess.run([sys.executable, "make_slideshow.py",
                            "--vertical", "--render",
                            "--hook-sec", ("%.2f" % a.hook_sec) if a.hook else "0",
                            "--images", a.images], cwd=out)
        if r.returncode == 0:
            say(u"")
            say(u"完成: " + os.path.join(out, u"完成.mp4"))
        else:
            say(u"うまくいきませんでした。上の赤い文字を見てください。")


if __name__ == "__main__":
    main()
