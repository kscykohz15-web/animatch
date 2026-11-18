# -*- coding: utf-8 -*-
u"""おすすめ紹介の回は、無職転生のための段を通らないか（仕上げ.py ㉚）

■ 本人の指定（2026-11-17・v195 のログを見て）

  > 毎回無職転生を見る必要はないです。おすすめアニメ紹介の動画作成では前まで
  > 無職転生特化でやっていた作業の内、必要のないものは排除して、最低限のことだけを
  > 行ってください

  ログには毎回、画像カタログ（無職転生 第1話/001_ …）・話数マップ・挨拶のロキシー・
  #アイシャ #ノルン（当て方.txt から写った言葉）が出ていた。おすすめ紹介の絵には説明が
  1枚も無いので、どれも1枚も当たらない。

■ 同じログで、動画が「画像が見つかりません: …かぐや様は告らせたい\\166_…_x2.png」で止まった。
  作り始めたときに数えた絵が、絵をそろえる時点で消えていた。1枚のために止めない。

■ 見ること
  ① おすすめ紹介の回（右上に「2014年冬」のある章）で、無職転生のファイルを置いても
     カタログ・話数マップ・挨拶・タグの知らせが出ない／この回の作品だけ並べる／目印を置く
  ② 割り当てたあとで絵を1枚消しても、最後まで作れる（同じ作品の別の絵に替わる）
     「どの章もその作品の絵だけ」を数えて出す
  ③ 無職転生の形（年と季の無い章）では今までどおり（全フォルダを並べる・目印を消す）
  ④ 「1」と中身が同じ絵（別の名前・大きさを変えたもの）も「1」として扱い、頭の1文のほかで使わない
     フォルダに「1」しか無い作品は、頭の1文のほかを無地にする（別の作品の絵を残さない）
     （2026-11-18・本人の v197: はじめにのニセコイの公式画像／IS の章のニセコイの絵 14枚）
"""
from __future__ import print_function
import io, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SAGYOU = os.path.join(HERE, u"_おすすめ最低限テスト作業")
FF = shutil.which("ffmpeg")
warui = []


def iu(ok, msg):
    print(u"%s %s" % (u"○" if ok else u"×", msg))
    if not ok:
        warui.append(msg)


def ff(args):
    r = subprocess.run([FF, "-y", "-loglevel", "error"] + args,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if r.returncode != 0:
        print(r.stdout.decode("utf-8", "replace")[-1500:])
        raise SystemExit(u"材料が作れませんでした")


DAIHON = u"""どうもこんにちわ、かさです。
今回の動画の内容は、ためしの作品を三つご紹介します。それでは早速紹介にうつります。
最初にご紹介する作品は、あか組！、制作はこうしゃ。
本作は漫画が原作となっており、原作は完結済み、アニメは第二期まで放送済みの未完結となります。
物語は、妹と口もきかない主人公が、赤い所で人生相談を持ちかけられるところから始まります。
続いての作品は、あお組、制作はおつしゃ。
本作はゲームが原作となっており、アニメは第二期まで放送済みとなります。
物語は、青い所から始まります。
次の作品は、きいろ組、制作はこうしゃ。
本作は漫画が原作となっており、原作は連載中となります。
物語は、黄色い所で主人公が友人と出会うところから始まります。
最後にご紹介する作品は、みどり組、制作はへいしゃ。
本作はオリジナルアニメで、全12話で物語が完結しています。
今回の動画は以上となります。ご視聴ありがとうございました。
"""

GAMEN_OSUSUME = u"""引用\t各作品の著作権は、それぞれの権利者に帰属します
章\t今回の動画の内容は\t－\t＊全作品\t
章\tあか組\tあか組！\\N2014年冬\tあか組！\t
章\tあお組\tあお組\\N2010年夏\tあお組\t
章\tきいろ組\tきいろ組\\N2019年秋\tきいろ組\t
章\tみどり組\tみどり組\\N2025年夏\tみどり組\t
章\t今回の動画は以上となります\tおわりに\t＊全作品\t
"""

# 無職転生の形: 章に年と季が無い
GAMEN_MUSHOKU = u"""引用\t©理不尽な孫の手/MFブックス/「無職転生」製作委員会
章\t今回の動画の内容は\tはじめに\tあか組！\t
章\tあお組\t第1章\tあお組\t
"""

# 画像プランは本番と同じく 当て方.txt の言葉が写っている形にする（挨拶のロキシー・妹のノルン）
PLAN = u"""@@話数\tあか組！
どうもこんにちわ\t#ロキシー アップ, #ロキシー, #青髪 帽子
かさです\t#ロキシー アップ, #ロキシー
あか組！\t#公式, #穏やか, #室内
制作はこうしゃ\t#公式, #穏やか, #室内
人生相談\t#ノルン, #アイシャ, #茶髪 子供
あお組\t#公式, #穏やか
制作はおつしゃ\t#公式, #穏やか
@@話数\tきいろ組
きいろ組\t#公式, #穏やか
制作はこうしゃ\t#公式, #穏やか
@@話数\tみどり組
みどり組\t#公式, #穏やか
*\t#穏やか, #室内, #立ち姿
"""

MUSHOKU_KOTOBA = (u"画像カタログを読みました", u"話数マップを読みました", u"カタログのこの目印",
                  u"ロキシー", u"アイシャ", u"ノルン", u"対象話数", u"どの絵にも当たりませんでした",
                  u"画像プランを使いました", u"札まで合わせたいときは", u"⚠ 挨拶の絵", u"挨拶の字幕")


def junbi():
    if os.path.isdir(SAGYOU):
        shutil.rmtree(SAGYOU)
    e = os.path.join(SAGYOU, u"絵")
    from PIL import Image
    for n, fol in enumerate((u"あか組！", u"あお組", u"きいろ組", u"べつの作品", u"無職転生 第1話")):
        os.makedirs(os.path.join(e, fol))
        for j in range(8):
            Image.new("RGB", (320, 180), (40 + n * 50, 60 + j * 20, 120)).save(
                os.path.join(e, fol, u"%03d_x%04d_x2.png" % (100 + j * 7, n * 100 + j)))
    Image.new("RGB", (300, 400), (250, 250, 250)).save(os.path.join(e, u"あか組！", u"1.jpg"))
    Image.new("RGB", (300, 400), (240, 240, 10)).save(os.path.join(e, u"きいろ組", u"1.jpg"))
    os.makedirs(os.path.join(SAGYOU, u"効果音"))
    for nm, body in ((u"台本_字幕用.txt", DAIHON), (u"画面表示.txt", GAMEN_OSUSUME),
                     (u"画像プラン.txt", PLAN),
                     (u"著作権.txt", u"あか組！\t©あか/あか製作委員会\n")):
        io.open(os.path.join(SAGYOU, nm), "w", encoding="utf-8", newline="\n").write(body)
    # 無職転生のファイルも置く（本人のパックにも入っている）。読まれたら知らせが出る
    for f in (u"見た目.txt", u"演出.txt", u"画像カタログ.txt", u"話数マップ.txt", u"人物ルール.txt",
              u"当て方.txt", u"make_slideshow.py", u"置き場所.py"):
        if os.path.exists(os.path.join(HERE, f)):
            shutil.copy(os.path.join(HERE, f), os.path.join(SAGYOU, f))
    ff(["-f", "lavfi", "-i",
        "sine=frequency=280:duration=50,volume='if(lt(mod(t,2),1.5),0.5,0)':eval=frame",
        "-ar", "44100", "-ac", "1", os.path.join(SAGYOU, "merged.wav")])
    return e


def hashiru(e, *args):
    r = subprocess.run([sys.executable, "make_slideshow.py", "--images", e, "--sec", "2"] + list(args),
                       cwd=SAGYOU, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    return r.returncode, r.stdout.decode("utf-8", "replace")


def wariate():
    out = []
    for l in io.open(os.path.join(SAGYOU, u"その他", u"画像割り当て.tsv"), encoding="utf-8-sig"):
        c = l.rstrip(u"\r\n").split(u"\t")
        if len(c) >= 6 and c[0].strip().isdigit():
            out.append((c[4], c[5]))
    return out


def main():
    if not FF:
        print(u"ffmpeg が無いので、とばします。")
        return 0
    try:
        import PIL  # noqa: F401
    except ImportError:
        print(u"Pillow が無いので、とばします。")
        return 0
    e = junbi()
    jirushi = os.path.join(SAGYOU, u"その他", u"_おすすめ.txt")

    # ① おすすめ紹介の回の割り当て
    rc, log = hashiru(e, "--plan")
    io.open(os.path.join(SAGYOU, u"_log1.txt"), "w", encoding="utf-8").write(log)
    iu(rc == 0, u"① 割り当てが最後まで走る")
    deta = [k for k in MUSHOKU_KOTOBA if k in log]
    iu(not deta, u"① 無職転生のための知らせが出ない%s" % (u"（出た: " + u"・".join(deta) + u"）" if deta else u""))
    iu(u"おすすめ紹介の回です" in log and u"この回で使う作品の絵" in log,
       u"① この回の作品だけを並べる")
    iu(u"べつの作品" not in log.split(u"この回で使う作品の絵")[-1].split(u"\n\n")[0],
       u"① 使わないフォルダ（べつの作品）は並べない")
    iu(u"みどり組" in log and u"フォルダがありません" in log, u"① フォルダの無い作品を名前で言う")
    iu(os.path.exists(jirushi), u"① メニューが採点を飛ばす目印（その他/_おすすめ.txt）を置く")
    w = wariate()
    kou = [i for i, (img, tx) in enumerate(w) if img.endswith(u"/1.jpg")]
    atama = [i for i, (img, tx) in enumerate(w)
             if re.search(u"^(最初にご紹介する作品は|続いての作品は|次の作品は|最後にご紹介する作品は)|制作は", tx)]
    iu(bool(kou) and all(i in atama for i in kou),
       u"① 公式画像は作品の頭の1文だけ（%d枚）" % len(kou))
    # ■ 同じ制作会社の2本目（2026-11-18・本人の画面「アマガミSSの頭が1ではない」）
    #   画像プランの「制作はこうしゃ」が2回あり、前は1回目（あか組！）の行が当たっていた
    ki = [img for (img, tx) in w if u"きいろ組" in tx]
    iu(u"きいろ組/1.jpg" in ki,
       u"① 同じ制作会社の2本目（きいろ組）の頭にも、その作品の「1」が入る（%s）"
       % u" / ".join(sorted(set(ki))[:3]))
    iu(u"あか組！/1.jpg" not in ki, u"① 2本目の頭に、1本目（あか組！）の「1」が入らない")
    # ■ はじめに（＊全作品）は紹介する作品から順に。「1」は使わない
    _a = [i for i, (img, tx) in enumerate(w) if tx.startswith(u"今回の動画の内容は")]
    _b = [i for i, (img, tx) in enumerate(w) if tx.startswith(u"最初にご紹介する作品は")]
    hj = [img for (img, tx) in w[_a[0]:_b[0]]] if (_a and _b) else []
    iu(len(set(x.split(u"/")[0] for x in hj)) >= 2 and not any(x.endswith(u"/1.jpg") for x in hj),
       u"① はじめには、紹介する作品から順に出て「1」を使わない（%s）"
       % u" / ".join(x.split(u"/")[0] for x in hj))
    soto = [(img, tx) for (img, tx) in w if img.startswith((u"べつの作品/", u"無職転生"))]
    iu(not soto, u"① 紹介していない作品・無職転生の絵は出ない%s" % (u"（%s）" % soto[0][0] if soto else u""))

    # ② 割り当てたあとで絵を消しても、最後まで作れる
    kesu = [img for (img, tx) in w if img.startswith(u"あお組/")]
    if kesu:
        os.remove(os.path.join(e, kesu[0].replace(u"/", os.sep)))
        # 割り当て表を残したまま作る（前の回の表を使い回す形＝消えた名前が残る）
        rc2, log2 = hashiru(e)
        io.open(os.path.join(SAGYOU, u"_log2.txt"), "w", encoding="utf-8").write(log2)
        mp4 = [f for f in os.listdir(os.path.join(SAGYOU, u"動画")) if f.endswith(u".mp4")] \
            if os.path.isdir(os.path.join(SAGYOU, u"動画")) else []
        iu(rc2 == 0 and bool(mp4), u"② 絵を1枚消しても、動画が最後までできる")
        iu(u"無くなった絵が 1枚" in log2 and kesu[0] in log2, u"② 消えた絵の名前と、替えた絵を知らせる")
        iu(u"画像が見つかりません" not in log2, u"② 「画像が見つかりません」で止まらない")
        iu(u"○ 作品の章は、どれもその作品の絵だけ" in log2, u"② 「どの章もその作品の絵だけ」を数えて出す")
        deta2 = [k for k in MUSHOKU_KOTOBA if k in log2]
        iu(not deta2, u"② 動画まで作っても無職転生の知らせが出ない%s"
           % (u"（出た: " + u"・".join(deta2) + u"）" if deta2 else u""))
    else:
        iu(False, u"② あお組の絵が割り当てに無い（材料がおかしい）")

    # ④ 「1」と中身が同じ絵・「1」しか無いフォルダ
    from PIL import Image
    ichi = Image.open(os.path.join(e, u"あか組！", u"1.jpg"))
    shutil.copy(os.path.join(e, u"あか組！", u"1.jpg"), os.path.join(e, u"あか組！", u"91d7fdcb.jpg"))
    ichi.resize((150, 200)).save(os.path.join(e, u"あか組！", u"0998_chiisai.png"))
    for f in os.listdir(os.path.join(e, u"きいろ組")):
        if f != u"1.jpg":
            os.remove(os.path.join(e, u"きいろ組", f))
    rc4, log4 = hashiru(e, "--plan")
    io.open(os.path.join(SAGYOU, u"_log4.txt"), "w", encoding="utf-8").write(log4)
    w4 = wariate()
    atama4 = set(i for i, (img, tx) in enumerate(w4)
                 if re.search(u"^(最初にご紹介する作品は|続いての作品は|次の作品は|最後にご紹介する作品は)|制作は", tx))
    dup = [(i, img) for i, (img, tx) in enumerate(w4)
           if img in (u"あか組！/91d7fdcb.jpg", u"あか組！/0998_chiisai.png")]
    iu(rc4 == 0 and u"「1」と中身が同じ絵が、別の名前で 2枚" in log4,
       u"④ 「1」と中身が同じ絵を、別の名前でも2枚とも見つける")
    iu(not [i for (i, img) in dup if i not in atama4],
       u"④ 「1」と同じ絵は、作品の頭の1文のほかで使わない（%s）" % (dup[:3] or u"使っていない"))
    _k = [i for i, (img, tx) in enumerate(w4) if tx.startswith(u"次の作品は")]
    _m = [i for i, (img, tx) in enumerate(w4) if tx.startswith(u"最後にご紹介する作品は")]
    ki4 = w4[_k[0]:_m[0]] if (_k and _m) else []
    _dai4 = 0                   # 頭の1文（「次の作品は」から「。」で終わる字幕まで）の枚数
    for (img, tx) in ki4:
        _dai4 += 1
        if tx.strip().endswith(u"。"):
            break
    iu(ki4 and all(img.endswith(u"無地.png") for (img, tx) in ki4[_dai4:])
       and all(img == u"きいろ組/1.jpg" for (img, tx) in ki4[:_dai4]),
       u"④ 「1」しか無いフォルダ（きいろ組）は、頭の1文に「1」・ほかは無地（%s）"
       % u" / ".join(img for (img, tx) in ki4))
    iu(u"フォルダに「1」しか入っていない作品が 1 つ" in log4 and u"きいろ組" in log4,
       u"④ 「1」しか無いフォルダを名前で知らせる")

    # ③ 無職転生の形は今までどおり
    io.open(os.path.join(SAGYOU, u"画面表示.txt"), "w", encoding="utf-8",
            newline="\n").write(GAMEN_MUSHOKU)
    rc3, log3 = hashiru(e, "--plan")
    io.open(os.path.join(SAGYOU, u"_log3.txt"), "w", encoding="utf-8").write(log3)
    iu(rc3 == 0, u"③ 無職転生の形でも割り当てが走る")
    iu(not os.path.exists(jirushi), u"③ 無職転生の形では目印を消す（採点と 直す.py が回る）")
    iu(u"おすすめ紹介の回です" not in log3 and re.search(u"べつの作品\\s+\\d+枚", log3) is not None,
       u"③ 無職転生の形では今までどおり全フォルダを並べる")

    print(u"")
    if warui:
        print(u"× %d件 落ちました" % len(warui))
        return 1
    print(u"○ おすすめ紹介の回は、無職転生のための段を通りません")
    return 0


if __name__ == "__main__":
    sys.exit(main())
