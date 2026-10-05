# -*- coding: utf-8 -*-
u"""直す ─ 絵を入れ替える手間を「数字ひとつ」にする

■ ねらい（本人の指定・2026-10-05）
    「画像割当に対する私の工数を限りなく少なくすること」

これまでの直し方は、こうだった。

    コマ一覧14ページを見る → 変えたい所を見つける
    → 一覧シート300ページから良い絵を探す → 長い番号を打ち込む

**探す所がいちばん重い。** そこを機械にやらせる。

    不安な所だけ 1行にまとめ、[いまの絵]＋[候補6枚] を並べた紙を出す
    → 本人は 1〜6 の数字をひとつ書くだけ

候補の選び方は、本人の27件の直しから分かった7か条に沿わせてある。

    ③ セリフに出ている人が、絵にも写っていること  （いちばん重い）
    ④ その章の話数の中から選ぶ
    ④ となりの絵と同じ話数なら、場面がつながる
    ⑤ となりの絵と番号が近ければ、同じ場面
    ⑥ 使いすぎている絵は下げる
    ─ 使用不可（文字あり・実写）は候補にしない

出来るもの:
    確認用/直す_01.png    1行 = いまの絵 + 候補6枚（大きな番号つき）
    その他/候補.txt       042-3 → 実際の絵（機械が読む）
    その他/差し替え.txt   直す所の行が、空のまま足される（ここに数字を書く）

使い方:
    python 直す.py                 … 不安な所だけ（既定 30か所）
    python 直す.py --数 60         … もっと見る
    python 直す.py --全部          … 全部の区切りを見る
"""
from __future__ import print_function
import argparse
import hashlib
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import miru_kekka as M            # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
KOUHO = 6                        # 1行に並べる候補の数
FONTS = [u"C:\\Windows\\Fonts\\meiryo.ttc", u"C:\\Windows\\Fonts\\YuGothM.ttc",
         u"C:\\Windows\\Fonts\\msgothic.ttc",
         u"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]


def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def code_of(img):
    return M.code_of(img)


def ban_of(img):
    u"""絵のファイル名の頭の番号（同じ場面かを見るのに使う）。"""
    m = re.match(r"(\d+)", os.path.basename(img.replace(u"\\", u"/")))
    return int(m.group(1)) if m else -1


def walk_images(root):
    u"""画像フォルダを歩いて {話数フォルダ: [絵の名前]} を作る。"""
    out = {}
    if not os.path.isdir(root):
        return out
    for fol in sorted(os.listdir(root), key=natkey):
        d = os.path.join(root, fol)
        if not os.path.isdir(d) or fol == u"一覧":
            continue
        names = [u"%s/%s" % (fol, n) for n in sorted(os.listdir(d), key=natkey)
                 if n.lower().endswith(EXTS) and not n.startswith(u"一覧")]
        if names:
            out[fol] = names
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


def wrap(t, n):
    return [t[i:i + n] for i in range(0, len(t), n)] or [u""]


# ------------------------------------------------------------------ 採点
def fuan(r, tags, tsukai):
    u"""この区切りが「不安」かどうか。大きいほど先に見せる。

    採点(miru_kekka)と同じ目で見る。ここで拾えないものは紙に出ない。
    """
    img, tx = r[u"img"], r[u"text"]
    if not img or img.startswith(u"@@") or M.is_zuhyou(img):
        return 0, u""
    desc = M.cat_lookup(tags, img)
    if desc is None:
        return 6, u"この絵の説明がカタログにありません"
    w = set(desc.split())
    riyuu, omosa = [], 0
    if u"使用不可" in w:
        return 100, u"【使用不可】文字あり・実写など"
    hito = M.chars_in(tx)
    if hito:
        iru = []
        for c in hito:
            if c in w or any(x in w for x in M.IIKAE.get(c, [])):
                iru.append(c)
        if not iru:
            hoka = [c for c in M.CHARACTERS if c in w and c not in hito]
            if hoka:
                riyuu.append(u"人ちがい（絵は %s）" % u"・".join(hoka[:2]))
                omosa += 50
            else:
                riyuu.append(u"セリフは %s／絵に人がいません" % u"・".join(hito[:2]))
                omosa += 30
    yurusu = r.get(u"daihon") or []
    fol = M.folder_of(img)
    if yurusu and fol and fol not in yurusu:
        riyuu.append(u"話数ちがい")
        omosa += 25
    n = len(tsukai.get(img, []))
    if n >= 4:
        riyuu.append(u"同じ絵を%d回" % n)
        omosa += 12
    elif n == 3:
        riyuu.append(u"同じ絵を3回")
        omosa += 5
    te = M.tegakari_in(tx)
    hazure = [x for x in te if not M.tegakari_ok(x, w)]
    if te and len(hazure) == len(te):
        riyuu.append(u"情景ちがい（%s）" % u"・".join(te[:2]))
        omosa += 8
    return omosa, u" / ".join(riyuu)


def kouho_erabu(r, rows, i, tags, zenbu, tsukai, kazu=KOUHO):
    u"""この区切りに合いそうな絵を、良い順に kazu 枚えらぶ。"""
    tx = r[u"text"]
    ima = r[u"img"]
    yurusu = r.get(u"daihon") or []
    hito = M.chars_in(tx)
    te = M.tegakari_in(tx)

    # となりの絵（場面のつながりを見るため）
    tonari = []
    for j in (i - 1, i + 1):
        if 0 <= j < len(rows):
            g = rows[j][u"img"]
            if g and not g.startswith(u"@@"):
                tonari.append(g)

    # 候補のもと。章の話数があればその中、無ければ全部
    moto = []
    if yurusu:
        for f in yurusu:
            moto.extend(zenbu.get(f, []))
    if not moto:
        for v in zenbu.values():
            moto.extend(v)

    ten = []
    for k in moto:
        if k == ima:
            continue
        desc = M.cat_lookup(tags, k)
        if desc is None:
            continue
        w = set(desc.split())
        if u"使用不可" in w:
            continue
        p = 0.0
        # ③ 人がいちばん重い
        if hito:
            iru = [c for c in hito
                   if c in w or any(x in w for x in M.IIKAE.get(c, []))]
            hoka = [c for c in M.CHARACTERS if c in w and c not in hito]
            if iru:
                p += 100
            elif hoka:
                p -= 80
            else:
                p -= 30
        # 情景の手がかり
        atari = [x for x in te if M.tegakari_ok(x, w)]
        p += min(36, 12 * len(atari))
        # ④ 章の話数。左にあるものほど良い
        fol = M.folder_of(k)
        if yurusu:
            p += 60 - 10 * (yurusu.index(fol) if fol in yurusu else 6)
        # ④ となりと同じ話数なら場面がつながる
        if any(M.folder_of(t) == fol for t in tonari):
            p += 20
            # ⑤ 番号が近ければ、同じ場面
            for t in tonari:
                if M.folder_of(t) == fol and abs(ban_of(t) - ban_of(k)) <= 8:
                    p += 15
                    break
        # ⑥ 使いすぎている絵は下げる
        n = len(tsukai.get(k, []))
        p -= 50 if n >= 3 else (15 * n)
        # 同点のときの順番を、毎回同じにする
        p -= int(hashlib.md5(k.encode("utf-8")).hexdigest()[:4], 16) / 1e6
        ten.append((p, k))
    ten.sort(reverse=True)
    return [k for (_p, k) in ten[:kazu]]


# ------------------------------------------------------------------ 紙を作る
def sheet(mato, imgpath, tags, fol=u"確認用", gyou=5, omakase=False):
    u"""1行 = いまの絵 + 候補6枚。番号を大きく出す。"""
    from PIL import Image, ImageDraw
    tw, th = 236, 133
    pad, gap, aki, atama = 18, 10, 56, 54
    f_no, f_tx, f_sm, f_hd = fnt(26), fnt(17), fnt(13), fnt(22)
    W = pad * 2 + (KOUHO + 1) * tw + KOUHO * gap
    H = atama + pad + gyou * (th + aki) + (gyou - 1) * gap + pad
    mai = (len(mato) + gyou - 1) // gyou
    if not os.path.isdir(fol):
        os.makedirs(fol)
    dekita = 0

    def haru(d, sh, x, y, k, obi, iro):
        d.rectangle([x, y, x + tw, y + th], fill=(32, 30, 48))
        p = imgpath.get(k)
        if p and os.path.exists(p):
            try:
                im = Image.open(p).convert("RGB")
                im.thumbnail((tw, th), Image.LANCZOS)
                sh.paste(im, (x + (tw - im.width) // 2, y + (th - im.height) // 2))
            except Exception:
                pass
        wn = int(d.textlength(obi, font=f_no)) + 16
        d.rectangle([x, y, x + wn, y + 34], fill=(12, 10, 20))
        d.text((x + 8, y + 4), obi, font=f_no, fill=iro)
        setsu = (M.cat_lookup(tags, k) or u"")
        for n2, ln in enumerate(wrap(u" ".join(setsu.split()), 20)[:2]):
            d.text((x + 2, y + th + 2 + n2 * 15), ln, font=f_sm, fill=(150, 144, 180))

    for pg in range(mai):
        sh = Image.new("RGB", (W, H), (14, 13, 22))
        d = ImageDraw.Draw(sh)
        d.text((pad, 16),
               (u"直す  %d / %d ページ   ［★が自動で当たっています。"
                u"気に入らない所だけ 2〜6 を 差し替え.txt に］"
                if omakase else
                u"直す  %d / %d ページ   ［いちばん左がいまの絵。良いものの番号(1〜6)を "
                u"その他/差し替え.txt に書くだけ］") % (pg + 1, mai),
               font=f_hd, fill=(238, 201, 115))
        for q in range(gyou):
            idx = pg * gyou + q
            if idx >= len(mato):
                break
            m = mato[idx]
            y = atama + pad + q * (th + aki + gap)
            haru(d, sh, pad, y, m[u"ima"], u"%03d いま" % m[u"no"], (170, 170, 190))
            for c, k in enumerate(m[u"kouho"]):
                x = pad + (c + 1) * (tw + gap)
                obi = u"1 ★" if (omakase and c == 0) else u"%d" % (c + 1)
                haru(d, sh, x, y, k, obi,
                     (150, 230, 160) if (omakase and c == 0) else (238, 201, 115))
            d.text((pad, y + th + 32), u"%03d  %s" % (m[u"no"], m[u"serifu"][:44]),
                   font=f_tx, fill=(228, 222, 245))
            if m[u"riyuu"]:
                d.text((pad + 430, y + th + 32), u"← " + m[u"riyuu"][:52],
                       font=f_tx, fill=(232, 140, 140))
        out = os.path.join(fol, u"直す_%02d.png" % (pg + 1))
        sh.save(out)
        dekita += 1
    for n in os.listdir(fol):
        mm = re.match(r"^直す_(\d+)\.png$", n)
        if mm and int(mm.group(1)) > dekita:
            try:
                os.remove(os.path.join(fol, n))
            except Exception:
                pass
    return dekita


SASHI_ATAMA = u"""\ufeff# ─────────────────────────────────────────────
# 差し替え ─ 絵を入れ替える
#
#   確認用/直す_01.png を開いて、良い候補の **1〜6 の数字** を書くだけです。
#
#     042\t3        ← 42番を、紙の 3番目の候補にする
#     042\t         ← 空のままなら、いまの絵のまま
#
#   絵の番号で直接書くこともできます（一覧_01.png の番号）。
#     042\t3-13-007
#
# 直したら「はじめる.bat」→ 2 → 1 を実行するだけ。
# 台本も音声も作り直しません。
# ─────────────────────────────────────────────

"""


def sashikae_kaku(path, mato):
    u"""差し替え.txt に、直す所の行を空のまま足す。

    本人が書くのは数字ひとつ。すでに書いてある行はそのまま残す。
    """
    aru, moto = {}, u""
    if os.path.exists(path):
        moto = M.yomu(path)
        for line in moto.split(u"\n"):
            t = line.strip()
            if not t or t.startswith(u"#"):
                continue
            c = [x for x in re.split(r"[\t\u3000 ]{1,}", t)
                 if x and x.strip() not in (u"タブ", u"TAB", u"tab", u"\\t")]
            if c and c[0].isdigit():
                aru[int(c[0])] = u" ".join(c[1:]).strip()
    gyou = [SASHI_ATAMA.rstrip(u"\n")]
    for m in mato:
        no = m[u"no"]
        gyou.append(u"# %03d  %s" % (no, m[u"serifu"][:40]))
        if m[u"riyuu"]:
            gyou.append(u"#      %s" % m[u"riyuu"])
        gyou.append(u"%03d\t%s" % (no, aru.pop(no, u"")))
        gyou.append(u"")
    if aru:
        gyou.append(u"# ── 前に書いたもの ──")
        for no in sorted(aru):
            gyou.append(u"%03d\t%s" % (no, aru[no]))
    io.open(path, "w", encoding="utf-8", newline="\r\n") \
        .write(u"\n".join(gyou).replace(u"\n", u"\r\n") + u"\r\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(u"--一覧", dest="ichiran", default=os.path.join(u"確認用", u"一覧.txt"))
    ap.add_argument(u"--カタログ", dest="catalog", default=u"画像カタログ.txt")
    ap.add_argument(u"--画像", dest="images",
                    default=u"C:\\Youtube動画\\無職転生\\画像\\高画質")
    ap.add_argument(u"--数", dest="kazu", type=int, default=30)
    ap.add_argument(u"--全部", dest="zenbu", action="store_true")
    ap.add_argument(u"--おまかせ", dest="omakase", action="store_true",
                    help=u"いちばん良い候補を機械が当てる（あとで紙で直せます）")
    a = ap.parse_args()

    if not os.path.exists(a.ichiran):
        print(u"× %s がありません。先に動画を1回作ってください。" % a.ichiran)
        return 1
    try:
        from PIL import Image  # noqa
    except ImportError:
        print(u"Pillow が要ります（pip install pillow）")
        return 1

    rows = M.load_ichiran(a.ichiran)
    if not rows:
        print(u"× 一覧.txt が読めませんでした。")
        return 1
    tags = M.load_catalog(a.catalog)
    if not tags:
        print(u"× %s が読めませんでした。" % a.catalog)
        return 1
    zenbu = walk_images(a.images)
    if not zenbu:
        print(u"× 画像フォルダが見つかりません: %s" % a.images)
        print(u"   --画像 で場所を教えてください。")
        return 1
    imgpath = {}
    for fol, names in zenbu.items():
        for k in names:
            imgpath[k] = os.path.join(a.images, fol, k.split(u"/", 1)[1])

    tsukai = {}
    for r in rows:
        tsukai.setdefault(r[u"img"], []).append(r[u"no"])

    # 不安な順に並べる
    tsuki = []
    for i, r in enumerate(rows):
        omosa, riyuu = fuan(r, tags, tsukai)
        if a.zenbu or omosa > 0:
            tsuki.append((omosa, i, riyuu))
    tsuki.sort(key=lambda x: (-x[0], x[1]))
    if not a.zenbu:
        tsuki = tsuki[:a.kazu]
    else:
        tsuki = sorted(tsuki, key=lambda x: x[1])[:max(a.kazu, 200)]
    if not tsuki:
        print(u"○ 気になる所はありませんでした。")
        return 0

    print(u"区切り %d枚のうち、%d か所を見ます。候補を選んでいます…"
          % (len(rows), len(tsuki)))
    mato = []
    for n2, (omosa, i, riyuu) in enumerate(tsuki, 1):
        r = rows[i]
        k = kouho_erabu(r, rows, i, tags, zenbu, tsukai)
        if not k:
            continue
        mato.append({u"no": int(r[u"no"]), u"ima": r[u"img"], u"serifu": r[u"text"],
                     u"riyuu": riyuu, u"kouho": k})
        if n2 % 10 == 0:
            print(u"  %d / %d" % (n2, len(tsuki)))
            sys.stdout.flush()

    # 候補の対応表（機械が読む）
    kp = os.path.join(u"その他", u"候補.txt")
    M.youi(kp)
    g = [u"# 直す.py が作った候補の表です。手で直さないでください。",
         u"# 番号-候補 <タブ> 絵"]
    for m in mato:
        for c, k in enumerate(m[u"kouho"], 1):
            g.append(u"%03d-%d\t%s" % (m[u"no"], c, k))
    io.open(kp, "w", encoding="utf-8", newline="\r\n").write(u"\r\n".join(g) + u"\r\n")

    mai = sheet(mato, imgpath, tags, omakase=a.omakase)
    sashikae_kaku(os.path.join(u"その他", u"差し替え.txt"), mato)

    # おまかせ ─ いちばん良い候補を、機械の指定として別ファイルに書く。
    #
    # **本人の指定（差し替え.txt）とは別のファイルにする。**
    # 一緒にすると、採点が「本人が選んだ絵」とみなして責めなくなり、
    # 機械の当てそこないが見えなくなる。
    op = os.path.join(u"その他", u"おまかせ.txt")
    if a.omakase:
        g = [u"# 直す.py が自動で当てたものです（機械の指定）。",
             u"# 本人の指定は その他/差し替え.txt のほうです。そちらが勝ちます。",
             u"# この行を消せば、もとの絵に戻ります。",
             u"# 番号 <タブ> 絵"]
        for m in mato:
            g.append(u"%03d\t%s" % (m[u"no"], m[u"kouho"][0]))
        io.open(op, "w", encoding="utf-8", newline="\r\n") \
            .write(u"\r\n".join(g) + u"\r\n")
    elif os.path.exists(op):
        os.remove(op)

    print(u"")
    print(u"確認用/直す_01.png … %dページ を作りました（%d か所）" % (mai, len(mato)))
    if a.omakase:
        print(u"  **%d か所を、いちばん良い候補に自動で当てました。**" % len(mato))
        print(u"  紙の「1」が当たっています。気に入らない所だけ 2〜6 を書いてください。")
        print(u"  （何も書かなければ、そのまま自動のぶんが使われます）")
    else:
        print(u"  いちばん左がいまの絵、右の6枚が候補です。")
        print(u"  その他/差し替え.txt に、良い候補の 1〜6 を書くだけです。")
        print(u"  （空のままなら、いまの絵のままになります）")
    print(u"  そのまま「はじめる.bat」→ 2 → 1 で作り直してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
