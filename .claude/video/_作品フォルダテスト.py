# -*- coding: utf-8 -*-
u"""作品フォルダの回で、**別の作品の絵が出ないか**

■ なぜ要るか（2026-11-11・本人のログ：ラブコメ20選 v191）

    使った話数: 26種類
        ゆびさきと恋々                   41枚  (14%)
        乙女ゲー世界はモブに厳しい世界です   39枚  (13%)
        新世紀エヴァンゲリオン             20枚  (7%)
    採点   ひどい (人・話数ちがい)  : 207 か所

ラブコメ20選の動画に、紹介していない作品の絵が出ていた。原因は3つ重なっていた。

  ① 4列目の名前が本人のフォルダと1文字ちがう（ヤバイ／ヤバい・育てかた／育て方）
  ② おすすめ紹介の絵には1枚ごとの説明がまだ無い（12961枚ぜんぶ）。
     札が当たらないので、道具は**話数マップの言葉が合う別の作品**へ出ていった
  ③ 作品のフォルダが無い章は、前の章の作品とカタログ全体から借りていた

**こちらの材料には説明つきの絵しか無いので、この枝は一度も通っていなかった。**
説明の無い作品フォルダをその場で作って通す。

  ① 説明の無いフォルダの章は、その作品の絵だけになる
  ② 別の作品（話数マップの言葉が合う）からは1枚も借りない
  ③ 作品のフォルダが無い章は、無地になる（別の作品の絵を出さない）
  ④ 無い作品を名前で言う
  ⑤ 同じ絵が続かない・頭から順ではなくばらける・公式画像は頭の1文だけ
  ⑥ 「七つの大罪」と書いて「sin 七つの大罪」まで対象に入らない
  ⑦ 説明のあるフォルダ（無職転生の回）は、この段を素通りする
"""
from __future__ import print_function
import io
import os
import sys

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


def ms_yomu():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        u"ms_sf", os.path.join(HERE, u"make_slideshow.py"))
    m = importlib.util.module_from_spec(spec)
    sys.modules[u"ms_sf"] = m
    spec.loader.exec_module(m)
    return m


def hashiru(ms, images, plan_text, slots, chaps, cat, emap, focus):
    import tempfile
    d = tempfile.mkdtemp(prefix="sakuhin")
    pp = os.path.join(d, u"画像プラン.txt")
    io.open(pp, "w", encoding="utf-8", newline="\n").write(plan_text)
    rules, default, f2 = ms.load_imageplan(pp)
    log = []
    moto = ms.say
    ms.say = lambda *a: log.append(u" ".join(str(x) for x in a))
    try:
        rules, default = ms.plan_code_naosu(rules, default, images)
        out = ms.assign_images(slots, images, rules, default, catalog=cat,
                               epmap=emap, focus=focus or f2, chaps=chaps)
    finally:
        ms.say = moto
    return out, u"\n".join(log)


def main():
    ms = ms_yomu()
    kitei = u"#穏やか, #室内, #立ち姿"

    images = []
    for i in range(2, 42):
        images.append(u"ニセコイ/%04d.jpg" % i)
    images.append(u"ニセコイ/1.jpg")
    for i in range(2, 32):
        images.append(u"とらドラ！/%04d.jpg" % i)
    images.append(u"とらドラ！/1.png")
    for i in range(1, 60):
        images.append(u"ゆびさきと恋々/%04d.jpg" % i)       # 借りに行っていた先
    for i in range(1, 20):
        images.append(u"sin 七つの大罪/%04d.jpg" % i)
    for i in range(1, 20):
        images.append(u"七つの大罪/%04d.jpg" % i)

    # 話数マップ：別の作品のほうに、札の言葉がぜんぶ入っている（本人のログの形）
    emap = {u"ゆびさきと恋々": u"穏やか 室内 立ち姿 空 街 歩く 制服 学校 二人 会話",
            u"ニセコイ": u"2014 制服 学校"}

    plan = u"""# ══ はじめに ══
@@話数\tニセコイ
今回は\t%(k)s
# ══ ニセコイ ══
@@話数\tニセコイ
ニセコイ\t#公式, %(k)s
制作はシャフト\t#公式, %(k)s
本作は\t#本, #文字あり
物語は\t#歩く, #空, #立ち姿
本作の魅力は\t%(k)s
王道の\t#空, #街, #歩く
続いての作品は\t#空, #街
# ══ かぐや様 ══
@@話数\tかぐや様は告らせたい
かぐや様は告らせたい\t#公式, %(k)s
制作はエイワン\t#公式, %(k)s
生徒会で\t%(k)s
間の切れ味\t#空, #街
続く作品は\t#空, #街
# ══ とらドラ ══
@@話数\tとらドラ！
とらドラ\t#公式, %(k)s
制作はJ.C.\t#公式, %(k)s
見た目で怖がられている\t%(k)s
人を思う気持ち\t#空, #街, #歩く
文化祭の回\t%(k)s
*\t%(k)s
""" % {u"k": kitei}

    tx = [u"今回は、ご紹介していきます。", u"最初にご紹介する作品は、",
          u"ニセコイ、", u"制作はシャフト。", u"本作は漫画が原作です。",
          u"物語は、偽の恋人にされるところから始まります。",
          u"本作の魅力は、画面の作り込み。", u"王道のラブコメです。",
          u"続いての作品は、",
          u"かぐや様は告らせたい、", u"制作はエイワンピクチャーズ。",
          u"生徒会で顔を合わせる二人が、", u"間の切れ味。", u"続く作品は、",
          u"とらドラ！、", u"制作はJ.C.スタッフ。",
          u"見た目で怖がられている主人公、", u"人を思う気持ちのねじれ。",
          u"文化祭の回まで見てください。"]
    slots = [(i * 3.0, 3.0, t) for i, t in enumerate(tx)]
    chaps = [(u"今回は", u"はじめに", [u"ニセコイ"]),
             (u"ニセコイ", u"ニセコイ\\N2014年冬", [u"ニセコイ"]),
             (u"かぐや様は告らせたい", u"かぐや様は\\N告らせたい\\N2019年冬",
              [u"かぐや様は告らせたい"]),
             (u"とらドラ", u"とらドラ！\\N2008年秋", [u"とらドラ！"])]

    out, hon = hashiru(ms, images, plan, slots, chaps, {}, emap, None)
    fol = [o.split(u"/")[0] if u"/" in o else o for o in out]

    # ── ① ② その作品の絵だけ
    iu(all(f == u"ニセコイ" for f in fol[0:9]),
       u"① はじめに〜ニセコイの章は、ニセコイの絵だけ（いまは %s）"
       % u" ".join(sorted(set(fol[0:9]))))
    iu(all(f == u"とらドラ！" for f in fol[14:19]),
       u"① とらドラ！の章は、とらドラ！の絵だけ（いまは %s）"
       % u" ".join(sorted(set(fol[14:19]))))
    iu(u"ゆびさきと恋々" not in fol,
       u"② 話数マップの言葉が合う別の作品から、1枚も借りない")
    iu(u"別の作品へ出ていた絵" in hon, u"② 戻した枚数を言う")

    # ── ③ ④ フォルダの無い作品
    iu(all(o == ms.MUJI for o in out[9:14]),
       u"③ フォルダの無い作品の章は、無地（いまは %s）" % u" ".join(sorted(set(fol[9:14]))))
    iu(u"作品のフォルダが無い章が 1 つ" in hon and u"かぐや様は告らせたい" in hon,
       u"④ 無い作品を名前で言う")

    # ── ⑤ 並び
    iu(out[2] == u"ニセコイ/1.jpg" and out[3] == u"ニセコイ/1.jpg",
       u"⑤ 作品の頭の1文は公式画像のまま")
    iu(out[14] == u"とらドラ！/1.png" and out[15] == u"とらドラ！/1.png",
       u"⑤ 2つめの作品の頭も公式画像")
    hoka = [o for i, o in enumerate(out) if i not in (2, 3, 14, 15) and o != ms.MUJI]
    iu(not any(ms.wa_koushiki(o) for o in hoka),
       u"⑤ 公式画像は頭の1文だけ（ほかの字幕には出ない）")
    tsuzuki = [i for i in range(1, len(out))
               if out[i] == out[i - 1] and out[i] != ms.MUJI
               and not ms.wa_koushiki(out[i])]
    iu(not tsuzuki, u"⑤ 同じ絵が続かない")
    ban = sorted(int(os.path.basename(o)[:4]) for o in hoka if o.startswith(u"ニセコイ/"))
    iu(ban and max(ban) > 20,
       u"⑤ 頭から順ではなく、フォルダ全体にばらけている（番号 %s）"
       % u" ".join(str(b) for b in ban))
    iu(len(set(hoka)) == len(hoka), u"⑤ 余っているうちは同じ絵を2回使わない")

    # ── ⑥ ぴったり同じ名前が先
    plan6 = u"@@話数\t七つの大罪\n七つの大罪\t%s\n*\t%s\n" % (kitei, kitei)
    slots6 = [(i * 3.0, 3.0, u"七つの大罪の話です。") for i in range(6)]
    chaps6 = [(u"七つの大罪", u"七つの大罪\\N2014年秋", [u"七つの大罪"])]
    out6, _h = hashiru(ms, images, plan6, slots6, chaps6, {}, {}, None)
    iu(all(o.startswith(u"七つの大罪/") for o in out6),
       u"⑥「七つの大罪」と書いて「sin 七つの大罪」の絵が出ない（いまは %s）"
       % u" ".join(sorted(set(o.split(u"/")[0] for o in out6))))

    # ── ⑦ 説明のあるフォルダは素通り（無職転生の回）
    im7 = [u"無職転生Ⅲ 第11話/%03d_a.png" % i for i in range(1, 30)] \
        + [u"無職転生Ⅲ 第12話/%03d_b.png" % i for i in range(1, 30)]
    cat7 = dict((k, u"一人 ルーデウス 茶髪 室内 穏やか 立ち姿") for k in im7)
    plan7 = u"@@話数\t無職転生Ⅲ 第11話\nルーデウス\t%s\n*\t%s\n" % (kitei, kitei)
    slots7 = [(i * 3.0, 3.0, u"ルーデウスの話です。") for i in range(5)]
    chaps7 = [(u"ルーデウス", u"はじめに", [u"無職転生Ⅲ 第11話"])]
    out7, hon7 = hashiru(ms, im7, plan7, slots7, chaps7, cat7, {}, None)
    iu(u"別の作品へ出ていた絵" not in hon7 and ms.MUJI not in out7,
       u"⑦ 説明のあるフォルダの回は、この段を素通りする")

    # ── ⑧ 無地の絵は「絵の一覧」に入らない
    iu(ms.MUJI not in images, u"⑧ 無地の絵は絵の一覧に入れない（札で選ばれない）")
    iu(ms.barakeru(list(range(10)))[:3] == [0, 8, 4],
       u"⑧ ばらける順は、まんなか・4分の1…の順")


if __name__ == "__main__":
    main()
    print(u"")
    if warui:
        print(u"落ちました。%d件:" % len(warui))
        for w in warui:
            print(u"  ・" + w)
        sys.exit(1)
    print(u"全部通りました。")
