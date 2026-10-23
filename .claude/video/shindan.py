# -*- coding: utf-8 -*-
"""
この動画フォルダの中身を全部調べて 診断.txt に書き出します。
中身を見ないと原因が分からないので、出てきた 診断.txt をそのまま貼ってください。
"""
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import 置き場所                                   # 道は置き場所.txt にだけ書く
OUT = []


def w(line=u""):
    OUT.append(line)
    try:
        print(line)
    except UnicodeEncodeError:
        print(line.encode("utf-8", "replace").decode("ascii", "replace"))


def ff(args):
    return subprocess.run(args, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT).stdout.decode("utf-8", "replace")


def dur(path):
    out = ff(["ffprobe", "-v", "error", "-show_entries", "format=duration",
              "-of", "default=noprint_wrappers=1:nokey=1", path])
    try:
        return float(out.strip().split()[0])
    except Exception:
        return None


def pick_folder():
    """merged.wav のあるフォルダを自力で探す。"""
    here = os.path.dirname(os.path.abspath(__file__))
    tried = [here]
    d = here
    for _ in range(3):
        if os.path.exists(os.path.join(d, "merged.wav")):
            return d, tried
        d = os.path.dirname(d)
        tried.append(d)
    root = 置き場所.oomoto()
    best, bt = None, -1
    if os.path.isdir(root):
        for n in os.listdir(root):
            p2 = os.path.join(root, n, "merged.wav")
            if os.path.exists(p2):
                m = os.path.getmtime(p2)
                if m > bt:
                    best, bt = os.path.join(root, n), m
    if best:
        tried.append(best)
        return best, tried
    return here, tried


def main():
    folder, tried = pick_folder()
    globals()["HERE"] = folder
    os.chdir(folder)
    w(u"===== 場所 =====")
    w(u"調べたフォルダ: " + folder)
    w(u"merged.wav: " + (u"あり" if os.path.exists("merged.wav") else u"なし"))
    w(u"(探した場所: " + u" / ".join(tried) + u")")
    par = os.path.dirname(folder)
    if os.path.isdir(par):
        w(u"--- 親フォルダ %s の中身 ---" % par)
        try:
            for n in sorted(os.listdir(par))[:40]:
                q = os.path.join(par, n)
                w(u"    %s%s" % (n, u"  [フォルダ]" if os.path.isdir(q) else u"  %d バイト" % os.path.getsize(q)))
        except Exception as e:
            w(u"    (読めません: %s)" % e)
    w()

    w(u"===== このフォルダの中身 =====")
    for n in sorted(os.listdir(".")):
        p = os.path.join(".", n)
        if os.path.isdir(p):
            try:
                cnt = len(os.listdir(p))
            except Exception:
                cnt = -1
            w(u"  [フォルダ] %-34s %d個" % (n, cnt))
        else:
            w(u"  %-44s %9d バイト" % (n, os.path.getsize(p)))
    w()

    # 音声ファイル
    wavs = sorted([n for n in os.listdir(".")
                   if n.lower().endswith((".wav", ".mp3", ".flac")) and n != "merged.wav"])
    w(u"===== 音声 =====")
    d = dur("merged.wav") if os.path.exists("merged.wav") else None
    w(u"merged.wav: %s" % (u"%.3f秒 (%d:%02d)" % (d, int(d // 60), int(d % 60)) if d else u"ありません"))
    if wavs:
        w(u"merged.wav 以外の音声が %d個 あります(これが1行ずつの音声なら、ズレは完全に無くせます):" % len(wavs))
        tot = 0.0
        for n in wavs[:8]:
            dd = dur(n)
            w(u"    %-30s %s秒" % (n, ("%.3f" % dd) if dd else "?"))
            if dd:
                tot += dd
        if len(wavs) > 8:
            w(u"    … 他 %d個" % (len(wavs) - 8))
    else:
        w(u"merged.wav 以外の音声はありません。")
    for sub in ("wav", "音声", "voice", "out"):
        if os.path.isdir(sub):
            ns = sorted([x for x in os.listdir(sub) if x.lower().endswith(".wav")])
            if ns:
                w(u"フォルダ %s の中に wav が %d個 あります: %s …" % (sub, len(ns), ", ".join(ns[:5])))
    w()

    # 台本
    w(u"===== 台本 =====")
    for name in (u"台本_字幕用.txt", u"台本_読み上げ用.txt"):
        if not os.path.exists(name):
            w(u"%s: ありません" % name)
            continue
        t = io.open(name, encoding="utf-8-sig", errors="replace").read()
        paras = [x.strip() for x in t.replace("\r\n", "\n").split("\n") if x.strip()]
        sents = []
        for p in paras:
            sents += [x for x in re.split(u"(?<=[。！？])", u" ".join(p.split())) if x.strip()]
        commas = sum(1 for c in t if c in u"、,，")
        w(u"%s: %d文字 / 段落 %d / 文 %d / 読点 %d → 読点区切り %d"
          % (name, len(t), len(paras), len(sents), commas, len(sents) + commas))
    w()

    # 字幕ファイル
    w(u"===== subtitle.srt =====")
    if os.path.exists("subtitle.srt"):
        raw = io.open("subtitle.srt", encoding="utf-8-sig", errors="replace").read()
        blocks = [b for b in re.split(r"\n\s*\n", raw.replace("\r\n", "\n")) if b.strip()]
        w(u"キュー数: %d" % len(blocks))
        w(u"--- 最初の2つ ---")
        for b in blocks[:2]:
            for ln in b.strip().split("\n")[:3]:
                w(u"  " + ln[:100])
        w(u"--- 最後の2つ ---")
        for b in blocks[-2:]:
            for ln in b.strip().split("\n")[:3]:
                w(u"  " + ln[:100])
    else:
        w(u"ありません")
    w()

    # 無音の検出
    w(u"===== 無音の検出 (merged.wav) =====")
    if d:
        for db in (-25, -30, -35, -40, -45, -50):
            log = ff(["ffmpeg", "-hide_banner", "-nostats", "-i", "merged.wav",
                      "-af", "silencedetect=noise=%ddB:d=0.05" % db, "-f", "null", "-"])
            sil, st = [], None
            for m in re.finditer(r"silence_(start|end):\s*(-?[0-9.]+)", log):
                if m.group(1) == "start":
                    st = float(m.group(2))
                elif st is not None:
                    sil.append((st, float(m.group(2))))
                    st = None
            if not sil:
                w(u"  %4ddB : 無音が見つかりません" % db)
                continue
            row = []
            for L in (0.06, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.60):
                keep = [x for x in sil if (x[1] - x[0]) >= L]
                runs = len(keep) + 1
                row.append(u"%.2f秒→%d" % (L, runs))
            w(u"  %4ddB : 無音 %3d箇所 | 区間数: %s" % (db, len(sil), "  ".join(row)))
    else:
        w(u"merged.wav がないので調べられません")
    w()

    w(u"===== 完成した動画 =====")
    for n in sorted(os.listdir(".")):
        if n.lower().endswith(".mp4"):
            dd = dur(n)
            w(u"  %-28s %s秒" % (n, ("%.3f" % dd) if dd else "?"))
    w()

    w(u"===== 割り当て表 =====")
    if os.path.exists(u"画像割り当て.tsv"):
        rows = [l.rstrip("\n").split("\t") for l in io.open(u"画像割り当て.tsv", encoding="utf-8-sig")
                if l.strip() and not l.startswith("#") and not l.startswith("No")]
        cum = sum(float(c[2]) for c in rows if len(c) > 2)
        w(u"行数 %d / 合計 %.3f秒" % (len(rows), cum))
        w(u"--- 最初の5行 ---")
        for c in rows[:5]:
            w(u"  %s" % u"\t".join(c))
        w(u"--- 最後の5行 ---")
        for c in rows[-5:]:
            w(u"  %s" % u"\t".join(c))
    else:
        w(u"ありません")

    io.open(os.path.join(HERE, u"診断.txt"), "w", encoding="utf-8", newline="\r\n").write(
        u"\r\n".join(OUT) + u"\r\n")
    w()
    w(u"診断.txt に書き出しました。このファイルをそのまま貼ってください。")


if __name__ == "__main__":
    main()
