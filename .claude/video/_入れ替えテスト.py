# -*- coding: utf-8 -*-
u"""入れ替え表が、**本当に絵を入れ替えるところまで**つながっているか

■ 本人の指定（2026-11-15）

  > 画像のみを違うものに変更する工程を簡略化し楽にしたいので考えて提案してください
  → 「入れ替え表作って」

  ① 動画を作ると 確認用/入れ替え表.html ができる
  ② 押して選んで「保存」→ ダウンロードに 入れ替え_<動画>.txt
  ③ はじめる.bat → 2 で、それを 差し替え.txt に取り込んで入れ替える

■ なぜ通しで見るのか

表を作る所・取り込む所・差し替え.txt を読む所・題字の画面が1つでも食いちがうと、
**本人が押した絵が黙って当たらない**（いちばん信用を失う形）。
小さな材料で2回作り、2回目に選んだ絵が本当に出ていることまで見る。

  ① 入れ替え表ができる。番号は 一覧.txt と同じ・候補はその章の作品の絵だけ
  ② 作品の頭の1文は1行にまとまる・フォルダの無い作品は候補なし
  ③ 保存した形（ブラウザが書くのと同じ形）を置いて作り直すと、
     差し替え.txt に取り込まれ、その絵が一覧に出る
  ④ 作品の頭の1文で選んだ絵は、公式画像より先に題字の画面に使われる
  ⑤ 同じファイルを二度は取り込まない
  ⑥ フォルダ名に空白がある絵も、2列目まるごとで当たる（空白で切らない）
  ⑦ 取り込みは同じ所を指す古い行を消して、新しい行だけ残す。「-」は外すだけ
  ⑧ 台本を書き直したあとに残った差し替えが、**別の作品の章に当たらない**（2026-11-18・本人の画面）
     本人の動画で、IS の「本作の魅力は」にニセコイの絵が出た（右上 IS・左上ニセコイの ©）。
     差し替え.txt の3列目の文が今の台本に無いと、番号のまま当てていた。
     (A) 文が今の台本に無い行は使わない (B) 文は合っていても、その章の作品ではない絵は当てない
     (C) 見張り（作品の章はその作品の絵だけか）は差し替えのあとで数え、フォルダの無い章も数える
"""
from __future__ import print_function
import io, json, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

warui = []


def iu(ok, msg):
    print(u"%s %s" % (u"○" if ok else u"×", msg))
    if not ok:
        warui.append(msg)


def mod(path, name):
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def hashiru(d, e):
    r = subprocess.run([sys.executable, "make_slideshow.py", "--images", e, "--sec", "2"],
                       cwd=d, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    out = r.stdout.decode("utf-8", "replace")
    if r.returncode != 0:
        print(out[-3000:])
    return r.returncode, out


def ichiran(d):
    out = {}
    for line in io.open(os.path.join(d, u"確認用", u"一覧.txt"), encoding="utf-8-sig") \
            .read().replace(u"\r\n", u"\n").split(u"\n"):
        c = line.split(u"\t")
        if len(c) >= 8 and c[0].isdigit():
            out[int(c[0])] = (c[3], c[7])
    return out


def hyou(d):
    s = io.open(os.path.join(d, u"確認用", u"入れ替え表.html"), encoding="utf-8").read()
    m = re.search(u"const D = (.*?);\n", s)
    return json.loads(m.group(1).replace(u"<\\/", u"</"))


def tan(ms):
    # ⑥ 空白のあるフォルダ名
    d = tempfile.mkdtemp(prefix="irekae")
    p = os.path.join(d, u"差し替え.txt")
    imgs = [u"コードギアス 反逆のルルーシュ/0002.jpg", u"コードギアス 反逆のルルーシュ/0010.jpg",
            u"コードギアス/0001.jpg"]
    io.open(p, "w", encoding="utf-8").write(
        u"5\tコードギアス 反逆のルルーシュ/0010.jpg\tルルーシュは、帝国の元皇子です。\n")
    moji = {}
    out = ms.load_sashikae(p, imgs, moji=moji)
    iu(out.get(5) == u"コードギアス 反逆のルルーシュ/0010.jpg"
       and moji.get(5) == u"ルルーシュは、帝国の元皇子です。",
       u"⑥ フォルダ名に空白がある絵も、2列目まるごとで当たる（いまは %s）" % out.get(5))

    # ⑦ 取り込み
    io.open(p, "w", encoding="utf-8").write(
        u"# 差し替え.txt（本人の手書き）\n3\t2-01-001\n7\tX/1.jpg\t本作は漫画が原作です。\n"
        u"9\tX/2.jpg\n")
    ireta, hazu = ms.irekae_maji([(7, u"Y/2.jpg", u"本作は漫画が原作です。"),
                                  (3, u"-", u""), (12, u"Z/3.jpg", u"物語は、始まります。")],
                                 p, u"ためし")
    s = io.open(p, encoding="utf-8").read()
    iu(ireta == 2 and hazu == 1, u"⑦ 入れた 2・外した 1 を数える")
    iu(u"# 差し替え.txt（本人の手書き）" in s and u"9\tX/2.jpg" in s,
       u"⑦ 関係のない行と見出しは残す")
    iu(u"X/1.jpg" not in s and u"7\tY/2.jpg\t本作は漫画が原作です。" in s,
       u"⑦ 同じ字幕の文の古い行は消して、新しい行だけ残す")
    iu(u"2-01-001" not in s and not re.search(u"(?m)^3\t", s),
       u"⑦ 「-」は手で選んだ絵を外すだけ（行を足さない）")
    shutil.rmtree(d, ignore_errors=True)


def main():
    ms = mod(os.path.join(HERE, u"make_slideshow.py"), u"ms_irekae")
    tan(ms)
    if not shutil.which("ffmpeg"):
        print(u"ffmpeg が無いので、通しはとばします。")
        return 0
    T = mod(os.path.join(HERE, u"_題字テスト.py"), u"daiji_t")
    T.SAGYOU = os.path.join(HERE, u"_入れ替えテスト作業")
    e = T.junbi()
    d = T.SAGYOU
    rc, out = hashiru(d, e)
    if rc:
        warui.append(u"1回目が最後まで走りませんでした")
        return 1

    # ── ① ②
    D = hyou(d)
    ich = ichiran(d)
    iu(sum(len(r[u"n"]) for r in D[u"rows"]) == len(ich),
       u"① 入れ替え表の番号は 一覧.txt と同じ数（%d）" % len(ich))
    iu(all(ich[n][0] == (r[u"curKey"] or ich[n][0]) for r in D[u"rows"] for n in r[u"n"][:1]),
       u"① 「いまの絵」は 一覧.txt の絵と同じ")
    fol = D[u"fol"]
    aka = [r for r in D[u"rows"] if u"赤い所" in r[u"tx"]]
    iu(aka and [fol[i] for i in D[u"chap"][aka[0][u"c"]]] == [u"あか組！"],
       u"① あか組の字幕の候補は、あか組！の絵だけ")
    iu(u"べつの作品" not in [fol[i] for r in D[u"rows"] for i in D[u"chap"][r[u"c"]]],
       u"① 紹介していない作品の絵は、どの字幕の候補にも出ない")
    dj = [r for r in D[u"rows"] if r[u"kind"] == u"daiji"]
    # 字幕が短いと1文が1枚にまとまることもある（あお組）。見るのは「1文が1行」
    iu(len(dj) == 3 and all(u"制作は" in r[u"tx"] for r in dj)
       and any(len(r[u"n"]) >= 2 for r in dj),
       u"② 作品の頭の1文は1行にまとまる（%d 行・%s）"
       % (len(dj), u" ".join(u"%d〜%d" % (r[u"n"][0], r[u"n"][-1]) for r in dj)))
    mu = [r for r in D[u"rows"] if r[u"kind"] == u"muji"]
    iu(mu and all(not D[u"chap"][r[u"c"]] for r in mu),
       u"② フォルダの無い作品（みどり組）は、候補を並べない")

    # ── ③ ブラウザが書くのと同じ形で保存して、作り直す
    hon = aka[0]
    n_hon = hon[u"n"][0]
    erabu = u"あか組！/0005.jpg"
    if hon[u"curKey"] == erabu:
        erabu = u"あか組！/0004.jpg"
    ao = [r for r in dj if u"あお組" in r[u"tx"]][0]
    ao_e = u"あお組/0004.jpg"
    na = os.path.basename(d)
    gyou = [u"# 入れ替え表で選んだ絵（ためし）", u"#@title\t%s" % na,
            u"%d\t%s\t%s" % (n_hon, erabu, hon[u"txs"][0])]
    for n, tx in zip(ao[u"n"], ao[u"txs"]):
        gyou.append(u"%d\t%s\t%s" % (n, ao_e, tx))
    # ブラウザが書くのと同じ名前（irekae.txt）。別の動画の選び方も置いて、拾わないことを見る
    io.open(os.path.join(d, u"確認用", u"irekae (1).txt"), "w", encoding="utf-8-sig").write(
        u"#@title\tべつの動画\n%d\tあか組！/0003.jpg\t%s\n" % (n_hon, hon[u"txs"][0]))
    io.open(os.path.join(d, u"確認用", u"irekae.txt"), "w",
            encoding="utf-8-sig", newline="\r\n").write(u"\n".join(gyou) + u"\n")
    rc, out2 = hashiru(d, e)
    if rc:
        warui.append(u"2回目が最後まで走りませんでした")
        return 1
    iu(u"入れ替え表の選び方を 差し替え.txt に取り込みました: %d か所" % (1 + len(ao[u"n"]))
       in out2, u"③ 保存した選び方を 差し替え.txt に取り込んだ")
    iu(out2.count(u"取り込みました") == 1,
       u"③ 別の動画の選び方（#@title がちがう irekae (1).txt）は取り込まない")
    ich2 = ichiran(d)
    hit = [n for n, (img, tx) in ich2.items() if tx.strip() == hon[u"txs"][0]]
    iu(hit and ich2[hit[0]][0] == erabu,
       u"③ 選んだ絵が、その字幕に本当に出ている（%s）" % (ich2[hit[0]][0] if hit else u"-"))
    ao2 = [n for n, (img, tx) in ich2.items() if u"あお組" in tx and u"制作" in tx
           or tx.strip() in ao[u"txs"]]
    iu(ao2 and all(ich2[n][0] == ao_e for n in ao2),
       u"④ 作品の頭の1文で選んだ絵が、文ぜんぶに出ている（%s）"
       % u" ".join(ich2[n][0] for n in ao2))
    iu(u"作品の頭の1文 3 か所を「題字の画面」にしました" in out2,
       u"④ 題字の画面は3か所のまま（入れ替えても帯は出る）")

    # ── ⑤ 二度は取り込まない
    rc, out3 = hashiru(d, e)
    iu(rc == 0 and u"取り込みました" not in out3, u"⑤ 同じファイルを二度は取り込まない")
    ich3 = ichiran(d)
    iu(hit and ich3.get(hit[0], (u"",))[0] == erabu,
       u"⑤ 3回目も選んだ絵のまま（差し替え.txt に残っている）")

    # ── ⑧ 書き直しのあとに残った差し替えが、フォルダの無い章（みどり組）に当たらない
    mi_dai = [n for n, (img, tx) in ich3.items() if u"みどり組" in tx]
    mi_hon = [n for n, (img, tx) in ich3.items() if tx.strip() == u"本作はオリジナル作品です。"]
    if not (mi_dai and mi_hon):
        iu(False, u"⑧ みどり組の字幕が一覧に見つかりません")
        return 0
    with io.open(os.path.join(d, u"その他", u"差し替え.txt"), "a", encoding="utf-8") as f:
        f.write(u"\n%d\tあか組！/0003.jpg\t前の台本にあった、いまは無い字幕の文です。\n" % mi_dai[0])
        f.write(u"%d\tあか組！/0002.jpg\t本作はオリジナル作品です。\n" % mi_hon[0])
    rc, out4 = hashiru(d, e)
    ich4 = ichiran(d)
    iu(rc == 0 and ich4.get(mi_dai[0], (u"",))[0].endswith(u"無地.png"),
       u"⑧(A) 文が今の台本に無い差し替えは、番号で当てない（%d番は %s）"
       % (mi_dai[0], ich4.get(mi_dai[0], (u"-",))[0]))
    iu(u"いまの台本にありません" in out4, u"⑧(A) 使わなかったことを名前で知らせる")
    iu(ich4.get(mi_hon[0], (u"",))[0].endswith(u"無地.png"),
       u"⑧(B) 別の作品の絵は、フォルダの無い作品の章に当てない（%d番は %s）"
       % (mi_hon[0], ich4.get(mi_hon[0], (u"-",))[0]))
    iu(u"その章の作品ではない絵" in out4, u"⑧(B) 当てなかったことを名前で知らせる")
    iu(u"○ 作品の章は、どれもその作品の絵だけ" in out4, u"⑧ 見張りは ○ のまま")
    # (C) 見張りそのもの: フォルダの無い章に絵があれば数える
    chaps = [(u"あか組", u"あか組！\\N2014年冬", [u"あか組！"]),
             (u"みどり組", u"みどり組\\N2025年夏", [u"みどり組"])]
    rows = [(1.0, u"あか組！/0001.jpg", u"最初にご紹介する作品は、あか組！、制作はこうしゃ。"),
            (1.0, u"あか組！/0002.jpg", u"最後にご紹介する作品は、みどり組、制作はへいしゃ。"),
            (1.0, ms.MUJI, u"本作はオリジナル作品です。")]
    soto = ms.osusume_kakunin(rows, chaps, [u"あか組！/0001.jpg", u"あか組！/0002.jpg"])
    iu([i for (i, _im, _t) in soto] == [1],
       u"⑧(C) 見張りは、フォルダの無い章（みどり組）に入った別の作品の絵を数える（%s）"
       % [i for (i, _im, _t) in soto])
    return 0


if __name__ == "__main__":
    rc = main()
    print(u"")
    if rc or warui:
        print(u"落ちました。%d件:" % len(warui))
        for w in warui:
            print(u"  ・" + w)
        sys.exit(1)
    print(u"全部通りました。")
    if u"--nokosu" not in sys.argv:
        shutil.rmtree(os.path.join(HERE, u"_入れ替えテスト作業"), ignore_errors=True)
