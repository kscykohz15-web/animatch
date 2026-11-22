# -*- coding: utf-8 -*-
u"""選び直しを学ぶ（仕上げ.py ㊱）

■ 本人の指定（2026-11-21）

  > この変更を覚えていてもらいたくて、変更した内容を蓄積して、データとして解析しどんどんあなたの
  > 画像割り当て精度を高めて欲しいです。

  本人がスマホで選び直した 118 か所（ラブコメ20選）は、ほぼ「その字幕に出てくる人が写っている絵」だった
  （選び直した割合 名前の出る字幕 67%・立場の言葉 52%・人が出ない字幕 29%）。
  設計は docs/superpowers/specs/2026-11-21-選び直しを学ぶ-design.md

■ 見ること
  ① 台本のあらすじから主人公・ヒロインの名前を読む／字幕に出てくる人（名前・立場の言葉・二人）
  ② 本人の選び.txt を読み、選んだ絵に「写っている人」を覚える・外されて一度も選ばれていない絵は後回し
  ③ 絵を当てるとき、字幕に出てくる人を覚えた絵を先に当てる（作品の頭の公式画像・手で書いた絵・別の作品の絵・
     使用中の絵には触らない。本人の選び.txt が無ければ今までどおり）
"""
from __future__ import print_function
import io, os, sys

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


def ichi(ms):
    u"""① 名前を読む・字幕に出てくる人"""
    paras = [u"物語は、見た目で怖がられている高校生の主人公、高須竜児と、小さくて気の強いヒロイン、逢坂大河が、"
             u"お互いに好きな人と結ばれるため、協力関係となるところから始まります。",
             u"本作の魅力は、竜児と大河の掛け合いで、…",
             u"物語は、ごく普通の主人公が、旅に出るところから始まります。"]
    ji = ms.hito_jisho(paras, [u"とらドラ！", u"とらドラ！", u"名無し"])
    t = ji.get(u"とらドラ！", {})
    iu(t.get(u"主人公") == [u"高須竜児"] and t.get(u"ヒロイン") == [u"逢坂大河"],
       u"① あらすじから主人公（高須竜児）とヒロイン（逢坂大河）を読む（%s）" % t)
    iu(t.get(u"yobi", {}).get(u"竜児") == u"高須竜児" and t.get(u"yobi", {}).get(u"大河") == u"逢坂大河",
       u"① 同じ章の台本に出てくる短い呼び名（竜児・大河）も同じ人")
    iu(ms.hito_no_ji(u"高須竜児と、小さくて気の強いヒロイン、", t) == frozenset([u"高須竜児"]),
       u"① 名前が出る字幕は名前だけ（同じ字幕の「ヒロイン」は次の字幕の人の説明なので数えない）")
    iu(ms.hito_no_ji(u"物語は、見た目で怖がられている高校生の主人公、", t) == frozenset([u"高須竜児"]),
       u"① 名前の無い字幕の「主人公」は、その作品の主人公の名前に読みかえる")
    iu(ms.hito_no_ji(u"二人の掛け合いと、", t) == frozenset([u"高須竜児", u"逢坂大河"]),
       u"① 「二人」は主人公とヒロイン")
    iu(ms.hito_no_ji(u"そのリアルすぎる表現に心を打たれ、", t) == frozenset(),
       u"① 人が出ない字幕は空")
    iu(ms.hito_no_ji(u"主人公が旅に出る", ji.get(u"名無し", {})) == frozenset([u"主人公"]),
       u"① 名前が台本から取れない作品は「主人公」の言葉のまま")
    # 本人の決定の字幕は、直す前の言い方（主人公の高校生、名前）。名前は「高校生」ではない。ひらがなの入る名前も読む
    ji3 = ms.hito_jisho([u"物語は、見た目で怖がられている主人公の高校生、高須竜児と、小さくて気の強いヒロイン、逢坂大河が、…。",
                         u"物語は、生徒会長である主人公の白銀御行と、副会長であるヒロインの四宮かぐやが、…ところから始まります。"],
                        [u"とら", u"かぐや"])
    iu(ji3.get(u"とら", {}).get(u"主人公") == [u"高須竜児"] and ji3.get(u"かぐや", {}).get(u"ヒロイン") == [u"四宮かぐや"]
       and ji3.get(u"かぐや", {}).get(u"主人公") == [u"白銀御行"],
       u"① 「主人公の高校生、高須竜児」の名前は高須竜児（高校生ではない）・ひらがなの入る名前（四宮かぐや）も読む（%s）" % ji3)
    ji4 = ms.hito_jisho([u"物語は、主人公の神田空太のもとに、天才画家のヒロイン、椎名ましろがやってくるところから始まります。",
                         u"ましろの生活力の無さがおもしろい作品です。"], [u"さくら", u"さくら"])
    y4 = ji4.get(u"さくら", {}).get(u"yobi", {})
    iu(y4.get(u"ましろ") == u"椎名ましろ" and u"しろ" not in y4,
       u"① ひらがなで始まる短い呼び名（しろ＝「おもしろい」に入る）は使わない・3文字のひらがなの名前（ましろ）は使う（%s）" % y4)
    ji2 = ms.hito_jisho([u"物語は、同人ゲームを作ろうとしている主人公の安芸倫也が、偶然出会ったヒロイン、加藤恵を、"
                         u"ゲームの主役のモデルに決めるところから始まります。",
                         u"感情をあまり表に出さない恵がふとした瞬間に見せる本音に、恵まれた環境の倫也が…"],
                        [u"冴え", u"冴え"])
    y2 = ji2.get(u"冴え", {}).get(u"yobi", {})
    iu(u"恵" not in y2 and y2.get(u"倫也") == u"安芸倫也",
       u"① 1文字の呼び名は使わない（「恵まれた」に入る）・2文字の呼び名（倫也）は使う（%s）" % y2)


def ni(ms):
    u"""② 本人の選び.txt を読み、覚える"""
    import tempfile
    d = tempfile.mkdtemp(prefix=u"manabi")
    p = os.path.join(d, u"本人の選び.txt")
    io.open(p, "w", encoding="utf-8-sig", newline=u"\r\n").write(
        u"# 本人がスマホで選び直した絵\n# 作品フォルダ\t選んだ絵\t機械の絵\t字幕の文\t動画\t日時\n"
        u"とらドラ！\tとらドラ！/0020.jpg\tとらドラ！/0002.jpg\t逢坂大河が、お互いに好きな人と結ばれるため、\t07_ラブコメ\t2026-11-21\n"
        u"とらドラ！\tとらドラ！/0021.jpg\tとらドラ！/0003.jpg\t高須竜児と、小さくて気の強いヒロイン、\t07_ラブコメ\t2026-11-21\n"
        u"とらドラ！\tとらドラ！/0003.jpg\tとらドラ！/0004.jpg\t二人の掛け合いと、\t07_ラブコメ\t2026-11-21\n"
        u"とらドラ！\tとらドラ！/0022.jpg\n"
        u"\n")
    recs = ms.manabi_yomu(p)
    iu(len(recs) == 3 and recs[0][u"fol"] == u"とらドラ！" and recs[0][u"e"] == u"とらドラ！/0020.jpg"
       and recs[0][u"mae"] == u"とらドラ！/0002.jpg",
       u"② 本人の選び.txt を読む（列の足りない行・空の行は飛ばす・%d行）" % len(recs))
    iu(ms.manabi_yomu(os.path.join(d, u"無い.txt")) == [], u"② 本人の選び.txt が無ければ空")
    ji = ms.hito_jisho([u"物語は、見た目で怖がられている高校生の主人公、高須竜児と、小さくて気の強いヒロイン、逢坂大河が、"
                        u"お互いに好きな人と結ばれるため、協力関係となるところから始まります。"], [u"とらドラ！"])
    utsuru, yoi, dame = ms.manabi_shiru(recs, ji)
    iu(utsuru.get(u"とらドラ！/0020.jpg") == set([u"逢坂大河"]) and utsuru.get(u"とらドラ！/0021.jpg") == set([u"高須竜児"])
       and utsuru.get(u"とらドラ！/0003.jpg") == set([u"高須竜児", u"逢坂大河"]),
       u"② 選んだ絵に、その字幕に出てくる人を覚える（大河・竜児・二人）")
    iu(dame == set([u"とらドラ！/0002.jpg", u"とらドラ！/0004.jpg"]) and u"とらドラ！/0003.jpg" in yoi,
       u"② 外された絵は後回し。ただし別の字幕で選ばれた絵（0003）は後回しにしない（%s）" % sorted(dame))
    return recs


def san(ms, recs):
    u"""③ 当てる"""
    images = [u"とらドラ！/%04d.jpg" % i for i in range(2, 32)] + [u"とらドラ！/1.png"]
    images += [u"ニセコイ/%04d.jpg" % i for i in range(2, 20)] + [u"ニセコイ/1.jpg"]
    tx = [u"今回は、ご紹介していきます。", u"最初にご紹介する作品は、", u"とらドラ！、", u"制作はJ.C.スタッフ。",
          u"本作は電撃文庫のライトノベルが原作です。",
          u"物語は、見た目で怖がられている高校生の主人公、", u"高須竜児と、小さくて気の強いヒロイン、",
          u"逢坂大河が、お互いに好きな人と結ばれるため、", u"協力関係となるところから始まります。",
          u"本作の魅力は、大河の可愛さで、", u"手で選んだ絵の字幕です。", u"続いての作品は、",
          u"ニセコイ、", u"制作はシャフト。", u"本作は漫画が原作です。"]
    slots = [(i * 3.0, 3.0, t) for i, t in enumerate(tx)]
    chaps = [(u"今回は", u"はじめに", [u"とらドラ！", u"ニセコイ"]),
             (u"とらドラ", u"とらドラ！\\N2008年秋", [u"とらドラ！"]),
             (u"ニセコイ", u"ニセコイ\\N2014年冬", [u"ニセコイ"])]
    plan = u"""@@話数\tとらドラ！
とらドラ\t#公式
制作はJ.C.\t#公式
手で選んだ絵\tとらドラ！/0005.jpg
@@話数\tニセコイ
ニセコイ\t#公式
制作はシャフト\t#公式
"""
    import tempfile
    d = tempfile.mkdtemp(prefix=u"manabi3")
    pp = os.path.join(d, u"画像プラン.txt")
    io.open(pp, "w", encoding="utf-8", newline="\n").write(plan)

    def ate(rr):
        rules, default, f2 = ms.load_imageplan(pp)
        log = []
        moto = ms.say
        ms.say = lambda *a: log.append(u" ".join(str(x) for x in a))
        ms.OSUSUME[0] = True
        ms.MANABI[0] = rr
        try:
            rules, default = ms.plan_code_naosu(rules, default, images)
            out = ms.assign_images(slots, images, rules, default, catalog={}, epmap={}, focus=f2, chaps=chaps)
        finally:
            ms.say = moto
            ms.MANABI[0] = None
        return out, u"\n".join(log)

    moto_out, _l0 = ate(None)
    out, log = ate(recs)
    iu(out[7] == u"とらドラ！/0020.jpg", u"③ 「逢坂大河が、」の字幕に、大河を覚えた絵（0020）が入る（いまは %s）" % out[7])
    iu(set(out[5:7]) == set([u"とらドラ！/0021.jpg", u"とらドラ！/0003.jpg"]),
       u"③ 竜児が出る2つの字幕（主人公・高須竜児と）に、竜児を覚えた絵（竜児だけの 0021・二人の 0003）が入る（いまは %s）"
       % u" ".join(out[5:7]))
    iu(out[2] == out[3] == u"とらドラ！/1.png" and out[10] == u"とらドラ！/0005.jpg",
       u"③ 作品の頭の公式画像と、画像プランに手で書いた絵はそのまま")
    iu(all(o.split(u"/")[0] == u"とらドラ！" for o in out[2:11]) and all(o.split(u"/")[0] == u"ニセコイ" for o in out[12:15]),
       u"③ 別の作品の絵は出さない")
    naka = [o for i, o in enumerate(out) if i not in (2, 3, 12, 13)]
    iu(len(naka) == len(set(naka)), u"③ 同じ絵が2か所に入らない（%s）" % [o for o in naka if naka.count(o) > 1])
    iu(u"とらドラ！/0002.jpg" not in out[1:11] and u"とらドラ！/0004.jpg" not in out[1:11],
       u"③ とらドラ！の章では、外されて一度も選ばれていない絵（0002・0004）は、ほかに使える絵があれば使わない"
       u"（はじめに・おわりにはそのまま）")
    iu(u"本人の選びから" in log and u"名前の合う絵" in log, u"③ ログに「本人の選びから: …名前の合う絵に替えました」")
    no_out, _l1 = ate([])
    iu(no_out == moto_out, u"③ 本人の選び.txt が無い（空）ときは、今までどおりの当て方")


def main():
    ms = mod(os.path.join(HERE, u"make_slideshow.py"), u"ms_manabi")
    ichi(ms)
    recs = ni(ms)
    san(ms, recs)
    return 0


if __name__ == "__main__":
    rc = main()
    print(u"")
    if rc or warui:
        print(u"落ちました。%d件:" % len(warui))
        for x in warui:
            print(u"  ・" + x)
        sys.exit(1)
    print(u"全部通りました。")
