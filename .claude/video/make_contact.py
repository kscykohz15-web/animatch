# -*- coding: utf-8 -*-
"""
画像フォルダの中身を、番号つきの一覧シート(PNG)にまとめます。
チャットに貼るのはこのシートだけで済むので、画像を何十枚も送らずに、
どの場面にどの絵を当てるかを相談できます。

    python make_contact.py
    python make_contact.py --images "C:\\...\\別のフォルダ" --cols 5 --rows 4
"""
import argparse
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import 置き場所                                   # 絵の道は置き場所.txt にだけ書く
IMGDIR_DEFAULT = 置き場所.gazou()
OUTDIR_DEFAULT = os.path.dirname(IMGDIR_DEFAULT.rstrip(u"\\/")) \
    if os.path.basename(IMGDIR_DEFAULT.rstrip(u"\\/")) == u"高画質" else IMGDIR_DEFAULT
EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")

FONTS = [
    u"C:\\Windows\\Fonts\\meiryo.ttc",
    u"C:\\Windows\\Fonts\\YuGothM.ttc",
    u"C:\\Windows\\Fonts\\YuGothR.ttc",
    u"C:\\Windows\\Fonts\\msgothic.ttc",
    u"/usr/share/fonts/opentype/unifont/unifont_jp.otf",
    u"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

BG = (11, 10, 20)
CARD = (22, 20, 38)
FG = (228, 222, 245)
DIM = (150, 142, 180)
GOLD = (238, 201, 115)


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


def load_font(size):
    from PIL import ImageFont
    for path in FONTS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


def fit_text(draw, text, font, maxw):
    if draw.textlength(text, font=font) <= maxw:
        return text
    while text and draw.textlength(text + u"…", font=font) > maxw:
        text = text[:-1]
    return text + u"…"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=IMGDIR_DEFAULT)
    ap.add_argument("--out", default=OUTDIR_DEFAULT)
    ap.add_argument("--cols", type=int, default=0)
    ap.add_argument("--rows", type=int, default=0)
    ap.add_argument("--thumb", type=int, default=0)
    ap.add_argument("--big", action="store_true",
                    help=u"大きめ(3x3)。人物や場面を見分けるならこちら")
    ap.add_argument("--small", action="store_true", help=u"小さめ(5x4)")
    a = ap.parse_args()

    try:
        from PIL import Image, ImageDraw
    except ImportError:
        die(u"Pillow が入っていません。PowerShellで  pip install pillow  を実行してください。")

    if not os.path.isdir(a.images):
        die(u"画像フォルダが見つかりません: " + a.images)
    names = []
    for cur, dirs, files in os.walk(a.images):
        dirs.sort(key=natkey)
        rel = os.path.relpath(cur, a.images)
        rel = u"" if rel == "." else rel.replace(os.sep, u"/")
        for n in sorted([x for x in files if x.lower().endswith(EXTS)], key=natkey):
            names.append((rel + u"/" + n) if rel else n)
    if not names:
        die(u"画像フォルダに画像がありません: " + a.images)
    if not os.path.isdir(a.out):
        os.makedirs(a.out)

    if a.small:
        a.cols = a.cols or 5
        a.rows = a.rows or 4
        a.thumb = a.thumb or 340
    else:                      # 既定は大きめ(人物や場面が見分けられる大きさ)
        a.cols = a.cols or 3
        a.rows = a.rows or 3
        a.thumb = a.thumb or 600
    tw = a.thumb
    th = int(round(tw * 9 / 16.0))
    pad, gap, label, head = 26, 16, (66 if tw >= 480 else 54), 66
    per = a.cols * a.rows
    pages = (len(names) + per - 1) // per
    W = pad * 2 + a.cols * tw + (a.cols - 1) * gap
    H = head + pad + a.rows * (th + label) + (a.rows - 1) * gap + pad

    big = (tw >= 480)
    f_lab = load_font(26 if big else 17)
    f_sub = load_font(21 if big else 15)
    f_num = load_font(34 if big else 17)
    f_head = load_font(30 if big else 25)

    # しぼり込みでコピーしてきた画像なら、元のフォルダ/ファイル名の対応表がある。
    # これがあると、シートに「画像カタログ.txt にそのまま書ける目印」を出せる。
    orig = {}
    mp = os.path.join(a.images, u"_元の名前.tsv")
    if os.path.exists(mp):
        for ln in io.open(mp, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n").split("\n"):
            if u"\t" in ln:
                b, n = ln.split(u"\t", 1)
                orig[b.strip()] = n.strip()
        say(u"元のファイル名の対応表を読みました (%d件)" % len(orig))

    def catalog_key(name):
        """画像カタログ.txt の「目印」の形にする: フォルダ/連番_"""
        real = orig.get(name.split(u"/")[-1], name)
        if u"/" not in real:
            return real
        fol, base = real.rsplit(u"/", 1)
        head = base.split(u"_")[0]
        return u"%s/%s_" % (fol, head) if head else real

    # 同じフォルダの中で何枚目か（順に保存していれば、話の進み具合の目安になる）
    pos = {}
    cnt = {}
    for n in names:
        fol = n.rsplit(u"/", 1)[0] if u"/" in n else u""
        cnt[fol] = cnt.get(fol, 0) + 1
    seen = {}
    for n in names:
        fol = n.rsplit(u"/", 1)[0] if u"/" in n else u""
        seen[fol] = seen.get(fol, 0) + 1
        pos[n] = (seen[fol], cnt[fol])

    # 番号とファイル名の対応表
    with io.open(os.path.join(a.out, u"画像一覧.txt"), "w",
                 encoding="utf-8-sig", newline="\r\n") as f:
        f.write(u"# %s ・ 全%d枚\r\n" % (a.images, len(names)))
        f.write(u"# 番号\tカタログの目印\tファイル名\t(フォルダ内 何枚目/全部)\r\n")
        for i, n in enumerate(names):
            k2, t2 = pos[n]
            f.write(u"%d\t%s\t%s\t%d/%d\r\n"
                    % (i + 1, catalog_key(n), n, k2, t2))

    made = []
    for pg in range(pages):
        sheet = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(sheet)
        d.text((pad, 22), u"無職転生 画像一覧", font=f_head, fill=GOLD)
        d.text((pad + int(d.textlength(u"無職転生 画像一覧", font=f_head)) + 26, 30),
               u"%d / %d ページ ・ 全 %d 枚" % (pg + 1, pages, len(names)),
               font=f_lab, fill=DIM)

        for k in range(per):
            idx = pg * per + k
            if idx >= len(names):
                break
            c, r = k % a.cols, k // a.cols
            x = pad + c * (tw + gap)
            y = head + pad + r * (th + label + gap)
            d.rectangle([x, y, x + tw, y + th], fill=CARD)
            try:
                im = Image.open(os.path.join(a.images, names[idx]))
                im = im.convert("RGB")
                im.thumbnail((tw, th), Image.LANCZOS)
                sheet.paste(im, (x + (tw - im.width) // 2, y + (th - im.height) // 2))
            except Exception:
                d.text((x + 12, y + th // 2 - 10), u"(開けません)", font=f_lab, fill=DIM)
            num = u"%d" % (idx + 1)
            nw = int(d.textlength(num, font=f_num)) + 18
            d.rectangle([x, y, x + nw, y + (44 if big else 26)], fill=(18, 14, 30))
            d.text((x + 9, y + (3 if big else 4)), num, font=f_num, fill=GOLD)
            nm = names[idx]
            folder = nm.rsplit(u"/", 1)[0] if u"/" in nm else u""
            k, tot = pos[nm]
            line1 = catalog_key(nm)
            if line1 == nm.split(u"/")[-1] and folder:
                line1 = u"%s  ─  %s" % (folder, line1)
            d.text((x + 2, y + th + 6),
                   fit_text(d, line1, f_lab, tw - 4), font=f_lab, fill=FG)
            if tot > 1:
                d.text((x + 2, y + th + 8 + (30 if big else 20)),
                       u"%d / %d 枚目" % (k, tot), font=f_sub, fill=DIM)

        out = os.path.join(a.out, u"画像一覧_%02d.png" % (pg + 1))
        sheet.save(out)
        made.append(out)
        say(u"  " + out)

    say(u"")
    say(u"画像 %d枚 を %dページの一覧シートにしました。" % (len(names), pages))
    say(u"このPNGをチャットに貼れば、台本に合わせた割り当て表をこちらで作れます。")
    say(u"番号とファイル名の対応は 画像一覧.txt にも入っています。")


if __name__ == "__main__":
    main()
