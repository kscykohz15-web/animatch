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
    import 置き場所                # noqa: E402  絵の道は置き場所.txt にだけ書く
    GAZOU_KITEI = 置き場所.gazou()
except ImportError:
    # 検査の作業フォルダでは必ず --画像 が渡るので、この値は使われない
    GAZOU_KITEI = u""

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
def fuan(r, tags, tsukai, rows=None, i=None, han=None):
    u"""この区切りが「不安」かどうか。大きいほど先に見せる。

    採点(miru_kekka)と同じ目で見る。ここで拾えないものは紙に出ない。

    rows と i を渡すと、**前後の文も見てから**「人ちがい」と言う。
    渡さないと1行だけで見る（前までの動き）。
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
    # 前後の文から「出してよい人」を広げる。
    # 33番「ヒトガミを完全に封じ込めてしまう。」にオルステッドの絵を当てるのは、
    # 本人が良いと言った当て方。ここを1行だけで見ると「人ちがい」と出てしまう。
    yoi = list(hito)
    if rows is not None and i is not None:
        omomi = bunmyaku(rows, i, han=han)
        yoi += [c for c in omomi if omomi[c] >= 0.5 and c not in yoi]
    if hito:
        iru = []
        for c in yoi:
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


# 1回使うごとに引く点。**実測で決めた**（278枚・6450枚の材料で振ってみた）。
#
#   罰 0 … 人物一致100% だが 1枚を79回つかう（使いものにならない）
#   罰15 … 人物一致 99% / 種類145 / 最多9回      ← これにした
#   罰35 … 人物一致 84% / 種類169 / 最多5回
#   罰60 … 人物一致 71% / 種類174 / 最多4回
#
# 7か条では **③人物が、⑥使いまわしより上**。だから人物を守る側を選ぶ。
# 「3回まで」を硬い上限にする作りも試したが、人物一致が 100%→63% に
# 落ちたのでやめた（章の話数は2〜4本しかなく、その人の絵が足りない）。
KAISU_BATSU = 15


# ------------------------------------------------- 文脈（誰の話かを前後から読む）
#
# 中身は miru_kekka.py にある。**採点と、絵の選びかたで、同じ見方をするため。**
# 片方だけ直すと、採点が「人ちがい」と言い、直すが「合っている」と言い出す。
KAWARI = M.KAWARI
load_kawari = M.load_kawari
hitobito = M.hitobito
bun_han = M.bun_han
sashi_moto = M.sashi_moto
bunmyaku = M.bunmyaku
KAWARI_BIKI = M.KAWARI_BIKI


_HAN = {}


def han_cache(rows):
    u"""文の範囲は台本ごとに1回しか計算しない（区切りの数だけ呼ばれるので）。"""
    k = id(rows)
    if k not in _HAN or len(_HAN[k]) != len(rows):
        _HAN[k] = bun_han(rows)
    return _HAN[k]


def kouho_erabu(r, rows, i, tags, zenbu, tsukai, kazu=KOUHO, sakeru=None):
    u"""この区切りに合いそうな絵を、良い順に kazu 枚えらぶ。

    tsukai … いま何回使われているか。**自分が当てたぶんも数える。**
             数えないと、同じ絵を 82回 当ててしまう（実測）。
    sakeru … 直前の絵。同じ絵を続けない。
    """
    tx = r[u"text"]
    ima = r[u"img"]
    yurusu = r.get(u"daihon") or []
    # **前後の文からも「誰の話か」を読む。** 1行だけでは決まらない。
    omomi = bunmyaku(rows, i, han=han_cache(rows))
    hito = sorted(omomi, key=lambda c: -omomi[c])
    # 文脈でしっかり出ている人（この人たちが揃って写っていれば、なお良い）。
    #
    # **「0.7 以上の人ぜんぶ」ではいけない。**
    #   30「ララといいます。」の文脈は ルーデウス0.80 ロキシー0.80 ヒトガミ0.70。
    #   0.7 以上を全部とると3人になり、3人そろった絵は無いので、
    #   「二人が写った絵」の加点が働かず、ルーデウス1人の絵を選んでしまった。
    # だから **いちばん上に並んでいる人たちだけ** を主役とする。
    ue = max(omomi.values()) if omomi else 0.0
    shuyaku = [c for c in hito if omomi[c] >= max(0.7, ue - 0.05)]
    yarare = M.wo_ukeru(tx)
    te = M.tegakari_in(tx)
    # 前後の文の手がかりも少しだけ見る（「子供」「結婚」など）
    for d in (-1, 1):
        if 0 <= i + d < len(rows):
            for x in M.tegakari_in(rows[i + d][u"text"] or u""):
                if x not in te:
                    te.append(x)

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
        if k == ima or (sakeru and k == sakeru):
            continue
        desc = M.cat_lookup(tags, k)
        if desc is None:
            continue
        w = set(desc.split())
        if u"使用不可" in w:
            continue
        p = 0.0
        # ③ 人がいちばん重い。**文脈での重みぶん**だけ効かせる
        if hito:
            iru = [c for c in hito
                   if c in w or any(x in w for x in M.IIKAE.get(c, []))]
            hoka = [c for c in M.CHARACTERS if c in w and c not in hito]
            if iru:
                p += 100 * max(omomi[c] for c in iru)
                # 文脈の主役が2人いて、両方写っているなら、それがいちばん良い
                # （29・30番「ルーデウスとロキシーの二人が写った画像」）
            if len(shuyaku) >= 2:
                soro = [c for c in shuyaku
                        if c in w or any(x in w for x in M.IIKAE.get(c, []))]
                if len(soro) == len(shuyaku):
                    p += 45
                    if u"二人" in w:
                        p += 15
                elif len(soro) == 1 and u"二人" in w:
                    # **絵の説明には、名前が1人しか付かないことが多い。**
                    # カタログの元になっている言葉は「いちばん目立つ人」の
                    # 髪の色や服なので、二人写っていても片方しか名前が付かない。
                    # 「ロキシー 二人」は、ルーデウスとロキシーの絵かもしれない。
                    # そろっている絵が見つからないときの、次に良い手。
                    p += 30
                elif u"一人" in w:
                    # 1人しか写っていない絵は、二人の場面には合わない
                    p -= 10
            elif hoka:
                p -= 80
            else:
                p -= 30
        # 「〜を」で受けている人は、やられている側。
        # その顔の絵があれば、それがいちばん合う（本人の 33番の直し）。
        if yarare and M.yarare_kao(w) and any(
                c in w or any(x in w for x in M.IIKAE.get(c, []))
                for c in yarare):
            p += 25
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
        # ⑥ 使いすぎている絵は下げる。点を引くだけでは足りない。
        #
        # 章の話数は2〜4本しかないので、人が写っている絵はもともと少ない。
        # 点を引くだけだと、それでも同じ絵が勝ち続ける（実測で22回）。
        # **上限を超えたものは候補から外す。** 外しすぎて候補が無くなったら、
        # 呼び出し元が上限を1つ上げて呼び直す。
        n = len(tsukai.get(k, []))
        p -= KAISU_BATSU * n
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


def sashikae_kaku(path, mato, furui=None):
    u"""差し替え.txt に、直す所の行を空のまま足す。

    本人が書くのは数字ひとつ。すでに書いてある行はそのまま残す。

    ■ 前に書いた数字は、絵の番号に固めてから残す

    「3」は**そのときの紙の3番目**という意味しかない。紙を作り直すと
    中身が変わるので、古い「3」を残すと**別の絵を指してしまう。**
    前の候補表(furui)で引いて、`3-14-095` の形にしてから残す。
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
                no0 = int(c[0])
                v = u" ".join(c[1:]).strip()
                # 数字のままだと、紙を作り直したときに別の絵を指す
                if re.match(r"^[1-9]$", v) and furui:
                    g = furui.get((no0, int(v)))
                    if g:
                        v = M.code_of(g) or v
                aru[no0] = v
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
    ap.add_argument(u"--画像", dest="images", default=GAZOU_KITEI)
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
    if not os.path.exists(a.catalog):
        print(u"× %s がありません。" % a.catalog)
        print(u"   メニューの 8 で、絵に説明をつけてから使ってください。")
        return 1
    tags = M.load_catalog(a.catalog)
    KAWARI.update(load_kawari())
    if KAWARI:
        print(u"絵の無い人の代わり: " + u" / ".join(
            u"%s→%s" % (k, u"・".join(v)) for k, v in sorted(KAWARI.items())))
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

    # 前の候補表（差し替え.txt に残っている数字を、絵の番号に固めるのに使う）
    furui = {}
    kp0 = os.path.join(u"その他", u"候補.txt")
    if os.path.exists(kp0):
        for line in M.yomu(kp0).split(u"\n"):
            t = line.strip()
            if not t or t.startswith(u"#") or u"\t" not in t:
                continue
            aa, bb = t.split(u"\t", 1)
            mm = re.match(r"^(\d+)-(\d+)$", aa.strip())
            if mm:
                furui[(int(mm.group(1)), int(mm.group(2)))] = bb.strip()

    tsukai = {}
    for r in rows:
        tsukai.setdefault(r[u"img"], []).append(r[u"no"])

    # 不安な順に並べる
    tsuki = []
    for i, r in enumerate(rows):
        omosa, riyuu = fuan(r, tags, tsukai, rows, i, han_cache(rows))
        if a.zenbu or omosa > 0:
            tsuki.append((omosa, i, riyuu))
    tsuki.sort(key=lambda x: (-x[0], x[1]))
    if not tsuki:
        print(u"○ 気になる所はありませんでした。")
        return 0
    # 紙に出すのは上位だけ（読むのが大変になるので）。
    # ただし **おまかせは「重い不安」ぜんぶに当てる。**
    # 紙の枚数で区切ると、30か所ずつしか直らず何周もすることになる。
    OMOI = 25        # 人ちがい・話数ちがい・使用不可はここを超える
    if a.zenbu:
        taisho = sorted(tsuki, key=lambda x: x[1])[:400]
    else:
        kami = tsuki[:a.kazu]
        omoi = [x for x in tsuki if x[0] >= OMOI]
        mi = set(id(x) for x in kami)
        taisho = kami + [x for x in omoi if id(x) not in mi]
    kami_ban = set(x[1] for x in tsuki[:a.kazu]) if not a.zenbu else None
    tsuki = taisho

    print(u"区切り %d枚のうち、%d か所を見ます。候補を選んでいます…"
          % (len(rows), len(tsuki)))
    # ■ 当てる順は「区切りの順」。重い順ではない。
    #
    # 自分が当てたぶんも使った回数に数えるので、順に見ていかないと
    # 同じ絵が片寄る。となりの絵と続けないためにも、順に見る必要がある。
    riyuu_hyou = dict((i, riyuu) for (_o, i, riyuu) in tsuki)
    junban = sorted(riyuu_hyou)
    ima_tsukai = {}
    for r in rows:
        ima_tsukai.setdefault(r[u"img"], []).append(r[u"no"])
    # これから入れ替える所は、いまの絵を数えない（使わなくなるので）
    for i in junban:
        g = rows[i][u"img"]
        if g in ima_tsukai and rows[i][u"no"] in ima_tsukai[g]:
            ima_tsukai[g].remove(rows[i][u"no"])

    erabi = {}
    mae = None
    for n2, i in enumerate(junban, 1):
        r = rows[i]
        k = kouho_erabu(r, rows, i, tags, zenbu, ima_tsukai, sakeru=mae)
        if not k:
            continue
        erabi[i] = k
        ima_tsukai.setdefault(k[0], []).append(r[u"no"])
        mae = k[0]
        if n2 % 40 == 0:
            print(u"  %d / %d" % (n2, len(junban)))
            sys.stdout.flush()

    mato = []
    for (omosa, i, riyuu) in tsuki:
        if i not in erabi:
            continue
        r = rows[i]
        mato.append({u"no": int(r[u"no"]), u"i": i, u"ima": r[u"img"],
                     u"serifu": r[u"text"], u"riyuu": riyuu,
                     u"kouho": erabi[i]})

    # 候補の対応表（機械が読む）
    kp = os.path.join(u"その他", u"候補.txt")
    M.youi(kp)
    g = [u"# 直す.py が作った候補の表です。手で直さないでください。",
         u"# 番号-候補 <タブ> 絵"]
    for m in mato:
        for c, k in enumerate(m[u"kouho"], 1):
            g.append(u"%03d-%d\t%s" % (m[u"no"], c, k))
    io.open(kp, "w", encoding="utf-8", newline="\r\n").write(u"\r\n".join(g) + u"\r\n")

    kami = [m for m in mato
            if kami_ban is None or m[u"i"] in kami_ban]
    mai = sheet(kami, imgpath, tags, omakase=a.omakase)
    sashikae_kaku(os.path.join(u"その他", u"差し替え.txt"), kami, furui)

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
    if a.omakase:
        print(u"**%d か所を、いちばん良い候補に自動で当てました。**" % len(mato))
        print(u"  そのうち、とくに見てほしい %d か所を紙にしました: "
              u"確認用/直す_01.png（%dページ）" % (len(kami), mai))
        print(u"  紙の「1」が当たっています。気に入らない所だけ 2〜6 を書いてください。")
        print(u"  （何も書かなければ、そのまま自動のぶんが使われます）")
    else:
        print(u"確認用/直す_01.png … %dページ（%d か所）" % (mai, len(kami)))
        print(u"  いちばん左がいまの絵、右の6枚が候補です。")
        print(u"  その他/差し替え.txt に、良い候補の 1〜6 を書くだけです。")
        print(u"  （空のままなら、いまの絵のままになります）")
    print(u"  そのまま「はじめる.bat」→ 2 → 1 で作り直してください。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
