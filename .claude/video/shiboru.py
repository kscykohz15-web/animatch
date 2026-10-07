# -*- coding: utf-8 -*-
"""
大量の画像から、見比べる候補だけを絞り込みます。

1万枚あっても、ほとんどは連続したフレームでほぼ同じ絵です。
似た絵をまとめ（重複除去）、話数や位置で範囲を決めて、
そこから均等に選んだものだけを一覧シートにします。

    python shiboru.py                                   … 全体から120枚に絞る
    python shiboru.py --folder 第11話                    … 第11話だけ
    python shiboru.py --folder 第11話 --from 0.8 --max 24 … 第11話の終盤から24枚
    python shiboru.py --folder 第11話 --from 0.80 --to 0.95 --max 18

  --from / --to は、そのフォルダの何割目かです（0.0〜1.0）。
  順番に保存していれば、話の進み具合の目安になります。

初回は全画像のハッシュを作るので数分かかります（_hash.tsv に保存され、
2回目からは速くなります）。
"""
import argparse
import io
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import 置き場所                                   # 絵の道は置き場所.txt にだけ書く
IMGDIR_DEFAULT = 置き場所.gazou()
OUT_DEFAULT = os.path.dirname(IMGDIR_DEFAULT.rstrip(u"\\/")) \
    if os.path.basename(IMGDIR_DEFAULT.rstrip(u"\\/")) == u"高画質" else IMGDIR_DEFAULT
EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
HASHFILE = u"_hash.tsv"


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


def natkey(name):
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r"(\d+)", name)]


def walk(root):
    out = []
    for cur, dirs, files in os.walk(root):
        dirs.sort(key=natkey)
        rel = os.path.relpath(cur, root)
        rel = u"" if rel == "." else rel.replace(os.sep, u"/")
        for n in sorted([x for x in files if x.lower().endswith(EXTS)], key=natkey):
            out.append((rel + u"/" + n) if rel else n)
    return out


def dhash(Image, path):
    """似ている絵が同じ値になりやすい、小さな指紋を作る。"""
    try:
        im = Image.open(path)
        try:
            im.draft("L", (32, 32))     # JPEGなら読み込み自体を粗くして速くする
        except Exception:
            pass
        im = im.convert("L").resize((9, 8), Image.BILINEAR)
    except Exception:
        return None
    px = list(im.getdata())
    bits = 0
    for r in range(8):
        for c in range(8):
            if px[r * 9 + c] > px[r * 9 + c + 1]:
                bits |= 1 << (r * 8 + c)
    return bits


def popcount(x):
    n = 0
    while x:
        x &= x - 1
        n += 1
    return n


def load_hashes(root, names, Image):
    path = os.path.join(root, HASHFILE)
    have = {}
    if os.path.exists(path):
        for line in io.open(path, encoding="utf-8", errors="replace"):
            if u"\t" not in line:
                continue
            k, v = line.rstrip(u"\n").split(u"\t", 1)
            try:
                have[k] = int(v)
            except ValueError:
                pass
    todo = [n for n in names if n not in have]
    if todo:
        say(u"指紋を作っています… %d枚 (初回だけ時間がかかります)" % len(todo))
        for i, n in enumerate(todo):
            h = dhash(Image, os.path.join(root, n.replace(u"/", os.sep)))
            if h is not None:
                have[n] = h
            if (i + 1) % 500 == 0:
                say(u"    %d / %d" % (i + 1, len(todo)))
        with io.open(path, "w", encoding="utf-8", newline="\n") as f:
            for n in names:
                if n in have:
                    f.write(u"%s\t%d\n" % (n, have[n]))
        say(u"    保存しました: " + path)
    return have


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--images", default=IMGDIR_DEFAULT)
    ap.add_argument("--out", default=OUT_DEFAULT)
    ap.add_argument("--folder", default=u"", help=u"話数などで絞る（部分一致）")
    ap.add_argument("--from", dest="pos_from", type=float, default=0.0)
    ap.add_argument("--to", dest="pos_to", type=float, default=1.0)
    ap.add_argument("--dedupe", type=int, default=12, help=u"これ以下の差は同じ絵とみなす")
    ap.add_argument("--max", type=int, default=120, help=u"最終的に残す枚数")
    ap.add_argument("--name", default=u"候補", help=u"出力ファイル名の頭")
    ap.add_argument("--sheet", default="1", help=u"0 で一覧シートを作らない")
    a = ap.parse_args()

    try:
        from PIL import Image
    except ImportError:
        die(u"Pillow が入っていません。PowerShellで  pip install pillow  を実行してください。")

    if not os.path.isdir(a.images):
        die(u"画像フォルダが見つかりません: " + a.images)
    names = walk(a.images)
    if not names:
        die(u"画像がありません: " + a.images)
    say(u"全部で %d枚" % len(names))

    if a.folder:
        names = [n for n in names if a.folder in n]
        say(u"「%s」で絞って %d枚" % (a.folder, len(names)))
        if not names:
            die(u"その名前のフォルダ/ファイルがありません")

    # フォルダごとに「何割目か」で範囲を切る
    if a.pos_from > 0.0 or a.pos_to < 1.0:
        byf = {}
        for n in names:
            byf.setdefault(n.rsplit(u"/", 1)[0] if u"/" in n else u"", []).append(n)
        keep = []
        for f, ns in byf.items():
            lo = int(len(ns) * a.pos_from)
            hi = max(lo + 1, int(round(len(ns) * a.pos_to)))
            keep.extend(ns[lo:hi])
        names = [n for n in names if n in set(keep)]
        say(u"位置 %.0f%%〜%.0f%% で絞って %d枚" % (a.pos_from * 100, a.pos_to * 100, len(names)))

    hashes = load_hashes(a.images, names, Image)

    # 連続する似た絵をまとめる（1つの場面につき1枚だけ残す）
    kept, last, groups = [], None, []
    for n in names:
        h = hashes.get(n)
        if h is None:
            continue
        if last is not None and popcount(h ^ last) <= a.dedupe:
            groups[-1] += 1
            continue
        kept.append(n)
        groups.append(1)
        last = h
    say(u"似た絵をまとめて %d枚（1枚あたり平均 %.1f フレーム分）"
        % (len(kept), (len(names) / float(len(kept))) if kept else 0))
    if len(names) > 100 and len(kept) < 8:
        say(u"  まとめすぎです。--dedupe を小さく（例 6）してもう一度お試しください。")
    elif len(kept) > a.max * 4:
        say(u"  まだ多いので、--dedupe を大きく（例 16）すると減らせます。")

    if len(kept) > a.max:
        step = len(kept) / float(a.max)
        kept = [kept[int(i * step)] for i in range(a.max)]
        say(u"均等に間引いて %d枚" % len(kept))

    if not os.path.isdir(a.out):
        os.makedirs(a.out)
    lst = os.path.join(a.out, u"%s一覧.txt" % a.name)
    with io.open(lst, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write(u"# %s / 絞り込み条件: フォルダ=%s 位置=%.2f〜%.2f 重複しきい値=%d\r\n"
                % (a.images, a.folder or u"全部", a.pos_from, a.pos_to, a.dedupe))
        f.write(u"# 番号\tファイル名\r\n")
        for i, n in enumerate(kept):
            f.write(u"%d\t%s\r\n" % (i + 1, n))
    say(u"一覧: " + lst)

    if a.sheet != "0":
        here = os.path.dirname(os.path.abspath(__file__))
        mc = os.path.join(here, "make_contact.py")
        if not os.path.exists(mc):
            mc = os.path.join(a.out, "make_contact.py")
        if os.path.exists(mc):
            tmp = os.path.join(a.out, u"_選んだ画像")
            import shutil
            if os.path.isdir(tmp):
                shutil.rmtree(tmp, ignore_errors=True)
            os.makedirs(tmp)
            # 一覧シートに「本当のファイル名」を出せるよう、対応表も置く。
            # (シート用にフォルダ名を _ でつないでコピーしているため、
            #  これが無いと元のフォルダ/ファイル名が読み取れない)
            pairs = []
            for i, n in enumerate(kept):
                src = os.path.join(a.images, n.replace(u"/", os.sep))
                base = u"%03d_%s" % (i + 1, n.replace(u"/", u"_"))
                dst = os.path.join(tmp, base)
                try:
                    shutil.copy2(src, dst)
                    pairs.append((base, n))
                except Exception:
                    pass
            try:
                with io.open(os.path.join(tmp, u"_元の名前.tsv"), "w",
                             encoding="utf-8-sig", newline="\r\n") as f:
                    for b, n in pairs:
                        f.write(b + u"\t" + n + u"\r\n")
            except Exception:
                pass
            subprocess.run([sys.executable, mc, "--images", tmp, "--out", a.out],
                           stdout=None, stderr=None)
            say(u"")
            say(u"一覧シートを %s に作りました。" % a.out)
        else:
            say(u"make_contact.py が見つからないので、一覧シートは作りませんでした。")

    say(u"")
    say(u"この一覧シートをチャットに貼ってください。")


if __name__ == "__main__":
    main()
