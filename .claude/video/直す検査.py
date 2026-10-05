# -*- coding: utf-8 -*-
u"""直す検査 ─ 「数字ひとつで絵を入れ替える」仕組みが本当に働くか

■ 確かめること（通らなければ board.html を作らない）

  ① セリフに人名があるとき、1番目の候補にその人が写っているか  （7か条③）
  ② 1番目の候補が、その章の話数に入っているか                  （7か条④）
  ③ 使用不可（文字あり・実写）が候補に出ていないか
  ④ 紙に書いた数字が、ちゃんとその絵に戻るか                    （閉ループ）
  ⑤ 本人の指定が、機械のおまかせより上になるか

材料はここで作る。絵は色だけの画像で足りる（見るのは説明の言葉なので）。
"""
from __future__ import print_function
import importlib.util
import io
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SAGYOU = os.path.join(HERE, u"_直す検査")

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

WA = [u"無職転生Ⅲ 第11話", u"無職転生Ⅲ 第12話", u"無職転生Ⅲ 第13話", u"無職転生Ⅲ 第14話"]
HITO = [u"ヒトガミ", u"ルーデウス", u"ロキシー", u"エリス", u"オルステッド", u"老デウス"]
JOU = [u"室内 夜", u"屋外 昼", u"城 昼", u"洞窟 暗い", u"アップ", u"笑顔", u"悲しい"]
SERIFU = [u"まずヒトガミの目的。", u"これはヒトガミ自身の死を回避することで、",
          u"その手段として、", u"ルーデウスとロキシーの間に生まれる",
          u"子供を誕生させないことを目標として動いていました。", u"ヒトガミいわく、",
          u"将来ヒトガミを殺しにきてしまうとのことなのです。",
          u"オルステッドと手を組み、", u"ロキシーが妊娠していたからです。",
          u"エリスは剣を抜いた。"]


def junbi():
    import random
    from PIL import Image
    random.seed(3)
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    os.makedirs(os.path.join(SAGYOU, u"確認用"))
    os.makedirs(os.path.join(SAGYOU, u"その他"))
    for f in (u"直す.py", u"miru_kekka.py", u"make_slideshow.py", u"人物ルール.txt"):
        shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    root = os.path.join(SAGYOU, u"画像")
    cat = [u"# 目印\t説明"]
    for w, wa in enumerate(WA):
        os.makedirs(os.path.join(root, wa))
        for i in range(1, 61):
            nm = u"%03d_t%02d_x2.png" % (i, i)
            Image.new("RGB", (480, 270),
                      (30 + w * 40, 60 + i * 2 % 150, 140)) \
                .save(os.path.join(root, wa, nm))
            tag = []
            if i % 3 == 0:
                tag.append(random.choice(HITO))
            tag.append(random.choice(JOU))
            if i % 17 == 0:
                tag.append(u"文字あり 使用不可")
            cat.append(u"%s/%s\t%s" % (wa, nm, u" ".join(tag)))
    io.open(os.path.join(SAGYOU, u"画像カタログ.txt"), "w",
            encoding="utf-8", newline="\r\n").write(u"\r\n".join(cat) + u"\r\n")
    out = [u"番号\t開始\t尺\t画像\tセリフ\t台本の話数"]
    for i, s in enumerate(SERIFU, 1):
        wa = WA[i % 2]                      # わざと話数を外したものを混ぜる
        out.append(u"%d\t%.2f\t2.00\t%s/%03d_t%02d_x2.png\t%s\t%s"
                   % (i, i * 2.0, wa, (i * 7) % 60 + 1, (i * 7) % 60 + 1, s,
                      u"無職転生Ⅲ 第14話 / 無職転生Ⅲ 第12話"))
    io.open(os.path.join(SAGYOU, u"確認用", u"一覧.txt"), "w",
            encoding="utf-8", newline="\r\n").write(u"\r\n".join(out) + u"\r\n")


def mochikomu(nm, path):
    spec = importlib.util.spec_from_file_location(nm, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def main():
    try:
        from PIL import Image  # noqa
    except ImportError:
        print(u"Pillow が要ります（pip install pillow）")
        return 1
    junbi()
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    r = subprocess.run([sys.executable, u"直す.py", u"--画像", u"画像",
                        u"--数", u"8", u"--おまかせ"],
                       cwd=SAGYOU, stdout=subprocess.PIPE,
                       stderr=subprocess.STDOUT, env=env)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-1500:])
        print(u"× 直す.py が走りませんでした")
        return 1

    moto = os.getcwd()
    os.chdir(SAGYOU)
    try:
        sys.path.insert(0, u".")
        M = mochikomu("mk_t", u"miru_kekka.py")
        N = mochikomu("na_t", u"直す.py")
        ms = mochikomu("ms_t", u"make_slideshow.py")

        rows = M.load_ichiran(os.path.join(u"確認用", u"一覧.txt"))
        tags = M.load_catalog(u"画像カタログ.txt")
        zenbu = N.walk_images(u"画像")
        tsukai = {}
        for rr in rows:
            tsukai.setdefault(rr[u"img"], []).append(rr[u"no"])

        jin = atari = wa = wa_ok = dame = 0
        for i, rr in enumerate(rows):
            k = N.kouho_erabu(rr, rows, i, tags, zenbu, tsukai)
            if not k:
                continue
            w = set((M.cat_lookup(tags, k[0]) or u"").split())
            hito = M.chars_in(rr[u"text"])
            if hito:
                jin += 1
                if any(c in w or any(x in w for x in M.IIKAE.get(c, []))
                       for c in hito):
                    atari += 1
            yurusu = rr.get(u"daihon") or []
            if yurusu:
                wa += 1
                if M.folder_of(k[0]) in yurusu:
                    wa_ok += 1
            for kk in k:
                if u"使用不可" in (M.cat_lookup(tags, kk) or u""):
                    dame += 1

        imgs = []
        for fol in os.listdir(u"画像"):
            for n in os.listdir(os.path.join(u"画像", fol)):
                imgs.append(u"%s/%s" % (fol, n))
        kouho = ms.load_kouho(os.path.join(u"その他", u"候補.txt"))
        oma = ms.load_sashikae(os.path.join(u"その他", u"おまかせ.txt"), imgs)
        # 本人が 002 に 4 と書いたことにする
        sp = os.path.join(u"その他", u"差し替え.txt")
        s2 = io.open(sp, encoding="utf-8-sig").read()
        import re as _re
        s2 = _re.sub(r"(?m)^002\t.*$", u"002\t4", s2)
        io.open(sp, "w", encoding="utf-8", newline="\r\n").write(s2)
        kae = ms.load_sashikae(sp, imgs)
    finally:
        os.chdir(moto)

    warui = []
    def shirabe(na, ok, mi):
        print(u"%s %s … %s" % (u"○" if ok else u"×", na, mi))
        if not ok:
            warui.append(na)

    shirabe(u"① 人名のある所で、1番目の候補にその人が写る",
            jin and atari == jin, u"%d / %d件" % (atari, jin))
    shirabe(u"② 1番目の候補が、章の話数に入っている",
            wa and wa_ok == wa, u"%d / %d件" % (wa_ok, wa))
    shirabe(u"③ 使用不可が候補に出ない", dame == 0, u"%d回" % dame)
    shirabe(u"④ 紙の数字が、その絵に戻る",
            kae.get(2) == kouho.get((2, 4)) and kouho.get((2, 4)) is not None,
            u"002→4 が %s" % (kouho.get((2, 4)) or u"引けません"))
    shirabe(u"⑤ 本人の指定が、おまかせより上",
            kae.get(2) is not None and kae.get(2) != oma.get(2),
            u"本人 %s / おまかせ %s" % (kae.get(2), oma.get(2)))
    shirabe(u"⑥ 本人が書かない所は、おまかせのまま",
            8 not in kae and 8 in oma, u"008 は %s" % (oma.get(8) or u"無し"))

    print(u"")
    if warui:
        print(u"× 直す仕組みが働いていません: " + u" / ".join(warui))
        return 1
    print(u"○ 直す仕組みは、ぜんぶ働いています。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
