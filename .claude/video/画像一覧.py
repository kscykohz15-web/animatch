# -*- coding: utf-8 -*-
u"""画像一覧 ─ 話数フォルダごとに「絵と番号の一覧表」を作る

本人の指定（2026-10-04）:
  「私が保有している画像のそれぞれのフォルダ内に、画像とその番号が分かる
    一覧表を作成し、それぞれどの画像を割り当てるのか
    正確にかつ簡単に指示できるようにしたい」

できるもの（元の絵には一切ふれません）:

    無職転生Ⅲ 第11話/
        一覧_01.png     絵を並べた表。1マスに大きく「3-11-056」と番号
        一覧_02.png     20枚ずつ、何ページでも
        一覧.txt        番号 → ファイル名（説明があれば説明も）

    一覧/               ← 全話数ぶんを1つのフォルダに集めたもの
        3-11_01.png     ここを開いて矢印キーを押すだけで、
        3-11_02.png     1期の1話から3期の14話まで順に見ていけます
        ...

絵の番号は 期-話-通し番号 です。

    1-09-005   無職転生   第9話  の 005
    2-14-013   無職転生Ⅱ 第14話 の 013
    3-11-056   無職転生Ⅲ 第11話 の 056

この番号を その他/差し替え.txt に書けば、その場所の絵が入れ替わります。

    042<タブ>3-13-007

使い方:
    python 画像一覧.py                     … 新しくなったフォルダだけ作る
    python 画像一覧.py --again             … 全部作り直す
    python 画像一覧.py --images "D:\\絵"    … 別の場所の絵で作る
"""
import os
import re
import sys
import io
import argparse
import shutil

EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
KI_KIGOU = ((u"Ⅲ", 3), (u"Ⅱ", 2), (u"III", 3), (u"II", 2))
MATOME = u"一覧"            # 全話数ぶんを集めるフォルダの名前
RETSU, GYOU = 5, 4          # 1ページ 5列×4行 = 20枚
TW, TH = 360, 203           # 1マスの絵の大きさ
FONTS = [u"C:\\Windows\\Fonts\\meiryo.ttc", u"C:\\Windows\\Fonts\\YuGothM.ttc",
         u"C:\\Windows\\Fonts\\msgothic.ttc",
         u"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]


def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def fol_code(fol):
    u"""話数フォルダ名 → (期, 話)。分からなければ None。"""
    ki = 1
    for kigou, n in KI_KIGOU:
        if kigou in fol:
            ki = n
            break
    m = re.search(r"第\s*(\d+)\s*話", fol)
    return (ki, int(m.group(1))) if m else None


def img_code(fol, name):
    u"""フォルダ名とファイル名 → 短い番号。番号が無ければ空。"""
    ke = fol_code(fol)
    m = re.match(r"(\d+)", os.path.basename(name))
    if not ke or not m:
        return u""
    return u"%d-%02d-%03d" % (ke[0], ke[1], int(m.group(1)))


def load_catalog(path):
    u"""画像カタログ.txt があれば {目印: 説明} で読む。無くても困らない。"""
    out = {}
    if not path or not os.path.exists(path):
        return out
    for line in io.open(path, encoding="utf-8-sig", errors="replace") \
            .read().replace("\r\n", "\n").split("\n"):
        if not line.strip() or line.startswith(u"#"):
            continue
        c = line.split(u"\t")
        if len(c) >= 2:
            out[c[0].strip()] = u" ".join(c[1].split())
    return out


def fnt(px):
    from PIL import ImageFont
    for f in FONTS:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, px)
            except Exception:
                pass
    return ImageFont.load_default()


def matome_na(fol, pg):
    u"""まとめフォルダでの名前。並べ替えたときに話数の順になるようにする。"""
    ke = fol_code(fol)
    atama = u"%d-%02d" % ke if ke else (u"9-99_" + fol)
    return u"%s_%02d.png" % (atama, pg)


def sheet_wo_tsukuru(fol_path, fol, names, cat, f_no, f_sm, f_hd, matome=None):
    u"""1つの話数フォルダぶんの一覧シートを作る。作ったページ数を返す。

    matome を渡すと、同じ絵をそのフォルダにも置く。
    本人の指定：「画像の切り替えのみですべての一覧が見られるように」。
    """
    from PIL import Image, ImageDraw
    pad, gap, shita, atama = 20, 12, 30, 58
    per = RETSU * GYOU
    mai = (len(names) + per - 1) // per
    W = pad * 2 + RETSU * TW + (RETSU - 1) * gap
    H = atama + pad + GYOU * (TH + shita) + (GYOU - 1) * gap + pad
    dekita = 0
    for pg in range(mai):
        sheet = Image.new("RGB", (W, H), (14, 13, 22))
        d = ImageDraw.Draw(sheet)
        d.text((pad, 18),
               u"%s   %d / %d ページ   ［この番号を その他/差し替え.txt に書くと、"
               u"その絵に入れ替わります］" % (fol, pg + 1, mai),
               font=f_hd, fill=(238, 201, 115))
        for k in range(per):
            i = pg * per + k
            if i >= len(names):
                break
            c, r = k % RETSU, k // RETSU
            x = pad + c * (TW + gap)
            y = atama + pad + r * (TH + shita + gap)
            d.rectangle([x, y, x + TW, y + TH], fill=(32, 30, 48))
            try:
                im = Image.open(os.path.join(fol_path, names[i])).convert("RGB")
                im.thumbnail((TW, TH), Image.LANCZOS)
                sheet.paste(im, (x + (TW - im.width) // 2, y + (TH - im.height) // 2))
            except Exception:
                d.text((x + 12, y + TH // 2), u"(開けません)", font=f_sm,
                       fill=(150, 142, 180))
            code = img_code(fol, names[i]) or u"?"
            wn = int(d.textlength(code, font=f_no)) + 20
            d.rectangle([x, y, x + wn, y + 42], fill=(12, 10, 20))
            d.text((x + 10, y + 5), code, font=f_no, fill=(238, 201, 115))
            setsu = cat.get(fol + u"/" + names[i], u"")
            if setsu:
                if len(setsu) > 26:
                    setsu = setsu[:26] + u"…"
                d.text((x + 2, y + TH + 6), setsu, font=f_sm, fill=(170, 164, 200))
        out = os.path.join(fol_path, u"一覧_%02d.png" % (pg + 1))
        sheet.save(out)
        if matome:
            sheet.save(os.path.join(matome, matome_na(fol, pg + 1)))
        dekita += 1
    # 余分なページが前に残っていたら消す（絵が減ったとき）
    for n in os.listdir(fol_path):
        m = re.match(r"^一覧_(\d+)\.png$", n)
        if m and int(m.group(1)) > dekita:
            for q in [os.path.join(fol_path, n)] + \
                     ([os.path.join(matome, matome_na(fol, int(m.group(1))))]
                      if matome else []):
                try:
                    os.remove(q)
                except Exception:
                    pass
    return dekita


def txt_wo_kaku(fol_path, fol, names, cat):
    out = [u"# %s の絵の一覧（%d枚）" % (fol, len(names)),
           u"#",
           u"# 左の番号を その他/差し替え.txt に書けば、その絵に入れ替わります。",
           u"#   例)  042<タブ>%s" % (img_code(fol, names[0]) if names else u"3-11-056"),
           u"#",
           u"番号\tファイル名\t説明"]
    for n in names:
        out.append(u"%s\t%s\t%s"
                   % (img_code(fol, n) or u"?", n, cat.get(fol + u"/" + n, u"")))
    io.open(os.path.join(fol_path, u"一覧.txt"), "w",
            encoding="utf-8", newline="\r\n").write(u"\r\n".join(out) + u"\r\n")


def matome_mo_aru(fol_path, fol, matome):
    u"""まとめフォルダにも同じページが揃っているか。

    一覧だけ先に作ってあった回のぶんも、ここで拾って置き直す。
    """
    mai = len([n for n in os.listdir(fol_path)
               if re.match(r"^一覧_\d+\.png$", n)])
    if not mai:
        return False
    for pg in range(1, mai + 1):
        if not os.path.exists(os.path.join(matome, matome_na(fol, pg))):
            return False
    return True


def utsusu(fol_path, fol, matome):
    u"""もう出来ている一覧シートを、まとめフォルダに写すだけ。

    作り直すと何分もかかるので、中身が同じなら写すだけで済ませる。
    """
    n = 0
    for nm in sorted(os.listdir(fol_path)):
        m = re.match(r"^一覧_(\d+)\.png$", nm)
        if not m:
            continue
        try:
            shutil.copy2(os.path.join(fol_path, nm),
                         os.path.join(matome, matome_na(fol, int(m.group(1)))))
            n += 1
        except Exception:
            pass
    return n


def atarashii_ka(fol_path, names):
    u"""一覧がもう新しければ True（作り直さなくていい）。"""
    ichi = os.path.join(fol_path, u"一覧.txt")
    if not os.path.exists(ichi) or not os.path.exists(
            os.path.join(fol_path, u"一覧_01.png")):
        return False
    t = os.path.getmtime(ichi)
    for n in names:
        if os.path.getmtime(os.path.join(fol_path, n)) > t:
            return False
    try:
        aru = io.open(ichi, encoding="utf-8-sig", errors="replace").read()
        return (u"（%d枚）" % len(names)) in aru
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default=u"C:\\Youtube動画\\無職転生\\画像\\高画質")
    ap.add_argument("--catalog", default=u"画像カタログ.txt")
    ap.add_argument("--again", action="store_true")
    a = ap.parse_args()

    if not os.path.isdir(a.images):
        print(u"画像フォルダが見つかりません: " + a.images)
        print(u"  --images で場所を教えてください。")
        return 1
    try:
        from PIL import Image  # noqa
    except ImportError:
        print(u"Pillow が要ります。  pip install pillow")
        return 1

    cat = load_catalog(a.catalog)
    if cat:
        print(u"説明つき: 画像カタログ.txt から %d枚ぶん" % len(cat))

    fols = sorted([n for n in os.listdir(a.images)
                   if os.path.isdir(os.path.join(a.images, n)) and n != MATOME],
                  key=natkey)
    if not fols:
        print(u"話数フォルダが見つかりません: " + a.images)
        return 1

    matome_dir = os.path.join(a.images, MATOME)
    if not os.path.isdir(matome_dir):
        os.makedirs(matome_dir)

    f_no, f_sm, f_hd = fnt(30), fnt(16), fnt(24)
    zenbu, tobashi, mai_kei, utsushi = [], 0, 0, 0
    for idx, fol in enumerate(fols, 1):
        fp = os.path.join(a.images, fol)
        names = sorted([n for n in os.listdir(fp)
                        if n.lower().endswith(EXTS) and not n.startswith(u"一覧")],
                       key=natkey)
        if not names:
            continue
        if not a.again and atarashii_ka(fp, names):
            # 一覧はもう出来ている。まとめフォルダに無いぶんだけ写す
            if not matome_mo_aru(fp, fol, matome_dir):
                utsushi += utsusu(fp, fol, matome_dir)
            tobashi += 1
            for n in names:
                zenbu.append((img_code(fol, n), fol, n))
            continue
        print(u"[%d/%d] %s  %d枚" % (idx, len(fols), fol, len(names)))
        sys.stdout.flush()
        txt_wo_kaku(fp, fol, names, cat)
        mai_kei += sheet_wo_tsukuru(fp, fol, names, cat, f_no, f_sm, f_hd,
                                    matome=matome_dir)
        for n in names:
            zenbu.append((img_code(fol, n), fol, n))

    matome = [u"# 絵の番号 → どのフォルダのどのファイルか（%d枚）" % len(zenbu),
              u"#",
              u"# 番号は 期-話-通し番号 です。",
              u"#   1-09-005 … 無職転生   第9話  の 005",
              u"#   2-14-013 … 無職転生Ⅱ 第14話 の 013",
              u"#   3-11-056 … 無職転生Ⅲ 第11話 の 056",
              u"#",
              u"番号\t話数\tファイル名"]
    for (c, fol, n) in sorted(zenbu, key=lambda t: natkey(t[0])):
        matome.append(u"%s\t%s\t%s" % (c or u"?", fol, n))
    mp = os.path.join(a.images, u"画像番号一覧.txt")
    io.open(mp, "w", encoding="utf-8", newline="\r\n").write(u"\r\n".join(matome) + u"\r\n")

    print(u"")
    print(u"できました。絵 %d枚 / 話数 %d フォルダ" % (len(zenbu), len(fols)))
    if tobashi:
        print(u"  （%d フォルダは変わっていないのでとばしました。--again で作り直せます）"
              % tobashi)
    if mai_kei:
        print(u"  一覧シート %dページを作りました" % mai_kei)
    if utsushi:
        print(u"  （もう出来ていた %dページは、作り直さずにまとめフォルダへ写しました）"
              % utsushi)
    print(u"  話数フォルダの中の  一覧_01.png  を開くと、絵と番号が並んでいます。")
    print(u"  ぜんぶまとめたものは  " + matome_dir)
    print(u"    1枚目を開いて矢印キーを押すだけで、1期の1話から3期の14話まで見られます。")
    print(u"  番号とファイル名の対応は  " + mp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
